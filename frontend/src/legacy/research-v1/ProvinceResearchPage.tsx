import { LIAONING_CITIES, STUDY_CITY_IDS } from '../../domain/geography/cities';
import './province-research.css';

/**
 * 辽宁六城综合研究（V4 §十三/§十四）。
 *
 * 顶部「研究」指向这里，而不是沈阳报告 —— 那是错误的产品层级。
 * 省域综合研究内容尚未接入：这里只建立**正确的页面 Shell**，
 * 既不拿沈阳报告冒充，也不生成任何假研究内容。
 */
export function ProvinceResearchPage() {
  const cities = STUDY_CITY_IDS
    .map((id) => LIAONING_CITIES.find((city) => city.id === id))
    .filter((city): city is NonNullable<typeof city> => Boolean(city));

  return (
    <main className="province-research">
      <header className="province-research__head">
        <h1 className="ag-hero">辽宁综合研究</h1>
        <p className="province-research__status">内容待接入</p>
      </header>
      <ul className="province-research__cities">
        {cities.map((city) => (
          <li key={city.id}>{city.shortName}</li>
        ))}
      </ul>
    </main>
  );
}
