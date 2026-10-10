import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { STUDY_CITY_IDS, getCity, isStudyCity } from '../../domain/geography/cities';
import { selectedCityFromSearch, provinceUrl } from '../../app/context/provinceSelection';
import { usePageNavigate } from '../../app/pageNavigation';
import { useCitySelection } from '../spatial/SpatialShell';
import { useSpatialStageStore } from '../spatial/spatialStageStore';
import { useDailyResource } from '../daily/useDaily';
import { CITY_COLOR_TOKENS } from '../../design/sceneTokens';
import { CitySummary } from './CitySummary';
import { MarketOverview } from './MarketOverview';
import { usePaperSelection } from './usePaperSelection';
import './liaoning-page.css';

export function LiaoningPage() {
  const selectedCityId = selectedCityFromSearch(useLocation().search);
  const hover = useSpatialStageStore(s => s.hoveredCityId);
  const setHover = useSpatialStageStore(s => s.setHoveredCity);
  const select = useCitySelection();
  const navigate = usePageNavigate();
  const { displayedCityId, phase } = usePaperSelection(selectedCityId, Boolean(useReducedMotion()));
  const market = useDailyResource(displayedCityId ?? 'shenyang');
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
      <aside className="liaoning-paper liaoning-page__current" aria-label="最新农业市场">
        <div className="liaoning-panel-content" data-phase={phase} inert={phase === 'out'}>
          <p className="ag-label">最新农业市场</p>
          <h1 className="liaoning-page__title">{displayedCityId ? `${getCity(displayedCityId)?.shortName}市场` : '最新行情'}</h1>
          <MarketOverview cityId={displayedCityId ?? 'shenyang'} resource={market}/>
        </div>
      </aside>
      <div className="liaoning-page__window" aria-hidden />
      <aside className="liaoning-paper liaoning-page__city" aria-label="当前观察对象">
        <label className="ag-label" htmlFor="province-city">观察对象</label>
        <div className="liaoning-city-picker">
          <i aria-hidden style={{ background: selectedCityId && isStudyCity(selectedCityId) ? CITY_COLOR_TOKENS[selectedCityId] : '#e3ded4' }}/>
          <select id="province-city" value={selectedCityId ?? ''} onChange={event => {
            setHover(null);
            if (event.target.value) select(event.target.value);
            else navigate(provinceUrl(null));
          }}>
            <option value="">辽宁 · 全省</option>
            {STUDY_CITY_IDS.map(id => <option key={id} value={id}>{getCity(id)?.shortName}</option>)}
          </select>
        </div>
        <div className="liaoning-panel-content" data-phase={phase} inert={phase === 'out'}>
          <CitySummary cityId={displayedCityId} market={market.state}/>
        </div>
      </aside>
    </div>
  </main>;
}
