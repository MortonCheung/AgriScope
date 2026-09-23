import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import { getCatalog, listPoints, listTopics } from '../../domain/research/catalog';
import { V2Repository } from '../../domain/research/v2/repository';
import { useArticle } from './useV2';
import { ResearchTree } from './ResearchTree';
import './city-research.css';

/**
 * 城市研究页（本轮 §7/§26）：一张**实体纸**上列出完整的两层研究树。
 *
 *   A = 城市
 *   A1–A8 = 8 个研究方向（研究侧冻结）
 *   A?.? = 每个方向下的具体研究点
 *
 * 页面只做两件事：给出城市名与树。不再有「综合报告 / 暴雨专题」入口
 * —— 报告属于「报告」，2026 暴雨的推演属于「推演」（§29/§30）。
 */
export function CityResearchPage() {
  const { cityId = '' } = useParams();
  const city = getCity(cityId);
  const catalog = getCatalog(cityId);
  const topics = listTopics(cityId);
  const points = listPoints(cityId);

  /** 进入城市后后台预取全部方向的文章，点进去时不再等加载。 */
  const firstArticle = useArticle(cityId, topics[0]?.articleId ?? null);
  const articleIds = topics.map((topic) => topic.articleId).join(',');
  useEffect(() => {
    if (!catalog || firstArticle.status !== 'ready') return;
    const ids = articleIds.split(',').filter(Boolean).slice(1);
    const run = () => ids.forEach((id) => { void V2Repository.getArticle(cityId, id).catch(() => null); });
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof idle === 'function') idle(run, { timeout: 2000 });
    else window.setTimeout(run, 0);
  }, [articleIds, catalog, cityId, firstArticle.status]);

  return (
    <main className="city-research">
      <div className="city-research__paper">
        <header className="city-research__head">
          <h1 className="city-research__city">{city?.shortName ?? cityId}</h1>
          {catalog && (
            <p className="city-research__meta">
              {topics.length} 个研究方向 · {points.length} 个研究点
            </p>
          )}
        </header>

        {catalog ? (
          <ResearchTree cityId={cityId} topics={topics} variant="index" />
        ) : (
          <p className="city-research__empty">研究内容待接入</p>
        )}
      </div>
    </main>
  );
}
