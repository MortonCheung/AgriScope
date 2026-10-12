import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { selectedCityFromSearch, provinceUrl } from '../../app/context/provinceSelection';
import { usePageNavigate } from '../../app/pageNavigation';
import { useSpatialStageStore } from '../spatial/spatialStageStore';
import { demoMarketFor } from '../../domain/market/demoMarket';
import { CitySummary } from './CitySummary';
import { MarketOverview } from './MarketOverview';
import '../../design/paper-motion.css';
import './liaoning-page.css';

export function LiaoningPage() {
  const selectedCityId = selectedCityFromSearch(useLocation().search);
  const hover = useSpatialStageStore(s => s.hoveredCityId);
  const setHover = useSpatialStageStore(s => s.setHoveredCity);
  const navigate = usePageNavigate();
  const market = demoMarketFor(selectedCityId);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (hover) setHover(null);
      else if (selectedCityId) navigate(provinceUrl(null));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hover, navigate, selectedCityId, setHover]);
  return <main className="liaoning-page" data-scope={selectedCityId ? 'city' : 'province'}>
    <div className="liaoning-page__stage">
      <aside className="liaoning-paper liaoning-page__current" data-paper-surface aria-label="最新行情">
        <div className="liaoning-panel-content">
          <h1 className="liaoning-page__title">最新行情</h1>
          <MarketOverview market={market}/>
        </div>
      </aside>
      <div className="liaoning-page__window" aria-hidden />
      <aside className="liaoning-paper liaoning-page__city" data-paper-surface aria-label="城市与决策">
        <div className="liaoning-panel-content">
          <CitySummary market={market}/>
        </div>
      </aside>
    </div>
  </main>;
}
