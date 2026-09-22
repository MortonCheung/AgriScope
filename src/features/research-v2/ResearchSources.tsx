import type { V2Source } from '../../domain/research/v2/types';
import './research-sources.css';

/**
 * 来源区块（V5 §51/§74/§81）。
 *
 * 只展示**用户要的来源**：机构 / 数据集 / 链接 / 时间。
 * 绝不出现 `.csv`、`.md`、`workspace/`、`outputs/` 这类技术血缘（§37/§38）。
 */
export function ResearchSources({ sources, title = '来源' }: { sources: V2Source[]; title?: string }) {
  if (sources.length === 0) {
    return (
      <section className="research-sources" aria-label={title}>
        <h3 className="research-sources__title">{title}</h3>
        <p className="research-sources__pending">来源待补充</p>
      </section>
    );
  }
  return (
    <section className="research-sources" aria-label={title}>
      <h3 className="research-sources__title">{title}</h3>
      <ul className="research-sources__list">
        {sources.map((source) => (
          <li className="research-sources__item" key={source.source_id}>
            <span className="research-sources__publisher">{source.publisher}</span>
            <span className="research-sources__dataset">
              {source.url
                ? <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title} ↗</a>
                : source.title}
            </span>
            {source.data_period && <span className="research-sources__period">{source.data_period}</span>}
            {source.source_grade && <span className="research-sources__grade">等级 {source.source_grade}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
