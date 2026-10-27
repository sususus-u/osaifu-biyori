// Firebaseクライアントの初期化。
// Next.jsのホットリロードで何度も初期化されないよう、getApps()で既存インスタンスを確認する。

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInWithCustomToken, signOut, type User } from "firebase/auth";
import { extractAuthToken } from "@/lib/authToken";
import { consumeState, issueState } from "@/lib/handoffState";
import {
  buildHomeEntryLoginUrl,
  decideHomeEntrySession,
  planHomeEntry,
  stripEntry,
  type HomeEntrySessionCheck,
} from "@/lib/hubEntry";
import { clearUserLocalData } from "@/lib/clearUserData";
import { sendStateMark } from "@/lib/stateMark";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ハブ(okizukibiyori.com)からURLに ?authToken=xxx または #authToken=xxx(こちらを優先)が付与されて遷移してきた場合、
// そのカスタムトークンでログインする。
//
// auth.currentUserの永続化復元(非同期)が先に終わってしまうと、既存の匿名ユーザーが
// そのまま使われてカスタムトークンでのログインが素通りされる競合状態が起きるため、
// モジュール読み込み時点(=このファイルがimportされた瞬間)で即座に処理を開始し、
// 他の場所(AuthProviderのonAuthStateChanged購読)はこのPromiseを必ず待ってから動く。
//
// 引き継ぎに失敗しても、匿名ログインにはしない(アプリは案内の画面で止まる)。
// 失敗の印はメモリ上だけに持つ(authToken はアドレスから消すので、再読み込みでは残らない)。
let customTokenHandoffFailed = false;

export function hasCustomTokenHandoffFailed(): boolean {
  return customTokenHandoffFailed;
}

// アドレスから authToken(クエリ・フラグメント)を消す。ほかの部分は残す。
// Next.js が読み込み後にアドレスを書き戻すことがあるため、AuthProvider からも呼び直す。
export function removeAuthTokenFromUrl(): void {
  if (typeof window === "undefined") return;
  const { cleanedPath } = extractAuthToken(window.location.href);
  if (cleanedPath !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, "", cleanedPath);
  }
}

// アドレスから entry(ハブのホームのカードの印)を消す。AuthProvider からも呼び直す
export function removeEntryFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    if (planHomeEntry(window.location.href).action === "none") return;
    const u = new URL(stripEntry(window.location.href));
    window.history.replaceState(null, "", u.pathname + u.search + u.hash);
  } catch {
    // 消せなくても、ログインには影響しない
  }
}

// ログインの有効さを、通信して確かめる(依頼272)。ハブでのログアウト(リフレッシュトークンの取り消し。10/09 の仕組み)に
// 気づくため、保存済みの ID トークンではなく、必ず取り直す(getIdToken(true))。返ってこないときは、通信の失敗として扱う。
const SESSION_CHECK_TIMEOUT_MS = 10_000;

async function checkSession(user: User): Promise<HomeEntrySessionCheck> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      user.getIdToken(true),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject({ code: "auth/network-request-failed" }), SESSION_CHECK_TIMEOUT_MS);
      }),
    ]);
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code ?? "unknown";
    return { ok: false, code };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ハブのホームのカード(?entry=home。authToken なし)から開かれたときの入口(依頼264、依頼272)。
// 先に、このアプリのログイン状態を見る(保存済みのログインの復元を待ってから)。
// - ログイン済みで、ログインが有効 → ハブへ出ない(false。呼び出し元が entry を外して、そのまま一覧を出す)。
//   ハブとアカウントが違っていても、このアプリは自分のアカウントのまま。
// - ログインしていない → state を作って控え、ハブのログイン画面へ移動し直す。
// - ログインが取り消されていた → この端末でログアウトし、端末のユーザー固有のデータを消してから、同じく移動する。
// 案0のボタンの「1回の起動で1回」の数えは使わない(return に entry を入れないので往復しない)。
// 移動するときは true(ログイン状態の判定を始めない。案内の画面がちらつかないように)。
// 決めている間は、AuthProvider が読み込み中のまま(案内の画面は出ない)。
// state を控えられないときは、entry を外して、今までどおり進む。
async function redirectFromHomeEntry(): Promise<boolean> {
  let returnHref: string;
  try {
    const plan = planHomeEntry(window.location.href);
    if (plan.action !== "redirect") return false;
    returnHref = plan.returnHref;
  } catch {
    return false;
  }

  try {
    await auth.authStateReady();
  } catch {
    // 復元に失敗しても、currentUser を見て進む
  }
  const user = auth.currentUser;
  const check: HomeEntrySessionCheck = user && !user.isAnonymous ? await checkSession(user) : null;
  const decision = decideHomeEntrySession(check);
  if (decision === "skip") return false;
  if (decision === "signOutThenRoundTrip") {
    try {
      await signOut(auth);
    } catch {
      // ログアウトに失敗しても、ハブから戻ったトークンでログインし直す
    }
    clearUserLocalData();
  }

  let state: string | null = null;
  try {
    state = issueState(window.localStorage);
  } catch {
    state = null;
  }
  // 控えられないときは、entry を外して(呼び出し元の removeEntryFromUrl)、今までどおり進む
  if (state === null) return false;
  window.location.replace(buildHomeEntryLoginUrl(returnHref, state));
  return true;
}

export const customTokenSignInReady: Promise<void> = (async () => {
  if (typeof window === "undefined") return;

  if (await redirectFromHomeEntry()) {
    // 移動するまで、ログイン状態の判定を始めない(終わらない Promise で止める)
    await new Promise<never>(() => {});
  }
  removeEntryFromUrl();

  // 読んだらすぐ、アドレスから消す(クエリもフラグメントも。成否を待たない)
  const { token, rejected, state } = extractAuthToken(window.location.href);
  removeAuthTokenFromUrl();
  if (token !== null || rejected || state !== null) {
    // state の照合(控えは必ず消える)。state なしは、段階1の間は通す
    let stateOk = false;
    try {
      stateOk = consumeState(state, window.localStorage);
    } catch {
      stateOk = state === null;
    }
    if (!stateOk) {
      sendStateMark("mismatch");
      customTokenHandoffFailed = true;
      console.error("照合用の値(state)が合わないため、ログインを行いませんでした");
      return;
    }
  }
  if (rejected) {
    customTokenHandoffFailed = true;
    console.error("カスタムトークンが長すぎるため、ログインを行いませんでした");
    return;
  }
  if (!token) return;

  // state なしで受け入れた(段階1の間は通す)。段階2へ進める判断のため、回数だけハブへ知らせる
  if (state === null) sendStateMark("no-state");

  try {
    await signInWithCustomToken(auth, token);
  } catch (error) {
    customTokenHandoffFailed = true;
    // トークンを含みうるため、エラーの中身は出さず、コードだけ残す
    const code = (error as { code?: string } | null)?.code ?? "unknown";
    console.error("カスタムトークンでのログインに失敗しました:", code);
  }
})();
