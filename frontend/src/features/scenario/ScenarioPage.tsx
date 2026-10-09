import { listCatalogCityIds } from '../../domain/research/catalog';
import { useScenarioTable } from '../research-v2/useV2';
import { DataTable } from '../research-v2/DataTable';
import { REANALYSIS_NOTE, VOLUME_UNIT_NOTE } from '../../domain/research/v2/metrics';
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScenarioSimulation } from './ScenarioSimulation';
import { useAppContext } from '../../app/context/appContext';
import { EvidenceDrawer } from '../evidence/EvidenceDrawer';
import './scenario-page.css';

const DecisionStressPage=lazy(()=>import('../decision/DecisionStressPage').then(m=>({default:m.DecisionStressPage})));

/**
 * 推演 / 情景模拟（本轮 §30 / V3 §16）。
 *
 * 三个入口共用一个路由 `/scenario-lab`：
 *   · 默认            → 决策中心 · 情景模拟（现实 vs 模拟；§16）
 *   · ?mode=decision  → 决策压力页（既有）
 *   · ?mode=research  → 2026 沈阳暴雨平行情景表（既有研究推演，§30）
 *
 * 研究侧的门控结论（未达可靠反事实预测门槛）原样保留在首屏；
 * 列名走受控中文映射，`gate_min_r2` / `severity_mult` 这类工程字段不出现在界面上。
 */

const CITY_ID = listCatalogCityIds()[0] ?? '';

const SCENARIOS = [
  { file: 'counterfactual_gate.csv', caption: '门控：模型能否复现现实' },
  { file: 'counterfactual_severity.csv', caption: '事件强度情景：缺口随强度放大' },
  { file: 'counterfactual_buffer.csv', caption: '供应缓冲情景：缺口被缓冲吸收多少' },
] as const;

function ScenarioBlock({ file, caption }: { file: string; caption: string }) {
  const state = useScenarioTable(CITY_ID, file);
  return (
    <section className="scenario__block">
      {state.status === 'ready' && <DataTable table={state.data} caption={caption} filterColumn="crop" maxRows={20} />}
      {state.status === 'error' && <p className="scenario__pending">研究内容待接入</p>}
    </section>
  );
}

/** 既有：沈阳暴雨平行情景表（研究推演）。 */
function RainstormResearch() {
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

/**
 * 开发期证据抽屉自检入口：决策中心尚未接线时可在此打开 Drawer（仅 DEV）。
 * 不进 URL，不进生产构建。
 */
function EvidenceDevEntry() {
  const cityId = useAppContext((state) => state.cityId);
  const [params, setParams] = useSearchParams();
  const open = params.get('evidence') === 'open';
  return (
    <p className="scenario__note">
      <button type="button" className="ag-button" onClick={() => setParams((previous) => { const next = new URLSearchParams(previous); next.set('evidence', open ? 'closed' : 'open'); return next; })}>
        {open ? '关闭证据面板（开发自检）' : '打开证据面板（开发自检）'}
      </button>
      <EvidenceDrawer open={open} onClose={() => setParams((previous) => { const next = new URLSearchParams(previous); next.delete('evidence'); return next; })} context={{ cityId, topic: 'forecast' }} />
    </p>
  );
}

export function ScenarioPage() {
  const [params] = useSearchParams();
  const mode = params.get('mode');
  if (mode === 'decision') {
    return <Suspense fallback={<main className="scenario" role="status">情景加载中</main>}><DecisionStressPage /></Suspense>;
  }
  if (mode === 'research') return <RainstormResearch />;
  return (
    <>
      <ScenarioSimulation />
      {import.meta.env.DEV && <div className="scenario-sim__dev"><EvidenceDevEntry /></div>}
    </>
  );
}