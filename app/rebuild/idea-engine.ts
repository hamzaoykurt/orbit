export type GoalKind = 'body' | 'english' | 'make' | 'research' | 'social' | 'any';
export type SuggestionType = 'project' | 'research' | 'activity' | 'meal' | 'vocabulary' | 'speaking';
export type WordSuggestion = { word: string; meaning: string; example: string };
export type ProjectPlan = { description: string; goal: string; scope: string; tasks: string[]; approach: string };
export type ResearchPlan = { subquestions: string[] };
export type Idea = {
  id: string; kind: 'MAKE' | 'RESEARCH' | 'TRY' | 'LEARN' | 'EXPLORE' | 'GO' | 'BUILD';
  goal: Exclude<GoalKind, 'any'>; text: string;
  title?: string; type?: SuggestionType; domain?: string; generatedAt?: string;
  projectPlan?: ProjectPlan; researchPlan?: ResearchPlan; resultingId?: string;
  words?: WordSuggestion[];
};
export type GeneratedIdea = Idea & {
  title: string; type: SuggestionType; domain: string; generatedAt: string; model: string;
  status: 'generated' | 'skipped' | 'rejected' | 'accepted';
};
export type IdeaRequest = { goal?: GoalKind; type?: SuggestionType | 'surprise'; words?: string[]; signal?: AbortSignal };
export const GENERATION_UNAVAILABLE = 'AI üretimi şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.';

export function isIdea(value: unknown): value is Idea {
  if (!value || typeof value !== 'object') return false;
  const item = value as Idea;
  return typeof item.id === 'string' && typeof item.text === 'string' && item.text.trim().length > 0 && item.text.length <= 600
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
export async function generationHistory(before = '', signal?: AbortSignal): Promise<{ items: GeneratedIdea[]; next: string | null }> {
  const response = await fetch(`/api/ideas${before ? `?before=${encodeURIComponent(before)}` : ''}`, { cache: 'no-store', credentials: 'same-origin', signal });
  const payload = await response.json() as { items: GeneratedIdea[]; next: string | null; error?: string };
  if (!response.ok) throw new Error(payload.error || 'Üretim geçmişi yüklenemedi.');
  return payload;
}
