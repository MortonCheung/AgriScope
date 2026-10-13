import { CityWorkspaceSelector, WorkspaceLanding } from '../../components/workbench/WorkspaceLanding';
import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import './decision.css';
export function CityDecisionEntry() {
  return <main className="decision decision-city-workspace" data-paper-surface>
    <WorkspaceLanding title="选择城市"><nav aria-label="选择决策城市">
      <CityWorkspaceSelector buildHref={id => cityContextUrl(ROUTES.decision(id), id)}/>
    </nav></WorkspaceLanding>
  </main>;
}
