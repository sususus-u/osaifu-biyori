import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultRowName,
  isStampName,
  planStampSave,
  stampSaveMessage,
  toExistingItem,
  validateStampRows,
  MAX_STAMP_ROWS,
  type ExistingItem,
  type SaveRow,
} from "./stampMerge.ts";
import { saveStamps, type StampSaveDeps, type StampTx } from "./stampSave.ts";

function item(over: Partial<ExistingItem> & { id: string }): ExistingItem {
  return {
    name: "切手 1円",
    category: "gift_certificate",
    faceValue: 1,
    currentBalance: 18,
    itemQuantity: 18,
    createdMillis: 1000,
    ...over,
  };
}
const row = (name: string, faceValue: number, count: number): SaveRow => ({ name, faceValue, count });

// ---- 計画(純粋な関数) ----

test("足す: 18枚+5枚=23枚、18円+5円=23円", () => {
  const plan = planStampSave([item({ id: "a" })], [row("切手 1円", 1, 5)]);
  assert.deepEqual(plan, [
    { kind: "add", id: "a", name: "切手 1円", faceValue: 1, addCount: 5, newCount: 23, newBalance: 23 },
  ]);
});

test("作る: 同じ項目がなければ新しく作る(合計は額面×枚数)", () => {
  const plan = planStampSave([], [row("切手 2円", 2, 25)]);
  assert.deepEqual(plan, [{ kind: "create", name: "切手 2円", faceValue: 2, count: 25, amount: 50 }]);
});

test("重複: 同じ条件の項目が複数あれば、いちばん古いものに足す", () => {
  const plan = planStampSave(
    [item({ id: "new", createdMillis: 5000 }), item({ id: "old", createdMillis: 100 }), item({ id: "none", createdMillis: null })],
    [row("切手 1円", 1, 1)]
  );
  assert.equal(plan[0].kind === "add" && plan[0].id, "old");
});

test("名前違い・種類違い・額面違いは別扱い(作る)", () => {
  const existing = [
    item({ id: "renamed", name: "切手 1円(旧)" }),
    item({ id: "other-cat", category: "points" }),
    item({ id: "other-face", faceValue: 2 }),
    item({ id: "legacy", name: "切手", faceValue: 1 }),
  ];
  const plan = planStampSave(existing, [row("切手 1円", 1, 5)]);
  assert.equal(plan[0].kind, "create");
});

test("複数行: 行ごとに足す/作るが決まる", () => {
  const plan = planStampSave([item({ id: "a" })], [row("切手 1円", 1, 5), row("切手 2円", 2, 3)]);
  assert.equal(plan[0].kind, "add");
  assert.deepEqual(plan[1], { kind: "create", name: "切手 2円", faceValue: 2, count: 3, amount: 6 });
});

test("同じ名前・額面の行が2つあれば、先に1つにまとめる", () => {
  const plan = planStampSave([], [row("切手 1円", 1, 5), row("切手 1円", 1, 4)]);
  assert.deepEqual(plan, [{ kind: "create", name: "切手 1円", faceValue: 1, count: 9, amount: 9 }]);
});

test("既存の枚数・金額が null のときは 0 として足す", () => {
  const plan = planStampSave([item({ id: "a", itemQuantity: null, currentBalance: null })], [row("切手 1円", 1, 5)]);
  assert.equal(plan[0].kind === "add" && plan[0].newCount, 5);
  assert.equal(plan[0].kind === "add" && plan[0].newBalance, 5);
});

test("案内の文", () => {
  const plan = planStampSave([item({ id: "a" })], [row("切手 1円", 1, 5), row("切手 2円", 2, 3)]);
  assert.equal(stampSaveMessage(plan), "切手 1円に5枚追加しました（合計23枚）\n切手 2円を新しく作りました（3枚）");
});

test("名前の判定と初期値", () => {
  assert.equal(isStampName("切手 1円"), true);
  assert.equal(isStampName("切手"), false);
  assert.equal(isStampName("切手 1円(旧)"), false);
  assert.equal(defaultRowName("切手", "10"), "切手 10円");
  assert.equal(defaultRowName("", "2"), "切手 2円");
  assert.equal(defaultRowName("切手", ""), "");
  assert.equal(defaultRowName("切手", "1.5"), "");
});

test("入力の確認: 名前が空、長すぎ、行が多すぎ", () => {
  assert.equal(validateStampRows([row("切手 1円", 1, 1)]), null);
  assert.ok(validateStampRows([row(" ", 1, 1)]));
  assert.ok(validateStampRows([row("あ".repeat(41), 1, 1)]));
  assert.ok(validateStampRows(Array.from({ length: MAX_STAMP_ROWS + 1 }, (_, i) => row(`切手 ${i + 1}円`, i + 1, 1))));
});

test("toExistingItem: 作成日時と数値を取り出す。形が違えば null", () => {
  const it = toExistingItem("x", {
    name: "切手 1円", category: "gift_certificate", faceValue: 1, currentBalance: 3, itemQuantity: 3,
    createdAt: { toMillis: () => 42 },
  });
  assert.equal(it?.createdMillis, 42);
  assert.equal(toExistingItem("x", { name: 1 }), null);
});

