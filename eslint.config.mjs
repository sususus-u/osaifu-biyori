import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // react-hooks/set-state-in-effect を、次の6ファイルだけ切る。
  // いずれも、保存値(localStorage/sessionStorage/Firestore)や画面の大きさを、描画後の effect で
  // 読み込んで state に入れる作り。直すと初期表示(ちらつき、ハイドレーション)が変わるおそれがあり、
  // 動作を変えない整理の範囲を超えるため、緩める。新規のファイルには効かせたままにする。
  {
    files: [
      "app/reports/page.tsx",
      "components/AccountForm.tsx",
      "components/AppShell.tsx",
      "components/NotificationSetup.tsx",
      "components/QuickUpdate.tsx",
      "components/ScanPhysicalUpload.tsx",
    ],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
]);

export default eslintConfig;
