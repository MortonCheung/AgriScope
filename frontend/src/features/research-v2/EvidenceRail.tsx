import type { ResearchPoint, ResearchTopic } from '../../domain/research/catalog';
import { pointStatusLabel } from '../../domain/research/catalog/labels';
import { readExplorer } from '../../domain/research/runtime/catalog';
import { columnLabel, columnMeta, formatMetricValue } from '../../domain/research/v2/metrics';
import { filterRows } from '../../domain/research/v2/selectors';
import type { V2Source } from '../../domain/research/v2/types';
import { useArticle, useSources, useTable } from './useV2';
import { countStatuses } from './CityResearchPreview';
import { MarkdownBlocks } from './blocks';
import { renderInline, stripListPrefix } from './markdown';

/**
 * 城市研究工作台的**证据栏**（本轮 §22/§23）。
 *
 * 它只集中呈现**研究侧真的写了的东西**，一列都不补：
 *   · 来源   —— 文章 `source_ids` → `sources.json` 的 机构 / 标题 / 类型（未登记的类型不渲染）；
 *   · 方法   —— `article.methods` 原文（与 `explorer.methodology`，有才给）；点标题展开全文；
 *   · 样本与统计 —— 该研究点绑定研究表里**已有**的统计列（样本量 / 区间 / FDR 等），取值照抄不重算；
 *   · 研究限制 —— `article.limitations` 原文。
 * 任何一项在研究侧不存在时**整块不渲染**，不使用占位文字（§38 红线）。
 */

/**
 * 来源类型 → 中文（研究载荷里是英文枚举）。
 * 只登记真实出现过的取值；未登记的取值不渲染，绝不把英文工程名露给读者。
 */
const SOURCE_TYPE_LABELS: Record<string, string> = {
  ACADEMIC: '学术文献',
  METHOD: '方法文献',
  DATA_GOV: '政府数据',
  DATA_API: '数据接口',
  NEWS_OFFICIAL: '官方新闻',
  official_statistics: '官方统计',
  official_api: '官方数据接口',
  official_news: '官方新闻',
};

/**
 * 统计列白名单（样本 / 区间 / 多重检验 / 拟合）。
 * 只在研究表**真的包含**这些列时渲染；取值直接取该列既有取值，前端不做任何计算。
 */
const EVIDENCE_COLUMNS = [
  'n', 'n_eff', 'n_events', 'n_clusters', 'n_test', 'n_loo', 'df1',
  'se', 'r2', 'ar1', 'ci_low', 'ci_high', 'p_raw', 'q_fdr', 'p_wild_boot', 'placebo_p',
] as const;

/** 单列最多列出的取值个数；超出只报数量，避免窄栏被刷屏。 */
const VALUE_LIMIT = 5;

/** 该列在研究表里的去重取值（源顺序，空值不算）。 */
function distinctValues(rows: Record<string, string>[], key: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of rows) {
    const value = (row[key] ?? '').trim();
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

/** 研究点的统计列证据（只读该点绑定表里已有的列）。 */
function PointStatistics({ cityId, point }: { cityId: string; point: ResearchPoint }) {
  const binding = point.binding;
  const table = useTable(cityId, binding?.table ?? null);

  if (!binding || table.status !== 'ready') return null;

  const columns = table.data.columns;
  const rows = filterRows(table.data.rows, binding.filter);
  const stats = EVIDENCE_COLUMNS
    .filter((key) => columns.includes(key) && columnLabel(key) !== null)
    .map((key) => ({ key, label: columnLabel(key) as string, values: distinctValues(rows, key) }))
    .filter((entry) => entry.values.length > 0);

  if (stats.length === 0) return null;

  return (
    <section className="evidence-rail__block">
      <h2 className="evidence-rail__label">样本与统计</h2>
      <dl className="evidence-rail__stats">
        {stats.map((entry) => {
          const meta = columnMeta(entry.key);
          return (
            <div key={entry.key}>
              <dt>{entry.label}</dt>
              <dd>
                {entry.values.slice(0, VALUE_LIMIT).map((value) => formatMetricValue(value, meta)).join('、')}
                {entry.values.length > VALUE_LIMIT && (
                  <span className="evidence-rail__more">（共 {entry.values.length} 个取值）</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export function EvidenceRail({ cityId, topic, point }: {
  cityId: string;
  topic: ResearchTopic | null;
  point: ResearchPoint | null;
}) {
  /** hook 位置固定：无论选中方向还是研究点，都读同一篇文章与同一份来源表。 */
  const articleState = useArticle(cityId, topic?.articleId ?? null);
  const sourcesState = useSources(cityId);

  if (!topic) return null;

  const article = articleState.status === 'ready' ? articleState.data : null;
  const allSources = sourcesState.status === 'ready' ? sourcesState.data : [];
  const sources = article
    ? article.source_ids
      .map((id) => allSources.find((source) => source.source_id === id))
      .filter((source): source is V2Source => Boolean(source))
    : [];
  const methods = article?.methods ?? [];
  const limitations = article?.limitations ?? [];
  const methodology = article ? readExplorer(article)?.methodology ?? '' : '';
  const counts = point ? null : countStatuses(topic);

  return (
    <div className="evidence-rail">
      <header className="evidence-rail__ident">
        <p className="evidence-rail__id">{point ? point.id : topic.id}</p>
        <p className="evidence-rail__title">{point ? point.title : topic.title}</p>
        <p className="evidence-rail__sub">{point ? `${topic.id} · ${topic.title}` : topic.articleTitle}</p>
        {point ? (
          <p className="evidence-rail__status">研究状态：{pointStatusLabel(point.status)}</p>
        ) : counts && (
          <p className="evidence-rail__status">
            已有内容 {counts.ready} · 待接入 {counts.pending} · 数据不足 {counts.unsupported}
          </p>
        )}
      </header>

      {point && <PointStatistics cityId={cityId} point={point} />}

      {sources.length > 0 && (
        <section className="evidence-rail__block">
          <h2 className="evidence-rail__label">来源</h2>
          <ul className="evidence-rail__sources">
            {sources.map((source) => {
              const typeLabel = SOURCE_TYPE_LABELS[source.type];
              return (
                <li key={source.source_id}>
                  <span className="evidence-rail__publisher">{source.publisher}</span>
                  <span className="evidence-rail__dataset">
                    {source.url
                      ? <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title} ↗</a>
                      : source.title}
                  </span>
                  {typeLabel && <span className="evidence-rail__type">{typeLabel}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(methods.length > 0 || methodology) && (
        <section className="evidence-rail__block">
          <h2 className="evidence-rail__label">方法</h2>
          {methods.map((method, index) => (
            <details className="evidence-rail__method" key={index}>
              <summary>方法 {index + 1}</summary>
              <MarkdownBlocks source={method.summary} />
            </details>
          ))}
          {methodology && (
            <details className="evidence-rail__method">
              <summary>研究侧方法说明</summary>
              <MarkdownBlocks source={methodology} />
            </details>
          )}
        </section>
      )}

      {limitations.length > 0 && (
        <section className="evidence-rail__block">
          <h2 className="evidence-rail__label">研究限制</h2>
          <ul className="evidence-rail__list">
            {limitations.map((item, index) => (
              <li key={index}>{renderInline(stripListPrefix(item), `lim-${index}`)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}