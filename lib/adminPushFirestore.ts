// 運営者への通知の、Firestore と FCM の部分(サーバー側専用。依頼245)。ここはテストで動かさない。
// 運営者は、環境変数 ADMIN_UID の uid で見分ける(たべびよりと同じ)。送り先は、その uid の
// users/{uid}.fcmTokens(期限の通知 send-notifications と同じ記録)。
// 失敗しても例外は投げない(画面への応答に影響させない)。ログには、トークンや uid を出さない。

import { adminDb, adminMessaging } from "@/lib/firebaseAdmin";
import { ADMIN_PUSH_COLLECTION, ADMIN_PUSH_DOC, ADMIN_PUSH_LIMITS, adminTokens, nextPushTimes } from "@/lib/adminPush";

export async function notifyAdmin(text: { title: string; body: string }): Promise<boolean> {
  const adminUid = process.env.ADMIN_UID;
  if (!adminUid) return false;
  try {
    const now = Date.now();
    const ref = adminDb.collection(ADMIN_PUSH_COLLECTION).doc(ADMIN_PUSH_DOC);
    const longest = Math.max(...ADMIN_PUSH_LIMITS.map((w) => w.ms));
    // 確かめると足すを1つのトランザクションで行うので、同時に呼ばれても回数を超えない
    const allowed = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const times = nextPushTimes(snap.exists ? snap.data()?.times : [], now);
      if (!times) return false;
      tx.set(ref, { times, expireAt: new Date(now + longest + 24 * 60 * 60 * 1000) });
      return true;
    });
    if (!allowed) return false;
    const userSnap = await adminDb.collection("users").doc(adminUid).get();
    const tokens = adminTokens(userSnap.data());
    if (tokens.length === 0) {
      console.warn("admin push skipped: no device");
      return false;
    }
    const result = await adminMessaging.sendEachForMulticast({
      tokens,
      notification: { title: text.title, body: text.body },
      webpush: { fcmOptions: { link: "/" } },
    });
    if (result.failureCount > 0) {
      const codes = result.responses.filter((r) => !r.success).map((r) => r.error?.code ?? "unknown");
      console.warn("admin push failures", JSON.stringify(codes));
    }
    return result.successCount > 0;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error("failed to send admin push", code);
    return false;
  }
}
