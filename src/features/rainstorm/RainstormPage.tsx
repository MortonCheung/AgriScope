import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { AsyncBoundary } from '../../components/AsyncState';
import { ResearchFigure } from '../../components/ResearchFigure';
import { DATA_COLORS } from '../../design/chartTokens';
import type { CityResearchIndex, ResearchTable } from '../../domain/research/types';
import { numeric } from '../../services/csv';
import { useCityResearch } from '../../services/useCityResearch';
import { useTables } from '../research/data/useTable';
import { BarChart, ChartFrame, XYChart, type BarDatum, type XYBand, type XYMarker, type XYSeries } from '../research/widgets/primitives';
import './rainstorm.css';

/**
 * 2026 沈阳强降雨专题：以 8 步滚动叙事呈现"一次显著天气冲击为什么没有转化为
 * 同等量级的市场冲击"。左/上为 sticky 图区，右侧步骤文本随滚动推进；
 * prefers-reduced-motion 或窄屏时退化为普通文档（每步自带图）。
 * 实际观测 / 模型估计严格分开，事实与假说分开，不写因果结论。
 */

const TABLES = {
  weather: '/research/shenyang/tables/case2026_weather.csv',
  summary: '/research/shenyang/tables/case2026_summary.csv',
  vsHistory: '/research/shenyang/tables/case2026_vs_history.csv',
  rank: '/research/shenyang/tables/case2026_rank.csv',
  analog: '/research/shenyang/tables/counterfactual_analog.csv',
};

const FIGURES = '/research/shenyang/figures';

interface WeatherDay {
  label: string;
  day: number;
  precip: number;
  precip3d: number;
  climMean: number;
  climStd: number;
  humidity: number;
  vpd: number;
  climZ: number;
}

interface SummaryRow {
  crop: string;
  response: string;
  eventMean: number;
  post3_14: number;
  troughOffset: number;
  troughZ: number;
  peakOffset: number;
  peakZ: number;
}

interface VsHistoryRow {
  response: string;
  casePostMean: number;
  histPostMean: number;
  ciLow: number;
  ciHigh: number;
  within: boolean;
  placeboP: number | null;
}

interface RankRow { metric: string; value: number; unit: string; reference: string }

function parseWeather(table: ResearchTable): WeatherDay[] {
  return table.rows.map((row, position) => ({
    label: (row.date ?? '').slice(5),
    day: position + 1,
    precip: numeric(row.precipitation) ?? 0,
    precip3d: numeric(row.precip_3d) ?? 0,
    climMean: numeric(row.clim_precipitation_mean) ?? 0,
    climStd: numeric(row.clim_precipitation_std) ?? 0,
    humidity: numeric(row.humidity) ?? 0,
    vpd: numeric(row.vpd) ?? 0,
    climZ: numeric(row.clim_z) ?? 0,
  }));
}

function parseSummary(table: ResearchTable): SummaryRow[] {
  return table.rows.map((row) => ({
    crop: row.crop,
    response: row.response,
    eventMean: numeric(row['event_mean(-2..2)']) ?? 0,
    post3_14: numeric(row.post_3_14) ?? 0,
    troughOffset: numeric(row.trough_offset) ?? 0,
    troughZ: numeric(row.trough_z) ?? 0,
    peakOffset: numeric(row.peak_offset) ?? 0,
    peakZ: numeric(row.peak_z) ?? 0,
  }));
}

function parseVsHistory(table: ResearchTable): VsHistoryRow[] {
  return table.rows.map((row) => ({
    response: row.response,
    casePostMean: numeric(row.case_post_mean) ?? 0,
    histPostMean: numeric(row.hist_post_mean) ?? 0,
    ciLow: numeric(row.hist_ci_low) ?? 0,
    ciHigh: numeric(row.hist_ci_high) ?? 0,
    within: row.case_within_hist_ci === 'True',
    placeboP: numeric(row.placebo_p),
  }));
}

