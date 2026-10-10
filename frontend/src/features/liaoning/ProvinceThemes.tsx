import { TransitionLink } from '../../app/pageNavigation';
import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
export function ProvinceThemes({cityId}: {cityId: string | null}) {
  return <nav className="province-themes" aria-label="深入观察">{[['生产结构','A7'],['历史气象',cityId === 'shenyang' ? 'A2' : 'A9'],['市场研究','A1']].map(([label,id]) => <TransitionLink key={id} to={cityId ? cityContextUrl(ROUTES.research(cityId,id),cityId) : ROUTES.researchCenter}>{label} ↗</TransitionLink>)}</nav>;
}
