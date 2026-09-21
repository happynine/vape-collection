// ============================================================
// extract-logos.mjs — 一次性迁移
// 把 data/brands.json、data/shops.json 中内嵌的 base64 logo
// 抽取为 data/logos/{dataset}_{id}.{ext} 独立文件，
// 并把每条记录的 logo 字段改写为 "logos/{dataset}_{id}.{ext}"。
//
// 幂等：已是相对路径（logos/...）的记录跳过。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');
const LOGO_DIR = path.join(DATA, 'logos');

fs.mkdirSync(LOGO_DIR, { recursive: true });

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

const TARGETS = [
  { file: 'brands.json', dataset: 'brand' },
  { file: 'shops.json', dataset: 'shop' },
];

function decodeDataURI(uri) {
  // data:image/png;base64,XXXX — 捕获组：1=mime, 2=;base64 标记, 3=数据体
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(uri);
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const isB64 = !!m[2];
  const payload = m[3];
  let buf;
  if (isB64) {
    buf = Buffer.from(payload, 'base64');
  } else {
    buf = Buffer.from(decodeURIComponent(payload), 'utf-8');
  }
  return { mime, buf };
}

let totalExtracted = 0;
const report = [];

for (const { file, dataset } of TARGETS) {
  const fp = path.join(DATA, file);
  const list = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  let extracted = 0;
  let skipped = 0;
  let external = 0;
  let empty = 0;

  for (const rec of list) {
    const logo = rec.logo || '';
    if (!logo) { empty++; continue; }
    if (!logo.startsWith('data:')) {
      if (!logo.startsWith('logos/')) external++;
      else skipped++;
      continue;
    }
    const dec = decodeDataURI(logo);
    if (!dec) { external++; continue; }
    const ext = MIME_EXT[dec.mime] || 'png';
    const name = `${dataset}_${rec.id}.${ext}`;
    fs.writeFileSync(path.join(LOGO_DIR, name), dec.buf);
    rec.logo = `logos/${name}`;
    extracted++;
  }

  fs.writeFileSync(fp, JSON.stringify(list, null, 2));
  totalExtracted += extracted;
  report.push({ file, count: list.length, extracted, skipped, external, empty });
}

console.log('== logo extraction report ==');
for (const r of report) console.log(r);
console.log('total extracted:', totalExtracted);
console.log('logos on disk:', fs.readdirSync(LOGO_DIR).length);

// 体积对比
for (const f of ['brands.json', 'shops.json']) {
  const sz = fs.statSync(path.join(DATA, f)).size;
  console.log(`${f}: ${(sz / 1024).toFixed(0)} KB`);
}