// ---- 保存の流れ(偽の Firestore) ----

// メモリ上の口座。トランザクションは、fn が成功したときだけ書き込みを反映する。
// 読んだ項目が途中で他から書き換えられていたら、競合として fn を呼び直す(本物のトランザクションと同じ)。
class FakeDb {
  docs = new Map<string, ExistingItem>();
  version = new Map<string, number>();
  seq = 0;
  txRuns = 0;
  // fn の実行中(読み取りのあと)に、別の端末の書き込みを差し込むための合図
  interleave: (() => void) | null = null;

  put(it: ExistingItem) {
    this.docs.set(it.id, it);
    this.version.set(it.id, (this.version.get(it.id) ?? 0) + 1);
  }

  deps(): StampSaveDeps {
    return {
      listMine: async () => [...this.docs.values()],
      runTransaction: async <T>(fn: (tx: StampTx) => Promise<T>): Promise<T> => {
        for (let attempt = 0; attempt < 5; attempt++) {
          this.txRuns++;
          const read = new Map<string, number>();
          const writes: (() => void)[] = [];
          const tx: StampTx = {
            get: async (id) => {
              read.set(id, this.version.get(id) ?? 0);
              return this.docs.get(id) ?? null;
            },
            addTo: (id, newCount, newBalance) =>
              writes.push(() => {
                const cur = this.docs.get(id)!;
                this.put({ ...cur, itemQuantity: newCount, currentBalance: newBalance });
              }),
            create: (c) => {
              const id = `new${++this.seq}`;
              writes.push(() =>
                this.put({
                  id, name: c.name, category: "gift_certificate", faceValue: c.faceValue,
                  currentBalance: c.amount, itemQuantity: c.count, createdMillis: 9000,
                })
              );
              return id;
            },
          };
          const result = await fn(tx); // 例外なら、書き込みを反映せずに外へ出る
          const inject = this.interleave;
          this.interleave = null;
          inject?.();
          const conflict = [...read].some(([id, v]) => (this.version.get(id) ?? 0) !== v);
          if (conflict) continue;
          writes.forEach((w) => w());
          return result;
        }
        throw new Error("競合が解消しません");
      },
    };
  }
}

test("保存: 足す行と作る行を、まとめて1回で保存する", async () => {
  const db = new FakeDb();
  db.put(item({ id: "a" }));
  const { plan, items, message } = await saveStamps(db.deps(), [row("切手 1円", 1, 5), row("切手 2円", 2, 25)]);
  assert.equal(plan.length, 2);
  // 案内の文と、足した/作った項目の ID(作った方は、実際に作られた項目の ID)
  assert.equal(message, "切手 1円に5枚追加しました（合計23枚）\n切手 2円を新しく作りました（25枚）");
  assert.equal(items[0].id, "a");
  assert.equal(items[0].kind, "add");
  assert.equal(items[0].text, "切手 1円に5枚追加しました（合計23枚）");
  assert.equal(items[1].kind, "create");
  assert.equal(db.docs.get(items[1].id)?.name, "切手 2円");
  assert.equal(db.docs.get("a")?.itemQuantity, 23);
  assert.equal(db.docs.get("a")?.currentBalance, 23);
  const created = [...db.docs.values()].find((d) => d.name === "切手 2円");
  assert.equal(created?.itemQuantity, 25);
  assert.equal(created?.currentBalance, 50);
  assert.equal(db.docs.size, 2);
});

test("失敗時は全部失敗: 途中で例外なら、どの行も保存されない", async () => {
  const db = new FakeDb();
  db.put(item({ id: "a" }));
  const base = db.deps();
  const failing: StampSaveDeps = {
    listMine: base.listMine,
    runTransaction: (fn) =>
      base.runTransaction((tx) =>
        fn({
          ...tx,
          // 2行目(作る)を書こうとして失敗する
          create: () => {
            throw new Error("書き込み失敗");
          },
        })
      ),
  };
  await assert.rejects(saveStamps(failing, [row("切手 1円", 1, 5), row("切手 2円", 2, 25)]), /書き込み失敗/);
  assert.equal(db.docs.get("a")?.itemQuantity, 18); // 足した分も反映されていない
  assert.equal(db.docs.size, 1);
});

test("同時更新: 読んだあとに別の端末が 18→20 にしても、足し算がずれない(20+5=25)", async () => {
  const db = new FakeDb();
  db.put(item({ id: "a" }));
  db.interleave = () => db.put(item({ id: "a", itemQuantity: 20, currentBalance: 20 }));
  await saveStamps(db.deps(), [row("切手 1円", 1, 5)]);
  assert.equal(db.txRuns, 2); // 競合で1回やり直した
  assert.equal(db.docs.get("a")?.itemQuantity, 25);
  assert.equal(db.docs.get("a")?.currentBalance, 25);
});

test("クエリのあと、トランザクションまでの間に項目が消えたら、新しく作る", async () => {
  const db = new FakeDb();
  db.put(item({ id: "a" }));
  const base = db.deps();
  const deps: StampSaveDeps = {
    listMine: async () => {
      const found = await base.listMine();
      db.docs.delete("a"); // 探したあとに、別の端末が消した
      return found;
    },
    runTransaction: base.runTransaction,
  };
  const { plan } = await saveStamps(deps, [row("切手 1円", 1, 5)]);
  assert.equal(plan[0].kind, "create");
  assert.equal([...db.docs.values()][0].itemQuantity, 5);
});

