import { useMemo, useState } from 'react';
import { variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTable } from '../data/useTable';
import { BarChart, ChartFrame, type BarDatum } from './primitives';
import { OptionSelector, VariableSelector } from './Selectors';

type Variable = 'price' | 'volume';

const VARIABLE_LABEL: Record<Variable, string> = { price: '价格', volume: '成交量' };
const SCOPE_LABEL: Record<string, string> = { open_field: '露地（主口径）', all: '全部（次口径）' };

interface InteractionRow {
  scope: string;
  response: string;
  crop: string;
  hazard: string;
  hazardLabel: string;
  windowDays: number | null;
  betaHazard: number | null;
  pHazard: number | null;
  betaInteraction: number;
  pInteraction: number | null;
  fdrP: number | null;
  sigFdr: boolean;
  n: number | null;
  r2: number | null;
  slopeIn: number | null;
  slopeOut: number | null;
}

function formatP(value: number | null): string {
  if (value === null) return '—';
  return value < 0.001 ? '<0.001' : value.toFixed(3);
}

function formatNumber(value: number | null, digits = 3): string {
  return value === null ? '—' : value.toFixed(digits);
}

/**
 * G9 补充模块：物候上市窗口内的交互项系数。
 * 关注交互项 b2 是否通过 FDR；当前数据下逐品种显著计数为 0。
 */
