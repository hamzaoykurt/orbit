import { isIdea } from './idea-engine';
import type { GoalKind, Idea } from './idea-engine';

export type WeeklyGoal = { id: string; name: string; target: number; kind: GoalKind };
export type Completion = { id: string; at: string; idea?: Idea };
export type DeckWeek = { goals: WeeklyGoal[]; marks: Record<string, Completion[]>; ideas: Record<string, Idea> };
export type WeeklyDeck = { version: 1; startedOn: string; defaults: WeeklyGoal[]; weeks: Record<string, DeckWeek>; seenIdeas: string[] };
export type LegacyActivity = { id: string; date: string; areaId: string; title: string };
export type WeekSeed = { activities: LegacyActivity[]; selections: Record<string,string>; curiosity?: string; creation?: string };
export const defaultGoals: WeeklyGoal[] = [
  { id:'body', name:'Spor', target:3, kind:'body' },
  { id:'english', name:'English', target:2, kind:'english' },
  { id:'make', name:'Üret', target:1, kind:'make' },
  { id:'research', name:'Araştır', target:1, kind:'research' },
  { id:'social', name:'Dışarı çık / sosyalleş', target:1, kind:'social' },
];
export const emptyDeck = (): WeeklyDeck => ({version:1,startedOn:'',defaults:defaultGoals.map(goal=>({...goal})),weeks:{},seenIdeas:[]});
const record = (value: unknown): Record<string,unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const validDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const validWeek = (value: string) => validDay(value) && new Date(value).getUTCDay() === 1;
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]+$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
const cleanGoals = (value: unknown): WeeklyGoal[] => {
  const used = new Set<string>();
  return (Array.isArray(value) ? value : []).flatMap((entry: unknown) => {
    const item = record(entry);
    if (!safeId(item.id) || used.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) return [];
    used.add(item.id);
    return [{id:item.id,name:item.name.trim().slice(0,80),target:Math.min(99,Math.max(1,Math.floor(Number(item.target)||1))),kind:['body','english','make','research','social','any'].includes(String(item.kind)) ? item.kind as GoalKind : 'any' as const}];
  });
};
export function normalizeDeck(value: unknown): WeeklyDeck {
  const base = emptyDeck();
  const saved = record(value);
  const weeks: Record<string,DeckWeek> = {};
  for (const [key,raw] of Object.entries(record(saved.weeks))) {
    if (!validWeek(key)) continue;
    const week = record(raw);
    const marks: DeckWeek['marks'] = {};
    for (const [id,entries] of Object.entries(record(week.marks))) {
      if (!safeId(id)) continue;
      const ids = new Set<string>();
      marks[id] = (Array.isArray(entries) ? entries : []).flatMap(entry => {
        const mark = record(entry);
        if (typeof mark.id !== 'string' || typeof mark.at !== 'string' || ids.has(mark.id)) return [];
        ids.add(mark.id);
        return [{id:mark.id,at:mark.at,...(isIdea(mark.idea)?{idea:mark.idea}:{})}];
      });
    }
    const ideas = Object.fromEntries(Object.entries(record(week.ideas)).filter(([id,idea])=>safeId(id) && isIdea(idea))) as DeckWeek['ideas'];
    weeks[key] = {goals:cleanGoals(week.goals),marks,ideas};
  }
  return {version:1,startedOn:validDay(saved.startedOn)?saved.startedOn:'',defaults:Array.isArray(saved.defaults)?cleanGoals(saved.defaults):base.defaults,weeks,seenIdeas:Array.isArray(saved.seenIdeas)?saved.seenIdeas.filter((id): id is string=>typeof id==='string').slice(-100):[]};
}
const legacyKind = (entry: LegacyActivity): GoalKind => {
  if (entry.areaId === 'body') return 'body';
  if (entry.areaId === 'language' && !/diksiyon|ses kaydı|ses provası/i.test(entry.title)) return 'english';
  if (['curiosity','space'].includes(entry.areaId)) return 'research';
  if (entry.areaId === 'creativity') return 'make';
  if (['social','solo'].includes(entry.areaId)) return 'social';
  return 'any';
};
export function weekView(deck: WeeklyDeck, key: string, seed?: WeekSeed): DeckWeek {
  if (deck.weeks[key]) return deck.weeks[key];
  const goals = deck.defaults.map(goal=>({...goal}));
  const marks: DeckWeek['marks'] = {};
  const ideas: DeckWeek['ideas'] = {};
  if (seed) for (const goal of goals) {
    marks[goal.id] = seed.activities.filter(entry=>validDay(entry.date) && entry.date >= key && Date.parse(entry.date)-Date.parse(key)<7*86400000 && legacyKind(entry)===goal.kind && goal.kind!=='any').map(entry=>({id:entry.id,at:entry.date}));
    const text = goal.kind==='research' ? seed.curiosity || seed.selections[`${key}-curiosity`] : goal.kind==='make' ? seed.creation || seed.selections[`${key}-creative`] : goal.kind==='social' ? seed.selections[`${key}-solo`] : '';
    if (text) ideas[goal.id]={id:`legacy-${key}-${goal.id}`,kind:goal.kind==='research'?'RESEARCH':goal.kind==='social'?'GO':'MAKE',goal:goal.kind as Idea['goal'],text};
  }
  return {goals,marks,ideas};
}
export function ensureWeek(deck: WeeklyDeck, key: string, seed?: WeekSeed): WeeklyDeck {
  if (!validWeek(key)) throw new Error('Geçerli bir hafta gerekli.');
  if (deck.weeks[key] && deck.startedOn) return deck;
  return {...deck,startedOn:deck.startedOn||key,weeks:{...deck.weeks,[key]:weekView(deck,key,seed)}};
}
export function completeGoal(deck: WeeklyDeck, key: string, goalId: string, mark: Completion): WeeklyDeck {
  const week = deck.weeks[key];
  const goal = week?.goals.find(item=>item.id===goalId);
  const marks = week?.marks[goalId] ?? [];
  if (!goal || marks.length>=goal.target || marks.some(item=>item.id===mark.id)) return deck;
  return {...deck,weeks:{...deck.weeks,[key]:{...week,marks:{...week.marks,[goalId]:[...marks,mark]}}}};
}
export function undoCompletion(deck: WeeklyDeck, key: string, goalId: string, markId?: string): WeeklyDeck {
  const week = deck.weeks[key];
  const marks = week?.marks[goalId] ?? [];
  if (!week || !marks.length) return deck;
  const remove = markId ?? marks.at(-1)!.id;
  return {...deck,weeks:{...deck.weeks,[key]:{...week,marks:{...week.marks,[goalId]:marks.filter(mark=>mark.id!==remove)}}}};
}
export function configureGoals(deck: WeeklyDeck, key: string, goals: WeeklyGoal[]): WeeklyDeck {
  const next = cleanGoals(goals);
  const week = weekView(deck,key);
  // Only this week and future defaults change. Past names, targets and evidence stay intact.
  return {...deck,defaults:next,weeks:{...deck.weeks,[key]:{...week,goals:next.map(goal=>({...goal}))}}};
}
export function rememberIdea(deck: WeeklyDeck, id: string): WeeklyDeck {
  return {...deck,seenIdeas:[...deck.seenIdeas.filter(item=>item!==id),id].slice(-100)};
}
export function attachIdea(deck: WeeklyDeck, key: string, idea: Idea, goalId?: string): WeeklyDeck {
  const week = weekView(deck,key);
  let goal = week.goals.find(item=>goalId ? item.id===goalId : item.kind===idea.goal);
  let goals = week.goals;
  // A removed default is never silently restored for future weeks.
  if (!goal) {
    goal = {...defaultGoals.find(item=>item.kind===idea.goal)!,id:`extra-${idea.goal}`,target:1};
    goals = [...goals,goal];
  }
  const count = week.marks[goal.id]?.length ?? 0;
  if (count>=goal.target && week.ideas[goal.id]?.id !== idea.id) goals=goals.map(item=>item.id===goal.id?{...item,target:count+1}:item);
  return {...rememberIdea(deck,idea.id),weeks:{...deck.weeks,[key]:{...week,goals,ideas:{...week.ideas,[goal.id]:idea}}}};
}