test("クエリのあとに名前や額面が変えられた項目には足さない", async () => {
  const db = new FakeDb();
  db.put(item({ id: "a" }));
  const base = db.deps();
  const deps: StampSaveDeps = {
    listMine: async () => {
      const found = await base.listMine();
      db.put(item({ id: "a", name: "別の名前" }));
      return found;
    },
    runTransaction: base.runTransaction,
  };
  const { plan } = await saveStamps(deps, [row("切手 1円", 1, 5)]);
  assert.equal(plan[0].kind, "create");
  assert.equal(db.docs.get("a")?.itemQuantity, 18);
});

// ---- 切手の判定と、保存する行の名前 ----

import { isScannedStamp, normalizeName, saveRowName } from "./stampMerge.ts";

test("切手の判定: 名前が「切手」と完全に一致するときだけ", () => {
  assert.equal(isScannedStamp("切手"), true);
  assert.equal(isScannedStamp(" 切手 "), true);
  for (const n of ["図書カード", "Amazonギフト券", "商品券", "切手シート", "切手 1円", "", null, undefined]) {
    assert.equal(isScannedStamp(n), false, String(n));
  }
});

test("1円だけの写真(額面が1種類): 名前が「切手 1円」になり、既存の「切手 1円」に足される", async () => {
  const name = saveRowName({ rowCount: 1, name: "切手", scanIsStamp: isScannedStamp("切手"), faceValue: "1" });
  assert.equal(name, "切手 1円");
  const db = new FakeDb();
  db.put(item({ id: "a" }));
  await saveStamps(db.deps(), [row(name, 1, 5)]);
  assert.equal(db.docs.get("a")?.itemQuantity, 23);
  assert.equal(db.docs.get("a")?.currentBalance, 23);
});

test("今ある「切手」(額面×枚数の1件)には触らない", async () => {
  const db = new FakeDb();
  db.put(item({ id: "legacy", name: "切手", faceValue: 1, itemQuantity: 10, currentBalance: 10 }));
  await saveStamps(db.deps(), [row("切手 1円", 1, 5)]);
  assert.equal(db.docs.get("legacy")?.itemQuantity, 10);
  assert.equal(db.docs.size, 2);
});

test("名前の決め方: 複数行、手で付けた名前、手で「切手」に変えた場合、切手以外", () => {
  const stamp = { rowCount: 1, name: "切手", scanIsStamp: true, faceValue: "2" };
  assert.equal(saveRowName(stamp), "切手 2円");
  assert.equal(saveRowName({ ...stamp, rowName: "私の切手" }), "私の切手");
  assert.equal(saveRowName({ rowCount: 2, name: "切手", scanIsStamp: true, faceValue: "3" }), "切手 3円");
  // 手で名前を変えた(scanIsStamp が false): 名前欄の名前そのもの(今までどおり1件)
  assert.equal(saveRowName({ rowCount: 1, name: "切手", scanIsStamp: false, faceValue: "1" }), "切手");
  // 切手以外: AI の返した名前のまま
  assert.equal(saveRowName({ rowCount: 1, name: "図書カード", scanIsStamp: isScannedStamp("図書カード"), faceValue: "500" }), "図書カード");
  // 切手以外の複数行は「名前 N円」
  assert.equal(saveRowName({ rowCount: 2, name: "図書カード", scanIsStamp: false, faceValue: "500" }), "図書カード 500円");
});

// ---- 名前のゆれ ----

test("正規化: 空白(半角・全角・タブ・改行)を除き、全角数字を半角にする", () => {
  for (const n of ["切手 1円", "切手1円", "切手　1円", "切手 １円", "切手\t1円\n", "切手　１円"]) {
    assert.equal(normalizeName(n), "切手1円", JSON.stringify(n));
  }
  assert.notEqual(normalizeName("切手 1円"), normalizeName("切手 2円"));
  assert.notEqual(normalizeName("記念切手 1円"), normalizeName("切手 1円"));
});

test("「切手1円」「切手　1円」「切手 １円」は、既存の「切手 1円」と同じ項目として足される(名前は書き換えない)", () => {
  for (const typed of ["切手1円", "切手　1円", "切手 １円"]) {
    const plan = planStampSave([item({ id: "a" })], [row(typed, 1, 5)]);
    assert.equal(plan[0].kind, "add", typed);
    assert.equal(plan[0].kind === "add" && plan[0].newCount, 23, typed);
  }
});

test("逆向き: 既存が「切手1円」でも、「切手 1円」が足される", () => {
  const plan = planStampSave([item({ id: "a", name: "切手1円" })], [row("切手 1円", 1, 5)]);
  assert.equal(plan[0].kind, "add");
});

test("「切手 1円」と「切手 2円」、名前を変えた「記念切手 1円」は別扱い(作る)", () => {
  assert.equal(planStampSave([item({ id: "a" })], [row("切手 2円", 1, 5)])[0].kind, "create");
  assert.equal(planStampSave([item({ id: "a", name: "記念切手 1円" })], [row("切手 1円", 1, 5)])[0].kind, "create");
});

