import { completeGoal, ensureWeek, undoCompletion } from '../rebuild/weekly-deck-model';
import type { WeeklyDeck } from '../rebuild/weekly-deck-model';
import type { GoalKind } from '../rebuild/idea-engine';

// Weekly program: editable block template + one small log per week.
// Every task is identified by "<originalDay>:<stepId>" (bonus: "<day>:<slot>:b"), so postponing
// never changes its key and editing text never loses what was already done.
export type Slot = 'am' | 'day' | 'pm';
export const slots: Slot[] = ['am', 'day', 'pm'];
export const slotLabels: Record<Slot, string> = { am: 'Sabah', day: 'Gün içi', pm: 'Akşam' };
export const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const dayShort = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export type Step = { id: string; t: string; text: string };
export type Block = { id: string; name: string; slot: Slot; kind?: GoalKind; steps: Step[] };
export type Template = { blocks: Block[]; week: Record<string, Partial<Record<Slot, string>>>; bonus: Record<Slot, string> };
export type WeekLog = { done: Record<string, string>; moved: Record<string, number>; days: Record<string, string>; breaks: Record<string, string> };
export type Profile = { bankedXp: number; badges: Record<string, string>; bestStreak: number };
export type Program = { version: 1; template: Template; weeks: Record<string, WeekLog>; profile: Profile };
export type Task = { key: string; day: number; slot: Slot; t: string; text: string; blockId: string; blockName: string; kind?: GoalKind; bonus: boolean; done: string | null; movedFrom?: number };

export const XP_STEP = 10, XP_BONUS = 20, XP_DAY = 50, XP_BREAK = 5, XP_LEVEL = 100;
export const titles = ['Uykucu', 'Erken Kuş', 'Düzenci', 'Ritimci', 'Odak Ustası', 'Denge Bekçisi', 'Zaman Ağası', 'Orbit Efsanesi'];

const kinds = ['body', 'english', 'make', 'research', 'social', 'any'];
const step = (id: string, t: string, text: string): Step => ({ id, t, text });
export function defaultTemplate(): Template {
  const blocks: Block[] = [
    { id: 'am-move', name: 'Sabah hareketi', slot: 'am', kind: 'body', steps: [step('a1', '06:30', 'Kalk, su iç, yüzünü yıka'), step('a2', '06:45', 'Isınma ve 30 dakika antrenman')] },
    { id: 'am-grow', name: 'Sabah gelişim', slot: 'am', kind: 'english', steps: [step('b1', '06:45', 'Yeni kelimeleri çalış (15 dk)'), step('b2', '07:05', 'Sesli konuşma provası (10 dk)')] },
    { id: 'am-easy', name: 'Sabah esnek', slot: 'am', steps: [step('c1', '07:00', 'Günün en önemli işini seç'), step('c2', '07:10', 'Rahat bir kahvaltı')] },
    { id: 'day-focus', name: 'Odak günü', slot: 'day', steps: [step('d1', '09:00', 'İlk odak bloğu (90 dk)'), step('d2', '11:00', 'Kısa mola ve yürüyüş'), step('d3', '14:00', 'İkinci odak bloğu (90 dk)')] },
    { id: 'pm-social', name: 'Akşam sosyal', slot: 'pm', kind: 'social', steps: [step('e1', '19:00', 'Biriyle görüş ya da sesli konuş')] },
    { id: 'pm-research', name: 'Akşam araştırma', slot: 'pm', kind: 'research', steps: [step('f1', '20:30', 'Merak ettiğin bir konuyu 30 dk araştır')] },
    { id: 'pm-make', name: 'Akşam üretim', slot: 'pm', kind: 'make', steps: [step('g1', '20:30', 'Küçük bir şey üret (30 dk)')] },
    { id: 'pm-free', name: 'Akşam serbest', slot: 'pm', steps: [step('h1', '21:00', 'Kitap, film ya da sadece dinlen')] },
  ];
  const week: Template['week'] = {
    '0': { am: 'am-move', day: 'day-focus', pm: 'pm-research' }, '1': { am: 'am-grow', day: 'day-focus', pm: 'pm-free' },
    '2': { am: 'am-move', day: 'day-focus', pm: 'pm-social' }, '3': { am: 'am-grow', day: 'day-focus', pm: 'pm-make' },
    '4': { am: 'am-move', day: 'day-focus', pm: 'pm-social' }, '5': { am: 'am-easy', pm: 'pm-free' }, '6': { am: 'am-easy', pm: 'pm-research' },
  };
  return { blocks, week, bonus: { am: 'Telefonsuz ilk 30 dakika', day: '', pm: 'Zamanında yat' } };
}
export const emptyWeek = (): WeekLog => ({ done: {}, moved: {}, days: {}, breaks: {} });
export const emptyProgram = (): Program => ({ version: 1, template: defaultTemplate(), weeks: {}, profile: { bankedXp: 0, badges: {}, bestStreak: 0 } });

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,40}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const safeKey = (value: string) => /^[\w:-]{1,60}$/.test(value) && !value.includes('__proto__');
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const isSlot = (value: unknown): value is Slot => value === 'am' || value === 'day' || value === 'pm';
const validMonday = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).getUTCDay() === 1;
const count = (value: unknown, max: number) => Math.min(max, Math.max(0, Math.floor(Number(value)) || 0));

