import { useParams } from 'react-router-dom';
import { WorkbenchLayout } from '../../components/workbench/WorkbenchLayout';
import { useResearchWorkspace } from './useResearchWorkspace';

/** One stable shell for all city/module/point identities, including explicit replacements. */
export function CityResearchPage({ initialModuleId, initialSelection }: { initialModuleId?: string; initialSelection?: string } = {}) {
  const { cityId = '', researchId } = useParams();
  const workspace = useResearchWorkspace(cityId, researchId ?? initialSelection ?? initialModuleId);
  return <WorkbenchLayout {...workspace}/>;
}
