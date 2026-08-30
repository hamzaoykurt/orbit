import type { GeneratedIdea } from './idea-engine';
import type { ProjectWorkspaceData } from '../projects/project-types';

export function projectFromIdea(idea:GeneratedIdea) {
  const plan=idea.projectPlan;
  if(idea.type!=='project'||idea.status!=='accepted'||!idea.resultingId||!plan)throw new Error('Kabul edilmiş bir proje planı gerekli.');
  return {
    project:{id:idea.resultingId,title:idea.title,stage:0,progress:0,color:'violet',due:'',tags:[idea.domain],tasks:[...plan.tasks],cover:'minimal' as const},
    workspace:{description:plan.description,diagrams:[],links:[],notes:[{id:`${idea.id}-plan`,title:'Amaç ve kapsam',body:`Amaç\n${plan.goal}\n\nKapsam\n${plan.scope}${plan.approach?`\n\nYaklaşım\n${plan.approach}`:''}`}]} satisfies ProjectWorkspaceData,
  };
}
