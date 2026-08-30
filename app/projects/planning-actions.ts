import type { ProjectPlanning } from './planning-types';
import type { Practice, ResearchTopic } from '../rebuild/practice-model';
import type { ProjectWorkspaceData } from './project-types';

export const planningResearchId = (projectId:string) => `research-${projectId}`;
export function addPlanningResearch(practice:Practice,projectId:string,title:string,plan:ProjectPlanning):Practice {
  const id=planningResearchId(projectId);
  if(practice.research.some(topic=>topic.id===id))return {...practice,currentResearchId:id};
  const topic:ResearchTopic={id,ideaId:'',projectId,source:'project-planning',title:title.slice(0,120),
    question:`“${title}” fikrinin ilk denemesi hangi kullanıcı ihtiyacını, hangi gözlenebilir sonuçla doğrulayabilir?`,startedAt:plan.updatedAt,
    questions:plan.analysis.research.map((text,index)=>({id:`${id}-${index}`,text:text.slice(0,240),explored:false,note:''}))};
  return {...practice,currentResearchId:id,research:[...practice.research,topic]};
}
export function applyPlanning(workspace:ProjectWorkspaceData,plan:ProjectPlanning):ProjectWorkspaceData {
  // Existing work, attachments and user overrides survive a new assessment.
  return {...workspace,description:workspace.description||plan.input.idea,planning:{...plan,
    createdAt:workspace.planning?.createdAt||plan.createdAt,
    overrides:workspace.planning?.overrides||plan.overrides,
    ...(workspace.planning?.researchId?{researchId:workspace.planning.researchId}:{}),
  }};
}
