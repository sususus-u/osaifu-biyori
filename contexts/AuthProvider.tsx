"use client";

// ホームのログイン(#authToken= の引き継ぎ)で入った人だけを「ログイン済み」として扱い、
// どの画面からも useAuth() でログイン中のUIDを取得できるようにする。
// 匿名ログインは使わない。ログインしていないときは uid が null のままで、
// 画面側(AppShell → LoginGuide)が、自動でホームのログインへ移る(依頼345 の決定2)。
// ログインしている間は、開いたときと、30分以上たって画面に戻ったときに、ログインがまだ有効かを確かめる(決定4)。

import {
  createContext,
  useRef,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, cleanHandoffFromUrl, handoffEnv, handoffReady } from "@/lib/firebase";
import { LOGIN_HANDOFF_PRESETS, recheckSession, resetRedirectCount, startSessionWatch } from "@/lib/login-handoff";
import { clearUserLocalData } from "@/lib/clearUserData";

interface AuthContextValue {
  /** ログイン状態の確認が終わるまで true。読み込み中の表示に使う */
  isLoading: boolean;
  /** ログイン済み(匿名でない)ユーザーのUID。未ログイン・確認中は null */
  uid: string | null;
  /** ホームからの引き継ぎ(#authToken=)に失敗したか。メモリ上だけの印 */
  handoffFailed: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  isLoading: true,
  uid: null,
  handoffFailed: false,
});

function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [handoffFailed, setHandoffFailed] = useState(false);
  // ログイン済みだったか。ログイン済み → 未ログインに変わった時だけ、端末のデータを消すために使う
  const wasLoggedInRef = useRef(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    // ホームのログインの受け取り(モジュール読み込み時点で開始済み)が
    // 終わるまで、ログイン状態の判定を始めない。先にonAuthStateChangedを
    // 購読してしまうと、永続化復元で残っていた古いユーザーを先に見てしまう
    // 競合状態が起きるため。
    handoffReady.then((result) => {
      cleanHandoffFromUrl();
      if (cancelled) return;
      setHandoffFailed(result.kind === "failed");
      unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
        if (user && !user.isAnonymous) {
          resetRedirectCount(LOGIN_HANDOFF_PRESETS.osaifu, sessionStore());
          wasLoggedInRef.current = true;
          setUid(user.uid);
          setIsLoading(false);
          return;
        }
        // ログイン中の人がいない、または端末に古い匿名ログインが残っていた場合は、
        // 未ログインとして扱う。匿名ユーザーは、サインアウトして残さない。
        setUid(null);
        // ログイン中に未ログインへ変わった(ホームでのログアウトでログインが取り消された場合など)ときは、
        // 次の人に引き継がないよう、端末のユーザー固有のデータを消す。起動時の未ログインでは消さない。
        if (wasLoggedInRef.current) {
          wasLoggedInRef.current = false;
          clearUserLocalData();
        }
        if (user) {
          try {
            await signOut(auth);
            // 成功すると、この onAuthStateChanged が user=null で再度呼ばれる
          } catch (error) {
            console.error("匿名ユーザーのサインアウトに失敗しました", error);
          }
        }
        setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // ログインしている間: 開いたとき(すぐ1回)と、30分以上たって画面に戻ったときに、ログインがまだ有効かを確かめる。
  // 取り消されていたら(ホームでのログアウトなど)、この端末でログアウトし、ホームのログインへ移る。
  // 移れなかったときは、ログアウトで uid が null になり、LoginGuide が失敗の画面を出す
  useEffect(() => {
    if (!uid) return;
    return startSessionWatch({ target: document, check: () => recheckSession(handoffEnv()) });
  }, [uid]);

  return (
    <AuthContext.Provider value={{ isLoading, uid, handoffFailed }}>
      {children}
    </AuthContext.Provider>
  );
}

/** 画面側からログイン中のUIDを取得するためのフック */
export function useAuth() {
  return useContext(AuthContext);
}
