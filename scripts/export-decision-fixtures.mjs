/** Read-only extraction. Never retrains or writes to the model/data workspace. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(project, '..');
const target = resolve(project, 'public/decision/legacy-v2');
const files = ['models/outputs/v2_recommendation.json', 'models/evaluation/cases/recommendation_examples.json'];
const raw = await Promise.all(files.map((file) => readFile(resolve(root, file), 'utf8')));
const primary = JSON.parse(raw[0]);
const cases = JSON.parse(raw[1]).cases;
const selections = [
  { id: 'baseline-100', label: '100 亩 · 均衡', request: primary.request, output: primary, source: 0 },
  { id: 'steady-30', label: '30 亩 · 稳健', ...cases[0], source: 1 },
  { id: 'balanced-50', label: '50 亩 · 均衡', ...cases[1], source: 1 },
  { id: 'return-80', label: '80 亩 · 收益优先', ...cases[2], source: 1 },
];
await mkdir(target, { recursive: true });
const sources = files.map((file, i) => ({ path: file, sha256: createHash('sha256').update(raw[i]).digest('hex') }));
const manifest = { snapshot_version: 'legacy-v2-20261007', data_status: 'legacy_model_fixture', sources, samples: [] };
for (const selection of selections) {
  const { id, label, request, output, source } = selection;
  const labels = output.labels ?? [];
  const pareto = (output.pareto_frontier ?? []).filter((p) => labels.some((l) => l.crop === p.crop && l.harvest_date === p.harvest_date));
  const fixture = {
    id, label, request,
    source: sources[source],
    snapshot_version: manifest.snapshot_version,
    output: {
      status: output.status,
      recommended_plan: output.recommended_plan,
      alternatives: output.alternatives,
      labels, pareto_frontier: pareto,
      within_crop_windows: output.within_crop_windows,
      confidence: output.confidence,
      risk_summary: output.risk_summary,
      stress_test: { recommended_plan_stress: output.stress_test?.recommended_plan_stress },
      plan_risks: output.plan_risks,
      limitations: output.limitations,
      comparison_reason: output.comparison_reason,
    },
  };
  const payload = JSON.stringify(fixture, null, 2) + '\n';
  await writeFile(resolve(target, `${id}.json`), payload);
  manifest.samples.push({ id, label, request, file: `${id}.json`, sha256: createHash('sha256').update(payload).digest('hex') });
}
await writeFile(resolve(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Extracted ${selections.length} legacy snapshots to public/decision (${manifest.snapshot_version}).`);
