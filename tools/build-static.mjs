/* Generates the static extras: beaute-nutrie.vcf and the favicon set.
   node tools/build-static.mjs   (icons need Chrome via Playwright) */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/* ---- contact card (vCard 3.0, CRLF line endings) ---- */
const vcf = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:;BEAUTE&NUTRIE;;;',
  'FN:BEAUTE&NUTRIE',
  'ORG:BEAUTE&NUTRIE',
  'TEL;TYPE=WORK,VOICE:+91 93555 91909',
  'ADR;TYPE=WORK:;Shop No. G-30\\, Ground Floor\\, VR Chennai;VR Mall #44\\, Pillaiyar Koil Street\\, Jawaharlal Nehru Salai\\, Anna Nagar;Chennai;Tamil Nadu;600040;India',
  'NOTE:Cosmetics boutique inside VR Chennai\\, Ground Floor. Closes 10 PM.',
  'END:VCARD',
  ''
].join('\r\n');
writeFileSync('beaute-nutrie.vcf', vcf);
console.log('wrote beaute-nutrie.vcf');

/* ---- icons: the site's existing mark (red arch, B&N) ---- */
mkdirSync('icons', { recursive: true });
const mark = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${bg ? `<rect width="64" height="64" rx="${bg === 'mask' ? 0 : 14}" fill="#240B12"/>` : ''}<path d="M${bg ? '14 54V38a18 17 0 0 1 36 0v16' : '8 62V38a24 23 0 0 1 48 0v24'}Z" fill="none" stroke="#B3262E" stroke-width="${bg ? 4.5 : 6}"/><text x="32" y="${bg ? 48 : 49}" font-family="Georgia,serif" font-size="${bg ? 13 : 16}" fill="#EBC9B6" text-anchor="middle">B&amp;N</text></svg>`;
writeFileSync('icons/favicon.svg', mark(false));
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
async function png(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await png(mark('tile'), 180, 'icons/apple-touch-icon.png');
await png(mark('tile'), 192, 'icons/icon-192.png');
await png(mark('tile'), 512, 'icons/icon-512.png');
await png(mark('mask'), 512, 'icons/icon-maskable-512.png');
await png(mark('tile'), 32, 'icons/favicon-32.png');
await browser.close();

/* favicon.ico holding the 32 px PNG (PNG-in-ICO is valid for every current browser) */
const p32 = readFileSync('icons/favicon-32.png');
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 32; head[7] = 32; head[8] = 0; head[9] = 0;
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(p32.length, 14); head.writeUInt32LE(22, 18);
writeFileSync('favicon.ico', Buffer.concat([head, p32]));
console.log('wrote icons and favicon.ico');
