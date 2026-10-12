/** The mesh owns pointer selection; city text never intercepts its hit area. */
export function CityMapLabel({ cityId, name, highlighted, hasResearch }: {
  cityId: string; name: string; highlighted: boolean; hasResearch: boolean;
}) {
  return <span aria-hidden="true" data-city={cityId} className={`liaoning-label${highlighted ? ' is-active' : ''}${hasResearch ? ' is-research' : ''}`}>{name}</span>;
}