test("同じ保存の中の「切手 1円」と「切手1円」の行は、1つにまとめる", () => {
  const plan = planStampSave([], [row("切手 1円", 1, 5), row("切手1円", 1, 4)]);
  assert.deepEqual(plan, [{ kind: "create", name: "切手 1円", faceValue: 1, count: 9, amount: 9 }]);
});

// ---- 名前の表示と保存の統一 ----
import { canonicalStampName, displayAccountName, findSameName } from "./stampMerge.ts";

test("表示: 「切手1円」「切手　1円」「切手 １円」は、すべて「切手 1円」。空白・全角数字のゆれだけを直す", () => {
  for (const n of ["切手1円", "切手　1円", "切手 １円", " 切手  1円 ", "切手 1円"]) {
    assert.equal(displayAccountName(n), "切手 1円");
  }
  assert.equal(displayAccountName("切手 10円"), "切手 10円");
});

test("表示: 「記念切手 1円」などはそのまま。「切手 1円」と「切手 2円」は別", () => {
  assert.equal(displayAccountName("記念切手 1円"), "記念切手 1円");
  assert.equal(displayAccountName("切手"), "切手");
  assert.equal(displayAccountName("PayPay残高"), "PayPay残高");
  assert.notEqual(displayAccountName("切手1円"), displayAccountName("切手2円"));
});

test("保存の正規化: 「切手 N円」と同じ名前だけ、「切手 N円」にする。別の名前は変えない", () => {
  assert.equal(canonicalStampName("切手１円"), "切手 1円");
  assert.equal(canonicalStampName("記念切手1円"), "記念切手1円");
  assert.equal(canonicalStampName("楽天ポイント"), "楽天ポイント");
});

test("同名の確認: 「切手1円」と入力すると、既にある「切手 1円」が見つかる。別の額面は見つからない", () => {
  const items = [{ name: "切手 1円" }, { name: "切手 2円" }];
  assert.equal(findSameName(items, "切手1円"), items[0]);
  assert.equal(findSameName(items, "切手　２円"), items[1]);
  assert.equal(findSameName(items, "切手3円"), undefined);
  assert.equal(findSameName(items, "  "), undefined);
});

// ---- 読み込み中の表示の条件 ----
import { busyViewForPhysical, busyViewForScan, BUSY_PREPARING, BUSY_READING } from "./busyView.ts";

test("切手の読み取り: 準備中、読み取り中の順に出る。どちらでもなければ出ない(終わると消える)", () => {
  assert.equal(busyViewForPhysical(true, false)!.title, BUSY_PREPARING);
  assert.equal(busyViewForPhysical(false, true)!.title, BUSY_READING);
  assert.equal(busyViewForPhysical(false, false), null);
  assert.ok(busyViewForPhysical(false, true)!.note.includes("数秒"));
});

test("スクショの読み取り: 処理中だけ出る。文が空なら準備中、読み取りの文なら読み取り中、ほかはその文", () => {
  assert.equal(busyViewForScan(false, "画像を読み取っています…"), null);
  assert.equal(busyViewForScan(true, "")!.title, BUSY_PREPARING);
  assert.equal(busyViewForScan(true, "画像を読み取っています…")!.title, BUSY_READING);
  assert.equal(busyViewForScan(true, "既存の項目を確認しています…")!.title, "既存の項目を確認しています…");
});
import { stashStampSavedMessage, takeStampSavedMessage } from "./stampToast.ts";

// ---- 手で足したときの案内 ----
import { manualAddNotice } from "./stampMerge.ts";

test("手動で足す(切手): 読み取りの保存と同じ形の文。名前のゆれは「切手 N円」にそろう", () => {
  assert.equal(
    manualAddNotice({ name: "切手1円", addQuantity: 5, newQuantity: 23, addBalance: 5, newBalance: 23, unit: "円" }),
    "切手 1円に5枚追加しました（合計23枚）"
  );
});

test("手動で足す(切手以外): 足した量と合計が分かる。枚数だけ、何もないときの文も", () => {
  assert.equal(
    manualAddNotice({ name: "楽天ポイント", addQuantity: 0, newQuantity: 0, addBalance: 500, newBalance: 1500, unit: "ポイント" }),
    "「楽天ポイント」に500ポイントを追加しました（合計1,500ポイント）"
  );
  assert.equal(
    manualAddNotice({ name: "商品券", addQuantity: 2, newQuantity: 7, addBalance: 0, newBalance: 0, unit: "円" }),
    "「商品券」に2枚追加しました（合計7枚）"
  );
  assert.equal(
    manualAddNotice({ name: "商品券", addQuantity: 0, newQuantity: 0, addBalance: 0, newBalance: 0, unit: "円" }),
    "「商品券」に追加しました"
  );
});

test("手動で足した案内は、読み取りの保存と同じ入れ物(items に id と kind=add)で、読み出しできる", () => {
  const data = new Map<string, string>();
  const st = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  const text = "切手 1円に5枚追加しました（合計23枚）";
  stashStampSavedMessage(st, { message: text, items: [{ id: "abc", kind: "add", text }] });
  assert.deepEqual(takeStampSavedMessage(st), { message: text, items: [{ id: "abc", kind: "add", text }] });
});

