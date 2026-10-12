import { useSearchParams } from 'react-router-dom';
import { useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { ROUTES } from '../../app/routes';
import { usePageNavigate } from '../../app/pageNavigation';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { ReportNavigation } from '../report/ReportNavigation';
import { CrossCityPage } from '../cross-city/CrossCityPage';
import { SynthesisPage } from '../cross-city/SynthesisPage';
import '../report/reports.css';

/** The report entrance is already a workspace; no default city is selected. */
export function ResearchCenterPage() {
  const state = useRuntimeCatalog();
  const [searchParams] = useSearchParams();
  const navigate = usePageNavigate();
  const view = searchParams.get('view');
  if (view === 'cross_city') return <CrossCityPage />;
  if (view === 'synthesis') return <SynthesisPage />;
  return <WorkbenchLayout className="report-workbench report-index-workbench report-entry-workbench" resetKey="report-index" sidebarLabel="报告目录" railLabel="报告信息" onEscape={() => navigate(ROUTES.liaoning)} sidebar={() => null}>
    <WorkbenchMain><div className="report__body">
      <header className="report__head"><h1 className="report__title">城市报告</h1></header>
      {state.status === 'loading' && <p className="report__empty" role="status">读取报告目录…</p>}
      {state.status === 'error' && <p className="report__empty" role="alert">报告目录读取失败，请稍后重试。</p>}
      <ReportNavigation label="城市报告" className="report-navigation--overview" />
    </div></WorkbenchMain>
    <WorkbenchRail>{null}</WorkbenchRail>
  </WorkbenchLayout>;
}
