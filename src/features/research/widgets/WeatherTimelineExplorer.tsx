import { useEffect, useMemo, useState } from 'react';
import { DATA_COLORS } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useResearchContextStore } from '../../insight/researchContextStore';
import { useTable } from '../data/useTable';
import { ChartFrame, XYChart, type XYBand, type XYMarker, type XYSeries } from './primitives';
import { OptionSelector, TimeScrubber } from './Selectors';

type TimelineVariable = 'precip' | 'precip3d' | 'humidity' | 'vpd' | 'climZ';

const VARIABLES: { id: TimelineVariable; label: string; unit: string; color: string; dashed?: boolean }[] = [
  { id: 'precip', label: '逐日降水', unit: 'mm', color: DATA_COLORS.rain },
  { id: 'precip3d', label: '3 日累计降水', unit: 'mm', color: DATA_COLORS.rain, dashed: true },
  { id: 'humidity', label: '近地面相对湿度', unit: '%', color: DATA_COLORS.humidity },
  { id: 'vpd', label: '饱和水汽压差 VPD', unit: 'kPa', color: DATA_COLORS.radiation },
  { id: 'climZ', label: '相对基线偏离', unit: 'σ', color: DATA_COLORS.extreme },
];

interface TimelineDay {
  index: number;
  label: string;
  date: string;
  precip: number;
  precip3d: number;
  climMean: number;
  climStd: number;
  humidity: number;
  vpd: number;
  climZ: number;
}

/**
 * G7 时间线探索器：事件窗口逐日序列。
 *
 * 曲线沿真实日期逐渐绘制，事件标注按真实顺序出现，用户可以暂停、拖动时间；
 * 拖动时联动图表、时间轴、标注、事件状态与关键数字（同一份 case2026 研究表）。
 */
