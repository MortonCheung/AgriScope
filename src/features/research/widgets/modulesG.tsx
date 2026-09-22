import type { ModuleContext, ResearchModuleRender } from './registry';
import { TrendChart } from './TrendChart';
import { EventContrastChart } from './EventContrastChart';
import { CropVolatilityChart } from './CropVolatilityChart';
import { PhenologyChart } from './PhenologyChart';
import { YearlyProductionChart } from './YearlyProductionChart';

/**
 * G1–G10 的补充交互模块。
 * 只使用该研究点真正引用的研究表：任一来源缺失即返回空数组，不猜测、不替代数值来源。
 */
export function buildGModules(ctx: ModuleContext): ResearchModuleRender[] {
  switch (ctx.point.id) {
    case 'G1': return g1(ctx);
    case 'G7': return g7(ctx);
    case 'G8': return g8(ctx);
    case 'G9': return g9(ctx);
    case 'G10': return g10(ctx);
    default: return [];
  }
}

function g1(ctx: ModuleContext): ResearchModuleRender[] {
  const price = ctx.table('trend_by_crop.csv');
  const volume = ctx.table('trend_volume_by_crop.csv');
  if (!price || !volume) return [];
  return [{
    id: 'g1-trend',
    title: '逐年趋势：逐品种年化斜率',
    note: '价格与成交量的逐品种斜率、区间与显著性。',
    node: <TrendChart sources={{ price, volume }} evidenceLevel={ctx.point.evidenceLevel} />,
  }];
}

function g7(ctx: ModuleContext): ResearchModuleRender[] {
  const source = ctx.table('extreme_day_contrast.csv');
  if (!source) return [];
  return [{
    id: 'g7-extreme-contrast',
    title: '极端日与普通日的市场异常差',
    note: '正值代表极端日更高；多数单元并不显著，且显著者多为负向。',
    node: <EventContrastChart source={source} evidenceLevel={ctx.point.evidenceLevel} />,
  }];
}

function g8(ctx: ModuleContext): ResearchModuleRender[] {
  const source = ctx.table('descriptive_by_crop.csv');
  if (!source) return [];
  return [{
    id: 'g8-volatility',
    title: '品种波动分层',
    note: '年化波动率与变异系数的逐品种描述统计。',
    node: <CropVolatilityChart source={source} evidenceLevel={ctx.point.evidenceLevel} />,
  }];
}

function g9(ctx: ModuleContext): ResearchModuleRender[] {
  const source = ctx.table('phenology_interaction_by_crop.csv');
  if (!source) return [];
  return [{
    id: 'g9-phenology',
    title: '物候窗口交互系数',
    note: '不同口径与天气变量下的交互项与 FDR 显著计数。',
    node: <PhenologyChart source={source} evidenceLevel={ctx.point.evidenceLevel} />,
  }];
}

function g10(ctx: ModuleContext): ResearchModuleRender[] {
  const panel = ctx.table('shenyang_yearly_panel.csv');
  const corr = ctx.table('yearly_weather_corr.csv');
  if (!panel || !corr) return [];
  return [{
    id: 'g10-yearly-production',
    title: '年度生产序列与年度天气相关',
    note: '年度生产只有年粒度，不插值为日度；相关清单只作方向性描述。',
    node: <YearlyProductionChart panelSource={panel} corrSource={corr} evidenceLevel={ctx.point.evidenceLevel} />,
  }];
}
