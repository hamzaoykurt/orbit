export type GoalKind = 'body' | 'english' | 'make' | 'research' | 'social' | 'any';
export type SuggestionType = 'project' | 'digital_project' | 'image_prompt' | 'research' | 'activity' | 'meal' | 'vocabulary' | 'speaking';
export type DigitalPlatform = 'mobile_app' | 'web_app' | 'desktop_app' | 'game' | 'browser_extension' | 'plugin' | 'automation' | 'interactive_experience';
export const RESEARCH_CATEGORIES = [{value:'surprise',label:'Karışık'},{value:'science',label:'Bilim'},{value:'technology',label:'Teknoloji'},{value:'society',label:'Toplum'},{value:'psychology',label:'Zihin'},{value:'nature',label:'Doğa'},{value:'arts',label:'Sanat'},{value:'future',label:'Gelecek'},{value:'everyday',label:'Gündelik hayat'}] as const;
export const SOCIAL_CATEGORIES = [{value:'surprise',label:'Karışık'},{value:'outdoor',label:'Açık hava'},{value:'indoor',label:'Kapalı alan'},{value:'digital',label:'Dijital'},{value:'culture',label:'Kültür'},{value:'community',label:'Topluluk'},{value:'creative',label:'Yaratıcı'},{value:'low_energy',label:'Düşük enerji'}] as const;
export const CREATE_CATEGORIES = [{value:'surprise',label:'Karışık'},{value:'physical',label:'Fiziksel'},{value:'electronics',label:'Elektronik'},{value:'visual',label:'Görsel'},{value:'craft',label:'El işi'},{value:'spatial',label:'Mekânsal'},{value:'experimental',label:'Deneysel'},{value:'software',label:'Yazılım'}] as const;
export const DIGITAL_PLATFORMS = [{value:'surprise',label:'Karışık'},{value:'mobile_app',label:'Mobil uygulama'},{value:'web_app',label:'Web uygulaması'},{value:'desktop_app',label:'Masaüstü'},{value:'game',label:'Oyun'},{value:'browser_extension',label:'Tarayıcı eklentisi'},{value:'plugin',label:'Eklenti'},{value:'automation',label:'Otomasyon'},{value:'interactive_experience',label:'İnteraktif deneyim'}] as const;
export type ResearchCategory = typeof RESEARCH_CATEGORIES[number]['value'];
export type SocialCategory = typeof SOCIAL_CATEGORIES[number]['value'];
export type CreateCategory = typeof CREATE_CATEGORIES[number]['value'];
export type IdeaCategory = ResearchCategory|SocialCategory|CreateCategory;
export type WordSuggestion = { word: string; meaning: string; example: string };
export type ProjectPlan = { description: string; goal: string; scope: string; tasks: string[]; approach: string };
export type ResearchPlan = { subquestions: string[] };
export type Idea = {
  id: string; kind: 'MAKE' | 'RESEARCH' | 'TRY' | 'LEARN' | 'EXPLORE' | 'GO' | 'BUILD';
  goal: Exclude<GoalKind, 'any'>; text: string;
  title?: string; type?: SuggestionType; domain?: string; generatedAt?: string;
  projectPlan?: ProjectPlan; researchPlan?: ResearchPlan; resultingId?: string;
  words?: WordSuggestion[];
  platform?: DigitalPlatform;
  visualMode?: 'concept' | 'prompt' | 'variation';
  parentId?: string;
};
export type GeneratedIdea = Idea & {
  title: string; type: SuggestionType; domain: string; generatedAt: string; model: string;
  status: 'generated' | 'skipped' | 'rejected' | 'accepted';
};
export type IdeaRequest = { goal?: GoalKind; type?: SuggestionType | 'surprise'; category?:IdeaCategory; platform?:DigitalPlatform; words?: string[]; visualMode?: 'concept' | 'prompt' | 'variation'; sourceId?: string; signal?: AbortSignal };
export const GENERATION_UNAVAILABLE = 'AI üretimi şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.';

export function isIdea(value: unknown): value is Idea {
  if (!value || typeof value !== 'object') return false;
  const item = value as Idea;
  return typeof item.id === 'string' && typeof item.text === 'string' && item.text.trim().length > 0 && item.text.length <= (item.type === 'image_prompt' ? 2400 : 600)
    && ['MAKE','RESEARCH','TRY','LEARN','EXPLORE','GO','BUILD'].includes(item.kind)
    && ['body','english','make','research','social'].includes(item.goal);
}

// All new suggestions come from the authenticated server. No local idea pool or fallback.
async function api<T>(body: object, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const response = await fetch('/api/ideas', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || GENERATION_UNAVAILABLE);
  return payload as T;
}
export async function generateIdea({ signal, ...request }: IdeaRequest): Promise<GeneratedIdea> {
  const { idea } = await api<{ idea: GeneratedIdea }>({ action: 'generate', ...request }, signal);
  if (!isIdea(idea) || !idea.generatedAt || !idea.type) throw new Error(GENERATION_UNAVAILABLE);
  return idea;
}
export async function acceptIdea(id: string, signal?: AbortSignal): Promise<GeneratedIdea> {
  return (await api<{ idea: GeneratedIdea }>({ action: 'accept', id }, signal)).idea;
}
export async function recordIdeaDecision(id: string, status: 'skipped' | 'rejected', signal?: AbortSignal) {
  await api({ action: 'decision', id, status }, signal);
}
export async function generationHistory(before = '', signal?: AbortSignal, type?: SuggestionType): Promise<{ items: GeneratedIdea[]; next: string | null }> {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  if (type) params.set('type', type);
  const response = await fetch(`/api/ideas${params.size ? `?${params}` : ''}`, { cache: 'no-store', credentials: 'same-origin', signal });
  const payload = await response.json() as { items: GeneratedIdea[]; next: string | null; error?: string };
  if (!response.ok) throw new Error(payload.error || 'Üretim geçmişi yüklenemedi.');
  return payload;
}
