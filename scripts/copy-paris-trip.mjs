// The Paris trip guide is a hand-written static page, not part of the Vite
// build, so copy it into dist/ after bundling. npm runs this via `postbuild`.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';

const FILES = ['index.html', 'paris_mom_dad.kml', 'places.csv'];
const OUT = 'dist/paris-trip';

mkdirSync(OUT, { recursive: true });
for (const f of FILES) {
  const src = `paris-trip/${f}`;
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  copyFileSync(src, `${OUT}/${f}`);
}
console.log(`copied ${FILES.length} files to ${OUT}/`);
