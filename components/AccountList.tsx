"use client";

// 口座一覧。AppShellの中に表示される想定(独自のヘッダーは持たない)。
// 「期間限定」タブ(キーはwithExpiryのまま)は、期限日が入っているものに加えて
// 名前に「期間」を含むもの(「期間限定」「期間・利用先限定」等、期限日未入力でも対象)を集める。期限月ごとにグルーピングし、
// 期限未入力のものは「期限未設定」セクションにまとめて最上部に表示、直近3ヶ月は展開・それ以降は折りたたむ。
// 「期限なし」タブはどちらにも当てはまらないものを別扱い。「サービス別」タブはグループ名でまとめる。
// 登録・スクショの導線は /accounts/new 側の大きなCTAに集約したため、ここでは持たない。
// クイック更新のみ、控えめなリンクとして残す。

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { CATEGORY_DEFAULTS, type AccountCategory, type AccountDoc } from "@/types/firestore";
import AccountRow, { type AccountWithId } from "@/components/AccountRow";
import StampRowNotice from "@/components/StampRowNotice";
import StampSavedToast from "@/components/StampSavedToast";
import { GroupCheck } from "@/components/SelectCheck";
import {
  SELECTION_LIMIT,
  SELECTION_LIMIT_MESSAGE,
  exitSelection,
  selectionAfterTabChange,
  groupButtonView,
  pruneSelection,
  isAllSelectedInTab,
  toggleSelectAllInTab,
  toggleGroup,
  toggleOne,
  type SelectionResult,
} from "@/lib/listSelection";
import {
  STAMP_TOAST_MS,
  STAMP_WAIT_MS,
  clearNoticesOnTabChange,
  clearStampSavedMessage,
  closeNotice,
  peekStampSavedMessage,
  decideBind,
  planWaitTimeout,
  type StampNoticePlan,
  type StampSavedPayload,
} from "@/lib/stampToast";
import { displayAccountName } from "@/lib/stampMerge";
import { getYenValue } from "@/lib/accountUtils";

function monthKey(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function categoryLabel(acc: AccountWithId) {
  if (acc.category === "other") return acc.customCategoryLabel || "その他";
  return CATEGORY_DEFAULTS[acc.category as AccountCategory]?.label ?? acc.category;
}

function sortAccounts(list: AccountWithId[], mode: "balance" | "name"): AccountWithId[] {
  if (mode === "name") {
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }
  // 残高順:円建てのものだけ金額の大きい順に並べ、非円建て(マイル等、比較できない)は末尾に名前順で並べる
  const yenItems = list.filter((a) => getYenValue(a) !== null);
  const others = list.filter((a) => getYenValue(a) === null);
  yenItems.sort((a, b) => (getYenValue(b) ?? 0) - (getYenValue(a) ?? 0));
  others.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return [...yenItems, ...others];
}

// 「サービス別」タブのグループ内での固定表示順(期間限定/期限なし → ポイント/残高/運用/それ以外)。
// 値が小さいほど先に表示する
function getSortPriority(acc: AccountWithId): number {
  const hasExpiry = Boolean(acc.expiryDate) || acc.name.includes("期間");
  const tier = hasExpiry ? 0 : 1; // 期間限定=0, 期限なし=1

  // 「PayPayポイント(通常)」のように接尾辞が付く名前にも対応するため、末尾一致ではなく含むかで判定する。
  // 「ポイント運用」のような名前を誤って「ポイント」に分類しないよう、「運用」を最優先でチェックする
  let category: number;
  if (acc.name.includes("運用")) category = 2;
  else if (acc.name.includes("残高")) category = 1;
  else if (acc.name.includes("ポイント")) category = 0;
  else category = 3;

  return tier * 10 + category;
}

function sortServiceGroupItems(list: AccountWithId[]): AccountWithId[] {
  return [...list].sort((a, b) => {
    const diff = getSortPriority(a) - getSortPriority(b);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "ja");
  });
}