export function PhenologyChart({ source, evidenceLevel }: {
  source: string;
  evidenceLevel: EvidenceLevelCode;
}) {
  const state = useTable(source);
  const [variable, setVariable] = useState<Variable>('price');
  const [scope, setScope] = useState('open_field');
  const [hazard, setHazard] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const rows: InteractionRow[] = state.data.rows.map((row) => ({
      scope: row.scope,
      response: row.response,
      crop: row.crop,
      hazard: row.hazard,
      hazardLabel: row.hazard_label || row.hazard,
      windowDays: numeric(row.window_days),
      betaHazard: numeric(row.beta_hazard),
      pHazard: numeric(row.p_hazard),
      betaInteraction: numeric(row.beta_interaction) ?? 0,
      pInteraction: numeric(row.p_interaction),
      fdrP: numeric(row.fdr_p_interaction),
      sigFdr: row.sig_fdr05 === 'True',
      n: numeric(row.n),
      r2: numeric(row.r2),
      slopeIn: numeric(row.slope_in_window),
      slopeOut: numeric(row.slope_out_window),
    }));

    const scopeIds = [...new Set(rows.map((row) => row.scope))];
    const activeScope = scopeIds.includes(scope) ? scope : scopeIds[0] ?? '';
    const family = rows.filter((row) => row.scope === activeScope && row.response === variable);
    const hazards = [...new Map(family.map((row) => [row.hazard, row.hazardLabel])).entries()];
    const activeHazard = hazard && hazards.some(([id]) => id === hazard) ? hazard : hazards[0]?.[0] ?? '';
    return {
      scopeIds,
      activeScope,
      hazards,
      activeHazard,
      family,
      familySig: family.filter((row) => row.sigFdr).length,
      list: family.filter((row) => row.hazard === activeHazard),
    };
  }, [hazard, scope, state, variable]);

  const anySignificant = model ? model.list.some((row) => row.sigFdr) : false;

  const bars: BarDatum[] = model ? model.list.map((row) => ({
    id: row.crop,
    label: row.crop,
    value: row.betaInteraction,
    color: variableColor(variable),
    muted: anySignificant && !row.sigFdr,
    note: row.sigFdr ? `FDR p=${formatP(row.fdrP)} 显著` : `FDR p=${formatP(row.fdrP)}`,
  })) : [];

  const focus = model
    ? model.list.find((row) => row.crop === hovered) ?? model.list.find((row) => row.crop === selected) ?? null
    : null;

  const hazardLabel = model ? model.hazards.find(([id]) => id === model.activeHazard)?.[1] ?? model.activeHazard : '';
  const scopeLabel = model ? SCOPE_LABEL[model.activeScope] ?? model.activeScope : '';

  return (
    <ChartFrame
      title={`物候窗口交互系数（${VARIABLE_LABEL[variable]}）`}
      note={
        model
          ? `模型 y ~ z_hazard + z_hazard×in_window + in_window + 控制（HAC-14）；横条为交互项 b2。口径：${scopeLabel}，暴露变量：${hazardLabel}。`
          : '正在读取物候交互表。'
      }
      provenance="observed"
      sources={[source.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <VariableSelector<Variable>
            options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
            value={variable}
            onChange={setVariable}
          />
          {model && model.scopeIds.length > 1 && (
            <OptionSelector
              label="口径"
              options={model.scopeIds.map((id) => ({ id, label: SCOPE_LABEL[id] ?? id }))}
              value={model.activeScope}
              onChange={setScope}
            />
          )}
          {model && model.hazards.length > 1 && (
            <OptionSelector
              label="天气变量"
              options={model.hazards.map(([id, label]) => ({ id, label }))}
              value={model.activeHazard}
              onChange={setHazard}
            />
          )}
        </>
      }
    >
      <AsyncBoundary state={state} label="正在读取物候交互表">
        {() => (model && model.list.length > 0 ? (
          <>
            <BarChart
              ariaLabel={`${VARIABLE_LABEL[variable]}逐品种物候窗口交互系数`}
              data={bars}
              valueFormat={(value) => value.toFixed(3)}
              onSelect={setSelected}
              selectedId={selected}
            />

            <div className="selector">
              <span className="selector__label">悬停 / 点选品种查看完整读数</span>
              <ul className="compare-list" aria-label="逐品种交互系数读数">
                {model.list.map((row) => (
                  <li
                    key={row.crop}
                    data-active={(focus?.crop === row.crop) || undefined}
                    onPointerEnter={() => setHovered(row.crop)}
                    onPointerLeave={() => setHovered(null)}
                  >
                    <button type="button" onClick={() => setSelected(row.crop)}>{row.crop}</button>
                    <span className="ag-number">{row.betaInteraction.toFixed(3)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {focus ? (
              <div className="readout-row">
                <div className="readout-row__item"><dt>品种</dt><dd>{focus.crop}</dd></div>
                <div className="readout-row__item"><dt>暴露变量</dt><dd>{focus.hazardLabel}</dd></div>
                <div className="readout-row__item"><dt>窗口天数</dt><dd className="ag-number">{focus.windowDays ?? '—'}</dd></div>
                <div className="readout-row__item"><dt>主效应 b1</dt><dd className="ag-number">{formatNumber(focus.betaHazard)}</dd></div>
                <div className="readout-row__item"><dt>b1 p 值</dt><dd className="ag-number">{formatP(focus.pHazard)}</dd></div>
                <div className="readout-row__item"><dt>交互项 b2</dt><dd className="ag-number">{formatNumber(focus.betaInteraction)}</dd></div>
                <div className="readout-row__item"><dt>b2 p 值</dt><dd className="ag-number">{formatP(focus.pInteraction)}</dd></div>
                <div className="readout-row__item"><dt>b2 FDR p</dt><dd className="ag-number">{formatP(focus.fdrP)}</dd></div>
                <div className="readout-row__item"><dt>窗内 / 窗外斜率</dt><dd className="ag-number">{formatNumber(focus.slopeIn)} / {formatNumber(focus.slopeOut)}</dd></div>
                <div className="readout-row__item"><dt>R²</dt><dd className="ag-number">{formatNumber(focus.r2, 4)}</dd></div>
                <div className="readout-row__item"><dt>样本</dt><dd className="ag-number">{focus.n ?? '—'}</dd></div>
              </div>
            ) : <p className="ag-meta">悬停或点选任一品种，查看交互项系数、p 值与 FDR。</p>}

            <div className="readout-row">
              <div className="readout-row__item"><dt>FDR 显著计数（本口径）</dt><dd className="ag-number">{model.familySig} / {model.family.length}</dd></div>
              <div className="readout-row__item"><dt>本口径品种数</dt><dd className="ag-number">{model.list.length}</dd></div>
              <div className="readout-row__item"><dt>天气变量数</dt><dd className="ag-number">{model.hazards.length}</dd></div>
              <div className="readout-row__item"><dt>当前暴露</dt><dd>{hazardLabel}</dd></div>
            </div>

            <p className="chart-frame__note">
              在 {scopeLabel} 口径下，{VARIABLE_LABEL[variable]}的 {model.family.length} 个（品种 × 天气变量）交互项中，通过 FDR 校正的为 {model.familySig} 个，几乎全为 0；
              因此当前数据不支持"物候窗口内天气冲击被放大"。该口径并非全部品种可用，窗口构造含代理降级，结论不涉及产地来源。
            </p>
          </>
        ) : <p className="ag-meta">该口径下没有可用的物候交互数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
