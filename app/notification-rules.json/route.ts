import vercelConfig from "../../vercel.json";
import { notificationRules } from "@/lib/notificationRules";

// ホームの「通知と表示の決まり」のページが読む数(依頼288)。ビルドのときに作る(static)。
// 中身は数だけで、利用者の情報は入れない。
export const dynamic = "force-static";

export function GET() {
  return Response.json(notificationRules(vercelConfig.crons));
}
