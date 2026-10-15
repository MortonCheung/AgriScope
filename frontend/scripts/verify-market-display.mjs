/** Production imports may use an audited published presentation, never synthetic/legacy seeds. */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(frontend, 'src');
const visited = new Set();
async function visit(path) {
  if (visited.has(path) || !/\.[cm]?[jt]sx?$/.test(path)) return;
  visited.add(path);
  const raw = await readFile(path, 'utf8');
  const tree = ts.createSourceFile(path, raw, ts.ScriptTarget.Latest, true);
  const imports = [];
  function inspect(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node, inspect);
  }
  inspect(tree);
  for (const specifier of imports) {
    if (!specifier.startsWith('.')) continue;
    const base = resolve(dirname(path), specifier);
    const target = [base, ...['.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx'].map(extension => base + extension)].find(existsSync);
    if (!target) continue;
    const name = relative(source, target).replaceAll('\\', '/');
    if (name.startsWith('test/') || /\.(test|spec)\.[jt]sx?$/.test(name) || name === 'domain/market/publishedMarket.json') throw new Error(`Test or obsolete market seed in production imports: ${name}`);
    await visit(target);
  }
}
await visit(resolve(source, 'main.tsx'));
const domain = await readFile(resolve(source, 'domain/market/displayMarket.ts'), 'utf8');
if (/INITIAL_DISPLAY_MARKET/.test(domain)) throw new Error('Formal market still exposes an obsolete initial price seed.');
const bootstrap = await readFile(resolve(source, 'domain/market/publishedPresentation.json'), 'utf8');
const published = JSON.parse(bootstrap);
if (published.schema_version !== 'presentation-1' || published.records?.length !== 224 || !/^[a-f0-9]{64}$/.test(published.input_hash)
  || /SYNTHETIC|example\.test|provenance|\/Users\/|outputs\//.test(bootstrap)) throw new Error('Invalid production presentation projection.');
console.log(`[verify-market-display] ${visited.size} production source modules checked; published presentation has 224 cells; no bundled test/legacy seeds. Full evidence validation is covered by Vitest.`);
