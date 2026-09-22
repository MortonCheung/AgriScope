import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { getCity } from '../../domain/geography/cities';
import { useCityResearch } from '../../services/useCityResearch';
import { AsyncBoundary } from '../../components/AsyncState';
import { ResearchSummary } from '../research/ResearchSummary';
import { ResearchTreeNav } from '../research/tree/ResearchTreeNav';
import { ResearchWorkspace } from '../research/workspace/ResearchWorkspace';
import { ResearchEvidenceRail } from '../research/workspace/ResearchEvidenceRail';
import { useResearchTreeStore } from '../research/tree/researchTreeStore';
import { ROUTES } from '../../app/routes';
import { useAppHistory } from '../../app/appHistory';
import { MOTION_DURATION, MOTION_EASE, MOTION_SPRING } from '../../design/motion';
import type { CityResearchIndex } from '../../domain/research/types';
import './city-space.css';

/**
 * 研究纸进入的原点（V3 §13）。
 * 进入：从右下方铺到桌面；Back 返回（direction < 0）：更轻的回铺，读起来像"纸被重新摆回来"（V3 §12）。
 */
const PAPER_FROM = {
  enter: { opacity: 0, x: 56, y: 20, scale: 0.975, rotate: 0.3 },
  back: { opacity: 0, x: 18, y: 0, scale: 0.99, rotate: 0 },
} as const;

/**
 * 城市研究空间（V3 §16–§24）。
 *
 * 与 `/cities/:cityId/research/*` 共用同一个 ResearchTreeNav 与 ResearchWorkspace：
 * 研究树在进入研究点之后依然存在，用户始终知道自己在 沈阳 → S5 → C5。
 * 整壳固定不动，只有目录与正文各自内部滚动（§31/§32）。
 */
export function CityResearchSpacePage() {
  const { cityId = '' } = useParams<{ cityId: string }>();
  const city = getCity(cityId);
  const state = useCityResearch(cityId);

  if (!city) {
    return (
      <main className="ag-page ag-container">
        <h1 className="ag-hero">未知城市</h1>
        <p className="ag-body">没有名为 {cityId} 的研究城市。</p>
        <Link className="ag-button" to={ROUTES.liaoning}>返回辽宁</Link>
      </main>
    );
  }

  if (!city.hasResearch) {
    return (
      <main className="ag-page ag-container">
        <h1 className="ag-hero">{city.shortName}研究尚未接入</h1>
        <div className="ag-row">
          <Link className="ag-button ag-button--primary" to={ROUTES.city('shenyang')}>查看沈阳研究</Link>
          <Link className="ag-button" to={ROUTES.liaoning}>返回辽宁</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="city-space" aria-label={`${city.name}研究空间`}>
      <AsyncBoundary state={state} label="正在读取城市研究索引">
        {(index) => <CitySpaceBody cityShortName={city.shortName} index={index} />}
      </AsyncBoundary>
    </main>
  );
}

function CitySpaceBody({ cityShortName, index }: {
  cityShortName: string;
  index: CityResearchIndex;
}) {
  const reducedMotion = Boolean(useReducedMotion());
  const navDirection = useAppHistory()?.direction ?? 0;
  const selectedPointId = useResearchTreeStore((state) => state.selectedPointId);
  const selectPoint = useResearchTreeStore((state) => state.selectPoint);

  const selected = useMemo(
    () => (selectedPointId ? index.points.find((point) => point.id === selectedPointId) ?? null : null),
    [index.points, selectedPointId],
  );

  return (
    <motion.div
      className="city-space__panel"
      initial={reducedMotion ? false : (navDirection < 0 ? PAPER_FROM.back : PAPER_FROM.enter)}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
      transition={reducedMotion
        ? { duration: 0 }
        : { ...MOTION_SPRING.paper, opacity: { duration: MOTION_DURATION.normal, ease: MOTION_EASE.out } }}
    >
      <header className="city-space__head">
        <h1 className="ag-hero city-space__title">{cityShortName}</h1>
        <div className="city-space__entries">
          <Link className="ag-button" to={ROUTES.report(index.cityId)}>综合报告</Link>
          <Link className="ag-button" to={ROUTES.rainstorm}>暴雨专题</Link>
        </div>
      </header>

      <div className="city-space__body">
        <ResearchWorkspace
          variant="fixed"
          tree={<ResearchTreeNav index={index} onSelectPoint={() => undefined} />}
          rail={selected ? <ResearchEvidenceRail point={selected} timeWindow={index.window} provenance={index.provenance} /> : undefined}
        >
          {selected ? (
            <ResearchSummary point={selected} onClose={() => selectPoint(null)} />
          ) : (
            <div className="city-space__overview">
              <p className="ag-label">城市结论</p>
              <p className="city-space__risk">{index.cityConclusion.riskProfile}</p>
              <p className="city-space__definition">{index.cityConclusion.definition}</p>
              <p className="city-space__hint">选择左侧任一研究点查看摘要。</p>
            </div>
          )}
        </ResearchWorkspace>
      </div>
    </motion.div>
  );
}
