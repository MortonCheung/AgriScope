#!/usr/bin/env node
/**
 * 内容层回归检查：同步产物必须自洽，且不得出现被禁文案。
 * 保护的是"研究内容规范"，不是界面样式。作为 `npm test` 的一部分运行。
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(here, '..', 'public');
const indexPath = join(publicRoot, 'research', 'shenyang', 'index.json');
const manifestPath = join(publicRoot, 'research', 'shenyang', 'manifest.json');

const FORBIDDEN_COPY = ['AI驱动', 'AI 驱动', '赋能', '智慧', '洞察未来', '智能决策', '开启探索', '解码农业脉搏', '一键洞察'];
const EVIDENCE_CODES = ['A', 'B', 'C', 'D', 'Unsupported'];
const STATUS_CODES = ['supported', 'null_result', 'descriptive', 'exploratory', 'unsupported'];

const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

check('研究点为 17、专题为 6，分类计数一致', () => {
  assert.equal(index.topics.length, 17);
  assert.equal(index.summaryBlocks.length, 6);
  assert.equal(index.counters.topics, 6);
  assert.equal(index.counters.studies, 17);
  assert.equal(index.counters.crops, 10);
});

check('证据等级与状态均在受控枚举内，且每个研究点都有图或表', () => {
  for (const topic of index.topics) {
    const level = /([ABCD])\b/.exec(topic.evidenceLevel)?.[1] ?? 'Unsupported';
    assert.ok(EVIDENCE_CODES.includes(level), `${topic.id} 证据等级非法：${topic.evidenceLevel}`);
    assert.ok(STATUS_CODES.includes(topic.status), `${topic.id} 状态非法：${topic.status}`);
    assert.ok(topic.figures.length + topic.tables.length > 0, `${topic.id} 没有任何图表`);
  }
});

check('索引引用的图与表都真实存在于 public 目录', () => {
  const missing = [];
  for (const topic of index.topics) {
    for (const src of [...topic.figures, ...topic.tables]) {
      if (!existsSync(join(publicRoot, src.replace(/^\//, '')))) missing.push(src);
    }
  }
  assert.deepEqual(missing, []);
});

check('每个研究点都能被某个专题 covers 覆盖', () => {
  const covered = new Set(index.summaryBlocks.flatMap((block) => block.coversResolved));
  const orphans = index.topics.map((topic) => topic.id).filter((id) => !covered.has(id));
  assert.deepEqual(orphans, []);
});

check('阴性结果被保留为正式结论', () => {
  const nulls = index.topics.filter((topic) => topic.status === 'null_result');
  assert.ok(nulls.length > 0, '缺少阴性结果');
});

check('整城问答保留 7 问与限定说明', () => {
  assert.equal(index.cityConclusion.qas.length, 7);
  assert.ok(index.cityConclusion.caveats.length > 0);
  assert.ok(index.redLines.length > 0);
});

check('不得出现被禁的 AI 营销文案', () => {
  const text = JSON.stringify(index);
  const hits = FORBIDDEN_COPY.filter((word) => text.includes(word));
  assert.deepEqual(hits, []);
});

check('manifest 计数与索引一致', () => {
  assert.equal(manifest.counters.topics, 17);
  assert.equal(manifest.counters.summaryBlocks, 6);
  assert.equal(manifest.counters.cityQuestions, 7);
  assert.equal(manifest.figures.length, new Set(index.topics.flatMap((topic) => topic.figures)).size);
  assert.equal(manifest.tables.length, new Set(index.topics.flatMap((topic) => topic.tables)).size);
});

console.log(`[verify-content] 全部通过（${checks.length} 项）：`);
for (const name of checks) console.log(`  ✓ ${name}`);
