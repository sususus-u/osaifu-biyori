// 定期実行(Vercel Cron)からの呼び出しかを確かめる。
// CRON_SECRET が未設定(空を含む)なら、常に断る(「Bearer undefined」で通さない。点検 L5)。
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  return authorization === `Bearer ${secret}`;
}