// ---- 足し先の選び方(手動と読み取りで同じ規則)と、複数あるときの注意 ----
import { MULTIPLE_STAMP_NOTE, pickAddTarget, planStampSave as planSave2, stampItemText as itemText2 } from "./stampMerge.ts";

function ex(id: string, name: string, faceValue: number | null, createdMillis: number | null, category = "gift_certificate") {
  return { id, name, category, faceValue, currentBalance: 0, itemQuantity: 0, createdMillis, type: "finite" };
}

test("手動の足し先: 候補が複数あれば最古。名前のゆれ・作成日時なし・同じ日時(id順)も読み取りと同じ", () => {
  const items = [ex("z", "切手1円", 1, 300), ex("b", "切手 1円", 1, 100), ex("a", "切手　１円", 1, null), ex("c", "切手 1円", 1, 100)];
  const r = pickAddTarget(items, { name: "切手 1円", category: "electronic_money" });
  assert.equal(r.target!.id, "b");
  assert.equal(r.count, 4);
  // 読み取りの保存の計画と同じ先
  const plan = planSave2(items, [{ name: "切手 1円", faceValue: 1, count: 1 }]);
  assert.equal(plan[0].kind === "add" && plan[0].id, "b");
});

test("手動の足し先: 額面の違う項目、種類の違う項目には足さない(切手)。1件なら注意の元になる count は 1", () => {
  const items = [ex("x", "切手 2円", 2, 1), ex("y", "切手 1円", 1, 1, "electronic_money"), ex("w", "切手 1円", 1, 5)];
  const r = pickAddTarget(items, { name: "切手1円", category: "electronic_money" });
  assert.equal(r.target!.id, "w");
  assert.equal(r.count, 1);
  assert.equal(pickAddTarget([ex("x", "切手 2円", 2, 1)], { name: "切手 1円", category: "gift_certificate" }).target, undefined);
});

test("手動の足し先(切手以外): 名前で選ぶ。同じ種類を優先し、なければ名前が合うもの全部から最古", () => {
  const items = [ex("p", "PayPay残高", null, 100, "electronic_money"), ex("q", "PayPay残高", null, 50, "point"), ex("r", "別の名前", null, 1)];
  const same = pickAddTarget(items, { name: "PayPay残高", category: "electronic_money" });
  assert.equal(same.target!.id, "p");
  assert.equal(same.count, 1);
  const other = pickAddTarget(items, { name: "PayPay残高", category: "gift_certificate" });
  assert.equal(other.target!.id, "q");
  assert.equal(other.count, 2);
  assert.equal(pickAddTarget(items, { name: "", category: "point" }).target, undefined);
});

test("注意: 読み取りの保存は、候補が2件以上のときだけ文に続く。1件なら今の文のまま", () => {
  const one = planSave2([ex("a", "切手 1円", 1, 1)], [{ name: "切手 1円", faceValue: 1, count: 5 }]);
  assert.equal(itemText2(one[0]), "切手 1円に5枚追加しました（合計5枚）");
  const two = planSave2([ex("a", "切手 1円", 1, 1), ex("b", "切手1円", 1, 2)], [{ name: "切手 1円", faceValue: 1, count: 5 }]);
  assert.equal(itemText2(two[0]), "切手 1円に5枚追加しました（合計5枚）" + MULTIPLE_STAMP_NOTE);
});

test("注意: 手動の文。切手は「同じ額面」、切手以外は「同じ名前」。1件なら付かない", () => {
  const base = { addQuantity: 5, newQuantity: 23, addBalance: 5, newBalance: 23, unit: "円" };
  assert.equal(manualAddNotice({ ...base, name: "切手1円" }), "切手 1円に5枚追加しました（合計23枚）");
  assert.equal(manualAddNotice({ ...base, name: "切手1円", multiple: true }), "切手 1円に5枚追加しました（合計23枚）。同じ額面のポイント・残高が複数あります。");
  assert.equal(
    manualAddNotice({ name: "楽天ポイント", addQuantity: 0, newQuantity: 0, addBalance: 500, newBalance: 1500, unit: "ポイント", multiple: true }),
    "「楽天ポイント」に500ポイントを追加しました（合計1,500ポイント）。同じ名前のポイント・残高が複数あります。"
  );
});

test("古い形式の案内(文字列だけ、items の text だけ)も、注意つきの文も、読める", () => {
  const data = new Map<string, string>();
  const st = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  const text = "切手 1円に5枚追加しました（合計23枚）" + MULTIPLE_STAMP_NOTE;
  stashStampSavedMessage(st, { message: text, items: [{ id: "abc", kind: "add", text }] });
  assert.equal(takeStampSavedMessage(st)!.items[0].text, text);
  data.set("tamari:stampSavedMessage", "切手 1円に5枚追加しました（合計23枚）");
  assert.deepEqual(takeStampSavedMessage(st), { message: "切手 1円に5枚追加しました（合計23枚）", items: [] });
});

