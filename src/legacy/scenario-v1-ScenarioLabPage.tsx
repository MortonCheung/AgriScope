import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { AsyncBoundary } from '../../components/AsyncState';
import { DATA_COLORS } from '../../design/chartTokens';
import type { ResearchTable } from '../../domain/research/types';
import { useTables } from '../research/data/useTable';
import { BarChart, ChartFrame, XYChart, type BarDatum, type XYBand, type XYSeries } from '../research/widgets/primitives';
import { OptionSelector } from '../research/widgets/Selectors';
import {
  clampToNearest,
  isClamped,
  numericOptions,
  parseBuffer,
  parseGapSummary,
  parseGate,
  parseSeverity,
} from './scenarioData';
import './scenario.css';

/**
 * 平行世界实验室（情景实验）。
 *
 * 全部数字来自真实反事实研究表：四个世界的缺口、门槛、参数可选值均直接读取 CSV，
 * 前端不做插值或外推。参数取值若不在表中，一律对齐到最近的真实取值并在界面标注。
 * 模型门控未通过时，明确声明这是情景演示而非预测。
 */

const TABLES = {
  gate: '/research/shenyang/tables/counterfactual_gate.csv',
  gap: '/research/shenyang/tables/counterfactual_gap_summary.csv',
  severity: '/research/shenyang/tables/counterfactual_severity.csv',
  buffer: '/research/shenyang/tables/counterfactual_buffer.csv',
};

type Target = 'price' | 'volume';

const TARGET_LABEL: Record<Target, string> = { price: '价格', volume: '成交量' };

export function ScenarioLabPage() {
  const state = useTables([TABLES.gate, TABLES.gap, TABLES.severity, TABLES.buffer]);

  return (
    <main className="ag-page ag-container scenario-lab">
      <header className="scenario-lab__head">
        <h1 className="ag-hero scenario-lab__title">情景实验</h1>
        <p className="ag-lead">
          把 2026 暴雨事件放进四个平行情景：基准情景、无灾害情景、冲击增强情景、供应缓冲情景。
          所有数字来自反事实研究表，反映模型在门控未过时的行为，不作为对未来的判断。
        </p>
      </header>

      <AsyncBoundary state={state}>
        {(tables) => <ScenarioLabBody tables={tables} />}
      </AsyncBoundary>
    </main>
  );
}

