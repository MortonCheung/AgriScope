import { useSearchParams } from 'react-router-dom';
import { getCity, STUDY_CITY_IDS } from '../../domain/geography/cities';
import { cityEntry, useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import { TransitionLink } from '../../app/pageNavigation';
import { LlmEvidenceSection } from './LlmEvidenceSection';
import { CrossCityPage } from '../cross-city/CrossCityPage';
import { SynthesisPage } from '../cross-city/SynthesisPage';
import '../../design/paper-motion.css';
import './research-center.css';

/** Direct, catalog-backed report entrances. Research deep links remain available. */
export function ResearchCenterPage() {
  const catalogState = useRuntimeCatalog();
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  if (view === 'cross_city') return <CrossCityPage />;
  if (view === 'synthesis') return <SynthesisPage />;
  const catalog = catalogState.status === 'ready' ? catalogState.catalog : null;
  const reportAvailable = (id: string) => Boolean(catalog && cityEntry(catalog, id)?.modules.some(module => module.module_id === 'A09'));
  const crossCity = catalog && cityEntry(catalog, 'cross_city');
  return <main className="ag-page">
    <div className="ag-container research-center ag-paper-enter">
      <header className="ag-section__head"><p className="ag-label">AGRISCOPE</p><h1 className="ag-hero">城市报告</h1></header>
      <nav aria-label="城市报告">
        {catalogState.status === 'loading' && <p className="ag-caption" role="status">读取报告目录…</p>}
        {catalogState.status === 'error' && <p className="ag-body" role="alert">报告目录读取失败：{catalogState.message}</p>}
        <ul className="research-center__cities">{STUDY_CITY_IDS.map(id => <li key={id}>
          {reportAvailable(id)
            ? <TransitionLink className="ag-button research-center__city-button" to={cityContextUrl(ROUTES.cityReport(id), id)}>{getCity(id)!.shortName}<span aria-hidden>↗</span></TransitionLink>
            : <button type="button" className="ag-button research-center__city-button" disabled>{getCity(id)!.shortName}</button>}
        </li>)}</ul>
      </nav>
      <nav className="research-center__supplement" aria-label="其他研究">
        {crossCity && <>
          <TransitionLink className="ag-button" to={ROUTES.provinceReport}>辽宁综合报告</TransitionLink>
          <TransitionLink className="ag-button" to={`${ROUTES.researchCenter}?view=cross_city`}>六城比较</TransitionLink>
          <TransitionLink className="ag-button" to={`${ROUTES.researchCenter}?view=synthesis`}>综合研究</TransitionLink>
        </>}
        <TransitionLink className="ag-button" to={ROUTES.about}>方法与来源</TransitionLink>
      </nav>
      <details className="research-center__evaluation"><summary>模型评估</summary><LlmEvidenceSection/></details>
    </div>
  </main>;
}