// ---- 手動の登録: グループ名「切手」の額面の数字入力 ----
import { isStampGroupEntry, MAX_STAMP_FACE_VALUE, parseStampFace, stampFaceFromName, stampNameFromFace } from "./stampMerge.ts";

test("数字入力から名前: 「84」「８４」は「切手 84円」。前後の空白は無視", () => {
  for (const raw of ["84", "８４", " 84 ", "８ ４"]) {
    const r = parseStampFace(raw);
    assert.equal(r.kind, "ok");
    if (r.kind === "ok") assert.equal(stampNameFromFace(r.value), "切手 84円");
  }
});

test("数字入力: 空欄は未入力。0、負の数、小数、文字、上限超えは不可。上限ちょうどは可", () => {
  assert.equal(parseStampFace("").kind, "empty");
  assert.equal(parseStampFace("  ").kind, "empty");
  for (const bad of ["0", "00", "-5", "1.5", "１．５", "abc", "84円", String(MAX_STAMP_FACE_VALUE + 1)]) {
    assert.equal(parseStampFace(bad).kind, "invalid", bad);
  }
  assert.equal(parseStampFace(String(MAX_STAMP_FACE_VALUE)).kind, "ok");
});

test("名前から額面を戻す(名称を自分で付けた名前は対象外)。足し先の規則は、この名前でそのまま動く", () => {
  assert.equal(stampFaceFromName("切手 84円"), 84);
  assert.equal(stampFaceFromName("切手８４円"), 84);
  assert.equal(stampFaceFromName("記念切手 84円"), null);
  assert.equal(stampFaceFromName(""), null);
  const r = pickAddTarget([ex("a", "切手 84円", 84, 1)], { name: stampNameFromFace(84), category: "electronic_money" });
  assert.equal(r.target!.id, "a");
});

test("数字入力にするのは、グループ名が「切手」の新規登録だけ。編集モードや別のグループ名では出ない(名前は変わらない)", () => {
  assert.equal(isStampGroupEntry(false, "切手"), true);
  assert.equal(isStampGroupEntry(false, " 切手 "), true);
  assert.equal(isStampGroupEntry(true, "切手"), false);
  assert.equal(isStampGroupEntry(false, "記念切手"), false);
  assert.equal(isStampGroupEntry(false, ""), false);
});

// ---- 2つの選択(額面の数字で入力する / 名称を自分で付ける) ----
import { STAMP_DEFAULT_NAME, STAMP_MANUAL_PLACEHOLDER, stampEntryMode, switchStampMode } from "./stampMerge.ts";

const modeBase = { isEditMode: false, groupName: "切手", manualFlag: false, name: "", faceInput: "" };

test("グループ名が「切手」の新規登録では2つの選択が出る。初期値は数字入力。数字入力の名前の見せ方は「切手」", () => {
  assert.equal(stampEntryMode(modeBase), "numeric");
  assert.equal(STAMP_DEFAULT_NAME, "切手");
  assert.equal(STAMP_MANUAL_PLACEHOLDER, "記念切手 など");
});

test("編集モード、別のグループ名では、2つの選択が出ない(null)", () => {
  assert.equal(stampEntryMode({ ...modeBase, isEditMode: true }), null);
  assert.equal(stampEntryMode({ ...modeBase, groupName: "PayPay" }), null);
});

test("数字入力のとき、額面が空だと保存できない(空欄・不正は、確認で止まる)", () => {
  assert.equal(parseStampFace("").kind, "empty");
  assert.equal(parseStampFace("abc").kind, "invalid");
  assert.equal(parseStampFace("84").kind, "ok");
});

test("切り替えで、手で打った名前を失わない。数字入力に戻すと名前は「切手 N円」、また手入力に戻すと復元", () => {
  // 手入力で「記念切手」と打ち、数字入力へ(額面 84 が入っている)
  const toNum = switchStampMode("numeric", { name: "記念切手", savedManualName: "", faceShown: "84" });
  assert.deepEqual(toNum, { name: "切手 84円", savedManualName: "記念切手" });
  const back = switchStampMode("manual", { name: toNum.name, savedManualName: toNum.savedManualName, faceShown: "84" });
  assert.equal(back.name, "記念切手");
  // 額面が空のまま数字入力へ戻すと名前は空(画面では「切手」)
  assert.equal(switchStampMode("numeric", { name: "記念切手", savedManualName: "", faceShown: "" }).name, "");
});

test("名前がすでに別の名称で額面の入力がないとき(引き継ぎなど)は、手入力として扱い、名前を失わない", () => {
  assert.equal(stampEntryMode({ ...modeBase, name: "記念切手" }), "manual");
  assert.equal(stampEntryMode({ ...modeBase, name: "切手 84円" }), "numeric");
  assert.equal(stampEntryMode({ ...modeBase, manualFlag: true }), "manual");
});

test("「名称を自分で付ける」に切り替えると、名前は空(控えた名前があれば復元)。空のままでは保存できない", () => {
  const fresh = switchStampMode("manual", { name: "切手 84円", savedManualName: "", faceShown: "84" });
  assert.equal(fresh.name, "");
  assert.equal(stampEntryMode({ ...modeBase, manualFlag: true, name: fresh.name }), "manual"); // 空でも手入力のまま
  // 名前が空だと、画面の確認(name.trim() === "")で止まる
  assert.equal(fresh.name.trim() === "", true);
  const restored = switchStampMode("manual", { name: "切手 84円", savedManualName: "記念切手", faceShown: "84" });
  assert.equal(restored.name, "記念切手");
});