function ScenarioLabBody({ tables }: { tables: ResearchTable[] }) {
  const gate = useMemo(() => parseGate(tables[0]), [tables]);
  const gaps = useMemo(() => parseGapSummary(tables[1]), [tables]);
  const severity = useMemo(() => parseSeverity(tables[2]), [tables]);
  const buffer = useMemo(() => parseBuffer(tables[3]), [tables]);

  const severityOptions = useMemo(() => numericOptions(severity.map((row) => row.severityMult)), [severity]);
  const bufferOptions = useMemo(() => numericOptions(buffer.map((row) => row.bufferFrac)), [buffer]);
  const windowOptions = useMemo(() => numericOptions(gaps.filter((row) => row.method === 'A').map((row) => row.nDays)), [gaps]);

  const [target, setTarget] = useState<Target>('price');
  const [severityMult, setSeverityMult] = useState(1.5);
  const [days, setDays] = useState(5);
  const [bufferFrac, setBufferFrac] = useState(0.2);

  const effectiveSeverity = clampToNearest(severityMult, severityOptions);
  const daysClamped = clampToNearest(days, windowOptions);
  const bufferClamped = clampToNearest(bufferFrac, bufferOptions);

  const gateMin = gate[0]?.gateMin ?? 0;

  const baseline = severity.find((row) => row.crop === 'POOLED' && row.severityMult === 1);
  const noDisaster = gaps.filter((row) => row.method === 'A' && row.target === target && row.nDays === daysClamped && row.crop !== 'POOLED');
  const noDisasterPooled = gaps.find((row) => row.method === 'A' && row.target === target && row.nDays === daysClamped && row.crop === 'POOLED');
  const severityRows = severity.filter((row) => row.severityMult === effectiveSeverity);
  const severityPooled = severityRows.find((row) => row.crop === 'POOLED');
  const bufferRows = buffer.filter((row) => row.bufferFrac === bufferClamped);
  const bufferPooled = bufferRows.find((row) => row.crop === 'POOLED');

  const gapSeries: XYSeries[] = noDisaster.length > 0
    ? [{
      id: 'gap',
      label: `${TARGET_LABEL[target]}缺口（z）`,
      points: noDisaster.map((row, index) => ({ x: index, y: row.meanGapZ })),
      color: target === 'price' ? DATA_COLORS.price : DATA_COLORS.volume,
      dots: true,
    }]
    : [];
  const gapBands: XYBand[] = noDisaster.some((row) => row.ciHighZ !== null)
    ? [{
      id: 'ci',
      upper: noDisaster.map((row, index) => ({ x: index, y: row.ciHighZ ?? row.meanGapZ })),
      lower: noDisaster.map((row, index) => ({ x: index, y: row.ciLowZ ?? row.meanGapZ })),
      color: target === 'price' ? DATA_COLORS.price : DATA_COLORS.volume,
      opacity: 0.14,
    }]
    : [];

  const severityBars: BarDatum[] = severityRows.map((row) => ({
    id: `sev-${row.crop}`,
    label: row.crop,
    value: target === 'price' ? row.priceZ : row.volumeZ,
    color: target === 'price' ? DATA_COLORS.price : DATA_COLORS.volume,
  }));

  const bufferBars: BarDatum[] = bufferRows.map((row) => ({
    id: `buf-${row.crop}`,
    label: row.crop,
    value: row.priceGapZRemaining,
    color: DATA_COLORS.price,
  }));

  return (
    <div className="scenario-lab__inner">
      <section className="scenario-lab__gate" aria-label="模型可信边界">
        <div className="scenario-lab__gate-head">
          <p className="ag-label">模型可信边界</p>
          <span className="ag-badge ag-badge--plain">模型状态 · 实验性</span>
          <span className="ag-badge ag-badge--plain">门槛 gate_min_r2 = {gateMin}</span>
        </div>
        <dl className="scenario-lab__gate-rows">
          {gate.map((row) => (
            <div key={row.target} className="scenario-lab__gate-row">
              <dt>{TARGET_LABEL[row.target as Target] ?? row.target} R²</dt>
              <dd className="ag-number">{row.r2.toFixed(4)}</dd>
              <dd className="ag-meta">门槛 {row.gateMin}</dd>
              <dd><span className="ag-badge ag-badge--plain" data-tone={row.pass ? 'observed' : 'negative'}>{row.pass ? '已过门槛' : '未过门槛'}</span></dd>
            </div>
          ))}
        </dl>
        <p className="scenario-lab__gate-statement">
          当前模型未达到可靠反事实预测门槛，本节为情景演示而非预测。
        </p>
      </section>

      <section className="ag-section" aria-labelledby="scenario-params">
        <div className="ag-section__head">
          <p className="ag-label">情景参数</p>
          <h2 className="ag-section-title" id="scenario-params">三个可调项</h2>
          <p className="ag-body">
            可选值都来自真实研究表；取值不在表中时，界面对齐到最近的真实取值并标注，不做插值。
          </p>
        </div>
        <div className="scenario-lab__params">
          <ParamSlider
            label="事件强度倍率"
            min={0.4}
            max={1.7}
            step={0.05}
            value={severityMult}
            options={severityOptions}
            clamped={effectiveSeverity}
            affects="冲击增强情景"
            hint="事件严重度倍率 severity_mult（表中只有单一强度轴，未拆分降雨与高温）"
            onChange={setSeverityMult}
            format={(value) => value.toFixed(2)}
          />
          <ParamSlider
            label="持续窗口"
            min={1}
            max={14}
            step={1}
            value={days}
            options={windowOptions}
            clamped={daysClamped}
            affects="无灾害情景"
            hint="反事实缺口窗口（表中只有过程内 5 日与过程后 10 日）"
            onChange={setDays}
            format={(value) => `${value} 日`}
          />
          <ParamSlider
            label="供应缓冲"
            min={0.05}
            max={0.35}
            step={0.05}
            value={bufferFrac}
            options={bufferOptions}
            clamped={bufferClamped}
            affects="供应缓冲情景"
            hint="缓冲比例 buffer_frac"
            onChange={setBufferFrac}
            format={(value) => value.toFixed(2)}
          />
        </div>
        <OptionSelector
          label="目标变量"
          options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
          value={target}
          onChange={(value) => setTarget(value as Target)}
        />
      </section>

      <section className="ag-section" aria-labelledby="scenario-worlds">
        <div className="ag-section__head">
          <p className="ag-label">四个情景</p>
          <h2 className="ag-section-title" id="scenario-worlds">同一事件的四种反事实呈现</h2>
          <p className="ag-body">缺口均为相对均值的稳健 z；价格单位为元/500g，成交量单位未知，只使用相对口径。</p>
        </div>
        <div className="ag-grid ag-grid--2 scenario-lab__worlds">
          <ChartFrame
            title="基准情景"
            note="反事实框架把实际发生的事件作为基准情景：严重度倍率 1.00 时缺口按定义为 0。观测侧证据见 2026 暴雨专题。"
            provenance="scenario"
            lineage={['counterfactual_severity.csv']}
          >
            <dl className="readout-row">
              <div className="readout-row__item"><dt>严重度倍率</dt><dd className="ag-number">{(baseline?.severityMult ?? 1).toFixed(2)}</dd></div>
              <div className="readout-row__item"><dt>价格缺口 z</dt><dd className="ag-number">{(baseline?.priceZ ?? 0).toFixed(3)}</dd></div>
              <div className="readout-row__item"><dt>成交量缺口 z</dt><dd className="ag-number">{(baseline?.volumeZ ?? 0).toFixed(3)}</dd></div>
            </dl>
          </ChartFrame>

          <ChartFrame
            title="无灾害情景"
            note={`去除 2026 事件的反事实世界（world0），缺口来自反事实缺口汇总表，窗口 ${daysClamped} 日（${daysClamped === 5 ? '过程内' : '过程后'}）。`}
            provenance="scenario"
            lineage={['counterfactual_gap_summary.csv']}
          >
            {noDisaster.length > 0 ? (
              <>
                <XYChart
                  ariaLabel={`无灾害世界中各品种${TARGET_LABEL[target]}缺口与置信区间`}
                  series={gapSeries}
                  bands={gapBands}
                  zeroLine
                  yLabel="某品种的缺口与置信区间"
                  yTickFormat={(value) => value.toFixed(2)}
                  xTickFormat={(value) => noDisaster[Math.round(value)]?.crop ?? ''}
                  describeX={(value) => {
                    const row = noDisaster[Math.round(value)];
                    if (!row) return '';
                    const ci = row.ciLowZ !== null && row.ciHighZ !== null ? `，95% CI [${row.ciLowZ.toFixed(3)}, ${row.ciHighZ.toFixed(3)}]` : '';
                    return `${row.crop}：缺口 z=${row.meanGapZ.toFixed(3)}，${row.meanGapPct.toFixed(2)}%${ci}`;
                  }}
                />
                <dl className="readout-row">
                  <div className="readout-row__item"><dt>POOLED 缺口 z</dt><dd className="ag-number">{(noDisasterPooled?.meanGapZ ?? 0).toFixed(3)}</dd></div>
                  <div className="readout-row__item"><dt>POOLED 缺口 %</dt><dd className="ag-number">{(noDisasterPooled?.meanGapPct ?? 0).toFixed(2)}%</dd></div>
                  <div className="readout-row__item"><dt>窗口</dt><dd className="ag-number">{daysClamped} 日</dd></div>
                </dl>
              </>
            ) : <p className="ag-meta">该窗口没有可用的缺口数据。</p>}
          </ChartFrame>

          <ChartFrame
            title="冲击增强情景"
            note={`按事件强度倍率 ${effectiveSeverity.toFixed(2)} 缩放事件强度后的反事实缺口。目标变量：${TARGET_LABEL[target]}。`}
            provenance="scenario"
            lineage={['counterfactual_severity.csv']}
          >
            <BarChart
              ariaLabel={`灾害增强世界中各品种${TARGET_LABEL[target]}缺口`}
              data={severityBars}
              valueFormat={(value) => value.toFixed(3)}
            />
            <dl className="readout-row">
              <div className="readout-row__item"><dt>POOLED 价格缺口 z</dt><dd className="ag-number">{(severityPooled?.priceZ ?? 0).toFixed(3)}</dd></div>
              <div className="readout-row__item"><dt>POOLED 成交量缺口 z</dt><dd className="ag-number">{(severityPooled?.volumeZ ?? 0).toFixed(3)}</dd></div>
              <div className="readout-row__item"><dt>价格缺口 %</dt><dd className="ag-number">{(severityPooled?.pricePct ?? 0).toFixed(2)}%</dd></div>
            </dl>
          </ChartFrame>

          <ChartFrame
            title="供应缓冲情景"
            note={`按缓冲比例 ${bufferClamped.toFixed(2)} 增强供应缓冲后，价格缺口的剩余部分。该表只有价格口径。`}
            provenance="scenario"
            lineage={['counterfactual_buffer.csv']}
          >
            <BarChart
              ariaLabel="供应缓冲增强世界中各品种价格缺口剩余"
              data={bufferBars}
              valueFormat={(value) => value.toFixed(3)}
            />
            <dl className="readout-row">
              <div className="readout-row__item"><dt>POOLED 剩余缺口 z</dt><dd className="ag-number">{(bufferPooled?.priceGapZRemaining ?? 0).toFixed(3)}</dd></div>
              <div className="readout-row__item"><dt>POOLED 避免比例</dt><dd className="ag-number">{(bufferPooled?.avoidedFraction ?? 0).toFixed(6)}</dd></div>
              <div className="readout-row__item"><dt>缓冲比例</dt><dd className="ag-number">{bufferClamped.toFixed(2)}</dd></div>
            </dl>
          </ChartFrame>
        </div>
      </section>

      <section className="ag-section" aria-labelledby="scenario-detail">
        <div className="ag-section__head">
          <p className="ag-label">缺口明细</p>
          <h2 className="ag-section-title" id="scenario-detail">无灾害情景 · {TARGET_LABEL[target]}分品种缺口</h2>
          <p className="ag-body">含 POOLED 汇总行；置信区间仅分品种提供，POOLED 行在源表中为空。</p>
        </div>
        <div className="scenario-lab__table-wrap">
          <table className="ag-table">
            <thead>
              <tr>
                <th scope="col">品种</th>
                <th scope="col">窗口</th>
                <th scope="col">n_days</th>
                <th scope="col">mean_gap_z</th>
                <th scope="col">mean_gap_pct</th>
                <th scope="col">95% CI（z）</th>
              </tr>
            </thead>
            <tbody>
              {[...noDisaster, ...(noDisasterPooled ? [noDisasterPooled] : [])].map((row) => (
                <tr key={row.crop}>
                  <td>{row.crop === 'POOLED' ? 'POOLED（汇总）' : row.crop}</td>
                  <td>{row.window === 'during' ? '过程内' : '过程后'}</td>
                  <td>{row.nDays}</td>
                  <td>{row.meanGapZ.toFixed(3)}</td>
                  <td>{row.meanGapPct.toFixed(2)}%</td>
                  <td>{row.ciLowZ !== null && row.ciHighZ !== null ? `[${row.ciLowZ.toFixed(3)}, ${row.ciHighZ.toFixed(3)}]` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="scenario-lab__foot">
        <p className="ag-body">
          以上四个情景共享同一套门控未过的模型；缺口的量级与方向都来自研究表，不代表真实因果，也不构成任何预测。
        </p>
        <div className="ag-row">
          <Link className="ag-button" to={ROUTES.rainstorm}>2026 暴雨专题</Link>
          <Link className="ag-button" to={ROUTES.report('shenyang')}>城市综合研究</Link>
        </div>
      </footer>
    </div>
  );
}

function ParamSlider({ label, hint, min, max, step, value, options, clamped, affects, onChange, format }: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  options: number[];
  clamped: number;
  affects: string;
  onChange: (value: number) => void;
  format: (value: number) => string;
}) {
  const clampedNote = isClamped(value, clamped);
  return (
    <div className="scenario-param" data-clamped={clampedNote || undefined}>
      <div className="scenario-param__head">
        <span className="scenario-param__label">{label}</span>
        <span className="scenario-param__value ag-number">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={`${format(value)}，对齐到 ${format(clamped)}`}
        className="scenario-param__input"
      />
      <p className="scenario-param__note">
        {clampedNote
          ? `所选 ${format(value)} 不在表中，已对齐到最近的真实取值 ${format(clamped)}。`
          : `对齐到表中真实取值 ${format(clamped)}。`}
        {' '}影响：{affects}。
      </p>
      <p className="scenario-param__hint">{hint}。可选值：{options.map(format).join(' / ')}。</p>
    </div>
  );
}
