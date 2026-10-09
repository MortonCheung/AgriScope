import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getCity, LIAONING_CITIES, STUDY_CITY_IDS } from '../../domain/geography/cities';
import { usePageNavigate } from '../pageNavigation';
import { CONTEXT_HORIZONS, useAppContext, type ContextHorizon } from './appContext';
import './context-bar.css';

/**
 * 全局上下文条（V3 §6 / §6.1）。
 *
 * 只做一件事：让「辽宁农业态势 / 决策中心 / 研究中心」共享同一座城市与同一个周期。
 * 视觉刻意做轻：两个贴纸式的原生 select（文字 + 底线），不是后台筛选栏。
 *
 * 用原生 `<select>` 而不是自绘下拉：键盘、触屏、读屏都能直接用（§59），
 * 也避免再引入一套浮层管理与焦点陷阱。
 */

const HORIZON_LABEL: Record<ContextHorizon, string> = { 7: '7 天', 14: '14 天', 30: '30 天' };

const studyCities = STUDY_CITY_IDS
  .map((id) => LIAONING_CITIES.find((city) => city.id === id))
  .filter((city): city is NonNullable<typeof city> => Boolean(city));

export function ContextBar() {
  const { pathname } = useLocation();
  const cityId = useAppContext((state) => state.cityId);
  const horizon = useAppContext((state) => state.horizon);
  const setCity = useAppContext((state) => state.setCity);
  const setHorizon = useAppContext((state) => state.setHorizon);

  /**
   * 进入某座城市的页面时，把上下文对齐到这座城市 —— 上下文是"你正在看哪里"，
   * 而不是一个与路由无关的独立开关。只在六个研究城市内对齐，避免 /cities/anshan
   * 这类没有上下文的城市污染它。
   */
  useEffect(() => {
    const match = /^\/cities\/([^/]+)/.exec(pathname);
    const routeCity = match?.[1];
    if (routeCity && (STUDY_CITY_IDS as readonly string[]).includes(routeCity) && routeCity !== cityId) {
      setCity(routeCity);
    }
  }, [cityId, pathname, setCity]);

  const city = getCity(cityId);
  const navigate = usePageNavigate();

  /**
   * 切换城市时，如果当前正处于"城市内页面"，就跟着换到新城市的同一层页面 ——
   * 否则在 /cities/shenyang/decision 上把城市改成朝阳会毫无反馈，
   * 用户还得自己再点一次。研究子路径不跟随（researchId 属于原城市），
   * 只回到新城市的城市页。
   */
  const onCityChange = (next: string) => {
    setCity(next);
    const match = /^\/cities\/[^/]+(\/.*)?$/.exec(pathname);
    if (!match || next === cityId) return;
    const rest = match[1] ?? '';
    const nextRest = rest.startsWith('/research/') ? '' : rest;
    navigate(`/cities/${next}${nextRest}`);
  };

  return (
    <div className="ag-context" role="group" aria-label="当前城市与周期">
      <label className="ag-context__field" htmlFor="ag-context-city">
        <span className="ag-context__label">城市</span>
        <select
          id="ag-context-city"
          name="city"
          className="ag-context__select"
          aria-label="当前城市"
          value={cityId}
          onChange={(event) => onCityChange(event.target.value)}
        >
          {studyCities.map((item) => (
            <option key={item.id} value={item.id}>{item.shortName}</option>
          ))}
        </select>
      </label>
      <span className="ag-context__sep" aria-hidden>·</span>
      <label className="ag-context__field" htmlFor="ag-context-horizon">
        <span className="ag-context__label">周期</span>
        <select
          id="ag-context-horizon"
          name="horizon"
          className="ag-context__select"
          aria-label="当前周期"
          value={String(horizon)}
          onChange={(event) => setHorizon(Number(event.target.value) as ContextHorizon)}
        >
          {CONTEXT_HORIZONS.map((days) => (
            <option key={days} value={days}>{HORIZON_LABEL[days]}</option>
          ))}
        </select>
      </label>
      <span className="ag-sr-only">{city ? `当前城市：${city.shortName}` : ''}</span>
    </div>
  );
}
