import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { TransitionLink } from '../../app/pageNavigation';
import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import './decision.css';
export function CityDecisionEntry() {
  return <main className="decision"><header className="center-hero"><p className="ag-label">六城 · 决策</p><h1 className="ag-hero">从一座城市开始</h1><p className="decision-note">观察农业结构与历史气候，输入自己的亩产、成本和销售条件，比较经营结果。</p></header><nav className="decision-city-entry" aria-label="选择决策城市">{STUDY_CITY_IDS.map(id => <TransitionLink key={id} className="ag-button" to={cityContextUrl(ROUTES.decision(id), id)}>{getCity(id)?.shortName} →</TransitionLink>)}</nav></main>;
}