// ---- 自動で決まった名前の見せ方(濃い文字色。WCAG AA) ----
import { STAMP_NAME_COLOR, STAMP_NAME_HINT_COLOR, contrastRatio, stampNameView } from "./stampNameView.ts";

test("額面を入れたあとの名前は、濃い文字色(案内用の薄い色ではない)。案内の文は付かない", () => {
  const v = stampNameView("切手 84円", "切手");
  assert.equal(v.text, "切手 84円");
  assert.equal(v.textColor, STAMP_NAME_COLOR);
  assert.notEqual(v.textColor, STAMP_NAME_HINT_COLOR);
  assert.equal(v.hint, "");
});

test("額面を入れる前は、「切手」と薄めの案内の文。決まったあとより薄い", () => {
  const v = stampNameView("", "切手");
  assert.equal(v.text, "切手");
  assert.ok(v.hint.includes("額面を入れると"));
  assert.equal(v.textColor, STAMP_NAME_HINT_COLOR);
  assert.ok(contrastRatio(STAMP_NAME_COLOR, v.background) > contrastRatio(STAMP_NAME_HINT_COLOR, v.background));
});

test("コントラスト比は WCAG AA(4.5:1)以上。決まった名前も、案内も", () => {
  const v = stampNameView("切手 84円", "切手");
  assert.ok(contrastRatio(STAMP_NAME_COLOR, v.background) >= 4.5);
  assert.ok(contrastRatio(STAMP_NAME_HINT_COLOR, v.background) >= 4.5);
  assert.ok(contrastRatio("#000000", "#ffffff") > 20.9); // 計算の確かめ(黒と白は 21:1)
});

// ---- 切手の自動設定(種類・単位・期限・通知) ----
import { NO_TOUCH, stampAutoApply, stampAutoRestore, stampAutoSummary } from "./stampAuto.ts";

const initial = { category: "electronic_money", unit: "円", hasExpiry: null as boolean | null };

test("切手のとき、種類=商品券・切手、単位=円、期限=なしが自動で入る(通知は期限なしで対象外)", () => {
  const next = stampAutoApply(initial, NO_TOUCH);
  assert.deepEqual(next, { category: "gift_certificate", unit: "円", hasExpiry: false });
  assert.equal(
    stampAutoSummary({ isStampEntry: true, cur: next, touched: NO_TOUCH }),
    "自動で設定しました: 種類=商品券・切手、単位=円、期限=なし、通知=なし（変更できます）"
  );
});

test("手で変えた欄は、上書きしない(一言にも出ない)", () => {
  const cur = { category: "other", unit: "枚", hasExpiry: true as boolean | null };
  const touched = { category: true, unit: true, expiry: true };
  assert.deepEqual(stampAutoApply(cur, touched), cur);
  assert.equal(stampAutoSummary({ isStampEntry: true, cur, touched }), null);
  const part = stampAutoApply(initial, { category: true, unit: false, expiry: false });
  assert.deepEqual(part, { category: "electronic_money", unit: "円", hasExpiry: false });
});

test("グループ名を変えると、手で変えていない欄だけ元に戻る", () => {
  const applied = stampAutoApply(initial, NO_TOUCH);
  assert.deepEqual(stampAutoRestore(applied, initial, NO_TOUCH), initial);
  const edited = { ...applied, hasExpiry: true as boolean | null };
  const back = stampAutoRestore(edited, initial, { category: false, unit: false, expiry: true });
  assert.deepEqual(back, { category: "electronic_money", unit: "円", hasExpiry: true });
});

test("編集モード(切手の新規登録でない)では、一言が出ない。自動設定の入口は止まる", () => {
  assert.equal(stampAutoSummary({ isStampEntry: false, cur: stampAutoApply(initial, NO_TOUCH), touched: NO_TOUCH }), null);
  assert.equal(isStampGroupEntry(true, "切手"), false);
});

// ---- 段階3: 読み取りの新規作成のグループ名と、一言 ----
import { groupNameForNewItem } from "./stampMerge.ts";
import { scanStampSummary } from "./stampAuto.ts";

test("新規作成のグループ名: 「切手 N円」は「切手」(ゆれも)。別の名前は名前のまま。足す場合は呼ばない", () => {
  assert.equal(groupNameForNewItem("切手 84円"), "切手");
  assert.equal(groupNameForNewItem("切手１円"), "切手");
  assert.equal(groupNameForNewItem("記念切手 84円"), "記念切手 84円");
  assert.equal(groupNameForNewItem("図書カード 500円"), "図書カード 500円");
  // 足す側(planStampSave)の計画には、グループ名が無い=既存の項目のグループ名は変えない
  const plan = planStampSave(
    [{ id: "a", name: "切手 1円", category: "gift_certificate", faceValue: 1, currentBalance: 0, itemQuantity: 0, createdMillis: 1 }],
    [{ name: "切手 1円", faceValue: 1, count: 3 }]
  );
  assert.equal(plan[0].kind, "add");
  assert.equal("groupName" in plan[0], false);
});

