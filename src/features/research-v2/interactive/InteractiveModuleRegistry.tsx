import type { InteractiveModuleKind, ResearchCitation, ResearchDataBinding, ResearchPoint } from '../../../domain/research/catalog';
import { quoteLabel } from '../../../domain/research/catalog/labels';
import { useTable } from '../useV2';
import { DataTable } from '../DataTable';
import { ResearchQuote } from '../blocks';
import { EstimateChart } from './EstimateChart';
import './interactive-module.css';

/**
 * 交互模块注册表（本轮 §16）。
 *
 * 模块种类刻意做少：**一个诚实的数据模块**覆盖全部已绑定的研究点，
 * 因为研究侧导出的就是"表 + 列"，而不是 76 套定制图表。
 * 模块名只用于说明"这一点在看什么"。
 */
export const MODULE_LABELS: Record<InteractiveModuleKind, string> = {
  trend: '长期趋势',
  seasonality: '季节结构',
  'weather-response': '天气响应',
  lag: '滞后窗口',
  accumulation: '累积暴露',
  nonlinearity: '非线性',
  'event-study': '事件研究',
  'event-inventory': '事件样本',
  'crop-heterogeneity': '品种差异',
  recovery: '恢复过程',
  'price-volume': '量价关系',
  transmission: '传导链条',
  forecast: '预测增量',
  'district-structure': '区县结构',
  'yield-panel': '区县面板',
  robustness: '稳健性',
};

/** 附加表的中文说明（只登记真实存在的附加表）。 */
const COMPANION_LABELS: Record<string, string> = {
  'A04_event_responses.csv': '事件级事后均值',
  'A05_recovery.csv': '事件级恢复明细',
  'A06_forecast_rolling.csv': '逐年滚动误差',
  'A08_robustness_loo.csv': '留一法系数范围',
  'A05_recovery_by_crop.csv': '逐品种恢复中位数',
  'A06_forecast_gain.csv': '天气相对基线的增益',
};

/** 按研究表自己的列与取值筛行；不做任何再计算（§17）。 */
export function filterRows(
  rows: Record<string, string>[],
  filter: Record<string, string[]>,
): Record<string, string>[] {
  const entries = Object.entries(filter ?? {});
  if (entries.length === 0) return rows;
  return rows.filter((row) => entries.every(([column, allowed]) => allowed.includes(row[column] ?? '')));
}

function CompanionTable({ cityId, file, filter, title }: {
  cityId: string;
  file: string;
  filter: Record<string, string[]>;
  title: string;
}) {
  const state = useTable(cityId, file);
  if (state.status !== 'ready') return null;
  const rows = filterRows(state.data.rows, filter);
  if (rows.length === 0) return null;
  return (
    <details className="module__companion">
      <summary>{COMPANION_LABELS[file] ?? '附加研究表'}</summary>
      <DataTable table={{ ...state.data, rows }} caption={title} maxRows={40} />
    </details>
  );
}

/**
 * 研究点的数据模块。
 *
 * 允许：筛选、排序、显示、hover 读数（§17）。
 * 禁止：在浏览器里重跑模型 / 重算 p 值 / 生成结论 —— 这里只呈现研究表里的数字。
 *
 * 本轮 §31：**删除「图 / 表」切换**。用户不该为同一份研究选择看图表还是看表；
 * 表现形式由前端按数据是否适合做图来决定（`binding.view` 仍作内部默认口径，不进 UI）。
 * 适合做图时给出图，并在其后附一张"研究表" details 作为辅助读数（§31）。
 */
export function ResearchDataModule({ cityId, point, binding, citations }: {
  cityId: string;
  point: ResearchPoint;
  binding: ResearchDataBinding;
  citations: ResearchCitation[];
}) {
  const table = useTable(cityId, binding.table);

  if (table.status === 'loading') return <div className="module__skeleton" aria-hidden />;
  if (table.status === 'error') return <p className="module__gap">研究内容待接入</p>;

  const rows = filterRows(table.data.rows, binding.filter);
  if (rows.length === 0) return <p className="module__gap">研究内容待接入</p>;

  const hasCi = table.data.columns.includes('ci_low') && table.data.columns.includes('ci_high');
  const category = binding.category;
  /** 值得做图的条件：研究侧口径就是图、有分类轴、且分类轴至少有 3 个不同取值。 */
  const canChart = binding.view === 'chart' && Boolean(category)
    && new Set(rows.map((row) => row[category as string])).size >= 3;

  const dataTable = (
    <DataTable table={{ ...table.data, rows }} caption={`${point.title} · 研究表`} maxRows={40} />
  );

  return (
    <section className="module">
      <div className="module__head">
        <h4 className="module__title">{MODULE_LABELS[point.module ?? 'trend']}</h4>
      </div>

      {canChart ? (
        <>
          <EstimateChart
            rows={rows}
            categoryKey={category as string}
            valueKey={binding.focus ?? table.data.columns[0]}
            ciLowKey={hasCi ? 'ci_low' : undefined}
            ciHighKey={hasCi ? 'ci_high' : undefined}
          />
          <details className="module__companion">
            <summary>研究表</summary>
            {dataTable}
          </details>
        </>
      ) : (
        dataTable
      )}

      {(binding.companions ?? []).map((file) => (
        <CompanionTable key={file} cityId={cityId} file={file} filter={binding.filter} title={point.title} />
      ))}

      {citations.length > 0 && (
        <div className="module__citations">
          {citations.map((citation, index) => (
            <ResearchQuote
              key={index}
              quote={citation.quote}
              cite={quoteLabel(point.articleId, citation.section)}
              className="module__quote"
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** 只有数据绑定的 ready 点才渲染模块；其余状态由页面显式说明。 */
export function hasDataModule(point: ResearchPoint): boolean {
  return point.status === 'ready' && Boolean(point.binding);
}
