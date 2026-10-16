// ひな形から public/firebase-messaging-sw.js を作る。必要な値が無ければ失敗させる。
import { readFileSync, writeFileSync } from "node:fs";

const keys = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
};

const config = {};
const missing = [];
for (const [k, env] of Object.entries(keys)) {
  const v = process.env[env];
  if (v) config[k] = v;
  else missing.push(env);
}
if (missing.length) {
  console.error(`generate-sw: 環境変数がありません: ${missing.join(", ")}`);
  process.exit(1);
}

const tpl = readFileSync(new URL("./firebase-messaging-sw.template.js", import.meta.url), "utf8");
const out = tpl.replace("__FIREBASE_CONFIG__", () => JSON.stringify(config, null, 2));
writeFileSync(new URL("../public/firebase-messaging-sw.js", import.meta.url), out);
console.log("generate-sw: public/firebase-messaging-sw.js を作りました");
