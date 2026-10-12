import { WorkbenchLayout } from '../../components/workbench/WorkbenchLayout';
import { useResearchWorkspace } from './useResearchWorkspace';

/** Compatibility entrance; module data and selection use the shared validated controller. */
export function CityModulesWorkspace({ cityId, initialModuleId }: { cityId: string; initialModuleId?: string }) {
  return <WorkbenchLayout {...useResearchWorkspace(cityId, initialModuleId)}/>;
}