test("読み取りの一言: 期限なし/期限ありの文。期限を手で直したら、期限と通知は挙げない", () => {
  assert.equal(
    scanStampSummary({ expiryDate: "", expiryTouched: false }),
    "自動で設定しました: 種類=商品券・切手、単位=円、期限=なし、通知=なし（変更できます）"
  );
  assert.equal(
    scanStampSummary({ expiryDate: "2027-03-31", expiryTouched: false }),
    "自動で設定しました: 種類=商品券・切手、単位=円、期限=2027-03-31、通知=90日前・21日前（変更できます）"
  );
  assert.equal(
    scanStampSummary({ expiryDate: "2027-03-31", expiryTouched: true }),
    "自動で設定しました: 種類=商品券・切手、単位=円（変更できます）"
  );
});

// ---- 「置き換える」の扱い(切手は出さない。切手以外は前後の値つきの確認) ----
import { isStampLikeEntry } from "./stampMerge.ts";
import { REPLACE_NO_CHANGE, replaceChanges } from "./replaceConfirm.ts";

test("切手のとき、「置き換える」を出さない: 名前のゆれ、または 種類=商品券・切手 かつ グループ名=切手", () => {
  assert.equal(isStampLikeEntry({ name: "切手 1円", category: "electronic_money", groupName: "" }), true);
  assert.equal(isStampLikeEntry({ name: "切手１円", category: "electronic_money", groupName: "" }), true);
  assert.equal(isStampLikeEntry({ name: "記念切手", category: "gift_certificate", groupName: "切手" }), true);
});

test("切手以外では、「置き換える」が出る(切手の判定に当たらない)", () => {
  assert.equal(isStampLikeEntry({ name: "PayPay残高", category: "electronic_money", groupName: "PayPay" }), false);
  assert.equal(isStampLikeEntry({ name: "記念切手", category: "gift_certificate", groupName: "" }), false);
  assert.equal(isStampLikeEntry({ name: "図書カード", category: "gift_certificate", groupName: "図書カード" }), false);
});

test("置き換えの説明: 変わるものだけ。残高だけ/期限も/額面・枚数/単位と桁区切り", () => {
  const base = { balance: 1000, expiry: null, faceValue: null, quantity: null };
  assert.deepEqual(replaceChanges(base, { ...base, balance: 25000 }, "円"), ["残高: 1,000円 → 25,000円"]);
  assert.deepEqual(replaceChanges(base, { ...base, balance: 500, expiry: "2027-03-31" }, "ポイント"), [
    "残高: 1,000ポイント → 500ポイント",
    "期限: なし → 2027-03-31",
  ]);
  assert.deepEqual(replaceChanges({ ...base, faceValue: 500, quantity: 3 }, { ...base, faceValue: 1000, quantity: 5 }, "円"), ["額面: 500円 → 1,000円", "枚数: 3枚 → 5枚"]);
});

test("置き換えの説明: 変わらない項目は出ない。何も変わらなければ空(画面は「変わる項目はありません」)", () => {
  const same = { balance: 100, expiry: "2027-01-01", faceValue: 10, quantity: 2 };
  assert.deepEqual(replaceChanges(same, { ...same }, "円"), []);
  assert.equal(REPLACE_NO_CHANGE, "変わる項目はありません。");
  assert.deepEqual(replaceChanges({ ...same, expiry: "2027-01-01" }, { ...same, expiry: null }, "円"), ["期限: 2027-01-01 → なし"]);
});

import { showTopNameField } from "./stampMerge.ts";

test("上の名前の欄: 切手の読み取りのときだけ隠す(保存の名前は行ごと)", () => {
  assert.equal(showTopNameField(true), false);
  assert.equal(showTopNameField(false), true);
  // 隠すとき、保存に使われる名前は上の名前ではなく、行の名前(額面が1種類でも)
  assert.equal(saveRowName({ rowCount: 1, name: "切手", scanIsStamp: true, faceValue: "1" }), "切手 1円");
  assert.equal(saveRowName({ rowCount: 1, name: "切手", scanIsStamp: true, rowName: "記念切手 1円", faceValue: "1" }), "記念切手 1円");
  assert.equal(saveRowName({ rowCount: 2, name: "切手", scanIsStamp: true, faceValue: "84" }), "切手 84円");
});

import { topNameHint } from "./stampMerge.ts";

test("上の名前の説明: 行が1つなら保存される名前、複数なら行の名前の元", () => {
  assert.equal(topNameHint(1), "保存される名前です。");
  assert.match(topNameHint(2), /各行の名前の元/);
  // 説明どおり、行が1つの切手以外は名前欄の名前がそのまま保存される。複数は行の名前(なければ「名前 額面円」)
  assert.equal(saveRowName({ rowCount: 1, name: "図書カード", scanIsStamp: false, faceValue: "500" }), "図書カード");
  assert.equal(saveRowName({ rowCount: 2, name: "商品券", scanIsStamp: false, faceValue: "1000" }), "商品券 1000円");
});
