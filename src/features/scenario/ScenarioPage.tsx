import { useCachedResource } from '../../services/useCachedResource';
import { parseCsv } from '../../services/csv';
import { DataTable } from '../research-v2/DataTable';
import { REANALYSIS_NOTE, VOLUME_UNIT_NOTE } from '../../domain/research/v2/metrics';
import './scenario-page.css';

/**
 * 推演（V5 §43–§48）：暴雨专题与情景实验合并为唯一入口。
 *
 * 数据仍来自研究工程已发布的情景结果表；本节**不是预测**，
 * 研究侧的门控结论（未达可靠反事实预测门槛）原样保留在首屏。
 * 所有列名走受控中文映射，`gate_min_r2` / `severity_mult` 这类工程字段不出现在界面上。
 */
const BASE = '/scenario/shenyang';

interface ScenarioTable {
  file: string;
  columns: string[];
  rows: Record<string, string>[];
}

function createResource() {
  const pending = new Map<string, Promise<ScenarioTable>>();
  const resolved = new Map<string, ScenarioTable>();
  return {
    peek(key: string) { return resolved.get(key) ?? null; },
    load(key: string, loader: () => Promise<ScenarioTable>) {
      const existing = pending.get(key);
      if (existing) return existing;
      const promise = loader().then(
        (value) => { resolved.set(key, value); return value; },
        (error: unknown) => { pending.delete(key); throw error; },
      );
      pending.set(key, promise);
      return promise;
    },
  };
}

const resource = createResource();

async function fetchTable(file: string): Promise<ScenarioTable> {
  const response = await fetch(`${BASE}/${file}`);
  // 对外文案不带文件名 / 路径（V5 §38）；具体地址只在开发期通过 cause 附带。
  if (!response.ok) {
    const error = new Error(`研究资源读取失败：情景表（HTTP ${response.status}）`);
    error.name = 'PayloadError';
    error.cause = import.meta.env.DEV ? file : undefined;
    throw error;
  }
  const parsed = parseCsv(await response.text());
  return { file, columns: parsed.columns, rows: parsed.rows };
}

const SCENARIOS = [
  { file: 'counterfactual_gate.csv', caption: '门控：模型能否复现现实' },
  { file: 'counterfactual_severity.csv', caption: '事件强度情景：缺口随强度放大' },
  { file: 'counterfactual_buffer.csv', caption: '供应缓冲情景：缺口被缓冲吸收多少' },
] as const;

function ScenarioBlock({ file, caption }: { file: string; caption: string }) {
  const state = useCachedResource<ScenarioTable>({
    key: file,
    peek: () => resource.peek(file),
    load: () => resource.load(file, () => fetchTable(file)),
    missingMessage: '缺少情景表',
  });

  return (
    <section className="scenario__block">
      {state.status === 'ready' && <DataTable table={state.data} caption={caption} filterColumn="crop" maxRows={20} />}
      {state.status === 'error' && <p className="scenario__pending">研究内容待接入</p>}
    </section>
  );
}

export function ScenarioPage() {
  return (
    <main className="scenario">
      <header className="scenario__head">
        <h1 className="scenario__title">沈阳暴雨模型推演</h1>
        <p className="scenario__lead">基于 2026 沈阳极端暴雨案例的平行情景实验。</p>
        <p className="scenario__caveat">模型未达到可靠反事实预测门槛，本节为情景演示而非预测。</p>
        <p className="scenario__note">{REANALYSIS_NOTE} {VOLUME_UNIT_NOTE}</p>
      </header>
      {SCENARIOS.map((scenario) => (
        <ScenarioBlock key={scenario.file} file={scenario.file} caption={scenario.caption} />
      ))}
    </main>
  );
}
