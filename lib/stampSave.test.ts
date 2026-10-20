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
  assert.equal(stampSaveMessage(plan), "切手 1円に5枚追加しました(合計23枚)\n切手 2円を新しく作りました(3枚)");
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
  assert.equal(message, "切手 1円に5枚追加しました(合計23枚)\n切手 2円を新しく作りました(25枚)");
  assert.equal(items[0].id, "a");
  assert.equal(items[0].kind, "add");
  assert.equal(items[0].text, "切手 1円に5枚追加しました(合計23枚)");
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
