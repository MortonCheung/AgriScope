import { listCatalogCityIds } from '../../domain/research/catalog';
import { useScenarioTable } from '../research-v2/useV2';
import { DataTable } from '../research-v2/DataTable';
import { REANALYSIS_NOTE, VOLUME_UNIT_NOTE } from '../../domain/research/v2/metrics';
import './scenario-page.css';

/**
 * 推演（本轮 §30）：暴雨专题与情景实验合并为唯一入口。
 *
 * 与研究树是两个产品入口，但数据同源：
 *   研究 —— 历史与 2026 事件本身；推演 —— 改变条件看平行情景。
 * 本节**不是预测**：研究侧的门控结论（未达可靠反事实预测门槛）原样保留在首屏。
 * 列名走受控中文映射，`gate_min_r2` / `severity_mult` 这类工程字段不出现在界面上。
 */

/** 站点级页面：城市从 catalog 注册表取，不把 shenyang 写死在组件里。 */
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
