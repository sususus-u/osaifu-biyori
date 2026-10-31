// 期限のお知らせの時期(依頼317 仕事1。2026-10-30 の利用者の決定。3つのサービスでそろえる)。
// - 「気づきのお知らせ」: 選んだ日(○日前)に1回ずつ。選べるのは 120・60・30日前と「なし」。デフォルトは60日前(種類ごとの違いはない)。
// - 「直前のお知らせ」: 期限の7日前から当日まで毎朝(選べない。lib/notificationSchedule.ts)。
// - いくつ選べるか: 無料のプランは1つ、有料のプラン(ゆったり・たっぷり)は、いくつでも。
// - 有料から無料に戻ったとき: 保存した選択は消さず、いちばん早い日(○日前の数が大きいもの)だけ効かせる。
//   有料に戻れば、保存した選択が全部効く。
// - 前の形(firstStageDays に自由な日数。2回目の secondStageDays)からの移し替え:
//   保存したデータは書き換えず、読むときに置き換える。1回目の日数は、それ以上でいちばん小さい選択肢に
//   (90→120、45→60、21・14・10・7→30)。全部より大きいとき(365 など)は120。2回目は使わない(消さない)。
// この中では、通信も時刻の取得もしない(画面とサーバーの両方が使う)。

import type { Plan } from "./plan-resolve.ts";

export const REMINDER_CHOICES = [120, 60, 30] as const;
export const REMINDER_DEFAULT_DAYS = 60;
// 無料のプランで選べる数。有料のプランは上限なし(null)
export const REMINDER_FREE_MAX = 1;
export const REMINDER_PAID_MAX: number | null = null;

// 画面の言葉(ハブの BRAND.md「お知らせと通知」の決定8。カタカナは使わない)
export const REMINDER_SECTION_LABEL = "お知らせの時期";
export const REMINDER_LABEL = "気づきのお知らせ";
export const REMINDER_CAPTION = "選んだ日に1回ずつ";
export const DAILY_LABEL = "直前のお知らせ";
export const DAILY_CAPTION = "7日前から当日まで毎朝";
export const REMINDER_NONE_LABEL = "なし";
export const REMINDER_DEFAULT_TAG = "デフォルト";
// 無料のプランの人に、いつも小さく出す案内(押し付けない。依頼348)
export const REMINDER_PAID_GUIDE = "有料のプランでは、いくつでも選べます。";

export function reminderChipLabel(days: number): string {
  return days === REMINDER_DEFAULT_DAYS ? `${days}日前（${REMINDER_DEFAULT_TAG}）` : `${days}日前`;
}

// 無料のプランで、2つ以上を保存しているときの添え書き(いちばん早い日だけ効く)
export function freeOnlyEarliestNote(earliest: number): string {
  return `いまのプランでは、いちばん早い${earliest}日前だけ、お知らせします。`;
}

function isChoice(v: unknown): v is number {
  return typeof v === "number" && (REMINDER_CHOICES as readonly number[]).includes(v);
}

// 前の形の日数を、選択肢に置き換える(それ以上でいちばん小さい選択肢。全部より大きいときは120)
export function mapLegacyDays(days: number): number {
  const ascending = [...REMINDER_CHOICES].sort((a, b) => a - b);
  return ascending.find((c) => c >= days) ?? Math.max(...REMINDER_CHOICES);
}

// 早い順(○日前の数が大きい順)に並べ、重なりを除く
function normalize(days: number[]): number[] {
  return [...new Set(days.filter(isChoice))].sort((a, b) => b - a);
}

// 保存してある notificationTiming から、選んでいる日を読む(読むときの移し替え)。空の配列は「なし」。
// - reminderDays(新しい形)があれば、それ(選択肢にない数は除く)。
// - なければ、前の形の firstStageDays を置き換えた1つ。それもなければ、デフォルト。
export function selectedReminderDays(timing: unknown): number[] {
  const t = timing && typeof timing === "object" ? (timing as Record<string, unknown>) : {};
  if (Array.isArray(t.reminderDays)) return normalize(t.reminderDays as number[]);
  const first = t.firstStageDays;
  if (typeof first === "number" && Number.isFinite(first)) return [mapLegacyDays(first)];
  return [REMINDER_DEFAULT_DAYS];
}

export function maxSelectable(plan: Plan): number | null {
  return plan === "free" ? REMINDER_FREE_MAX : REMINDER_PAID_MAX;
}

// 実際にお知らせする日。無料のプランは、いちばん早い日だけ
export function effectiveReminderDays(selected: number[], plan: Plan): number[] {
  const days = normalize(selected);
  const max = maxSelectable(plan);
  return max === null ? days : days.slice(0, max);
}

// いちばん早い日(なしのときは null)。プランにかかわらず同じ(無料も、いちばん早い日が効くため)
export function earliestReminderDay(selected: number[]): number | null {
  const days = normalize(selected);
  return days.length > 0 ? days[0] : null;
}

// 画面で見せる選択(依頼348)。無料のプランは、効いている1つ(いちばん早い日)だけを選んだ形に見せる
export function shownReminderDays(selected: number[], plan: Plan): number[] {
  return effectiveReminderDays(selected, plan);
}

// 選択肢を押したとき(依頼348。まもりびより 依頼343 と同じ形)。null は、変えない。
// 有料: 選んでいれば外す、選んでいなければ足す。
// 無料: 押した日に切り替える(押せないボタンは作らない)。今効いている日を押したときは、変えない(外すのは「なし」)。
// 有料のときに選んだ日は、無料の人が別の日に切り替えるまで残す(読むときに、いちばん早い日だけを使う)。
export function toggleReminderDay(selected: number[], day: number, plan: Plan): number[] | null {
  if (!isChoice(day)) return null;
  const days = normalize(selected);
  const max = maxSelectable(plan);
  if (max === null) return days.includes(day) ? days.filter((d) => d !== day) : normalize([...days, day]);
  if (effectiveReminderDays(days, plan).includes(day)) return null;
  return [day];
}
