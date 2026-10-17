// /api/account-data の認証の判定(段階1)。外部に依存しない小さな関数だけを置く(単体テスト用)。
import { timingSafeEqual, createHash } from "node:crypto";

// 合言葉の比較。時間が一定になるよう、SHA-256 で同じ長さにそろえてから比べる(長さが違っても安全)。
export function keyMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected || provided === null) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export type TokenVerdict = "ok" | "forbidden" | "invalid";

// authorization: Authorization ヘッダーの値(なければ null)
// verifiedUid: そのヘッダーを IDトークンとして検証した結果の uid(確かめられなければ null)
// bodyUid: 本文の uid
// ヘッダーがない・空・形が違う・無効なときは、すべて invalid(401)。段階3: トークンは必須。
export function judgeToken(
  authorization: string | null,
  verifiedUid: string | null,
  bodyUid: string,
): TokenVerdict {
  if (authorization === null) return "invalid";
  if (verifiedUid === null) return "invalid";
  return verifiedUid === bodyUid ? "ok" : "forbidden";
}
