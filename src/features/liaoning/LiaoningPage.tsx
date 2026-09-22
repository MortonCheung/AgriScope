import { LIAONING, LIAONING_CITIES, STUDY_CITY_IDS } from '../../domain/geography/cities';
import { useSpatialStageStore } from '../spatial/spatialStageStore';
import { useCitySelection } from '../spatial/SpatialShell';
import './liaoning-page.css';

/**
 * 省域空间：内容极少，主体是 3D 沙盘。
 * 城市列表与地图点击共用同一套选择逻辑，键盘与移动端可用。
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
        <p className="liaoning-page__hint">
          {hoveredCityId
            ? (LIAONING_CITIES.find((city) => city.id === hoveredCityId)?.hasResearch ? '点击进入研究' : '研究尚未接入')
            : '拖动可旋转沙盘，点击城市进入'}
        </p>
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
                data-ready={city.hasResearch || undefined}
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
