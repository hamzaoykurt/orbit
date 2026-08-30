export const lifecycleLabels = {
  idea: 'Fikir', research: 'Araştırma', mvp: 'MVP', active: 'Geliştirme',
  paused: 'Beklemede', completed: 'Tamamlandı', archived: 'Arşiv',
} as const;
export type ProjectLifecycle = keyof typeof lifecycleLabels;
export type AnswerKey = 'audience' | 'goal' | 'evidence' | 'difference' | 'scope' | 'validation' | 'capacity' | 'tone';
export type ProjectAnswers = Partial<Record<AnswerKey, string>>;
export type CreationDraft = {
  id: string; idea: string; title: string; answers: ProjectAnswers;
  step: 'idea' | 'questions' | 'design' | 'review'; question: number;
  selectedStyle: string | null; editingProjectId?: string; lifecycle?: ProjectLifecycle;
};
export type DesignRecommendation = { styleId: string; reason: string };
export type ProjectAnalysis = {
  version: 1; source: 'local'; summary: string;
  type: string; difficulty: string; mvpFit: string; revenue: string;
  audience: string; suggestedLifecycle: ProjectLifecycle; priority: string;
  scope: string; solo: string; technical: string; designIntensity: string; contentIntensity: string;
  route: string; routeReason: string; mvp: string;
  firstSteps: string[]; nextWeek: string[]; technologies: string[];
  research: string[]; features: string[]; risks: string[];
  recommendations: DesignRecommendation[];
};
export type ProjectPlanning = {
  version: 1; createdAt: string; updatedAt: string; input: CreationDraft;
  analysis: ProjectAnalysis; selectedStyle: string; lifecycle: ProjectLifecycle;
  overrides: Partial<Pick<ProjectAnalysis, 'type' | 'difficulty' | 'mvpFit' | 'revenue' | 'audience' | 'priority' | 'scope' | 'solo' | 'technical' | 'designIntensity' | 'contentIntensity'>>;
  researchId?: string;
};
export const newCreationDraft = (id: string): CreationDraft => ({ id, idea: '', title: '', answers: {}, step: 'idea', question: 0, selectedStyle: null });
export const lifecycleFromStage = (stage: number): ProjectLifecycle => stage === 3 ? 'completed' : stage === 1 ? 'active' : stage === 2 ? 'research' : 'idea';
export const stageFromLifecycle = (status: ProjectLifecycle) => status === 'completed' || status === 'archived' ? 3 : status === 'active' || status === 'mvp' ? 1 : status === 'research' ? 2 : 0;
export function normalizeCreationDraft(value: unknown): CreationDraft | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<CreationDraft>;
  if (typeof raw.id !== 'string' || !/^[\w-]{1,100}$/.test(raw.id)) return null;
  const answers: ProjectAnswers = {};
  for (const key of ['audience','goal','evidence','difference','scope','validation','capacity','tone'] as AnswerKey[]) {
    if (typeof raw.answers?.[key] === 'string') answers[key] = raw.answers[key]!.slice(0,300);
  }
  return { id: raw.id, idea: typeof raw.idea === 'string' ? raw.idea.slice(0,1200) : '', title: typeof raw.title === 'string' ? raw.title.slice(0,100) : '', answers,
    step: ['idea','questions','design','review'].includes(raw.step || '') ? raw.step! : 'idea', question: Math.min(8,Math.max(0,Math.floor(Number(raw.question)||0))),
    selectedStyle: typeof raw.selectedStyle === 'string' ? raw.selectedStyle.slice(0,80) : null,
    ...(typeof raw.editingProjectId === 'string' ? { editingProjectId: raw.editingProjectId } : {}),
    ...(raw.lifecycle && Object.hasOwn(lifecycleLabels,raw.lifecycle) ? {lifecycle:raw.lifecycle} : {}),
  };
}

export function normalizePlanning(value:unknown):ProjectPlanning|undefined {
  if(!value||typeof value!=='object')return undefined;
  const plan=value as ProjectPlanning;
  const input=normalizeCreationDraft(plan.input), a=plan.analysis;
  if(plan.version!==1||!input||!a||a.version!==1||a.source!=='local'||!Object.hasOwn(lifecycleLabels,plan.lifecycle)||typeof plan.selectedStyle!=='string')return undefined;
  const strings=['summary','type','difficulty','mvpFit','revenue','audience','priority','scope','solo','technical','designIntensity','contentIntensity','route','routeReason','mvp'] as const;
  if(strings.some(key=>typeof a[key]!=='string'))return undefined;
  if(!['firstSteps','nextWeek','technologies','research','features','risks'].every(key=>Array.isArray(a[key as keyof ProjectAnalysis])&&(a[key as keyof ProjectAnalysis] as unknown[]).every(x=>typeof x==='string')))return undefined;
  if(!Array.isArray(a.recommendations)||!a.recommendations.every(r=>r&&typeof r.styleId==='string'&&typeof r.reason==='string'))return undefined;
  const overrides=Object.fromEntries(Object.entries(plan.overrides||{}).filter(([key,value])=>strings.includes(key as typeof strings[number])&&typeof value==='string'));
  return {...plan,input,overrides};
}
