import Link from "next/link";
import { BarChart3, Bell, ChevronRight, ExternalLink, FileText } from "lucide-react";
import RecordExport from "@/components/RecordExport";
import { HUB_MENU_LINK_LABEL, HUB_MENU_URL } from "@/lib/login-handoff";

const HUB_TERMS_URL = "https://okizukibiyori.com/terms#おさいふびより";
const HUB_PRIVACY_URL = "https://okizukibiyori.com/privacy#おさいふびより";
// ホームの使い方のページ(どんな通知が、いつ来るか。依頼288)
const HUB_NOTIFICATION_RULES_URL = "https://okizukibiyori.com/guide/notifications#おさいふびより";

const SECTION_LABEL = { fontSize: 12, color: "var(--text-muted)", marginBottom: 8, paddingLeft: 2 } as const;

// メニューの並び(依頼366 仕事2。3つのサービスで同じ形):
// 「実績・データ」(実績、記録を書き出す)→「設定」(規約などへのつなぎ)→ いちばん下に、ホームの「メニュー」への小さな1行。
// 「アカウント」の欄は、依頼372 でなくした(ログイン・ログアウト・呼び名・プランは、すべてホームでする)
export default function MenuPage() {
  return (
    <div>
      <p style={SECTION_LABEL}>実績・データ</p>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
        <Link
          href="/reports"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <BarChart3 size={18} color="var(--brand)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>実績</span>
          <ChevronRight size={16} color="#ccc" />
        </Link>
        {/* 記録の書き出し(表の形。依頼369。無料)。押すと確かめを出す */}
        <RecordExport />
      </div>

      <p style={SECTION_LABEL}>設定</p>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* 規約などへのつなぎ: 利用規約・プライバシーポリシー・通知と表示の決まりの順に、同じ形で縦に並べる(ハブの BRAND.md 5章。依頼289) */}
        <a
          href={HUB_TERMS_URL}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <FileText size={18} color="var(--brand)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>利用規約</span>
          <ExternalLink size={16} color="#ccc" />
        </a>

        <a
          href={HUB_PRIVACY_URL}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px",
            textDecoration: "none",
            color: "inherit",
            borderTop: "0.5px solid #eee",
          }}
        >
          <FileText size={18} color="var(--brand)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>プライバシーポリシー</span>
          <ExternalLink size={16} color="#ccc" />
        </a>
        <a
          href={HUB_NOTIFICATION_RULES_URL}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px",
            textDecoration: "none",
            color: "inherit",
            borderTop: "0.5px solid #eee",
          }}
        >
          <Bell size={18} color="var(--brand)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>通知と表示の決まり</span>
          <ExternalLink size={16} color="#ccc" />
        </a>

      </div>

      {/* ホームの「メニュー」への目立たない1行(ログアウトなどを探す人のための入口。依頼372)。押せる高さは44px */}
      <a
        href={HUB_MENU_URL}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 44,
          marginTop: 16,
          fontSize: 12,
          color: "var(--text-muted)",
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        {HUB_MENU_LINK_LABEL}
      </a>
    </div>
  );
}
