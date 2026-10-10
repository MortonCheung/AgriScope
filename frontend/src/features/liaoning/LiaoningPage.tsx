import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { selectedCityFromSearch, provinceUrl } from '../../app/context/provinceSelection';
import { usePageNavigate } from '../../app/pageNavigation';
import { useCitySelection } from '../spatial/SpatialShell';
import { useSpatialStageStore } from '../spatial/spatialStageStore';
import { useObservations } from '../../domain/observations/useObservations';
import type { CityObservation } from '../../domain/observations/types';
import { CitySummary } from './CitySummary';
import { MarketOverview } from './MarketOverview';
import { ProvinceThemes } from './ProvinceThemes';
import './liaoning-page.css';
const n = (v: number) => new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1}).format(v);
function principalItems(c: CityObservation) {
  const items = c.city_id === 'shenyang' ? c.production.items.filter(i => ['玉米','稻谷','蔬菜及食用菌'].includes(i.crop)) : c.production.items;
  return [...items].sort((a,b) => b.area_ha-a.area_ha).slice(0,3);
}
export function LiaoningPage() {
  const selectedCityId = selectedCityFromSearch(useLocation().search);
  const hover = useSpatialStageStore(s => s.hoveredCityId);
  const setHover = useSpatialStageStore(s => s.setHoveredCity);
  const select = useCitySelection();
  const navigate = usePageNavigate();
  const data = useObservations();
  const cities = data.status === 'ready' ? data.data.cities : [];
  const city = cities.find(c => c.city_id === selectedCityId);
  const preview = cities.find(c => c.city_id === hover);
  const summary = data.status === 'ready' ? data.data.summary : null;
  const returnProvince = () => {setHover(null);navigate(provinceUrl(null));};
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key!=='Escape'||event.defaultPrevented)return; if(hover)setHover(null);else if(selectedCityId)navigate(provinceUrl(null));};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[hover,navigate,selectedCityId,setHover]);
  return <main className="liaoning-page" data-scope={selectedCityId ? 'city' : 'province'}>
    <div className="liaoning-page__stage">
      <aside className="liaoning-page__current" aria-label={selectedCityId ? '城市农业概览' : '辽宁农业概览'}>
        <p className="ag-label">{selectedCityId ? '农业与市场' : '辽宁 · 六城研究区'}</p>
        <h1 className="liaoning-page__title">{selectedCityId ? getCity(selectedCityId)?.shortName : <>辽宁<br/>农业观察</>}</h1>
        <div className="liaoning-panel-content" key={selectedCityId ?? 'province'}>
          {data.status === 'loading' && <p role="status">读取农业观测…</p>}
          {data.status === 'error' && <p role="alert">{data.error}</p>}
          {city ? <section className="agriculture-structure"><h2>主要作物</h2><p className="ag-caption">{city.production.latest_year} 年 · {selectedCityId === 'shenyang' ? '8 农业区县合计' : '已覆盖作物结构'}</p>{principalItems(city).map(i => <div className="agriculture-crop" key={i.crop}><span>{i.crop}</span><strong>{n(i.area_ha / 10000)} <small>万公顷</small></strong><div className="agriculture-crop__bar"><i style={{width:`${i.area_ha / (principalItems(city)[0]?.area_ha || 1) *100}%`}} /></div></div>)}</section> : cities.length > 0 && <section className="agriculture-structure"><h2>生产格局</h2><p className="ag-caption">各城最近可用年度的主要作物</p><dl className="province-crops">{cities.map(c => <div key={c.city_id}><dt>{getCity(c.city_id)?.shortName}</dt><dd>{principalItems(c)[0]?.crop}<small>{c.production.latest_year}</small></dd></div>)}</dl><p className="ag-caption">年度与统计范围不同，分别观察。</p></section>}
          {city ? <MarketOverview cityId={city.city_id} /> : <section className="province-note"><h2>观察什么</h2><p>从作物结构到气候差异，再把成本、亩产和销售条件代入自己的方案。</p></section>}
        </div>
      </aside>
      <div className="liaoning-page__window" aria-hidden />
      <aside className="liaoning-page__city" aria-label="观察详情">
        {selectedCityId && <button className="province-return" onClick={returnProvince}>← 返回全省</button>}
        <div className="liaoning-panel-content" key={selectedCityId ?? 'province'}>
        {city ? <CitySummary observation={city}/> : <section className="province-inspector"><p className="ag-label">全省观察</p><h2>在地图中<br/>找到你的城市</h2><p>悬停预览，点击锁定。随时切换城市，继续观察同一张辽宁地图。</p>{summary?.precipitation_range_mm && <dl className="province-climate"><dt>{summary.climate_year} 年 · 六城降水范围</dt><dd>{n(summary.precipitation_range_mm.min)}—{n(summary.precipitation_range_mm.max)} <small>mm</small></dd><dt>年均气温范围</dt><dd>{n(summary.mean_temp_range_c!.min)}—{n(summary.mean_temp_range_c!.max)} <small>℃</small></dd></dl>}<p className="ag-caption">气候为再分析资料；历史差异不等同于未来灾害损失。</p></section>}
        </div>
        <ProvinceThemes cityId={selectedCityId}/>
      </aside>
    </div>
    <div className="liaoning-map-footer">
      <p className="liaoning-hover-preview" aria-live="polite">{hover ? <>{getCity(hover)?.shortName}{preview ? ` · 主要作物 ${principalItems(preview)[0]?.crop ?? '见生产结构'}` : ''}<span>{(STUDY_CITY_IDS as readonly string[]).includes(hover) ? '点击观察' : '研究范围暂未覆盖'}</span></> : '选择城市，开始观察'}</p>
      <nav className="liaoning-city-rail" aria-label="选择观察城市">{STUDY_CITY_IDS.map(id => <button key={id} aria-pressed={selectedCityId === id} onPointerEnter={()=>setHover(id)} onPointerLeave={()=>setHover(null)} onFocus={()=>setHover(id)} onBlur={()=>setHover(null)} onClick={()=>select(id)}>{getCity(id)?.shortName}</button>)}</nav>
    </div>
  </main>;
}
