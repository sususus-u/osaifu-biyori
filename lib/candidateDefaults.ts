// 名前の候補(PayPay残高 など)から、種類・タイプなどの初期値を決める(依頼260)。
// 候補の初期値を使うのは、新しく登録するときだけ。編集の画面では、保存してある種類・タイプなどを
// 上書きしない(前は、保存した名前が候補と同じだと、開いたときに候補の初期値で上書きしていた)。
// お知らせの時期は、種類ごとの違いをやめたので、ここでは決めない(依頼317。lib/reminderTiming.ts)。

export interface CandidateDefaults<C extends string, T extends string> {
  category: C;
  isYenBased: boolean;
  type: T;
  unit: string | null;
}

export interface CandidateDefaultsDeps<C extends string, T extends string> {
  knownNames: readonly string[];
  guess: (name: string) => { category: C; isYenBased: boolean };
  categoryDefaults: Record<C, { type: T }>;
  unitDefaults: Partial<Record<C, string>>;
}

// 入れる初期値を返す。入れないときは null(編集の画面、または候補にない名前)。
export function candidateDefaults<C extends string, T extends string>(
  name: string,
  isEditMode: boolean,
  deps: CandidateDefaultsDeps<C, T>
): CandidateDefaults<C, T> | null {
  if (isEditMode) return null;
  if (!deps.knownNames.includes(name)) return null;
  const info = deps.guess(name);
  const d = deps.categoryDefaults[info.category];
  return {
    category: info.category,
    isYenBased: info.isYenBased,
    type: d.type,
    unit: deps.unitDefaults[info.category] ?? null,
  };
}
