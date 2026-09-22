#!/usr/bin/env node
/**
 * 界面字符串守卫（V5 §37 / §38 / §83）。
 *
 * 这条红线的原文是：`.csv` / `.md` / `workspace/` / `outputs/` / 技术血缘 / sourceOfTruth /
 * frontendText / provenance 都不允许出现在界面上。数据文件名由渲染层负责丢弃（见
 * `src/features/research-v2/markdown.test.tsx`），这里守的是**构建产物里不该存在的字面量**。
 *
 * 为什么扫 dist 而不是扫 src：src 里大量注释、开发期提示、必要 URL 都会命中这些词，
 * 而注释和 URL 都不是用户能看到的东西。dist/assets/*.js 是真正送到浏览器的字节，
 * 在这里出现「技术血缘」这类词，说明它确实可能在界面上出现。
 *
 * 两类规则：
 *   1. 零容忍字面量 —— 任何文件命中即失败，没有例外。
 *   2. `POOLED` 只许做查表键 —— 它必须写成 `POOLED:"总体"` 的键，
 *      绝不能出现在模板字符串或 JSX 文本里。
 *
 * 运行：npm run build 会自动执行（见 package.json），也可单独 `npm run verify:ui`。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, '..', 'dist', 'assets');

if (!existsSync(assetsDir)) {
  console.error('[verify-ui-strings] 未找到 dist/assets，请先执行 npm run build。');
  process.exit(1);
}

/** 这些词一旦出现在产物里就是红线，没有例外。 */
const ZERO_TOLERANCE = [
  '技术血缘',
  'sourceOfTruth',
  'frontendText',
  'provenance',
  'workspace/',
  'outputs/',
  '无量纲',
  '正在读取',
  '本页面',
  '本模块',
  '穹衡',
  '拖动可旋转',
  '点击城市进入',
];

const files = readdirSync(assetsDir).filter((name) => /\.(js|css|html)$/.test(name));
const problems = [];

for (const name of files) {
  const text = readFileSync(join(assetsDir, name), 'utf8');
  for (const word of ZERO_TOLERANCE) {
    if (text.includes(word)) problems.push(`${name} 出现禁用字样「${word}」`);
  }
  // POOLED 只能做查表键（`POOLED:"总体"`），不能出现在会被渲染的位置。
  for (const match of text.matchAll(/\bPOOLED\b/g)) {
    const rest = text.slice(match.index + 'POOLED'.length, match.index + 'POOLED'.length + 3);
    if (!rest.startsWith(':')) {
      problems.push(`${name} 的 POOLED 不是查表键，可能被直接渲染：…${text.slice(match.index - 40, match.index + 40)}…`);
    }
  }
}

if (problems.length > 0) {
  console.error(`[verify-ui-strings] 失败（${problems.length} 项）：`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(`[verify-ui-strings] 全部通过：${files.length} 个产物文件，禁用字样 0，POOLED 仅作查表键。`);
