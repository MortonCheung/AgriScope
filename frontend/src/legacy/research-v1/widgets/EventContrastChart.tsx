import { useMemo, useState } from 'react';
import { variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTable } from '../data/useTable';
import { BarChart, ChartFrame, ReadoutRow, type BarDatum } from './primitives';
import { VariableSelector } from './Selectors';

type Variable = 'price' | 'volume';

const VARIABLE_LABEL: Record<Variable, string> = { price: '价格', volume: '成交量' };

interface ContrastRow {
  crop: string;
  diff: number;
  ciLow: number | null;
  ciHigh: number | null;
  meanZExtreme: number | null;
  meanZNormal: number | null;
  abszExtreme: number | null;
  abszNormal: number | null;
  p: number | null;
  fdr: number | null;
  nExtreme: number | null;
  nNormal: number | null;
}

function readContrast(rows: Record<string, string>[], response: Variable): ContrastRow[] {
  return rows
    .filter((row) => row.response === response)
    .map((row) => ({
      crop: row.crop,
      diff: numeric(row.diff) ?? 0,
      ciLow: numeric(row.ci_low),
      ciHigh: numeric(row.ci_high),
      meanZExtreme: numeric(row.mean_z_extreme),
      meanZNormal: numeric(row.mean_z_normal),
      abszExtreme: numeric(row.mean_absz_extreme),
      abszNormal: numeric(row.mean_absz_normal),
      p: numeric(row.p_value),
      fdr: numeric(row.fdr_p),
      nExtreme: numeric(row.n_extreme_obs),
      nNormal: numeric(row.n_normal_obs),
    }))
    .sort((a, b) => b.diff - a.diff);
}

function formatP(value: number | null): string {
  if (value === null) return '—';
  return value < 0.001 ? '<0.001' : value.toFixed(3);
}

function formatNumber(value: number | null, digits = 3): string {
  return value === null ? '—' : value.toFixed(digits);
}

/**
 * G7 补充模块：极端日与普通日的 z 均值差。
 * 结论必须中性：极端日本身的市场波动并不更大；显著单元多为负向。
 */
export function EventContrastChart({ source, evidenceLevel }: {
  source: string;
  evidenceLevel: EvidenceLevelCode;
}) {
  const state = useTable(source);
  const [variable, setVariable] = useState<Variable>('price');
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const rows = readContrast(state.data.rows, variable);
    const significant = rows.filter((row) => row.fdr !== null && row.fdr < 0.05);
    return {
      rows,
      calmCount: rows.filter((row) => row.abszExtreme !== null && row.abszNormal !== null && row.abszExtreme < row.abszNormal).length,
      sigCount: significant.length,
      sigNegative: significant.filter((row) => row.diff < 0).length,
      nExtreme: rows[0]?.nExtreme ?? null,
    };
  }, [state, variable]);

  const bars: BarDatum[] = model ? model.rows.map((row) => ({
    id: row.crop,
    label: row.crop,
    value: row.diff,
    color: variableColor(variable),
    muted: !(row.fdr !== null && row.fdr < 0.05),
    note: row.fdr !== null && row.fdr < 0.05 ? `FDR p=${formatP(row.fdr)} 显著` : `FDR p=${formatP(row.fdr)}`,
  })) : [];

  const focus = model
    ? model.rows.find((row) => row.crop === hovered) ?? model.rows.find((row) => row.crop === selected) ?? null
    : null;

  return (
    <ChartFrame
      title={`极端日与普通日的市场异常差（${VARIABLE_LABEL[variable]}）`}
      note={`横条为极端日与普通日 z 均值的差（正值代表极端日更高），阴影口径由研究表给出；极端日仅 ${model?.nExtreme ?? '—'} 天，逐品种极端日样本 n=19。`}
      provenance="observed"
      lineage={[source.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <VariableSelector<Variable>
          options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
          value={variable}
          onChange={setVariable}
        />
      }
    >
      <AsyncBoundary state={state}>
        {() => (model && model.rows.length > 0 ? (
          <>
            <BarChart
              ariaLabel={`${VARIABLE_LABEL[variable]}极端日与普通日的均值差`}
              data={bars}
              valueFormat={(value) => value.toFixed(3)}
              onSelect={setSelected}
              selectedId={selected}
            />

            <div className="selector">
              <ul className="compare-list" aria-label="逐品种极端日均值差读数">
                {model.rows.map((row) => (
                  <li
                    key={row.crop}
                    data-active={(focus?.crop === row.crop) || undefined}
                    onPointerEnter={() => setHovered(row.crop)}
                    onPointerLeave={() => setHovered(null)}
                  >
                    <button type="button" onClick={() => setSelected(row.crop)}>{row.crop}</button>
                    <span className="ag-number">{row.diff.toFixed(3)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 读数区始终渲染（V4 §五十）：无选中时为「—」，高度与有读数时一致 */}
            <ReadoutRow items={[
              { label: '品种', value: focus ? focus.crop : '—', text: true },
              { label: 'z 均值差', value: focus ? formatNumber(focus.diff) : '—' },
              { label: '95% 区间', value: focus && focus.ciLow !== null && focus.ciHigh !== null ? `[${focus.ciLow.toFixed(3)}, ${focus.ciHigh.toFixed(3)}]` : '—' },
              { label: '极端日 z 均值', value: focus ? formatNumber(focus.meanZExtreme) : '—' },
              { label: '普通日 z 均值', value: focus ? formatNumber(focus.meanZNormal) : '—' },
              { label: '极端日 |z| 均值', value: focus ? formatNumber(focus.abszExtreme) : '—' },
              { label: '普通日 |z| 均值', value: focus ? formatNumber(focus.abszNormal) : '—' },
              { label: 'Welch p', value: focus ? formatP(focus.p) : '—' },
              { label: 'FDR p', value: focus ? formatP(focus.fdr) : '—' },
              { label: '极端日 / 普通日样本', value: focus ? `${focus.nExtreme ?? '—'} / ${focus.nNormal ?? '—'}` : '—' },
            ]} />

            <p className="chart-frame__note">
              以极端日与普通日的 |z| 均值衡量，{model.calmCount}/{model.rows.length} 个品种在极端日的波动并不更大；
              {model.sigCount === 0
                ? '没有任何单元的均值差通过 FDR 校正。'
                : `${model.sigCount} 个单元的均值差通过 FDR 校正，其中 ${model.sigNegative}/${model.sigCount} 个为负向（极端日更平静）。`}
              极端日本身的波动并不更大，因此不支持"极端天气日市场波动更大"的表述。
            </p>
          </>
        ) : <p className="ag-meta">该目标变量没有可用的极端日对比数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
