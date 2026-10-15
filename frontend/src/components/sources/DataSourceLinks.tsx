import { sourcesForScope } from '../../domain/sources/dataSources';
import { FlipValue } from '../motion/FlipValue';
import './data-source-links.css';

/** Stable receipt slots; only source names change, using the existing value motion. */
export function DataSourceLinks({ scope, items }: { scope: string | null; items?: readonly { name: string; url: string }[] }) {
  const sources = sourcesForScope(scope);
  // An explicit list comes from validated market records. Empty means no proven
  // source, rather than permission to substitute a regional reference website.
  const displayed = items ?? sources.items;
  if (!displayed.length) return null;
  return <section className="data-source-links" aria-label="数据来源" data-source-scope={sources.scope}>
    <h2 className="data-source-links__title">数据来源{items && displayed.length > 1 && <small> · 多来源</small>}</h2>
    <ul className="data-source-links__list">
      {displayed.map((source, index) => <li key={index}>
        <a className="data-source-links__link" href={source.url} target="_blank" rel="noopener noreferrer" aria-label={source.name}>
          <FlipValue className="data-source-links__name" value={source.name}/><span aria-hidden>↗</span>
        </a>
      </li>)}
    </ul>
  </section>;
}
