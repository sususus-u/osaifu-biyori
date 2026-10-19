// assets/icon.svg(丸)と assets/icon-maskable.svg(四角)から、PNG と favicon.ico を作る。
// 実行: node scripts/generate-icons.mjs(生成物はコミットする。ビルドでは実行しない)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const round = fs.readFileSync(path.join(root, "assets/icon.svg"));
const square = fs.readFileSync(path.join(root, "assets/icon-maskable.svg"));

const png = (svg, size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

// PNG を中に入れた ICO を組み立てる(16、32、48)
function buildIco(entries) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const dirs = entries.map(({ size, data }) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(size, 0);
    d.writeUInt8(size, 1);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(data.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += data.length;
    return d;
  });
  return Buffer.concat([head, ...dirs, ...entries.map((e) => e.data)]);
}

(async () => {
  const out = (p, buf) => fs.writeFileSync(path.join(root, p), buf);
  out("public/icon-192.png", await png(round, 192));
  out("public/icon-512.png", await png(round, 512));
  out("public/icon-maskable-512.png", await png(square, 512));
  out("public/apple-touch-icon.png", await png(square, 180));
  const sizes = [16, 32, 48];
  const entries = await Promise.all(sizes.map(async (size) => ({ size, data: await png(round, size) })));
  out("app/favicon.ico", buildIco(entries));
  console.log("icons generated");
})();
