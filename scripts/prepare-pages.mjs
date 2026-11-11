// Pós-processa o build para o GitHub Pages:
//  - 404.html = cópia do index.html (fallback de SPA: rotas profundas carregam o app);
//  - .nojekyll evita que o Pages processe os arquivos com Jekyll.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join('dist', 'project-flow-webapp', 'browser');
const index = join(outDir, 'index.html');

if (!existsSync(index)) {
  console.error(`index.html não encontrado em ${outDir}. Rode o build antes.`);
  process.exit(1);
}

copyFileSync(index, join(outDir, '404.html'));
writeFileSync(join(outDir, '.nojekyll'), '');
console.log('Pages: 404.html e .nojekyll criados em', outDir);
