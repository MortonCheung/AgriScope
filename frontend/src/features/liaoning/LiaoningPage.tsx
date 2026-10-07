import { LIAONING, LIAONING_CITIES, STUDY_CITY_IDS } from '../../domain/geography/cities';
import { useSpatialStageStore } from '../spatial/spatialStageStore';
import { useCitySelection } from '../spatial/SpatialShell';
import './liaoning-page.css';

/**
 * 省域空间：内容极少，主体是 3D 沙盘。最终左下只留「辽宁」一个词（V4 §十九/§七十）。
 * 城市列表与地图点击共用同一套选择逻辑，六个地级市全部可点击（V4 §十七）。
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
      </div>

      <div className="liaoning-page__index" role="group" aria-label="研究城市入口">
        {/*
          进入城市只在"项"上设置，清空只在"整个列表"离开时做。
          否则鼠标穿过两项之间的间隙会先经过 null，地图会闪一下。
        */}
        <ul className="liaoning-page__cities" onPointerLeave={() => setHoveredCity(null)}>
          {studyCities.map((city) => (
            <li key={city.id} onPointerEnter={() => setHoveredCity(city.id)}>
              <button
                type="button"
                className="liaoning-city"
                data-hovered={hoveredCityId === city.id || undefined}
                onFocus={() => setHoveredCity(city.id)}
                onBlur={() => setHoveredCity(null)}
                onClick={() => selectCity(city.id)}
              >
                <span className="liaoning-city__name">{city.shortName}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
