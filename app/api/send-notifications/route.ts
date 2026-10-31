// 毎日1回、Vercel Cronから呼び出される通知送信バッチ。
// 全ユーザーの全口座を確認し、その日に送るお知らせ(気づきのお知らせ・直前のお知らせ)があれば
// プッシュ通知を送る。同じ日に2通送らないよう、送った日(notifiedOn)を記録する(lib/notificationSchedule.ts)。
// 気づきのお知らせは、選んだ日に1回ずつ。無料のプランは、いちばん早い日だけ(lib/reminderTiming.ts。依頼317)。
// 期限の7日前から当日までは、直前のお知らせを毎朝送る(依頼289)。2回目のお知らせは、やめた(依頼317)。
// 合言葉 PUSH_RELAY_KEY があれば、ホームの通知で送る(lib/servicePush.ts。依頼290)。

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb, adminMessaging } from "@/lib/firebaseAdmin";
import { isCronAuthorized } from "@/lib/cronAuth";
import type { AccountDoc, UserDoc } from "@/types/firestore";
import { isPlanEnforced, jstDateString } from "@/lib/planLimits";
import { inDailyWindow, notifyBody, pickNotifyStage, type NotifyStage } from "@/lib/notificationSchedule";
import { needsOwnSend, relayItem, relayViaHome } from "@/lib/servicePush";
import { effectiveReminderDays, selectedReminderDays } from "@/lib/reminderTiming";
import { firestoreLastKnownStore, type Plan } from "@/lib/plan-resolve";
import { planForNotify } from "@/lib/notifyPlan";
// 期限までの日数は、日本時間の暦で数える(依頼365 決定7。サーバーは世界標準時)
import { daysUntilExpiry as daysToExpiry, expiryIsoOf } from "@/lib/jstDate";


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

  // 1. その日に知らせるものを集める
  type Due = {
    accountDoc: (typeof accountsSnap.docs)[number];
    account: AccountDoc;
    stage: NotifyStage;
    daysUntilExpiry: number;
    expiryIso: string;
  };
  const due: Due[] = [];
  // 持ち主ごとのプラン(1回の実行で1人1回だけ読む。lib/notifyPlan.ts)
  const enforced = isPlanEnforced();
  const lastKnownStore = firestoreLastKnownStore(adminDb, "tamari");
  const plans = new Map<string, Promise<Plan>>();
  const planOf = (uid: string) => {
    let p = plans.get(uid);
    if (!p) {
      p = planForNotify({
        uid,
        enforced,
        read: (id) => adminDb.collection("subscriptions").doc(id).get(),
        store: lastKnownStore,
        now: today,
      });
      plans.set(uid, p);
    }
    return p;
  };
  for (const accountDoc of accountsSnap.docs) {
    const account = accountDoc.data() as AccountDoc;
    if (!account.expiryDate) continue;

    const expiry = (account.expiryDate as unknown as Timestamp).toDate();
    const daysUntilExpiry = daysToExpiry(expiry, today);
    if (!Number.isFinite(daysUntilExpiry)) continue;
    const expiryIso = expiryIsoOf(expiry) ?? "";

    // 期限が過ぎたもの、まだ気づきの日より前のものは、プランを読まずに飛ばす
    const selected = selectedReminderDays(account.notificationTiming);
    const mayNotify = daysUntilExpiry >= 0 && (inDailyWindow(daysUntilExpiry) || selected.includes(daysUntilExpiry));
    const stage = mayNotify
      ? pickNotifyStage({
          daysUntilExpiry,
          reminderDays: inDailyWindow(daysUntilExpiry)
            ? []
            : effectiveReminderDays(selected, await planOf(account.ownerId)),
          todayIso,
          notifiedOn: account.notifiedOn,
          notifiedDailyOn: account.notifiedDailyOn,
        })
      : null;

    if (!stage) {
      skippedCount++;
      continue;
    }
    due.push({ accountDoc, account, stage, daysUntilExpiry, expiryIso });
  }

  // 2. ホームの「代わりに送る」窓口に頼む(合言葉 PUSH_RELAY_KEY があるときだけ。依頼290)。
  //    ホームで届けられなかったものだけ、今までどおり FCM で送る(2重に届かないように)。
  const relayed = await relayViaHome(
    due.map((d) =>
      relayItem({
        uid: d.account.ownerId,
        stage: d.stage,
        name: d.account.name,
        days: d.daysUntilExpiry,
        accountId: d.accountDoc.id,
      }),
    ),
    process.env.PUSH_RELAY_KEY,
  );
  let relayedCount = 0;

  for (const [index, { accountDoc, account, stage, daysUntilExpiry, expiryIso }] of due.entries()) {
    // 同じ日に2通送らないよう、送った日を残す(気づき・直前のどちらでも notifiedOn。
    // 前の形の欄も、今までどおり書く: 気づきは notifiedFirstStageForDate、直前は notifiedDailyOn)
    const markNotified = () =>
      accountDoc.ref.update({
        notifiedOn: todayIso,
        ...(stage === "reminder" ? { notifiedFirstStageForDate: expiryIso } : {}),
        ...(inDailyWindow(daysUntilExpiry) ? { notifiedDailyOn: todayIso } : {}),
      });

    const relayResult = relayed[index];
    if (!needsOwnSend(relayResult)) {
      // ホームが送った(sent)、またはホームでオフにしている・回数の上限(off・limited)
      if (relayResult === "sent") relayedCount++;
      try {
        await markNotified();
      } catch (error) {
        console.error(`送った印を残せませんでした(accountId: ${accountDoc.id})`, error);
      }
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

      await markNotified();
    } catch (error) {
      console.error(`通知送信に失敗しました(accountId: ${accountDoc.id})`, error);
    }
  }

  const summary = { failureCount, failureCodes, relayedCount, durationMs: Date.now() - today.getTime() };
  if (failureCount > 0) {
    console.warn("通知送信の結果(失敗あり)", JSON.stringify(summary));
  } else {
    console.log("通知送信の結果", JSON.stringify(summary));
  }

  return NextResponse.json({ sentCount, relayedCount, skippedCount, checkedAt: today.toISOString() });
}
