// 切手の保存後の案内を、切手の画面から一覧の画面へ渡し、一覧で出す先(該当の行、または上部のトースト)を決める。
// 画面が切り替わると切手の画面の表示は消えるため、sessionStorage に1回分だけ入れ、一覧が開いたときに読んですぐ消す。
// storage は引数で受けるので、テストでは偽物を使う。
export const STAMP_SAVED_MESSAGE_KEY = "tamari:stampSavedMessage";
export const STAMP_TOAST_MS = 4000; // 上部のトースト(代わりの案内)
export const STAMP_WAIT_MS = 3000; // 一覧の読み込みを待つ上限。超えたら上部のトーストへ切り替える

export interface MessageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// 保存した1項目ぶんの案内(足した/作った)
export interface SavedItem {
  id: string;
  kind: "add" | "create";
  text: string;
}

export interface StampSavedPayload {
  message: string; // まとめた文(複数行は改行)
  items: SavedItem[]; // 古い形式(文字列だけ)から読んだときは空
}

// 入れる。storage が使えない(例外)ときは、黙って何もしない(保存そのものは済んでいる)
export function stashStampSavedMessage(storage: MessageStorage | null, payload: StampSavedPayload): void {
  if (!storage || payload.message.trim() === "") return;
  try {
    storage.setItem(STAMP_SAVED_MESSAGE_KEY, JSON.stringify(payload));
  } catch {
    // 案内が出ないだけ
  }
}

function isSavedItem(v: unknown): v is SavedItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id !== "" &&
    (o.kind === "add" || o.kind === "create") &&
    typeof o.text === "string"
  );
}

// 読む(消さない)。なければ、読めなければ null。古い形式(文字列だけ)も読める(items は空)。
// 消すのは、表示を始めたとき(clearStampSavedMessage)。画面が作り直されても、案内を失わないため
export function peekStampSavedMessage(storage: MessageStorage | null): StampSavedPayload | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STAMP_SAVED_MESSAGE_KEY);
    if (raw === null || raw.trim() === "") return null;
    if (raw.trimStart().startsWith("{")) {
      try {
        const v = JSON.parse(raw) as { message?: unknown; items?: unknown };
        if (typeof v.message === "string" && v.message.trim() !== "") {
          const items = Array.isArray(v.items) ? v.items.filter(isSavedItem) : [];
          return { message: v.message, items };
        }
        return null;
      } catch {
        return { message: raw, items: [] };
      }
    }
    return { message: raw, items: [] };
  } catch {
    return null;
  }
}

// 消す。storage が使えないときは、黙って何もしない
export function clearStampSavedMessage(storage: MessageStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(STAMP_SAVED_MESSAGE_KEY);
  } catch {
    // 消えないだけ
  }
}

// 読んで、すぐ消す(peek + clear)
export function takeStampSavedMessage(storage: MessageStorage | null): StampSavedPayload | null {
  const v = peekStampSavedMessage(storage);
  clearStampSavedMessage(storage);
  return v;
}

// 行の下の案内は、自動では消さない。1件ずつ閉じる(他の案内は残る)
export function closeNotice(notices: Record<string, string>, id: string): Record<string, string> {
  const next = { ...notices };
  delete next[id];
  return next;
}

// 一覧のタブをユーザーが切り替えたら、案内は全部消す(保存直後の自動の切り替えでは呼ばない)
export function clearNoticesOnTabChange(notices: Record<string, string>): Record<string, string> {
  return Object.keys(notices).length === 0 ? notices : {};
}

// 結びつけを始めてよいか。items があるのに行が全部は見つからない間は、待つ(null)。
// 一覧の最初の読み込みは、保存した直後の項目をまだ含まないことがあり、先に上部のトーストを出さないため。
// 全部見つかる、または待ち時間を超えた(timedOut)ときに、計画を返す。items が空(古い形式)は待たない
export function decideBind(
  payload: StampSavedPayload,
  accounts: ListAccount[],
  currentTab: ListTab,
  timedOut: boolean
): StampNoticePlan | null {
  const plan = planStampNotices(payload, accounts, currentTab);
  if (plan.fallback !== null && payload.items.length > 0 && !timedOut) return null;
  return plan;
}

// 読み込みを待ちきれなかったとき(STAMP_WAIT_MS 超)は、行に結びつけず、全文を上部のトーストへ
export function planWaitTimeout(payload: StampSavedPayload): { fallback: string } {
  return { fallback: payload.message };
}

// ---- 一覧での出し先 ----

export type ListTab = "withExpiry" | "noExpiry" | "byGroup";

// 一覧の行の判定に必要な値だけ
export interface ListAccount {
  id: string;
  name: string;
  hasExpiry: boolean;
}

// 一覧の「期間限定」タブに入るか(AccountList の判定と同じ)
function isLimited(a: ListAccount): boolean {
  return a.hasExpiry || a.name.includes("期間");
}

// その行が必ず出るタブ。期限日つきは、月ごとの折りたたみで隠れうるので、必ず全部出る「サービス別」にする
function homeTab(a: ListAccount): ListTab {
  if (!isLimited(a)) return "noExpiry";
  return a.hasExpiry ? "byGroup" : "withExpiry";
}

// 該当の行が出るタブを選ぶ。今のタブで全部見えれば今のまま。全部が同じタブならそこ。そうでなければ「サービス別」
export function pickTab(current: ListTab, targets: ListAccount[]): ListTab {
  if (targets.length === 0 || current === "byGroup") return current;
  if (targets.every((a) => homeTab(a) === current)) return current;
  const first = homeTab(targets[0]);
  return targets.every((a) => homeTab(a) === first) ? first : "byGroup";
}

export interface StampNoticePlan {
  tab: ListTab;
  // 行の下に出す案内(項目の ID → 文)
  notices: Record<string, string>;
  // 画面の中央へ動かす最初の行
  firstId: string | null;
  // 行が見つからない分の案内(上部のトーストで出す)。全部見つかれば null
  fallback: string | null;
}

// 一覧に出ている項目と照らして、行の下に出すものと、上部のトーストで出すものを分ける。
// 見つかった項目は上部のトーストに出さない(二重にしない)。items が空(古い形式)なら、全文を上部のトーストへ
export function planStampNotices(
  payload: StampSavedPayload,
  accounts: ListAccount[],
  currentTab: ListTab
): StampNoticePlan {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const found = payload.items.filter((i) => byId.has(i.id));
  const missing = payload.items.filter((i) => !byId.has(i.id));
  const notices: Record<string, string> = {};
  for (const i of found) notices[i.id] = i.text;
  const fallback =
    payload.items.length === 0
      ? payload.message
      : missing.length > 0
        ? missing.map((i) => i.text).join("\n")
        : null;
  return {
    tab: pickTab(currentTab, found.map((i) => byId.get(i.id)!)),
    notices,
    firstId: found.length > 0 ? found[0].id : null,
    fallback,
  };
}
