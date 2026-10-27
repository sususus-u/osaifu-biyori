import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AI_BUDGET_COLLECTION,
  AI_POINTS,
  DEFAULT_AI_BUDGET,
  aiBudgetLog,
  dailyPointLimit,
  parseAiBudget,
} from "./aiBudget.ts";
import { consumeCore, type UsageTx } from "./usageCore.ts";

test("既定値: 1日の上限は、月の上限 × 1割 × 4割 × 1,000 点", () => {
  const expected = Math.floor(
    DEFAULT_AI_BUDGET.monthlyLimitUsd * DEFAULT_AI_BUDGET.dailyRatio * DEFAULT_AI_BUDGET.shares.osaifu * 1000 + 1e-6
  );
  assert.equal(dailyPointLimit(DEFAULT_AI_BUDGET), expected);
  assert.equal(DEFAULT_AI_BUDGET.shares.tabe + DEFAULT_AI_BUDGET.shares.mamori + DEFAULT_AI_BUDGET.shares.osaifu, 1);
});

test("設定の記録の月の上限を変えると、1日の上限がそれに合わせて変わる(1か所だけ直せばよい)", () => {
  const budget = parseAiBudget({ monthly_limit_usd: 50 });
  assert.equal(budget.dailyRatio, DEFAULT_AI_BUDGET.dailyRatio);
  assert.equal(dailyPointLimit(budget), 2000);
  assert.equal(dailyPointLimit(budget, "mamori"), 1000);
  assert.equal(dailyPointLimit(budget, "tabe"), 2000);
});

test("設定の記録がない・型が違う・範囲の外のときは、その項目だけ既定値", () => {
  assert.deepEqual(parseAiBudget(undefined), DEFAULT_AI_BUDGET);
  const b = parseAiBudget({ monthly_limit_usd: "50", daily_ratio: 2, share_osaifu: -1, share_tabe: 0.5 });
  assert.equal(b.monthlyLimitUsd, DEFAULT_AI_BUDGET.monthlyLimitUsd);
  assert.equal(b.dailyRatio, DEFAULT_AI_BUDGET.dailyRatio);
  assert.equal(b.shares.osaifu, DEFAULT_AI_BUDGET.shares.osaifu);
  assert.equal(b.shares.tabe, 0.5);
  assert.equal(parseAiBudget({ monthly_limit_usd: 0 }).monthlyLimitUsd, DEFAULT_AI_BUDGET.monthlyLimitUsd);
});

test("1回の点数は、依頼217の多めの見積もり(スクショ 8点、現物 40点)", () => {
  assert.equal(AI_POINTS.scanAccount, 8);
  assert.equal(AI_POINTS.scanPhysical, 40);
});

function fakeRun(store: Map<string, number>, budget: { points: number }) {
  return <T>(fn: (tx: UsageTx) => Promise<T>) => {
    const tx: UsageTx = {
      async read(id) {
        return store.get(id) ?? 0;
      },
      write(id, count) {
        store.set(id, count);
      },
      async readBudget() {
        return budget.points;
      },
      writeBudget(points) {
        budget.points = points;
      },
    };
    return fn(tx);
  };
}

const ids = { daily: "u_2026-10-27", monthly: "u_2026-10" };
const limits = { daily: 20, monthly: 100, enforceMonthly: false };

test("合計の点数が上限まで余っていれば、1人ごとの回数と合計の点数の両方を増やす", async () => {
  const store = new Map<string, number>();
  const budget = { points: 1150 };
  assert.equal(await consumeCore(fakeRun(store, budget), ids, limits, { points: 40, limit: 1200 }), "ok");
  assert.equal(budget.points, 1190);
  assert.equal(store.get(ids.daily), 1);
});

test("この1回で合計の上限を超えるなら止め、どちらも増やさない", async () => {
  const store = new Map<string, number>();
  const budget = { points: 1190 };
  assert.equal(await consumeCore(fakeRun(store, budget), ids, limits, { points: 40, limit: 1200 }), "budget");
  assert.equal(budget.points, 1190);
  assert.equal(store.get(ids.daily), undefined);
  // 安いほうの機能は、まだ通る
  assert.equal(await consumeCore(fakeRun(store, budget), ids, limits, { points: 8, limit: 1200 }), "ok");
});

test("1人ごとの1日の上限は、今までどおり先に効く", async () => {
  const store = new Map<string, number>([[ids.daily, 20]]);
  const budget = { points: 0 };
  assert.equal(await consumeCore(fakeRun(store, budget), ids, limits, { points: 8, limit: 1200 }), "daily");
  assert.equal(budget.points, 0);
});

test("ログは決まった印で始まる1行で、[AI_PAUSED] とは別", () => {
  const s = aiBudgetLog("scan-account", 1196, 1200);
  assert.ok(s.startsWith("[AI_DAILY_BUDGET] osaifu-biyori scan-account"));
  assert.ok(!s.includes("[AI_PAUSED]") && !s.includes("\n"));
});

test("窓口は機能を渡し、合計の上限では「休んでいます」(503)を返し、失敗のときは点数も戻す", () => {
  const usage = readFileSync(new URL("./usageLimit.ts", import.meta.url), "utf8");
  assert.match(usage, /consumed\.blocked === "budget"[\s\S]*?aiPausedBody\(\), \{ status: 503 \}/);
  assert.match(usage, /aiBudgetLog\(route, consumed\.used, consumed\.limit\)\);\s+await notifyOperator\("ai-daily-limit"\);/);
  assert.match(usage, /budgetRef\.update\(\{ points: FieldValue\.increment\(-points\)/);
  assert.match(usage, /expireAt: Timestamp\.fromMillis\(Date\.now\(\) \+ AI_BUDGET_RETENTION_DAYS \* DAY_MS\)/);
  assert.equal(AI_BUDGET_COLLECTION, "usage_global_tamari");
  const account = readFileSync(new URL("../app/api/scan-account/route.ts", import.meta.url), "utf8");
  assert.match(account, /guardAiRead\(req\.headers\.get\("authorization"\), "scanAccount", "scan-account"\)/);
  const physical = readFileSync(new URL("../app/api/scan-physical-count/route.ts", import.meta.url), "utf8");
  assert.match(physical, /guardAiRead\(req\.headers\.get\("authorization"\), "scanPhysical", "scan-physical-count"\)/);
});
