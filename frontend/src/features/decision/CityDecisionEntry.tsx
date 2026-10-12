import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { TransitionLink } from '../../app/pageNavigation';
import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import './decision.css';
export function CityDecisionEntry() {
  return <main className="decision decision-city-workspace ag-paper-enter"><h1 className="ag-section-title">农业决策</h1><nav className="decision-city-entry" aria-label="选择决策城市">{STUDY_CITY_IDS.map(id => <TransitionLink key={id} className="ag-button" to={cityContextUrl(ROUTES.decision(id), id)}>{getCity(id)?.shortName}</TransitionLink>)}</nav></main>;
}
