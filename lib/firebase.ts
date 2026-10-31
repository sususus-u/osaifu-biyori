// Firebaseクライアントの初期化。
// Next.jsのホットリロードで何度も初期化されないよう、getApps()で既存インスタンスを確認する。

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { clearUserLocalData } from "@/lib/clearUserData";
import {
  LOGIN_HANDOFF_PRESETS,
  readHandoff,
  receiveLogin,
  type HandoffEnv,
  type KeyStore,
  type ReceiveResult,
} from "@/lib/login-handoff";

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

// ホーム(okizukibiyori.com)のログインの受け取り(依頼347 仕事2)。
// 中身は、ハブが正本の部品の写し(lib/login-handoff.ts。手で直さない)。ここは、その部品に
// このアプリの Firebase・window・storage を渡すだけ。

function storageOf(pick: () => Storage): KeyStore | null {
  try {
    return pick();
  } catch {
    return null;
  }
}

/** 部品に渡す、このアプリの環境。呼ぶたびに作る(href は、その時のアドレス) */
export function handoffEnv(): HandoffEnv {
  return {
    config: LOGIN_HANDOFF_PRESETS.osaifu,
    href: window.location.href,
    local: storageOf(() => window.localStorage),
    session: storageOf(() => window.sessionStorage),
    replaceAddress: (path) => window.history.replaceState(null, "", path),
    navigate: (url, how) => (how === "replace" ? window.location.replace(url) : window.location.assign(url)),
    authStateReady: () => auth.authStateReady(),
    getUser: () => auth.currentUser,
    signInWithToken: (token) => signInWithCustomToken(auth, token),
    signOut: () => signOut(auth),
    clearUserData: clearUserLocalData,
    sendBeacon: typeof navigator !== "undefined" && navigator.sendBeacon ? (url, body) => navigator.sendBeacon(url, body) : undefined,
  };
}

// アドレスから authToken・state・entry を消す。ほかの部分は残す。
// Next.js が読み込み後にアドレスを書き戻すことがあるため、AuthProvider からも呼び直す。
export function cleanHandoffFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const { cleanedPath } = readHandoff(window.location.href);
    if (cleanedPath !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, "", cleanedPath);
    }
  } catch {
    // 消せなくても、ログインには影響しない
  }
}

// auth.currentUser の永続化復元(非同期)が先に終わってしまうと、トークンでのログインが素通りされる
// 競合状態が起きるため、モジュール読み込み時点(=このファイルが import された瞬間)で即座に始め、
// 他の場所(AuthProvider の onAuthStateChanged 購読)は、この Promise を必ず待ってから動く。
// ホームのログインへ移るとき(navigating)は、移るまで終わらない(案内の画面がちらつかないように)。
// 引き継げなかったとき(failed)は、匿名ログインにはしない。ログインしていなければ、失敗の画面を出す。
export const handoffReady: Promise<ReceiveResult> = (async () => {
  if (typeof window === "undefined") return { kind: "none" } as const;
  const result = await receiveLogin(handoffEnv());
  if (result.kind === "navigating") await new Promise<never>(() => {});
  if (result.kind === "failed") {
    // 値は出さず、理由の種類だけ残す
    console.error("ホームのログインを引き継げませんでした:", result.reason);
  }
  return result;
})();
