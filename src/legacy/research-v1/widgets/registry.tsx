import type { ReactNode } from 'react';
import type { CityResearchIndex, ResearchPoint } from '../../../domain/research/types';
import { MonthlyIndexChart } from './MonthlyIndexChart';
import { LagScanChart } from './LagScanChart';
import { LeadLagChart } from './LeadLagChart';
import { EventStudyChart } from './EventStudyChart';
import { WeatherTimelineExplorer } from './WeatherTimelineExplorer';
import { PseudoSignificanceReveal } from './PseudoSignificanceReveal';
import { ThresholdBinExplorer } from './ThresholdBinExplorer';
import { TableExplorer } from './TableExplorer';
import { buildGModules } from './modulesG';
import { buildCModules } from './modulesC';

/**
 * 交互研究模块注册表。
 *
 * 这里只做"研究点 → 交互模块"的配置，不写城市判断：
 * 任何研究点都应能通过 point.id / point.tables 找到自己的模块。
 */

export interface ModuleContext {
  index: CityResearchIndex;
  point: ResearchPoint;
  crops: string[];
  /** 按文件名查找该研究点引用到的研究表地址 */
  table: (fileName: string) => string | null;
}

export interface ResearchModuleRender {
  id: string;
  title: string;
  note?: string;
  node: ReactNode;
}

export function makeModuleContext(index: CityResearchIndex, point: ResearchPoint): ModuleContext {
  const byName = new Map(point.tables.map((table) => [table.src.split('/').pop() ?? '', table.src]));
  return {
    index,
    point,
    crops: index.crops,
    table: (fileName: string) => byName.get(fileName) ?? null,
  };
}

function seasonalModules(ctx: ModuleContext): ResearchModuleRender[] {
  const price = ctx.table('seasonal_index_price.csv');
  const volume = ctx.table('seasonal_index_volume.csv');
  const stl = ctx.table('stl_strength.csv');
  if (!price || !volume || !stl) return [];
  const modules: ResearchModuleRender[] = [{
    id: 'seasonal-index',
    title: '月份节奏：价格与成交量',
    node: <MonthlyIndexChart crops={ctx.crops} evidenceLevel={ctx.point.evidenceLevel} sources={{ price, volume, stl }} />,
  }];
  const annual = ctx.table('annual_market_by_year.csv');
  if (annual) {
    modules.push({
      id: 'annual-market',
      title: '逐年市场水平',
      node: <TableExplorer title="逐年中位价格与成交量" source={annual} evidenceLevel={ctx.point.evidenceLevel} />,
    });
  }
  return modules;
}

function weatherLagModules(ctx: ModuleContext, response: 'price' | 'volume'): ResearchModuleRender[] {
  const scan = ctx.table('weather_extra_scan.csv');
  const summary = ctx.table('weather_extra_summary.csv');
  if (!scan || !summary) return [];
  return [{
    id: `weather-lag-${response}`,
    title: '逐变量滞后扫描',
    note: '15 个天气变量与响应逐一配对的滞后曲线。',
    node: <LagScanChart crops={ctx.crops} response={response} scanSource={scan} summarySource={summary} evidenceLevel={ctx.point.evidenceLevel} />,
  }];
}

function soilLagModules(ctx: ModuleContext, response: 'price' | 'volume'): ResearchModuleRender[] {
  const scan = ctx.table('soil_layers_scan.csv');
  const summary = ctx.table('soil_layers_summary.csv');
  if (!scan || !summary) return [];
  return [{
    id: `soil-lag-${response}`,
    title: '三层土壤水分的滞后响应',
    note: '注意三层的自相关强度差异：越慢变的序列越容易在有限带宽 HAC 下产生伪显著。',
    node: <LagScanChart crops={ctx.crops} response={response} scanSource={scan} summarySource={summary} evidenceLevel={ctx.point.evidenceLevel} />,
  }, {
    id: `soil-pseudo-${response}`,
    title: '伪显著诊断：从"显著"到"假阳性"',
    note: '研究方法展示：逐步揭开深层土壤"显著"是怎么消失的。',
    node: (
      <PseudoSignificanceReveal
        summarySource={summary}
        response={response}
        keyNumbers={ctx.point.keyNumbers}
        evidenceLevel={ctx.point.evidenceLevel}
      />
    ),
  }];
}

function baseModules(ctx: ModuleContext): ResearchModuleRender[] {
  const id = ctx.point.id;
  switch (id) {
    case 'G1': return seasonalModules(ctx);
    case 'G2': return weatherLagModules(ctx, 'price');
    case 'G3': return weatherLagModules(ctx, 'volume');
    case 'G4': return soilLagModules(ctx, 'price');
    case 'G5': return soilLagModules(ctx, 'volume');
    case 'G6': {
      const source = ctx.table('m1_volume_price_leadlag.csv');
      return source ? [{
        id: 'leadlag',
        title: '同日与跨日结构',
        node: <LeadLagChart crops={ctx.crops} source={source} evidenceLevel={ctx.point.evidenceLevel} />,
      }] : [];
    }
    case 'C2': {
      const bins = ctx.table('threshold_bins_explanatory.csv');
      if (!bins) return [];
      return [{
        id: 'threshold-bins',
        title: '阈值分箱与样本量',
        note: '研究表的真实分箱，以及各档样本数量与结果稳定性。',
        node: (
          <ThresholdBinExplorer
            binsSource={bins}
            powerSource={ctx.table('threshold_power.csv')}
            breakpointSource={ctx.table('threshold_breakpoint.csv')}
            crops={ctx.crops}
            evidenceLevel={ctx.point.evidenceLevel}
          />
        ),
      }];
    }
    case 'G7': {
      const source = ctx.table('case2026_weather.csv');
      return source ? [{
        id: 'g7-timeline',
        title: '事件窗口时间线',
        note: '2026 事件窗口的逐日气象序列。',
        node: <WeatherTimelineExplorer source={source} evidenceLevel={ctx.point.evidenceLevel} />,
      }] : [];
    }
    case 'C3': {
      const curves = ctx.table('event_study_curves.csv');
      const summary = ctx.table('event_study_summary.csv');
      return curves && summary ? [{
        id: 'event-study',
        title: '事件窗平均响应',
        node: <EventStudyChart curvesSource={curves} summarySource={summary} evidenceLevel={ctx.point.evidenceLevel} />,
      }] : [];
    }
    default: return [];
  }
}

/** 该研究点的全部交互模块（基础 + G 系列补充 + C 系列补充）。 */
export function buildResearchModules(index: CityResearchIndex, point: ResearchPoint): ResearchModuleRender[] {
  const ctx = makeModuleContext(index, point);
  return [...baseModules(ctx), ...buildGModules(ctx), ...buildCModules(ctx)];
}

/** 回退：没有交互模块时，至少给出一张该研究点真正引用的研究表。 */
export function fallbackTable(point: ResearchPoint): string | null {
  const preferred = ['descriptive_by_crop.csv', 'weather_extra_overview.csv', 'soil_layers_overview.csv', 'model_metrics_overall.csv'];
  for (const name of preferred) {
    const found = point.tables.find((table) => (table.src.split('/').pop() ?? '') === name);
    if (found) return found.src;
  }
  return point.tables[0]?.src ?? null;
}