function normalizeTemplate(value: unknown): Template {
  const saved = record(value);
  if (!Array.isArray(saved.blocks)) return defaultTemplate();
  const used = new Set<string>();
  const blocks: Block[] = [];
  for (const raw of saved.blocks.slice(0, 40)) {
    const item = record(raw);
    if (!safeId(item.id) || used.has(item.id) || !isSlot(item.slot)) continue;
    used.add(item.id);
    const stepIds = new Set<string>();
    const steps = (Array.isArray(item.steps) ? item.steps : []).slice(0, 25).flatMap((entry: unknown) => {
      const s = record(entry);
      if (!safeId(s.id) || stepIds.has(s.id) || !text(s.text, 140)) return [];
      stepIds.add(s.id);
      return [{ id: s.id, t: text(s.t, 12), text: text(s.text, 140) }];
    });
    blocks.push({ id: item.id, name: text(item.name, 40) || 'Blok', slot: item.slot, ...(kinds.includes(String(item.kind)) ? { kind: item.kind as GoalKind } : {}), steps });
  }
  const week: Template['week'] = {};
  const savedWeek = record(saved.week);
  for (let day = 0; day < 7; day++) {
    const row = record(savedWeek[String(day)]);
    const out: Partial<Record<Slot, string>> = {};
    for (const slot of slots) { const id = row[slot]; if (typeof id === 'string' && blocks.some(b => b.id === id && b.slot === slot)) out[slot] = id; }
    week[String(day)] = out;
  }
  const bonus = record(saved.bonus);
  return { blocks, week, bonus: { am: text(bonus.am, 80), day: text(bonus.day, 80), pm: text(bonus.pm, 80) } };
}
export function normalizeProgram(value: unknown): Program {
  const saved = record(value);
  const weeks: Program['weeks'] = {};
  for (const [key, raw] of Object.entries(record(saved.weeks)).slice(0, 400)) {
    if (!validMonday(key)) continue;
    const log = record(raw);
    const done: WeekLog['done'] = {}; const moved: WeekLog['moved'] = {}; const days: WeekLog['days'] = {};
    for (const [k, v] of Object.entries(record(log.done))) if (safeKey(k) && typeof v === 'string') done[k] = v.slice(0, 24);
    for (const [k, v] of Object.entries(record(log.moved))) if (safeKey(k) && Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 6) moved[k] = v as number;
    for (const [k, v] of Object.entries(record(log.days))) if (/^[0-6]$/.test(k) && typeof v === 'string') days[k] = v.slice(0, 24);
    // Breaks are id-keyed events so two devices adding one each merge to two. Old numeric counts become stable legacy ids.
    const breaks: WeekLog['breaks'] = {};
    if (typeof log.breaks === 'number') for (let i = 1; i <= count(log.breaks, 200); i++) breaks[`legacy${i}`] = '';
    else for (const [k, v] of Object.entries(record(log.breaks)).slice(0, 200)) if (safeId(k) && typeof v === 'string') breaks[k] = v.slice(0, 24);
    weeks[key] = { done, moved, days, breaks };
  }
  const profile = record(saved.profile);
  const badges: Record<string, string> = {};
  for (const [k, v] of Object.entries(record(profile.badges))) if (safeId(k) && typeof v === 'string') badges[k] = v.slice(0, 24);
  return { version: 1, template: normalizeTemplate(saved.template), weeks, profile: { bankedXp: count(profile.bankedXp, 10_000_000), badges, bestStreak: count(profile.bestStreak, 400) } };
}

