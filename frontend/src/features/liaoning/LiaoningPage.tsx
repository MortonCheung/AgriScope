import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { selectedCityFromSearch, provinceUrl } from '../../app/context/provinceSelection';
import { usePageNavigate } from '../../app/pageNavigation';
import { useCitySelection } from '../spatial/SpatialShell';
import { useSpatialStageStore } from '../spatial/spatialStageStore';
import { demoMarketFor } from '../../domain/market/demoMarket';
import { CityChoices } from '../../components/controls/CityChoices';
import { useContentTransition } from '../../design/useContentTransition';
import { CitySummary } from './CitySummary';
import { MarketOverview } from './MarketOverview';
import '../../design/paper-motion.css';
import './liaoning-page.css';

export function LiaoningPage() {
  const selectedCityId = selectedCityFromSearch(useLocation().search);
  const hover = useSpatialStageStore(s => s.hoveredCityId);
  const setHover = useSpatialStageStore(s => s.setHoveredCity);
  const select = useCitySelection();
  const navigate = usePageNavigate();
  const market = demoMarketFor(selectedCityId);
  const pricesRef = useContentTransition<HTMLDivElement>(selectedCityId);
  const summaryRef = useContentTransition<HTMLDivElement>(selectedCityId);
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
      <aside className="liaoning-paper ag-paper-enter liaoning-page__current" aria-label="最新行情">
        <div className="liaoning-panel-content" ref={pricesRef}>
          <h1 className="liaoning-page__title">最新行情</h1>
          <MarketOverview market={market}/>
        </div>
      </aside>
      <div className="liaoning-page__window" aria-hidden />
      <aside className="liaoning-paper ag-paper-enter liaoning-page__city" aria-label="总览">
        <p className="ag-label">总览</p>
        <h2 className="liaoning-page__scope">{selectedCityId ? market.scope : '辽宁'}</h2>
        <div className="liaoning-city-picker">
          <CityChoices value={selectedCityId} onChange={cityId => {
            setHover(null);
            if (cityId) select(cityId);
            else navigate(provinceUrl(null));
          }}/>
        </div>
        <div className="liaoning-panel-content" ref={summaryRef}>
          <CitySummary market={market}/>
        </div>
      </aside>
    </div>
  </main>;
}
