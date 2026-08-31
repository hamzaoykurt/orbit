import type { ProjectPlanning } from './planning-types';
import type { Practice, ResearchTopic } from '../rebuild/practice-model';
import type { Diagram, ProjectWorkspaceData } from './project-types';

export function planningDiagram(plan: ProjectPlanning): Diagram {
  const id = `route-${plan.input.id}`;
  const steps = [...plan.analysis.firstSteps, ...plan.analysis.nextWeek].slice(0, 8);
  const nodes = steps.map((step, index) => ({ id: `${id}-${index}`, label: step.replace(/^“[^”]+”\s*:?\s*/, '').slice(0, 140),
    x: 30 + (index < 4 ? index : 7 - index) * 245, y: index < 4 ? 110 : 350, color: index === steps.length - 1 ? 'mint' : 'violet' }));
  return { id, title: 'Başlangıç yol haritası', nodes,
    edges: nodes.slice(1).map((node, index) => ({ id: `${id}-edge-${index}`, from: nodes[index].id, to: node.id })) };
}

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
  return {...workspace,description:workspace.description||plan.input.idea,
    // Only initialize once. Reevaluation must not replace edited or deleted diagrams.
    diagrams: !workspace.planning && !workspace.diagrams.length ? [planningDiagram(plan)] : workspace.diagrams,
    notes: !workspace.planning ? [...workspace.notes, { id: `criteria-${plan.input.id}`, title: 'İlk sürümün başarı ölçütü',
      body: `İlk kapsam\n${plan.analysis.mvp}\n\nDoğrulama adımı\n${plan.analysis.firstSteps.at(-1) || ''}\n\nGözlem ve karar\nDeneme sonucunu buraya yaz; devam etme veya kapsamı değiştirme kararını kanıta bağla.` }] : workspace.notes,
    planning:{...plan,
    createdAt:workspace.planning?.createdAt||plan.createdAt,
    overrides:workspace.planning?.overrides||plan.overrides,
    ...(workspace.planning?.researchId?{researchId:workspace.planning.researchId}:{}),
  }};
}
