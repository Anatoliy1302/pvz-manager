/** Sync legal HTML into docs for GitHub Pages (pvzpersonal.ru). */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const LEGAL_DIR = path.join(ROOT, 'legal');
const DOCS_DIR = path.join(ROOT, 'docs');

const FILES = [
  ['index.html', 'index.html'],
  ['privacy.html', 'privacy/index.html'],
  ['terms.html', 'terms/index.html'],
  ['consent.html', 'consent/index.html'],
];

for (const [srcName, destRel] of FILES) {
  const src = path.join(LEGAL_DIR, srcName);
  const dest = path.join(DOCS_DIR, destRel);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source file: ${src}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`${srcName} -> docs/${destRel}`);
}

fs.writeFileSync(path.join(DOCS_DIR, 'CNAME'), 'pvzpersonal.ru\n', 'utf8');
fs.writeFileSync(path.join(DOCS_DIR, '.nojekyll'), '', 'utf8');
console.log('Updated docs/CNAME and docs/.nojekyll');