export default function AccountList() {
  const { uid, isLoading } = useAuth();
  const [accounts, setAccounts] = useState<AccountWithId[]>([]);
  // 一覧の最初の読み込みが済んだか(保存後の案内は、行が出てから結びつける)
  const [loaded, setLoaded] = useState(false);
  // 切手の保存後の案内。pending は読んだだけ、notices は行の下に出す分、fallbackMessage は行が見つからない分(上部のトースト)
  const [pending, setPending] = useState<StampSavedPayload | null>(null);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const scrollTargetRef = useRef<string | null>(null);
  // 案内の表示を始めたか(始めたら storage から消す。StrictMode の二重実行で、同じ案内を2回出さない)
  const startedRef = useRef(false);
  const [tab, setTab] = useState<"withExpiry" | "noExpiry" | "byGroup">(() => {
    if (typeof window === "undefined") return "withExpiry";
    const stored = sessionStorage.getItem("account-list-tab");
    if (stored === "withExpiry" || stored === "noExpiry" || stored === "byGroup") return stored;
    return "withExpiry";
  });
  // 選択モード(複数削除の段階1。削除はまだない)。選択は id の Set で、タブを越えて保持する
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limitNote, setLimitNote] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<"balance" | "name">("balance");
  const [withExpirySortMode, setWithExpirySortMode] = useState<"expiry" | "balance" | "name">(
    "expiry"
  );
  // 「サービス別」タブでの、グループ自体の並び順(グループ内アイテムの順序とは独立)
  const [groupSortMode, setGroupSortMode] = useState<"balance" | "name">("balance");

  // タブの選択状態を、画面遷移をまたいで(編集画面から戻ってきた時など)保持する
  useEffect(() => {
    sessionStorage.setItem("account-list-tab", tab);
  }, [tab]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "accounts"), where("ownerId", "==", uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: AccountWithId[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as AccountDoc),
      }));
      setAccounts(list);
      setLoaded(true);
    });
    return () => unsubscribe();
  }, [uid]);

  // 切手の保存の直後に開いたときだけ、案内が入っている。読んでも消さない(表示を始めたときに消す)ので、
  // 画面が作り直されても(StrictMode の二重実行、再マウント)案内は失われない
  useEffect(() => {
    if (startedRef.current) return;
    const taken = peekStampSavedMessage(window.sessionStorage);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (taken) setPending(taken);
  }, []);

  // 表示を始める(1回だけ)。storage から消し、行の下の案内と、上部のトースト(行が見つからない分だけ)を出す
  function startNotices(plan: StampNoticePlan) {
    if (startedRef.current) return;
    startedRef.current = true;
    clearStampSavedMessage(window.sessionStorage);
    setPending(null);
    setTab(plan.tab);
    setNotices(plan.notices);
    setFallbackMessage(plan.fallback);
    scrollTargetRef.current = plan.firstId;
  }

  const listAccounts = accounts.map((a) => ({ id: a.id, name: a.name, hasExpiry: Boolean(a.expiryDate) }));
  // 待ち時間の超過(下のタイマー)で、その時点の一覧と今のタブで結びつけるために持つ
  const latestRef = useRef({ listAccounts, tab, loaded });
  useEffect(() => {
    latestRef.current = { listAccounts, tab, loaded };
  });

  // 一覧が読み込まれたら、案内を該当の行に結びつける。行が今のタブになければタブを切り替える。
  // 行が全部は見つからない間は待つ(最初の読み込みは、保存した直後の項目をまだ含まないことがあり、先にトーストを出さない)
  useEffect(() => {
    if (!pending || !loaded || startedRef.current) return;
    const plan = decideBind(pending, listAccounts, tab, false);
    if (plan) startNotices(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, loaded, accounts, tab]);

  // 待ち時間(STAMP_WAIT_MS)を超えたら、その時点で見つかった行には行の下に、見つからない分だけ上部のトーストで出す。
  // まだ一覧が読み込まれていなければ、全文を上部のトーストで出す
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      if (startedRef.current) return;
      const cur = latestRef.current;
      if (cur.loaded) {
        const plan = decideBind(pending, cur.listAccounts, cur.tab, true);
        if (plan) startNotices(plan);
        return;
      }
      startNotices({ tab: cur.tab, notices: {}, firstId: null, fallback: planWaitTimeout(pending).fallback });
    }, STAMP_WAIT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  // 案内が出たら、最初の行を画面の中央へ動かす。案内は自動では消さない(閉じる、タブの切り替え、画面を離れる、で消える)
  useEffect(() => {
    if (Object.keys(notices).length === 0) return;
    const id = scrollTargetRef.current;
    scrollTargetRef.current = null;
    if (id) {
      document
        .querySelector(`[data-account-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [notices]);

  function noticeFor(id: string) {
    const text = notices[id];
    if (!text) return undefined;
    return (
      <StampRowNotice
        text={text}
        onClose={() => setNotices((cur) => closeNotice(cur, id))}
      />
    );
  }

  const isLimitedOrHasExpiry = (a: AccountWithId) => Boolean(a.expiryDate) || a.name.includes("期間");

  const withExpiry = accounts.filter(isLimitedOrHasExpiry);
  const noExpiry = sortAccounts(
    accounts.filter((a) => !isLimitedOrHasExpiry(a)),
    sortMode
  );

  const isInvested = (a: AccountWithId) => a.name.endsWith("運用");
  const investedAccounts = noExpiry.filter(isInvested);
  const noExpiryExcludingInvested = noExpiry.filter((a) => !isInvested(a));

  const withExpirySummary = {
    count: withExpiry.length,
    yenTotal: withExpiry.reduce((sum, a) => sum + (getYenValue(a) ?? 0), 0),
  };
  const noExpirySummary = {
    count: noExpiryExcludingInvested.length,
    yenTotal: noExpiryExcludingInvested.reduce((sum, a) => sum + (getYenValue(a) ?? 0), 0),
  };
  const investedSummary = {
    count: investedAccounts.length,
    yenTotal: investedAccounts.reduce((sum, a) => sum + (getYenValue(a) ?? 0), 0),
  };

  const withExpiryDated = withExpiry.filter((a) => a.expiryDate);
  const withExpiryUndated = withExpiry.filter((a) => !a.expiryDate);

  const sorted = [...withExpiryDated].sort((a, b) => {
    const da = (a.expiryDate as Timestamp).toDate().getTime();
    const dbTime = (b.expiryDate as Timestamp).toDate().getTime();
    return da - dbTime;
  });

  const groups = new Map<string, AccountWithId[]>();
  for (const acc of sorted) {
    const key = monthKey((acc.expiryDate as Timestamp).toDate());
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(acc);
  }
  const monthKeys = Array.from(groups.keys());

  const serviceGroups = new Map<string, AccountWithId[]>();
  for (const acc of accounts) {
    const key = displayAccountName(acc.groupName?.trim() || acc.name);
    if (!serviceGroups.has(key)) serviceGroups.set(key, []);
    serviceGroups.get(key)!.push(acc);
  }
  for (const [key, items] of serviceGroups) {
    serviceGroups.set(key, sortServiceGroupItems(items));
  }
  // グループごとの合計残高(円換算できるものだけの合計)。見出し表示・グループの並び替えにも流用する
  const serviceGroupTotals = new Map<string, number>();
  for (const [key, items] of serviceGroups) {
    const total = items.reduce((sum, acc) => sum + (getYenValue(acc) ?? 0), 0);
    serviceGroupTotals.set(key, total);
  }
  // グループ自体の並び順。「名前順」は単純に五十音順、「残高順」は合計残高の降順
  // (合計が0(円換算できるアカウントがない場合を含む)のグループは、末尾に名前順で並べる)
  const serviceGroupKeys = Array.from(serviceGroups.keys()).sort((a, b) => {
    if (groupSortMode === "name") return a.localeCompare(b, "ja");
    const totalA = serviceGroupTotals.get(a) ?? 0;
    const totalB = serviceGroupTotals.get(b) ?? 0;
    if (totalA > 0 && totalB > 0) return totalB - totalA;
    if (totalA > 0) return -1;
    if (totalB > 0) return 1;
    return a.localeCompare(b, "ja");
  });

  // 選択モード。一覧から消えた項目は、選択から外して数える
  const selectedIds = pruneSelection(selected, accounts.map((a) => a.id));
  const currentTabIds = (tab === "withExpiry" ? withExpiry : tab === "noExpiry" ? noExpiry : accounts).map((a) => a.id);
  const allSelectedInTab = isAllSelectedInTab(selectedIds, currentTabIds);
  function applySelection(r: SelectionResult) {
    setSelected(r.next);
    setLimitNote(r.truncated);
  }
  function enterSelectMode() {
    setSelectMode(true);
    setLimitNote(false);
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelected(exitSelection());
    setLimitNote(false);
  }
  // 行に渡す、選択モードの props
  function rowSelect(id: string) {
    return { selectMode, selected: selectedIds.has(id), onToggleSelect: () => applySelection(toggleOne(selectedIds, id)) };
  }
  function groupCheck(label: string, ids: string[]) {
    const v = groupButtonView(selectedIds, ids, label);
    return (
      <GroupCheck
        state={v.state}
        text={v.text}
        ariaLabel={v.ariaLabel}
        onClick={() => applySelection(toggleGroup(selectedIds, ids))}
      />
    );
  }

  // 選択モードの操作ボタン: 枠線つき、高さ44px以上、濃い文字色(白地に #6e2a32 でコントラスト比は約 10:1)
  const selectBtnStyle = {
    minHeight: 44,
    padding: "0 16px",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--brand)",
    background: "#fff",
    border: "1.5px solid var(--brand)",
    borderRadius: 999,
  } as const;

  function toggleMonth(key: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (isLoading) {
    return <p style={{ fontSize: 14, color: "#999" }}>読み込み中です...</p>;
  }

  return (
    <div>
      {/* 読み上げ用。枠の外に常設し、案内が出たときに中身が入る(画面には出ない) */}
      <div
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        {Object.values(notices).join(" ")}
      </div>
      {fallbackMessage && (
        <StampSavedToast message={fallbackMessage} durationMs={STAMP_TOAST_MS} onClose={() => setFallbackMessage(null)} />
      )}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", textAlign: "center" }}>
          <div>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 4px" }}>期間限定</p>
            <p style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, margin: 0 }}>
              ¥{withExpirySummary.yenTotal.toLocaleString()}
            </p>
            <p style={{ fontSize: 11, color: "#999", margin: "2px 0 0" }}>
              {withExpirySummary.count}件
            </p>
          </div>
          <div style={{ borderLeft: "1px solid #eee" }}>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 4px" }}>期限なし</p>
            <p style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, margin: 0 }}>
              ¥{noExpirySummary.yenTotal.toLocaleString()}
            </p>
            <p style={{ fontSize: 11, color: "#999", margin: "2px 0 0" }}>
              {noExpirySummary.count}件
            </p>
          </div>
          <div style={{ borderLeft: "1px solid #eee" }}>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 4px" }}>運用残高</p>
            <p style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, margin: 0 }}>
              ¥{investedSummary.yenTotal.toLocaleString()}
            </p>
            <p style={{ fontSize: 11, color: "#999", margin: "2px 0 0" }}>
              {investedSummary.count}件
            </p>
          </div>
        </div>
      </div>

      {/* 選択モードの操作。通常のときは「選択」ボタンだけ */}
      {selectMode ? (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            margin: "0 -20px 12px",
            padding: "10px 20px",
            background: "#fff",
            borderBottom: "1px solid #d9cfcf",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={selectBtnStyle} onClick={exitSelectMode}>
              キャンセル
            </button>
            <button
              type="button"
              style={selectBtnStyle}
              onClick={() => applySelection(toggleSelectAllInTab(selectedIds, currentTabIds))}
            >
              {allSelectedInTab ? "すべて解除" : "すべて選択"}
            </button>
            <span aria-live="polite" style={{ fontSize: 15, fontWeight: 600, color: "#222", marginLeft: "auto" }}>
              {selectedIds.size}件を選択中
            </span>
          </div>
          {currentTabIds.length > SELECTION_LIMIT && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#555" }}>
              「すべて選択」は、先頭の{SELECTION_LIMIT}件までです
            </p>
          )}
          {limitNote && (
            <p role="status" style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 600, color: "#b3261e" }}>
              {SELECTION_LIMIT_MESSAGE}
            </p>
          )}
        </div>
      ) : (
        accounts.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button type="button" className="btn-ghost" style={{ minHeight: 44 }} onClick={enterSelectMode}>
              選択
            </button>
          </div>
        )
      )}

      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          background: "#f2ece7",
          borderRadius: "var(--radius-pill)",
          padding: 4,
        }}
      >
        {[
          { key: "withExpiry", label: "期間限定" },
          { key: "noExpiry", label: "期限なし" },
          { key: "byGroup", label: "サービス別" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key as typeof tab);
              // 選択モードは続け、選択だけ空にする(同じタブなら変えない)
              setSelected((cur) => selectionAfterTabChange(cur, tab, t.key as typeof tab));
              if (t.key !== tab) setLimitNote(false);
              setNotices((cur) => clearNoticesOnTabChange(cur));
            }}
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: 13,
              background: tab === t.key ? "var(--brand)" : "transparent",
              border: "none",
              borderRadius: "var(--radius-pill)",
              color: tab === t.key ? "#fff" : "#666",
              fontWeight: tab === t.key ? 500 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "withExpiry" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            {[
              { key: "expiry", label: "期限順" },
              { key: "balance", label: "残高順" },
              { key: "name", label: "名前順" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setWithExpirySortMode(s.key as typeof withExpirySortMode)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill)",
                  border: withExpirySortMode === s.key ? "none" : "1px solid #ddd",
                  background: withExpirySortMode === s.key ? "var(--brand)" : "transparent",
                  color: withExpirySortMode === s.key ? "#fff" : "#888",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {withExpirySortMode === "expiry" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {monthKeys.length === 0 && withExpiryUndated.length === 0 && (
                <p style={{ fontSize: 14, color: "#999" }}>登録されたサービスがありません</p>
              )}
              {withExpiryUndated.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {selectMode ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 14px",
                        fontSize: 13,
                        fontWeight: 500,
                        background: "#faf8f6",
                      }}
                    >
                      {groupCheck("期限未設定", withExpiryUndated.map((a) => a.id))}
                      <span>期限未設定</span>
                    </div>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        padding: "10px 14px",
                        fontSize: 13,
                        fontWeight: 500,
                        background: "#faf8f6",
                      }}
                    >
                      期限未設定
                    </p>
                  )}
                  <div>
                    {withExpiryUndated.map((acc) => (
                      <AccountRow
                        key={acc.id}
                        account={acc}
                        notice={noticeFor(acc.id)}
                        {...rowSelect(acc.id)}
                        subText={categoryLabel(acc)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {monthKeys.map((key, index) => {
                const isRecent = index < 3;
                const expanded = isRecent || expandedMonths.has(key);
                const items = groups.get(key)!;
                return (
                  <div key={key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    {selectMode ? (
                      <div style={{ display: "flex", alignItems: "center", background: "#faf8f6", paddingLeft: 14 }}>
                        {groupCheck(key, items.map((a) => a.id))}
                        <button
                          onClick={() => toggleMonth(key)}
                          style={{
                            flex: 1,
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "10px 14px 10px 8px",
                            fontSize: 13,
                            fontWeight: 500,
                            background: "#faf8f6",
                            border: "none",
                          }}
                        >
                          <span>{key}</span>
                          <span style={{ color: "#bbb" }}>{expanded ? "－" : "＋"}</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleMonth(key)}
                        style={{
                          width: "100%",
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          fontSize: 13,
                          fontWeight: 500,
                          background: "#faf8f6",
                          border: "none",
                        }}
                      >
                        <span>{key}</span>
                        <span style={{ color: "#bbb" }}>{expanded ? "－" : "＋"}</span>
                      </button>
                    )}
                    {expanded && (
                      <div>
                        {items.map((acc) => (
                          <AccountRow
                            key={acc.id}
                            account={acc}
                            notice={noticeFor(acc.id)}
                            {...rowSelect(acc.id)}
                            subText={categoryLabel(acc)}
                            highlightOverdue
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {withExpiry.length === 0 && (
                <p style={{ fontSize: 14, color: "#999", padding: 14 }}>登録されたサービスがありません</p>
              )}
              {sortAccounts(withExpiry, withExpirySortMode).map((acc) => {
                const expiry = acc.expiryDate ? (acc.expiryDate as Timestamp).toDate() : null;
                return (
                  <AccountRow
                    key={acc.id}
                    account={acc}
                    notice={noticeFor(acc.id)}
                    {...rowSelect(acc.id)}
                    subText={expiry ? `${expiry.getFullYear()}年${expiry.getMonth() + 1}月期限` : ""}
                    highlightOverdue
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "noExpiry" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            {[
              { key: "balance", label: "残高順" },
              { key: "name", label: "名前順" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setSortMode(s.key as typeof sortMode)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill)",
                  border: sortMode === s.key ? "none" : "1px solid #ddd",
                  background: sortMode === s.key ? "var(--brand)" : "transparent",
                  color: sortMode === s.key ? "#fff" : "#888",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {noExpiry.length === 0 && (
              <p style={{ fontSize: 14, color: "#999", padding: 14 }}>登録されたサービスがありません</p>
            )}
            {noExpiry.map((acc) => (
              <AccountRow
                key={acc.id}
                account={acc}
                notice={noticeFor(acc.id)}
                {...rowSelect(acc.id)}
                subText={categoryLabel(acc)}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "byGroup" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            {[
              { key: "balance", label: "残高順" },
              { key: "name", label: "名前順" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setGroupSortMode(s.key as typeof groupSortMode)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill)",
                  border: groupSortMode === s.key ? "none" : "1px solid #ddd",
                  background: groupSortMode === s.key ? "var(--brand)" : "transparent",
                  color: groupSortMode === s.key ? "#fff" : "#888",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {serviceGroupKeys.length === 0 && (
              <p style={{ fontSize: 14, color: "#999" }}>登録されたサービスがありません</p>
            )}
            {serviceGroupKeys.map((key) => {
              const items = serviceGroups.get(key)!;
              const total = serviceGroupTotals.get(key) ?? 0;
              return (
                <div key={key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      background: "#faf8f6",
                    }}
                  >
                    {selectMode ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {groupCheck(key, items.map((a) => a.id))}
                        <span>{key}</span>
                      </span>
                    ) : (
                      <span>{key}</span>
                    )}
                    {total > 0 && (
                      <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700 }}>
                        ¥{total.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {items.map((acc) => {
                    const expiry = acc.expiryDate ? (acc.expiryDate as Timestamp).toDate() : null;
                    return (
                      <AccountRow
                        key={acc.id}
                        account={acc}
                        notice={noticeFor(acc.id)}
                        {...rowSelect(acc.id)}
                        subText={expiry
                            ? `${expiry.getFullYear()}年${expiry.getMonth() + 1}月期限`
                            : acc.name.includes("期間")
                              ? "期限未入力"
                              : "期限なし"}
                        highlightOverdue
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 選択モードの下部バー。画面の下(下部ナビ .tabbar の上)に固定する。.tabbar は高さ78pxの別の枠。
          一覧の末尾に同じ高さの余白を足して、最後の行が隠れないようにする。削除は段階2で有効にする */}
      {selectMode && (
        <>
          <div aria-hidden="true" style={{ height: 80 }} />
          <div
            style={{
              position: "fixed",
              bottom: 78,
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(100%, 480px)",
              zIndex: 20,
              boxSizing: "border-box",
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              background: "#fff",
              borderTop: "1px solid #d9cfcf",
              boxShadow: "0 -2px 6px rgba(0,0,0,0.06)",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600, color: "#222" }}>{selectedIds.size}件を選択中</span>
            <button
              type="button"
              disabled
              style={{
                minHeight: 44,
                padding: "0 16px",
                fontSize: 14,
                fontWeight: 600,
                color: "#555",
                background: "#eee",
                border: "1.5px solid #bbb",
                borderRadius: 999,
              }}
            >
              削除(準備中)
            </button>
          </div>
        </>
      )}

      <div style={{ textAlign: "center", marginTop: 20 }}>
        <Link href="/accounts/quick-update" className="btn-ghost" style={{ textDecoration: "none" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Zap size={13} /> クイック更新
          </span>
        </Link>
      </div>
    </div>
  );
}
