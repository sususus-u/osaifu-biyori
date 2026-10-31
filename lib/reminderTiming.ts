// 期限のお知らせの時期(依頼317 仕事1。2026-10-30 の利用者の決定。3つのサービスでそろえる)。
// - 「気づきのお知らせ」: 選んだ日(○日前)に1回ずつ。選べるのは 120・60・30日前と「なし」。デフォルトは60日前(種類ごとの違いはない)。
// - 「直前のお知らせ」: 期限の7日前から当日まで毎朝(選べない。lib/notificationSchedule.ts)。
// - いくつ選べるか: 無料も有料も、いくつでも。選んだ日は、全部効く(2026-11-01 決定。依頼372。前の「無料は1つ」をやめた)。
//   1件ごとに選ぶ作りなので、選べる日数から選ぶのは無料のまま(有料の「個別に決める」は、あとで作る)。
// - 前の形(firstStageDays に自由な日数。2回目の secondStageDays)からの移し替え:
//   保存したデータは書き換えず、読むときに置き換える。1回目の日数は、それ以上でいちばん小さい選択肢に
//   (90→120、45→60、21・14・10・7→30)。全部より大きいとき(365 など)は120。2回目は使わない(消さない)。
// この中では、通信も時刻の取得もしない(画面とサーバーの両方が使う)。

export const REMINDER_CHOICES = [120, 60, 30] as const;
export const REMINDER_DEFAULT_DAYS = 60;
// 選べる数(null は、いくつでも)。無料も有料も、いくつでも(依頼372)
export const REMINDER_FREE_MAX: number | null = null;
export const REMINDER_PAID_MAX: number | null = null;

// 画面の言葉(ハブの BRAND.md「お知らせと通知」の決定8。カタカナは使わない)
export const REMINDER_SECTION_LABEL = "お知らせの時期";
export const REMINDER_LABEL = "気づきのお知らせ";
export const REMINDER_CAPTION = "選んだ日に1回ずつ";
export const DAILY_LABEL = "直前のお知らせ";
export const DAILY_CAPTION = "7日前から当日まで毎朝";
export const REMINDER_NONE_LABEL = "なし";

// 「(デフォルト)」の印は付けない(依頼353。初めに選ばれている日は REMINDER_DEFAULT_DAYS のまま)
export function reminderChipLabel(days: number): string {
  return `${days}日前`;
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

// 実際にお知らせする日。選んだ日を全部(プランでは絞らない。依頼372)
export function effectiveReminderDays(selected: number[]): number[] {
  return normalize(selected);
}

// いちばん早い日(なしのときは null)
export function earliestReminderDay(selected: number[]): number | null {
  const days = normalize(selected);
  return days.length > 0 ? days[0] : null;
}

// 選択肢を押したとき(依頼372。無料も有料も同じ)。選んでいれば外す、選んでいなければ足す。null は、変えない。
// 「なし」を押すと、全部外れる(画面の側で [] にする)。
export function toggleReminderDay(selected: number[], day: number): number[] | null {
  if (!isChoice(day)) return null;
  const days = normalize(selected);
  return days.includes(day) ? days.filter((d) => d !== day) : normalize([...days, day]);
}