function parseRank(table: ResearchTable): RankRow[] {
  return table.rows.map((row) => ({
    metric: row.metric,
    value: numeric(row.value) ?? 0,
    unit: row.unit,
    reference: row.reference,
  }));
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function RainstormPage() {
  const indexState = useCityResearch('shenyang');
  const tableState = useTables([TABLES.weather, TABLES.summary, TABLES.vsHistory, TABLES.rank, TABLES.analog]);

  return (
    <main className="rainstorm">
      <AsyncBoundary state={indexState} label="正在读取城市研究索引">
        {(index) => (
          <AsyncBoundary state={tableState} label="正在读取 2026 案例研究表">
            {(tables) => <RainstormBody index={index} tables={tables} />}
          </AsyncBoundary>
        )}
      </AsyncBoundary>
    </main>
  );
}

function RainstormBody({ index, tables }: { index: CityResearchIndex; tables: ResearchTable[] }) {
  const days = useMemo(() => parseWeather(tables[0]), [tables]);
  const summary = useMemo(() => parseSummary(tables[1]), [tables]);
  const vsHistory = useMemo(() => parseVsHistory(tables[2]), [tables]);
  const rank = useMemo(() => parseRank(tables[3]), [tables]);
  const analog = tables[4]?.rows[0] ?? null;

  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const narrow = useMediaQuery('(max-width: 1023px)');
  const documentMode = reduced || narrow;

  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  const steps = useMemo(
    () => buildSteps({ index, days, summary, vsHistory, rank, analog }),
    [index, days, summary, vsHistory, rank, analog],
  );

  useEffect(() => {
    if (documentMode) return;
    const nodes = stepRefs.current.filter((node): node is HTMLLIElement => Boolean(node));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [documentMode, steps.length]);

  const peak = days.reduce((best, day) => (day.precip > best.precip ? day : best), days[0]);

  return (
    <div className="rainstorm__inner">
      <header className="rainstorm__head">
        <p className="ag-label">专题 · 2026 暴雨</p>
        <h1 className="ag-hero rainstorm__title">2026 沈阳强降雨</h1>
        <p className="rainstorm__question">为什么一次显著天气冲击没有转化为同等量级的市场冲击？</p>
        <p className="ag-lead">
          由 {index.cityName} {index.window} 日度面板得出。以下 8 步中，事实来自 case2026 系列研究表，
          假说与因果解释严格分开，不作为结论。
        </p>
        <div className="ag-row rainstorm__lede">
          <span className="ag-badge ag-badge--plain">观测峰值 {peak.label} · {peak.precip} mm</span>
          <span className="ag-badge ag-badge--plain">证据等级 A 表示直接观测</span>
          <Link className="ag-button" to={ROUTES.report('shenyang')}>城市综合研究</Link>
          <Link className="ag-button" to={ROUTES.scenarioLab}>平行世界实验室</Link>
        </div>
      </header>

      <div className="rainstorm__scrolly">
        {!documentMode && (
          <div className="rainstorm__media" aria-live="polite">
            {steps[active].media}
          </div>
        )}
        <ol className="rainstorm__steps">
          {steps.map((step, position) => (
            <li
              key={step.id}
              className="rainstorm__step"
              data-index={position}
              data-active={!documentMode && position === active ? 'true' : undefined}
              ref={(node) => { stepRefs.current[position] = node; }}
            >
              {documentMode && <div className="rainstorm__media rainstorm__media--inline">{step.media}</div>}
              <div className="rainstorm__step-text">
                <div className="rainstorm__step-head">
                  <span className="rainstorm__step-index">{step.index}</span>
                  <h2 className="rainstorm__step-title">{step.title}</h2>
                  <span className="ag-badge ag-badge--plain" data-provenance={step.provenance}>{step.provenanceLabel}</span>
                </div>
                <p className="rainstorm__step-lead">{step.lead}</p>
                <ul className="rainstorm__facts">
                  {step.facts.map((fact) => <li key={fact}>{fact}</li>)}
                </ul>
                {step.hypothesis && (
                  <p className="rainstorm__hypothesis"><span className="ag-label">假说（未经验证）</span>{step.hypothesis}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

interface StepInput {
  index: CityResearchIndex;
  days: WeatherDay[];
  summary: SummaryRow[];
  vsHistory: VsHistoryRow[];
  rank: RankRow[];
  analog: Record<string, string> | null;
}

interface Step {
  id: string;
  index: string;
  title: string;
  lead: string;
  facts: string[];
  provenance: 'observed' | 'model' | 'scenario';
  provenanceLabel: string;
  hypothesis?: string;
  media: ReactNode;
}

function cropBars(rows: SummaryRow[], response: string, value: (row: SummaryRow) => number): BarDatum[] {
  return rows
    .filter((row) => row.response === response)
    .map((row) => ({ id: `${response}-${row.crop}`, label: row.crop, value: value(row), color: response === 'price' ? DATA_COLORS.price : DATA_COLORS.volume }));
}

function buildSteps({ index, days, summary, vsHistory, rank, analog }: StepInput): Step[] {
  const peak = days.reduce((best, day) => (day.precip > best.precip ? day : best), days[0]);
  const peakMarker: XYMarker[] = [{ x: peak.day, label: `${peak.label} 峰值` }];

  const findRank = (keyword: string) => rank.find((row) => row.metric.includes(keyword));
  const dailyMax = findRank('单日最大');
  const threeDayMax = findRank('3日累计');
  const processTotal = findRank('过程累计');
  const julyTotal = findRank('7月降水总量');

  const precipSeries: XYSeries[] = [
    { id: 'precip', label: '逐日降水（mm）', points: days.map((day) => ({ x: day.day, y: day.precip })), color: DATA_COLORS.rain, dots: true },
    { id: 'precip3d', label: '3 日累计降水（mm）', points: days.map((day) => ({ x: day.day, y: day.precip3d })), color: DATA_COLORS.rain, dash: '5 4', width: 1.3 },
  ];

  const baselineSeries: XYSeries[] = [
    { id: 'precip', label: '逐日降水（实测口径，ERA5 网格均值）', points: days.map((day) => ({ x: day.day, y: day.precip })), color: DATA_COLORS.rain, dots: true },
    { id: 'clim', label: '1991–2020 同期基线均值', points: days.map((day) => ({ x: day.day, y: day.climMean })), color: DATA_COLORS.null, dash: '3 4', width: 1.2 },
  ];
  const baselineBand: XYBand[] = [{
    id: 'clim-sd',
    upper: days.map((day) => ({ x: day.day, y: day.climMean + day.climStd })),
    lower: days.map((day) => ({ x: day.day, y: Math.max(0, day.climMean - day.climStd) })),
    color: DATA_COLORS.rain,
    opacity: 0.12,
  }];

  const humiditySeries: XYSeries[] = [
    { id: 'humidity', label: '近地面相对湿度（%）', points: days.map((day) => ({ x: day.day, y: day.humidity })), color: DATA_COLORS.humidity, dots: true },
  ];

  const describe = (value: number) => {
    const day = days.reduce((best, entry) => (Math.abs(entry.day - value) < Math.abs(best.day - value) ? entry : best), days[0]);
    return `${day.label}：降水 ${day.precip.toFixed(1)} mm，3 日累计 ${day.precip3d.toFixed(1)} mm，相对基线 z≈${day.climZ.toFixed(1)}`;
  };

  const vsPrice = vsHistory.find((row) => row.response === 'price');
  const vsVolume = vsHistory.find((row) => row.response === 'volume');
  const pointC3 = index.points.find((point) => point.id === 'C3');
  const pointC4 = index.points.find((point) => point.id === 'C4');
  const pointG4 = index.points.find((point) => point.id === 'G4');
  const soilAr1 = pointG4?.keyNumbers.find((entry) => entry.label.includes('AR(1)'));
  const soilNeff = pointG4?.keyNumbers.find((entry) => entry.label.includes('n_eff'));
  const rainQuestion = index.cityConclusion.questions.find((qa) => qa.question.includes('2026'));

  return [
    {
      id: 'event',
      index: '01',
      title: '事件发生',
      lead: '2026-07 中旬，一次强降雨过程落在沈阳。以下为事件窗口的逐日与 3 日累计降水。',
      provenance: 'observed',
      provenanceLabel: '实际观测',
      facts: [
        dailyMax ? `单日最大降水（${dailyMax.metric.replace(/^单日最大降水（|）$/g, '')}）${dailyMax.value.toFixed(1)} mm，${dailyMax.reference}` : '',
        threeDayMax ? `3 日累计最大降水 ${threeDayMax.value.toFixed(1)} mm，${threeDayMax.reference}` : '',
        processTotal ? `过程累计降水（07-11~07-15）${processTotal.value.toFixed(1)} mm` : '',
        julyTotal ? `2026 年 7 月降水总量 ${julyTotal.value.toFixed(1)} mm` : '',
      ].filter(Boolean),
      media: (
        <ChartFrame
          title="事件窗口逐日降水与 3 日累计"
          note="横轴为 2026 年 7 月日期，纵轴为降水量（mm）。降水为 ERA5 再分析网格均值，非气象站实测。"
          provenance="observed"
          sources={['case2026_weather.csv', 'case2026_rank.csv']}
          evidenceLevel="证据 A"
        >
          <XYChart
            ariaLabel="2026 年 7 月沈阳逐日降水与 3 日累计"
            series={precipSeries}
            markers={peakMarker}
            zeroLine
            yLabel="悬停查看某日降水"
            xTickFormat={(value) => `${value}日`}
            yTickFormat={(value) => value.toFixed(0)}
            describeX={describe}
          />
        </ChartFrame>
      ),
    },
    {
      id: 'anomaly',
      index: '02',
      title: '相对气候基线有多异常',
      lead: '把事件窗口放回 1991–2020 同期基线：多数日子的降水落在基线波动带内，只有少数几天冲出上界。',
      provenance: 'observed',
      provenanceLabel: '实际观测',
      facts: [
        `${peak.label} 相对 1991–2020 同期基线偏离约 z≈${peak.climZ.toFixed(1)}`,
        julyTotal?.reference ? `历年 7 月降水对比（研究表记录：${julyTotal.reference}）` : '',
        '基线与标准差来自 1991–2020 同期气候值，以 ERA5 网格均值口径给出',
      ],
      media: (
        <ChartFrame
          title="逐日降水 vs 气候基线均值 ± 1 SD"
          note="阴影为基线 ± 1 个标准差的波动带；虚线为基线均值。冲出波动带即代表当日降水相对同期气候异常。"
          provenance="observed"
          sources={['case2026_weather.csv']}
          evidenceLevel="证据 A"
        >
          <XYChart
            ariaLabel="2026 年 7 月逐日降水与 1991–2020 同期基线波动带"
            series={baselineSeries}
            bands={baselineBand}
            markers={peakMarker}
            zeroLine
            yLabel="悬停查看某日降水与基线"
            xTickFormat={(value) => `${value}日`}
            yTickFormat={(value) => value.toFixed(0)}
            describeX={describe}
          />
        </ChartFrame>
      ),
    },
    {
      id: 'soil',
      index: '03',
      title: '土壤如何响应',
      lead: '案例事件表未单独给出事件期土壤水分序列；可用的土壤证据来自全局三层分析与类比日汇总，需与其区分。',
      provenance: 'observed',
      provenanceLabel: '实际观测',
      facts: [
        analog ? `类比日汇总（${numeric(analog.n_analog_days) ?? 0} 天匹配）：表层（0–7cm）土壤含水量 ${numeric(analog.soil_moisture_0_7)?.toFixed(3) ?? '—'} m³/m³` : '',
        analog ? `类比日匹配口径：降水 ${numeric(analog.precipitation)?.toFixed(1) ?? '—'} mm、最高气温 ${numeric(analog.temp_max)?.toFixed(1) ?? '—'} ℃、VPD ${numeric(analog.vpd)?.toFixed(2) ?? '—'}` : '',
        pointG4?.frontendText
          ? `${pointG4.frontendText}${soilAr1 && soilNeff ? `（研究索引记录：${soilAr1.label} = ${soilAr1.value}，${soilNeff.label} ≈ ${soilNeff.value}）` : ''}`
          : '',
      ].filter(Boolean),
      media: (
        <ChartFrame
          title="事件窗口近地面相对湿度"
          note="案例事件表未含事件期土壤水分时间序列；此处以近地面相对湿度作为水分条件的观测代理，土壤结论以类比日汇总与全局三层分析为准。"
          provenance="observed"
          sources={['case2026_weather.csv', 'counterfactual_analog.csv']}
          evidenceLevel="证据 A（湿度）/ B（土壤）"
        >
          <XYChart
            ariaLabel="2026 年 7 月事件窗口近地面相对湿度"
            series={humiditySeries}
            markers={peakMarker}
            yLabel="悬停查看湿度与 VPD"
            xTickFormat={(value) => `${value}日`}
            yTickFormat={(value) => `${value.toFixed(0)}%`}
            describeX={(value) => {
              const day = days.reduce((best, entry) => (Math.abs(entry.day - value) < Math.abs(best.day - value) ? entry : best), days[0]);
              return `${day.label}：相对湿度 ${day.humidity.toFixed(0)}%，VPD ${day.vpd.toFixed(2)} kPa`;
            }}
          />
        </ChartFrame>
      ),
    },
    {
      id: 'volume',
      index: '04',
      title: '成交量如何变化',
      lead: '把事件后的成交量偏离放到品种维度：多数品种小幅下偏，个别品种上偏，方向不一致。',
      provenance: 'observed',
      provenanceLabel: '实际观测',
      facts: [
        '数值为事件后窗口（事件后第 3–14 日）成交量相对均值的稳健 z，非绝对值',
        '成交量单位在数据集中未知，只使用 z / 相对口径，禁止写作吨',
        '各品种偏离方向不一致，整体未见同向大幅移动',
      ],
      media: (
        <ChartFrame
          title="事件后窗口成交量偏离（z 口径）"
          note="横条为各品种在事件后第 3–14 日的成交量偏离（z），虚线为零偏离。"
          provenance="observed"
          sources={['case2026_summary.csv']}
          evidenceLevel="证据 A"
        >
          <BarChart
            ariaLabel="2026 暴雨事件后各品种成交量偏离"
            data={cropBars(summary, 'volume', (row) => row.post3_14)}
            valueFormat={(value) => value.toFixed(2)}
          />
        </ChartFrame>
      ),
    },
    {
      id: 'price',
      index: '05',
      title: '价格如何变化',
      lead: '同样的窗口放到价格上：品种之间的偏离差异明显大于成交量，但整体仍在常规波动范围内。',
      provenance: 'observed',
      provenanceLabel: '实际观测',
      facts: [
        '数值为事件后窗口（事件后第 3–14 日）价格相对均值的稳健 z',
        '价格单位为元/500g；偏离为相对口径，不代表具体价格',
        '黄瓜、韭菜等品种上偏，部分品种下偏，未见全行业同向冲击',
      ],
      media: (
        <>
          <ChartFrame
            title="事件后窗口价格偏离（z 口径）"
            note="横条为各品种在事件后第 3–14 日的价格偏离（z），虚线为零偏离。"
            provenance="observed"
            sources={['case2026_summary.csv']}
            evidenceLevel="证据 A"
          >
            <BarChart
              ariaLabel="2026 暴雨事件后各品种价格偏离"
              data={cropBars(summary, 'price', (row) => row.post3_14)}
              valueFormat={(value) => value.toFixed(2)}
            />
          </ChartFrame>
          <ChartFrame
            title="分品种案例响应（F28）"
            note="研究工程输出的分品种案例响应图，供与上面 z 口径读数对照。"
            provenance="observed"
            sources={['F28_case2026_percrop.png']}
          >
            <ResearchFigure
              src={`${FIGURES}/F28_case2026_percrop.png`}
              alt="2026 暴雨案例分品种价格与成交量响应图"
              source="shenyang · case2026"
              evidenceLevel="A"
            />
          </ChartFrame>
        </>
      ),
    },
    {
      id: 'history',
      index: '06',
      title: '是否超出历史正常波动',
      lead: '把案例后均值放到 8 个历史清洁雨簇的分布里比较：价格落在历史区间内，成交量仅边缘偏离。',
      provenance: 'observed',
      provenanceLabel: '实际观测',
      facts: [
        vsPrice ? `价格案例后均值 ${vsPrice.casePostMean.toFixed(3)}，历史区间 [${vsPrice.ciLow.toFixed(3)}, ${vsPrice.ciHigh.toFixed(3)}]，落在区间内：${vsPrice.within ? '是' : '否'}` : '',
        vsVolume ? `成交量案例后均值 ${vsVolume.casePostMean.toFixed(3)}，历史区间 [${vsVolume.ciLow.toFixed(3)}, ${vsVolume.ciHigh.toFixed(3)}]，落在区间内：${vsVolume.within ? '是' : '否'}` : '',
        vsPrice?.placeboP !== null && vsPrice?.placeboP !== undefined ? `价格安慰剂检验 p=${vsPrice.placeboP.toFixed(3)}（不可分辨于历史随机事件）` : '',
        vsVolume?.placeboP !== null && vsVolume?.placeboP !== undefined ? `成交量安慰剂检验 p=${vsVolume.placeboP.toFixed(3)}` : '',
      ].filter(Boolean),
      media: (
        <>
          <ChartFrame
            title="案例后均值 vs 历史区间（F27）"
            note="案例后均值与 8 个历史清洁雨簇的分布区间对照。区间含案例值即说明该次冲击未超出常规波动。"
            provenance="observed"
            sources={['case2026_vs_history.csv', 'F27_case2026_vs_history.png']}
            evidenceLevel="证据 A"
          >
            <ResearchFigure
              src={`${FIGURES}/F27_case2026_vs_history.png`}
              alt="2026 暴雨案例后均值与历史雨簇区间对照图"
              source="shenyang · case2026"
              evidenceLevel="A"
            />
          </ChartFrame>
          <ChartFrame
            title="安慰剂分布（F24）"
            note="把 500 次随机事件作为对照，案例值在其中并不突出。"
            provenance="observed"
            sources={['event_study_placebo.csv', 'F24_event_placebo.png']}
            evidenceLevel="证据 A"
          >
            <ResearchFigure
              src={`${FIGURES}/F24_event_placebo.png`}
              alt="事件研究安慰剂分布图"
              source="shenyang · C3"
              evidenceLevel="A"
            />
          </ChartFrame>
        </>
      ),
    },
    {
      id: 'transmission',
      index: '07',
      title: '是否存在传导链',
      lead: '检验"天气 → 成交量 → 价格"的两环链式传导：上游与下游均未成立，间接效应区间全部包含 0。',
      provenance: 'model',
      provenanceLabel: '模型估计',
      facts: [
        '上游（天气 → 成交量）与下游（成交量 → 价格）两环均不成立',
        '链式中介的间接效应置信区间全部包含 0',
        '该项为统计模型输出，不代表机制在现实中不存在，只是当前数据无法检出',
      ],
      media: (
        <ChartFrame
          title="传导链第一阶段（F30）"
          note="研究工程输出的传导第一阶段热力图，用于查看各品种 × 窗口的估计结果。"
          provenance="model"
          sources={['transmission_stage1.csv', 'F30_transmission_stage1_heatmap.png']}
          evidenceLevel="证据 B"
        >
          <ResearchFigure
            src={`${FIGURES}/F30_transmission_stage1_heatmap.png`}
            alt="传导链第一阶段估计热力图"
            source="shenyang · C4"
            evidenceLevel="B"
          />
        </ChartFrame>
      ),
    },
    {
      id: 'conclusion',
      index: '08',
      title: '当前能得出什么结论',
      lead: '天气侧的极端性确凿，市场侧未出现同量级响应。研究对"为什么"只给出假说，不给因果结论。',
      provenance: 'observed',
      provenanceLabel: '结论（观测 + 假说）',
      hypothesis: '研究对"为什么"提出了若干假说（如市场结构、品种差异等），均无数据验证，仅作为后续研究假设。',
      facts: [
        rainQuestion ? rainQuestion.answer : '天气侧极端性无可置疑，市场侧响应落在常规运行范围内。',
        pointC3 ? `C3 · ${pointC3.conclusion}` : '',
        pointC4 ? `C4 · ${pointC4.conclusion}` : '',
      ].filter(Boolean),
      media: (
        <ChartFrame
          title="事件总览"
          note="该图汇总 2026 案例的天气与市场基本面貌，供结论步骤回看。"
          provenance="observed"
          sources={['F26_case2026_weather.png']}
        >
          <ResearchFigure
            src={`${FIGURES}/F26_case2026_weather.png`}
            alt="2026 案例天气总览图"
            source="shenyang · case2026"
            evidenceLevel="A"
          />
        </ChartFrame>
      ),
    },
  ];
}
