import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import { getCatalog, listPoints, listTopics, researchIdKind } from '../../domain/research/catalog';
import { V2Repository } from '../../domain/research/v2/repository';
import { requestCityExit } from '../spatial/cityExit';
import { useArticle } from './useV2';
import { ResearchTree } from './ResearchTree';
import { CityResearchPreview } from './CityResearchPreview';
import './city-research.css';

/**
 * 城市研究 App（本轮 §18–§23）。
 *
 * 不是"一张长纸 + 整棵研究树"，而是一个 **macOS 式的研究窗口**（学空间逻辑，不做皮肤）：
 *
 *   ┌──────────────────────────────────────┐
 *   │ 沈阳研究   8 个方向 · 76 个研究点  × │  chrome
 *   ├──────────────┬───────────────────────┤
 *   │ ResearchTree │ CityResearchPreview   │  两个独立滚动区
 *   └──────────────┴───────────────────────┘
 *
 * 关键语义（§21）：单击左侧条目只改 `selectedId`，**URL 不变**；
 * 真正导航只发生在右侧预览的「进入研究」。
 *
 * 关闭（§23/§24/§26）：右上 `×` 与 `Esc` 都调用同一个空间退出协调器 ——
 * 先播纸面 fold + 相机回到省域，再真正导航，绝不瞬间消失。
 */
export function CityResearchPage() {
  const { cityId = '' } = useParams();
  const city = getCity(cityId);
  const catalog = getCatalog(cityId);
  const topics = listTopics(cityId);
  const points = listPoints(cityId);

  /** 选择只活在本地：不进 URL、不进历史（§21）。 */
  const [selectedId, setSelectedId] = useState<string | null>(() => topics[0]?.id ?? null);

  /** 选择必须在当前 catalog 里有效，否则回落到第一个方向。 */
  const resolvedSelected = selectedId && researchIdKind(cityId, selectedId) ? selectedId : (topics[0]?.id ?? null);

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

  /** Esc 与 `×` 完全同一套退出逻辑（§23）。协调器幂等，重复触发无副作用。 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestCityExit({ via: 'back' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <main className="city-research">
      <div className="city-research__paper">
        <header className="city-research__chrome">
          <div className="city-research__titles">
            <h1 className="city-research__city">{city?.shortName ?? cityId}研究</h1>
            {catalog && (
              <p className="city-research__meta">{topics.length} 个方向 · {points.length} 个研究点</p>
            )}
          </div>
          <button
            type="button"
            className="city-research__close"
            aria-label="返回辽宁"
            onClick={() => requestCityExit({ via: 'back' })}
          >
            ×
          </button>
        </header>

        {catalog ? (
          <div className="city-research__body">
            <aside className="city-research__sidebar" aria-label="研究方向">
              <ResearchTree
                cityId={cityId}
                topics={topics}
                variant="picker"
                selectedId={resolvedSelected ?? undefined}
                onSelect={setSelectedId}
              />
            </aside>
            <section className="city-research__preview" aria-live="polite">
              <CityResearchPreview cityId={cityId} topics={topics} selectedId={resolvedSelected} />
            </section>
          </div>
        ) : (
          <p className="city-research__empty">研究内容待接入</p>
        )}
      </div>
    </main>
  );
}