export function WeatherTimelineExplorer({ source, evidenceLevel, note }: { source: string; evidenceLevel: EvidenceLevelCode; note?: string }) {
  const state = useTable(source);
  const [variable, setVariable] = useState<TimelineVariable>('precip');
  const [cursor, setCursor] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [revealNonce, setRevealNonce] = useState(0);
  const setSelection = useResearchContextStore((store) => store.setSelection);

  const days = useMemo<TimelineDay[]>(() => {
    if (state.status !== 'ready') return [];
    return state.data.rows.map((row, position) => ({
      index: position + 1,
      date: row.date ?? '',
      label: (row.date ?? '').slice(5),
      precip: numeric(row.precipitation) ?? 0,
      precip3d: numeric(row.precip_3d) ?? 0,
      climMean: numeric(row.clim_precipitation_mean) ?? 0,
      climStd: numeric(row.clim_precipitation_std) ?? 0,
      humidity: numeric(row.humidity) ?? 0,
      vpd: numeric(row.vpd) ?? 0,
      climZ: numeric(row.clim_z) ?? 0,
    }));
  }, [state]);

  useEffect(() => {
    if (!playing) return;
    if (cursor >= days.length) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setCursor((value) => Math.min(days.length, value + 1)), 620);
    return () => window.clearTimeout(timer);
  }, [playing, cursor, days.length]);

  const active = days.find((day) => day.index === cursor) ?? days[0] ?? null;
  useEffect(() => {
    if (active) setSelection({ selectedDateRangeOrWindow: active.date, currentFigure: '事件窗口逐日序列' });
  }, [active, setSelection]);

  const meta = VARIABLES.find((entry) => entry.id === variable)!;
  const peak = days.reduce<TimelineDay | null>((best, day) => (!best || day.precip > best.precip ? day : best), null);

  const series: XYSeries[] = days.length > 0 ? [{
    id: variable,
    label: `${meta.label}（${meta.unit}）`,
    points: days.map((day) => ({ x: day.index, y: day[variable] })),
    color: meta.color,
    dash: meta.dashed ? '5 4' : undefined,
    dots: true,
  }] : [];

  const bands: XYBand[] = variable === 'precip' && days.length > 0 ? [{
    id: 'clim-band',
    upper: days.map((day) => ({ x: day.index, y: day.climMean + day.climStd })),
    lower: days.map((day) => ({ x: day.index, y: Math.max(0, day.climMean - day.climStd) })),
    color: DATA_COLORS.rain,
    opacity: 0.12,
  }] : [];

  const markers: XYMarker[] = peak ? [{ x: peak.index, label: `${peak.label} 峰值` }] : [];
  const exitedBaseline = active ? active.precip > active.climMean + active.climStd : false;

  return (
    <ChartFrame
      title="事件窗口逐日序列"
      note={note ?? '曲线沿真实日期逐渐绘制。拖动时间轴或播放，图表、标注、事件状态与关键数字同步更新。'}
      provenance="observed"
      sources={[source.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <OptionSelector
            label="变量"
            options={VARIABLES.map((entry) => ({ id: entry.id, label: entry.label }))}
            value={variable}
            onChange={(value) => { setVariable(value as TimelineVariable); setCursor(1); setPlaying(false); }}
          />
          <div className="selector">
            <span className="selector__label">时间</span>
            <TimeScrubber
              min={1}
              max={Math.max(1, days.length)}
              value={cursor}
              onChange={(value) => { setCursor(value); setPlaying(false); }}
              label={(value) => days.find((day) => day.index === value)?.label ?? `第 ${value} 天`}
              playing={playing}
              onTogglePlay={() => setPlaying((value) => !value)}
            />
          </div>
          {variable !== 'precip' || !days.length ? null : (
            <div className="selector">
              <span className="selector__label">绘制</span>
              <div className="selector__options">
                <button type="button" className="ag-chip" onClick={() => { setRevealNonce((value) => value + 1); setCursor(1); setPlaying(false); }}>
                  重播绘制
                </button>
                <span className="ag-meta">阴影为 1991–2020 同期基线均值 ± 1 SD</span>
              </div>
            </div>
          )}
        </>
      }
    >
      <AsyncBoundary state={state} label="正在读取案例天气表">
        {() => (days.length > 0 ? (
          <>
            <XYChart
              key={`${variable}-${revealNonce}`}
              ariaLabel={`2026 年 7 月事件窗口${meta.label}逐日序列`}
              series={series}
              bands={bands}
              markers={markers}
              zeroLine={variable === 'climZ'}
              reveal
              highlightX={cursor}
              onHoverX={(value) => { if (value === null) return; setCursor(Math.round(value)); }}
              yTickFormat={(value) => value.toFixed(variable === 'vpd' ? 1 : 0)}
              xTickFormat={(value) => days.find((day) => day.index === value)?.label ?? String(value)}
              describeX={(value) => {
                const day = days.reduce((best, entry) => (Math.abs(entry.index - value) < Math.abs(best.index - value) ? entry : best), days[0]);
                return `${day.date}：降水 ${day.precip.toFixed(1)} mm，3 日累计 ${day.precip3d.toFixed(1)} mm，基线偏离 z≈${day.climZ.toFixed(1)}`;
              }}
            />
            <div className="readout-row">
              <div className="readout-row__item"><dt>当前日期</dt><dd className="ag-number">{active?.date ?? '—'}</dd></div>
              <div className="readout-row__item"><dt>降水（mm）</dt><dd className="ag-number">{active ? active.precip.toFixed(1) : '—'}</dd></div>
              <div className="readout-row__item"><dt>3 日累计（mm）</dt><dd className="ag-number">{active ? active.precip3d.toFixed(1) : '—'}</dd></div>
              <div className="readout-row__item"><dt>相对基线（σ）</dt><dd className="ag-number">{active ? active.climZ.toFixed(1) : '—'}</dd></div>
              <div className="readout-row__item"><dt>事件状态</dt><dd className="ag-number">{active ? (exitedBaseline ? '冲出基线波动带' : '落在基线波动带内') : '—'}</dd></div>
            </div>
            <p className="chart-frame__note">
              降水为 ERA5 再分析网格均值，不是气象站实测；基线为 1991–2020 同期气候值。
              冲出波动带只说明当日降水相对同期气候异常，不代表市场响应。
            </p>
          </>
        ) : <p className="ag-meta">该研究点没有可用的逐日案例天气表。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
