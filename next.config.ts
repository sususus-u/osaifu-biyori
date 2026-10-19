import type { NextConfig } from "next";

// 報告専用(強制はしない)。強制へ切り替える手順は BRAND.md 参照。
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' blob: data:",
  "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://fcmregistrations.googleapis.com https://firebaseinstallations.googleapis.com",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["192.168.0.104"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
        ],
      },
    ];
  },
};

export default nextConfig;
