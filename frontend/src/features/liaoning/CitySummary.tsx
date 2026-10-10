import { getCity } from '../../domain/geography/cities';
import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import { TransitionLink } from '../../app/pageNavigation';
import type { CityObservation } from '../../domain/observations/types';
export function CitySummary({ observation }: { observation: CityObservation }) {
  const name = getCity(observation.city_id)?.shortName ?? observation.city_name;
  const last = observation.climate.series.find(y => y.year === observation.climate.complete_year);
  return <section className="city-summary" aria-label={`${name}观察详情`}>
    <p className="ag-label">城市观察</p><h2 className="city-summary__name">{name}</h2>
    <p className="city-summary__intro">把生产结构、气候条件和你的经营设想放在一起观察。</p>
    {last && <dl className="city-summary__fields"><div><dt>{last.year} 年降水</dt><dd>{last.precipitation_mm.toFixed(1)} <small>mm</small></dd></div><div><dt>年均气温</dt><dd>{last.mean_temp_c.toFixed(1)} <small>℃</small></dd></div></dl>}
    <section className="city-summary__attention"><h3>当前值得关注</h3><p>先比较亩产、成本与销售条件，查看保本价格，再检验价格或产量变化后的经营结果。</p></section>
    <div className="city-summary__actions"><TransitionLink className="ag-button ag-button--primary" to={cityContextUrl(ROUTES.decision(observation.city_id),observation.city_id)}>进入决策 →</TransitionLink><TransitionLink className="city-summary__research" to={cityContextUrl(ROUTES.city(observation.city_id),observation.city_id)}>查看研究 →</TransitionLink></div>
  </section>;
}
