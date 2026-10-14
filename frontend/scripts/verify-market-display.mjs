/** Formal market values come only from a validated API snapshot, never bundled seeds. */
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
console.log(`[verify-market-display] ${visited.size} production source modules checked; API-only market, no bundled test/legacy seeds. V2/V3 cell validation is covered by Vitest.`);