// ---- Dates ----
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKeyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export function weekKeyOf(date: Date): string {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return dayKeyOf(start);
}
export const dayIndexOf = (date: Date) => (date.getDay() + 6) % 7;
export function addDays(weekKey: string, days: number): string {
  const [y, m, d] = weekKey.split('-').map(Number);
  return dayKeyOf(new Date(y, m - 1, d + days));
}
const stamp = (now: Date) => `${dayKeyOf(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

// ---- Reading ----
const logOf = (program: Program, weekKey: string): WeekLog => program.weeks[weekKey] ?? emptyWeek();
export function allTasks(program: Program, weekKey: string): Task[] {
  const log = logOf(program, weekKey);
  const out: Task[] = [];
  for (let day = 0; day < 7; day++) {
    for (const slot of slots) {
      const block = program.template.blocks.find(b => b.id === program.template.week[String(day)]?.[slot]);
      for (const s of block?.steps ?? []) {
        const key = `${day}:${s.id}`;
        out.push({ key, day, slot, t: s.t, text: s.text, blockId: block!.id, blockName: block!.name, kind: block!.kind, bonus: false, done: log.done[key] ?? null });
      }
      const bonus = program.template.bonus[slot];
      if (bonus) out.push({ key: `${day}:${slot}:b`, day, slot, t: '', text: bonus, blockId: '', blockName: 'Bonus', bonus: true, done: log.done[`${day}:${slot}:b`] ?? null });
    }
  }
  return out;
}
export const effectiveDay = (program: Program, weekKey: string, task: Task) => task.bonus ? task.day : logOf(program, weekKey).moved[task.key] ?? task.day;
export function dayTasks(program: Program, weekKey: string, day: number): Task[] {
  return allTasks(program, weekKey)
    .filter(task => effectiveDay(program, weekKey, task) === day)
    .map(task => (effectiveDay(program, weekKey, task) !== task.day ? { ...task, movedFrom: task.day } : task));
}
export function dayStats(program: Program, weekKey: string, day: number) {
  const regular = dayTasks(program, weekKey, day).filter(task => !task.bonus);
  const done = regular.filter(task => task.done).length;
  return { total: regular.length, done, complete: regular.length > 0 && done === regular.length };
}

export function weekXp(log: WeekLog): number {
  let xp = 0;
  for (const key of Object.keys(log.done)) xp += key.endsWith(':b') ? XP_BONUS : XP_STEP;
  return xp + Object.keys(log.days).length * XP_DAY + Object.keys(log.breaks).length * XP_BREAK;
}
export const totalXp = (program: Program) => program.profile.bankedXp + Object.values(program.weeks).reduce((sum, log) => sum + weekXp(log), 0);
export function levelOf(xp: number) {
  const level = Math.floor(xp / XP_LEVEL) + 1;
  return { level, title: titles[Math.min(titles.length, level) - 1], inLevel: xp % XP_LEVEL, step: XP_LEVEL };
}
export function currentStreak(program: Program, today: Date): number {
  const complete = (date: Date) => Boolean(program.weeks[weekKeyOf(date)]?.days[String(dayIndexOf(date))]);
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  if (!complete(cursor)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (complete(cursor) && streak < 4000) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

// ---- Badges ----
export type Badge = { id: string; name: string; hint: string; test: (program: Program, deck: WeeklyDeck) => boolean };
const eachWeek = (program: Program) => Object.keys(program.weeks);
const slotComplete = (program: Program, slot: Slot) => eachWeek(program).some(weekKey => {
  for (let day = 0; day < 7; day++) { const tasks = dayTasks(program, weekKey, day).filter(t => t.slot === slot && !t.bonus); if (tasks.length && tasks.every(t => t.done)) return true; }
  return false;
});
export const badges: Badge[] = [
  { id: 'first', name: 'İlk Adım', hint: 'İlk görevini tamamla', test: p => eachWeek(p).some(k => Object.keys(p.weeks[k].done).length > 0) },
  { id: 'morning', name: 'Sabah Kuşu', hint: 'Bir günün tüm sabah görevlerini bitir', test: p => slotComplete(p, 'am') },
  { id: 'evening', name: 'Gece Bekçisi', hint: 'Bir günün tüm akşam görevlerini bitir', test: p => slotComplete(p, 'pm') },
  { id: 'fullday', name: 'Tam Gün', hint: 'Bir günü baştan sona bitir', test: p => eachWeek(p).some(k => Object.keys(p.weeks[k].days).length > 0) },
  { id: 'streak3', name: 'Seri Avcısı', hint: '3 gün üst üste tam gün', test: p => p.profile.bestStreak >= 3 },
  { id: 'week', name: 'Hafta Şampiyonu', hint: 'Bir haftanın 7 gününü bitir', test: p => eachWeek(p).some(k => Object.keys(p.weeks[k].days).length >= 7) },
  { id: 'bonus5', name: 'Bonus Avcısı', hint: '5 bonus görev tamamla', test: p => eachWeek(p).reduce((n, k) => n + Object.keys(p.weeks[k].done).filter(key => key.endsWith(':b')).length, 0) >= 5 },
  { id: 'goals', name: 'Hedef Ustası', hint: 'Haftanın tüm Rebuild hedeflerini tamamla', test: (_p, deck) => Object.values(deck.weeks).some(w => w.goals.length > 0 && w.goals.every(g => (w.marks[g.id]?.length ?? 0) >= g.target)) },
  { id: 'rest', name: 'Mola Ustası', hint: '3 mola tamamla', test: p => eachWeek(p).reduce((n, k) => n + Object.keys(p.weeks[k].breaks).length, 0) >= 3 },
];

// ---- Actions (pure) ----
export type Events = { xp: number; dayComplete: boolean; levelUp: { level: number; title: string } | null; newBadges: Badge[]; completed: boolean };
export type Result = { program: Program; deck: WeeklyDeck; events: Events };
const noEvents = (): Events => ({ xp: 0, dayComplete: false, levelUp: null, newBadges: [], completed: false });
const withWeek = (program: Program, weekKey: string, log: WeekLog): Program => ({ ...program, weeks: { ...program.weeks, [weekKey]: log } });

function settle(before: Program, after: Program, deck: WeeklyDeck, now: Date, events: Events): Result {
  let program = after;
  const earned = badges.filter(badge => !program.profile.badges[badge.id] && badge.test(program, deck));
  if (earned.length) program = { ...program, profile: { ...program.profile, badges: { ...program.profile.badges, ...Object.fromEntries(earned.map(b => [b.id, stamp(now)])) } } };
  const beforeLevel = levelOf(totalXp(before)).level, afterLevel = levelOf(totalXp(program)).level;
  return { program, deck, events: { ...events, newBadges: earned, levelUp: afterLevel > beforeLevel ? { level: afterLevel, title: levelOf(totalXp(program)).title } : null, xp: totalXp(program) - totalXp(before) } };
}
// One Rebuild mark per block per day: a two-step workout is one workout, not two.
function bridgeMark(deck: WeeklyDeck, weekKey: string, task: Task, now: Date, add: boolean, siblingsDone: number): WeeklyDeck {
  if (!task.kind || task.kind === 'any' || siblingsDone > 0) return deck;
  const id = `prog:${task.day}:${task.blockId}`;
  const base = ensureWeek(deck, weekKey);
  const goal = base.weeks[weekKey]?.goals.find(item => item.kind === task.kind);
  if (!goal) return deck;
  return add ? completeGoal(base, weekKey, goal.id, { id, at: now.toISOString() }) : undoCompletion(base, weekKey, goal.id, id);
}

export function toggleTask(program: Program, deck: WeeklyDeck, weekKey: string, key: string, now: Date): Result {
  const task = allTasks(program, weekKey).find(item => item.key === key);
  if (!task) return { program, deck, events: noEvents() };
  const log = logOf(program, weekKey);
  const day = effectiveDay(program, weekKey, task);
  const done = { ...log.done }; const days = { ...log.days };
  const completing = !done[key];
  if (completing) done[key] = stamp(now); else delete done[key];
  let next = withWeek(program, weekKey, { ...log, done, days });
  const stats = dayStats(next, weekKey, day);
  let dayComplete = false;
  if (completing && stats.complete && !days[String(day)]) { days[String(day)] = stamp(now); dayComplete = true; }
  if (!completing && !stats.complete && days[String(day)]) delete days[String(day)];
  next = withWeek(program, weekKey, { ...log, done, days });
  next = { ...next, profile: { ...next.profile, bestStreak: Math.max(next.profile.bestStreak, currentStreak(next, dateOf(weekKey, day))) } };
  const siblingsDone = allTasks(next, weekKey).filter(t => !t.bonus && t.blockId === task.blockId && t.day === task.day && t.key !== key && t.done).length;
  return settle(program, next, bridgeMark(deck, weekKey, task, now, completing, siblingsDone), now, { ...noEvents(), dayComplete, completed: completing });
}
const dateOf = (weekKey: string, day: number) => { const [y, m, d] = addDays(weekKey, day).split('-').map(Number); return new Date(y, m - 1, d, 12); };

export function postpone(program: Program, weekKey: string, key: string, toDay: number): Program {
  const task = allTasks(program, weekKey).find(item => item.key === key);
  if (!task || task.bonus || task.done || !Number.isInteger(toDay) || toDay < 0 || toDay > 6) return program;
  const log = logOf(program, weekKey);
  const moved = { ...log.moved };
  if (toDay === task.day) delete moved[key]; else moved[key] = toDay;
  const next = withWeek(program, weekKey, { ...log, moved });
  // A day that gained an open task is no longer complete.
  const days = { ...log.days };
  for (const day of [toDay]) if (days[String(day)] && !dayStats(next, weekKey, day).complete) delete days[String(day)];
  return withWeek(program, weekKey, { ...log, moved, days });
}
export function pullToToday(program: Program, weekKey: string, today: number): { program: Program; moved: number } {
  let next = program; let moved = 0;
  for (const task of allTasks(program, weekKey)) {
    const day = effectiveDay(program, weekKey, task);
    if (!task.bonus && !task.done && day < today) { next = postpone(next, weekKey, task.key, today); moved++; }
  }
  return { program: next, moved };
}
export function addBreak(program: Program, deck: WeeklyDeck, weekKey: string, now: Date): Result {
  const log = logOf(program, weekKey);
  return settle(program, withWeek(program, weekKey, { ...log, breaks: { ...log.breaks, [`m${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`]: stamp(now) } }), deck, now, noEvents());
}
// Old weeks keep only the day-complete record (streaks); their XP moves to the profile.
export function compactWeeks(program: Program, keepWeeks: number, now: Date): Program {
  const limit = addDays(weekKeyOf(now), -7 * keepWeeks);
  const weeks: Program['weeks'] = {}; let banked = 0;
  for (const [key, log] of Object.entries(program.weeks)) {
    if (key < limit && (Object.keys(log.done).length || Object.keys(log.moved).length || Object.keys(log.breaks).length)) { banked += weekXp(log) - Object.keys(log.days).length * XP_DAY; weeks[key] = { done: {}, moved: {}, days: log.days, breaks: {} }; }
    else weeks[key] = log;
  }
  return { ...program, weeks, profile: { ...program.profile, bankedXp: program.profile.bankedXp + banked } };
}

// ---- Template editing ----
const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;
const mapBlocks = (program: Program, fn: (blocks: Block[]) => Block[]): Program => normalizeProgram({ ...program, template: { ...program.template, blocks: fn(program.template.blocks) } });
export const addBlock = (program: Program, slot: Slot): Program => mapBlocks(program, blocks => [...blocks, { id: uid('b'), name: 'Yeni blok', slot, steps: [] }]);
export const updateBlock = (program: Program, id: string, patch: Partial<Pick<Block, 'name' | 'kind'>>): Program => mapBlocks(program, blocks => blocks.map(b => b.id === id ? { ...b, ...patch } : b));
export const removeBlock = (program: Program, id: string): Program => mapBlocks(program, blocks => blocks.filter(b => b.id !== id));
export const addStep = (program: Program, blockId: string, t: string, body: string): Program => mapBlocks(program, blocks => blocks.map(b => b.id === blockId ? { ...b, steps: [...b.steps, { id: uid('s'), t, text: body }] } : b));
export const updateStep = (program: Program, blockId: string, stepId: string, patch: Partial<Pick<Step, 't' | 'text'>>): Program => mapBlocks(program, blocks => blocks.map(b => b.id === blockId ? { ...b, steps: b.steps.map(s => s.id === stepId ? { ...s, ...patch } : s) } : b));
export const removeStep = (program: Program, blockId: string, stepId: string): Program => mapBlocks(program, blocks => blocks.map(b => b.id === blockId ? { ...b, steps: b.steps.filter(s => s.id !== stepId) } : b));
export const assignBlock = (program: Program, day: number, slot: Slot, blockId: string): Program => normalizeProgram({ ...program, template: { ...program.template, week: { ...program.template.week, [String(day)]: { ...program.template.week[String(day)], [slot]: blockId || undefined } } } });
export const setBonus = (program: Program, slot: Slot, value: string): Program => normalizeProgram({ ...program, template: { ...program.template, bonus: { ...program.template.bonus, [slot]: value } } });
export const resetTemplate = (program: Program): Program => ({ ...program, template: defaultTemplate() });
