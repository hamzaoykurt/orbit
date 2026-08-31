import type { GeneratedIdea } from './idea-engine';
import type { ProjectWorkspaceData } from '../projects/project-types';
import { analyzeProject } from '../projects/project-advisor';
import { newCreationDraft, stageFromLifecycle } from '../projects/planning-types';
import type { ProjectPlanning } from '../projects/planning-types';
import { applyPlanning } from '../projects/planning-actions';

export function projectFromIdea(idea:GeneratedIdea) {
  const plan=idea.projectPlan;
  if(!['project','digital_project'].includes(idea.type)||idea.status!=='accepted'||!idea.resultingId||!plan)throw new Error('Kabul edilmiş bir proje planı gerekli.');
  const input = { ...newCreationDraft(idea.resultingId), title: idea.title, idea: `${idea.text}\n${plan.description}`.slice(0,1200),
    answers: { scope: 'one', validation: 'build', evidence: 'unknown' }, step: 'review' as const };
  const analysis = analyzeProject(input, idea.platform);
  analysis.firstSteps = plan.tasks.slice(0,3);
  analysis.nextWeek = plan.tasks.slice(3);
  analysis.mvp = plan.scope;
  analysis.scope = plan.scope;
  analysis.route = `${analysis.type} · ilk sürüme giden yol`;
  analysis.routeReason = plan.approach || plan.goal;
  input.selectedStyle = analysis.recommendations[0].styleId;
  const planning: ProjectPlanning = { version:1, origin:'rebuild', createdAt:idea.generatedAt, updatedAt:idea.generatedAt,
    input, analysis, selectedStyle:input.selectedStyle, lifecycle:analysis.suggestedLifecycle, overrides:{} };
  const workspace: ProjectWorkspaceData = {description:plan.description,diagrams:[],links:[],notes:[{id:`${idea.id}-plan`,title:'Amaç ve kapsam',body:`Amaç\n${plan.goal}\n\nKapsam\n${plan.scope}${plan.approach?`\n\nYaklaşım\n${plan.approach}`:''}`} ]};
  return {
    project:{id:idea.resultingId,title:idea.title,stage:stageFromLifecycle(planning.lifecycle),progress:0,color:'violet',due:'',tags:[...new Set([idea.domain,analysis.type])],tasks:[...plan.tasks],cover:'minimal' as const},
    workspace:applyPlanning(workspace,planning),
  };
}
