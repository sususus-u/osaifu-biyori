// 毎日1回、Vercel Cronから呼び出される通知送信バッチ。
// 全ユーザーの全口座を確認し、通知タイミング(1段階目/2段階目)に該当する口座があれば
// プッシュ通知を送る。同じ期限日に対して二重送信しないよう、送信済みフラグを記録する。
// 期限の7日前から当日までは、毎朝送る(lib/notificationSchedule.ts。依頼289)。

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb, adminMessaging } from "@/lib/firebaseAdmin";
import { isCronAuthorized } from "@/lib/cronAuth";
import type { AccountDoc, UserDoc } from "@/types/firestore";
import { jstDateString } from "@/lib/planLimits";
import { inDailyWindow, notifyBody, pickNotifyStage } from "@/lib/notificationSchedule";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / msPerDay);
}

export async function GET(req: NextRequest) {
  // Vercel Cronからの呼び出しであることを確認(手違いで誰でも叩けないようにする)
  // CRON_SECRET が未設定なら、常に断る
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const todayIso = jstDateString(today.getTime());
  const accountsSnap = await adminDb.collection("accounts").get();

  let sentCount = 0;
  let skippedCount = 0;
  // 端末ごとの送信失敗は例外にならないため、件数とエラーコードだけを集計してログに残す
  // (あわせて所要時間 durationMs も残す)
  // (トークンや通知本文はログに含めない)
  let failureCount = 0;
  const failureCodes: Record<string, number> = {};

  for (const accountDoc of accountsSnap.docs) {
    const account = accountDoc.data() as AccountDoc;
    if (!account.expiryDate) continue;

    const expiry = (account.expiryDate as unknown as Timestamp).toDate();
    const daysUntilExpiry = daysBetween(today, expiry);
    const expiryIso = toIsoDate(expiry);

    const { firstStageDays, secondStageDays } = account.notificationTiming;

    const stage = pickNotifyStage({
      daysUntilExpiry,
      firstStageDays,
      secondStageDays,
      expiryIso,
      todayIso,
      notifiedFirstStageForDate: account.notifiedFirstStageForDate,
      notifiedSecondStageForDate: account.notifiedSecondStageForDate,
      notifiedDailyOn: account.notifiedDailyOn,
    });

    if (!stage) {
      skippedCount++;
      continue;
    }

    const userSnap = await adminDb.collection("users").doc(account.ownerId).get();
    const user = userSnap.data() as UserDoc | undefined;
    const tokens = user?.fcmTokens ?? [];
    if (tokens.length === 0) {
      skippedCount++;
      continue;
    }

    const body = notifyBody(stage, account.name, daysUntilExpiry);

    try {
      const result = await adminMessaging.sendEachForMulticast({
        tokens,
        notification: {
          title: "おさいふびより:期限のお知らせ",
          body,
        },
        webpush: {
          fcmOptions: {
            link: "/",
          },
        },
      });
      sentCount++;
      failureCount += result.failureCount;
      for (const response of result.responses) {
        if (response.success) continue;
        const code = response.error?.code ?? "unknown";
        failureCodes[code] = (failureCodes[code] ?? 0) + 1;
      }

      // 7日前からの毎朝の分も、同じ日に2回送らないよう、送った日を残す
      await accountDoc.ref.update({
        ...(stage === "first" ? { notifiedFirstStageForDate: expiryIso } : {}),
        ...(stage === "second" ? { notifiedSecondStageForDate: expiryIso } : {}),
        ...(inDailyWindow(daysUntilExpiry) ? { notifiedDailyOn: todayIso } : {}),
      });
    } catch (error) {
      console.error(`通知送信に失敗しました(accountId: ${accountDoc.id})`, error);
    }
  }

  const summary = { failureCount, failureCodes, durationMs: Date.now() - today.getTime() };
  if (failureCount > 0) {
    console.warn("通知送信の結果(失敗あり)", JSON.stringify(summary));
  } else {
    console.log("通知送信の結果", JSON.stringify(summary));
  }

  return NextResponse.json({ sentCount, skippedCount, checkedAt: today.toISOString() });
}
