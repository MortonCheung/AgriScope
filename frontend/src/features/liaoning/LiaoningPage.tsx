import { useCallback, useMemo, type KeyboardEvent } from 'react';
import { LIAONING_CITIES, STUDY_CITY_IDS } from '../../domain/geography/cities';
import { useAppContext } from '../../app/context/appContext';
import { useSpatialStageStore } from '../spatial/spatialStageStore';
import { CITY_STATE_LABEL } from './cityMarketState';
import { emptyCityView, useCityMarketStates } from './useCityMarketStates';
import { CitySummary } from './CitySummary';
import { MarketOverview } from './MarketOverview';
import { ProvinceThemes } from './ProvinceThemes';
import './liaoning-page.css';

/**
 * 辽宁农业态势（规范 §8）。
 *
 * 视觉主角是省域 3D 沙盘；DOM 只在它上面承担四件事：
 *   左  —— 当前市场（沈阳批发），回答"现在发生了什么"；
 *   右  —— 当前城市摘要 + 六城状态（也是键盘可用、颜色之外的第二重状态表达）；
 *   底  —— 市场趋势 / 生产结构 / 气象 / 异常事件 四个主题区。
 *
 * 城市交互（规范 §8）：
 *   · hover 目标城市 → 地图描边增强并轻微抬升、其他城市降权，右侧摘要同步；
 *   · click 目标城市 → 只更新全局 City Context（与 ContextBar 同一份状态），不强制跳页；
 *     真正进入由右侧摘要的「进入决策 / 查看研究」显式触发。
 */

const CITY_STATE_GLYPH: Record<string, string> = {
  normal: '●',
  warning: '▲',
  'partial-data': '◐',
  'market-data-unavailable': '○',
};

export function LiaoningPage() {
  const hoveredCityId = useSpatialStageStore((state) => state.hoveredCityId);
  const setHoveredCity = useSpatialStageStore((state) => state.setHoveredCity);
  const selectedCityId = useAppContext((state) => state.cityId);
  const setCity = useAppContext((state) => state.setCity);
  const market = useCityMarketStates(true);

  const studyCities = useMemo(
    () => STUDY_CITY_IDS
      .map((id) => LIAONING_CITIES.find((city) => city.id === id))
      .filter((city): city is NonNullable<typeof city> => Boolean(city)),
    [],
  );

  /** 右侧摘要显示的城市：hover 优先，其次是全局上下文（当前城市）。 */
  const displayView = (hoveredCityId ? market.views[hoveredCityId] : undefined)
    ?? market.views[selectedCityId]
    ?? emptyCityView(selectedCityId);

  /** Escape 清除 hover 高亮，回到"当前城市"（键盘可达的退出动作）。 */
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') setHoveredCity(null);
  }, [setHoveredCity]);

  return (
    <main className="liaoning-page" onKeyDown={onKeyDown}>
      <div className="liaoning-page__stage">
        <div className="liaoning-page__current">
          <h1 className="liaoning-page__title">辽宁农业态势</h1>
          <p className="liaoning-page__lead">
            地图是全域入口。六城中目前只有沈阳发布日度市场快照，其余城市按研究侧能力如实标注可用性。
          </p>
          <MarketOverview />
        </div>

        <div className="liaoning-page__window" aria-hidden />

        <div className="liaoning-page__city">
          {/* key 随城市变化：切换时给一次极轻的 4px 淡入，读作"摘要换了城市"，不是刷新页面。 */}
          <CitySummary key={displayView.cityId} view={displayView} />

          <nav className="liaoning-city-rail" aria-label="六城状态与选择">
            <p className="ag-label">六城 · 状态</p>
            <ul className="liaoning-city-rail__list">
              {studyCities.map((city) => {
                const view = market.views[city.id];
                const state = view?.state ?? 'normal';
                const isSelected = city.id === selectedCityId;
                return (
                  <li key={city.id} className="liaoning-city-rail__item">
                    <button
                      type="button"
                      className="liaoning-city"
                      data-state={state}
                      data-selected={isSelected || undefined}
                      data-hovered={hoveredCityId === city.id || undefined}
                      aria-pressed={isSelected}
                      aria-label={`${city.shortName}，市场状态：${CITY_STATE_LABEL[state]}`}
                      onPointerEnter={() => setHoveredCity(city.id)}
                      onFocus={() => setHoveredCity(city.id)}
                      onBlur={() => setHoveredCity(null)}
                      onClick={() => setCity(city.id)}
                    >
                      <span className="liaoning-city__mark" data-state={state} aria-hidden>
                        {CITY_STATE_GLYPH[state]}
                      </span>
                      <span className="liaoning-city__name">{city.shortName}</span>
                      <span className="liaoning-city__state">{CITY_STATE_LABEL[state]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>

      <ProvinceThemes cityId={selectedCityId} />
    </main>
  );
}