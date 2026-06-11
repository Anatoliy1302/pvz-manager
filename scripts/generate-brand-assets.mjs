/**
 * Генерирует/нормализует бренд-ассеты приложения (1024 и favicon).
 * Запуск: node scripts/generate-brand-assets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets');
const brandDir = path.join(assetsDir, 'brand-source');

const PRIMARY = '#6C5CE7';

async function ensureBrandSources() {
  if (!fs.existsSync(brandDir)) {
    fs.mkdirSync(brandDir, { recursive: true });
  }
}

async function writeSvgPng(svg, outPath, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
}

function boxIconSvg(fill, size = 1024) {
  const s = size;
  const iconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 1024 1024">
      <rect width="1024" height="1024" fill="none"/>
      <g transform="translate(512 500)">
        <path fill="${fill}" d="M-220 -90 L0 -190 L220 -90 L220 150 L0 250 L-220 150 Z"/>
        <path fill="${fill}" opacity="0.92" d="M-220 -90 L0 10 L220 -90 L220 -50 L0 50 L-220 -50 Z"/>
        <path fill="${fill}" opacity="0.78" d="M0 -190 L0 250 L220 150 L220 -90 Z"/>
        <path fill="${fill === '#FFFFFF' ? PRIMARY : '#FFFFFF'}" d="M-52 20 H52 V92 H-52 Z" rx="10"/>
      </g>
    </svg>`;
  return iconSvg;
}

async function generateFromSvg() {
  await ensureBrandSources();

  const iconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <rect width="1024" height="1024" fill="${PRIMARY}"/>
      <g transform="translate(512 500)">
        <path fill="#FFFFFF" d="M-220 -90 L0 -190 L220 -90 L220 150 L0 250 L-220 150 Z"/>
        <path fill="#FFFFFF" opacity="0.92" d="M-220 -90 L0 10 L220 -90 L220 -50 L0 50 L-220 -50 Z"/>
        <path fill="#FFFFFF" opacity="0.78" d="M0 -190 L0 250 L220 150 L220 -90 Z"/>
        <path fill="${PRIMARY}" d="M-52 20 H52 V92 H-52 Z"/>
      </g>
    </svg>`;

  await writeSvgPng(iconSvg, path.join(assetsDir, 'icon.png'), 1024);
  await writeSvgPng(boxIconSvg('#FFFFFF'), path.join(assetsDir, 'splash-icon.png'), 1024);
  await writeSvgPng(boxIconSvg('#FFFFFF'), path.join(assetsDir, 'adaptive-icon.png'), 1024);
  await writeSvgPng(boxIconSvg('#FFFFFF'), path.join(assetsDir, 'notification-icon.png'), 96);
  await sharp(path.join(assetsDir, 'icon.png')).resize(192, 192).png().toFile(path.join(assetsDir, 'favicon.png'));

  console.log('Generated assets in', assetsDir);
}

generateFromSvg().catch((error) => {
  console.error(error);
  process.exit(1);
});
