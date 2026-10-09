import { LIAONING, LIAONING_CITIES, STUDY_CITY_IDS } from '../../domain/geography/cities';
import { hasCatalog } from '../../domain/research/catalog';
import { useSpatialStageStore } from '../spatial/spatialStageStore';
import { useCitySelection } from '../spatial/SpatialShell';
import { MarketOverview } from './MarketOverview';
import './liaoning-page.css';

/**
 * 省域空间（V3 §5）：辽宁农业态势的驾驶舱。
 *
 * 主体仍是 3D 沙盘，DOM 层在其上给出两件事：
 *   左下 —— 「辽宁」+ 当前市场摘要（真实数据，口径写明）；
 *   右下 —— 六城入口，并如实标注哪些城市的研究已接入（§5.2/§22）。
 * 城市列表与地图点击共用同一套选择逻辑，六个地级市全部可点击。
 */
export function LiaoningPage() {
  const selectCity = useCitySelection();
  const hoveredCityId = useSpatialStageStore((state) => state.hoveredCityId);
  const setHoveredCity = useSpatialStageStore((state) => state.setHoveredCity);
  const studyCities = STUDY_CITY_IDS.map((id) => LIAONING_CITIES.find((city) => city.id === id)!).filter(Boolean);

  return (
    <main className="liaoning-page">
      <div className="liaoning-page__panel">
        <h1 className="ag-hero liaoning-page__title">{LIAONING.shortName}</h1>
        <MarketOverview />
      </div>

      <div className="liaoning-page__index" role="group" aria-label="研究城市入口">
        {/*
          进入城市只在"项"上设置，清空只在"整个列表"离开时做。
          否则鼠标穿过两项之间的间隙会先经过 null，地图会闪一下。
        */}
        <ul className="liaoning-page__cities" onPointerLeave={() => setHoveredCity(null)}>
          {studyCities.map((city) => {
            const available = hasCatalog(city.id);
            return (
              <li key={city.id} onPointerEnter={() => setHoveredCity(city.id)}>
                <button
                  type="button"
                  className="liaoning-city"
                  data-hovered={hoveredCityId === city.id || undefined}
                  data-available={available || undefined}
                  aria-label={`${city.shortName}${available ? '' : '（研究待接入）'}`}
                  onFocus={() => setHoveredCity(city.id)}
                  onBlur={() => setHoveredCity(null)}
                  onClick={() => selectCity(city.id)}
                >
                  <span className="liaoning-city__name">{city.shortName}</span>
                  {!available && <span className="liaoning-city__state">待接入</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
