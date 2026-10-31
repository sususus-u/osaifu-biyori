import Link from "next/link";
import { BarChart3, Bell, ChevronRight, ExternalLink, FileText, User } from "lucide-react";
import AccountSettings from "@/components/AccountSettings";
import RecordExport from "@/components/RecordExport";
import { HUB_ACCOUNT_MENU_LABEL, HUB_ACCOUNT_URL } from "@/lib/login-handoff";

const HUB_TERMS_URL = "https://okizukibiyori.com/terms#おさいふびより";
const HUB_PRIVACY_URL = "https://okizukibiyori.com/privacy#おさいふびより";
// ホームの使い方のページ(どんな通知が、いつ来るか。依頼288)
const HUB_NOTIFICATION_RULES_URL = "https://okizukibiyori.com/guide/notifications#おさいふびより";

export default function MenuPage() {
  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, paddingLeft: 2 }}>
        見る・調べる
      </p>
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
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, paddingLeft: 2 }}>
        設定
      </p>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "14px",
          }}
        >
          <User size={18} color="var(--brand)" style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>アカウント</p>
            <AccountSettings />
            {/* 記録の書き出し(表の形。依頼369。無料) */}
            <RecordExport />
          </div>
        </div>

        {/* ログイン・ログアウトは、ホームでだけする(依頼345 の決定1・3)。ホームのメニューの、アカウントの欄へつなぐ */}
        <a
          href={HUB_ACCOUNT_URL}
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
          <User size={18} color="var(--brand)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{HUB_ACCOUNT_MENU_LABEL}</span>
          <ExternalLink size={16} color="#ccc" />
        </a>

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
            borderTop: "0.5px solid #eee",
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
    </div>
  );
}
