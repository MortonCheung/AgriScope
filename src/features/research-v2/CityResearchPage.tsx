import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import { ROUTES } from '../../app/routes';
import { V2Repository } from '../../domain/research/v2/repository';
import { useV2Article, useV2Manifest } from './useV2';
import './city-research.css';

/**
 * 城市研究页（V5 §25/§26）：**只有**城市名 + 研究树（A01–A08）。
 *
 * §26 明确删除 v4 的「综合报告 / 暴雨专题」两个按钮 —— 报告属于「报告」一级，
 * 暴雨推演属于「推演」一级，都不该出现在研究页。
 */
function NoteListItem({ id, title }: { id: string; title: string }) {
  const navigate = useNavigate();
  const article = useV2Article(id);
  const summary = article.status === 'ready' ? article.data.frontend_summary : null;
  return (
    <li className="city-research__item">
      <button type="button" className="city-research__link" onClick={() => navigate(ROUTES.researchNote('shenyang', id))}>
        <span className="city-research__id">{id}</span>
        <span className="city-research__title">{title}</span>
        {summary && <span className="city-research__summary">{summary}</span>}
      </button>
    </li>
  );
}

export function CityResearchPage() {
  const { cityId = '' } = useParams();
  const city = getCity(cityId);
  const manifest = useV2Manifest();
  const hasResearch = cityId === 'shenyang';

  /** 进入城市后后台预取 8 篇研究条目：列表能带出摘要，点进去也不再等加载。 */
  useEffect(() => {
    if (!hasResearch || manifest.status !== 'ready') return;
    const ids = manifest.data.articles.map((a) => a.id).filter((id) => id !== 'A09');
    const run = () => ids.forEach((id) => { void V2Repository.getArticle(id).catch(() => null); });
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof idle === 'function') idle(run, { timeout: 2000 });
    else window.setTimeout(run, 0);
  }, [hasResearch, manifest]);

  const notes = manifest.status === 'ready'
    ? manifest.data.articles.filter((article) => article.id !== 'A09')
    : [];

  return (
    <main className="city-research">
      <header className="city-research__head">
        <h1 className="city-research__city">{city?.shortName ?? cityId}</h1>
      </header>
      {hasResearch && notes.length > 0 ? (
        <ol className="city-research__list">
          {notes.map((note) => <NoteListItem key={note.id} id={note.id} title={note.title} />)}
        </ol>
      ) : (
        <p className="city-research__empty">研究内容待接入</p>
      )}
    </main>
  );
}
