import type { DeckWeek, WeeklyDeck } from './rebuild/weekly-deck-model';

export function greeting(date: Date, name?: string): string {
  const hour = date.getHours();
  const base = hour >= 5 && hour < 11 ? 'Günaydın' : hour >= 11 && hour < 17 ? 'Merhaba' : hour >= 17 && hour < 22 ? 'İyi akşamlar' : 'İyi geceler';
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? `${base}, ${first}` : base;
}

export type GoalRow = { id: string; name: string; done: number; target: number; complete: boolean };
export function weekGoalRows(week: DeckWeek | undefined): GoalRow[] {
  return (week?.goals ?? []).map(goal => {
    const done = Math.min(goal.target, week?.marks[goal.id]?.length ?? 0);
    return { id: goal.id, name: goal.name, done, target: goal.target, complete: done >= goal.target };
  });
}
export const XP_PER_STEP = 10;
export const weekXp = (rows: GoalRow[]) => rows.reduce((sum, row) => sum + row.done * XP_PER_STEP, 0);

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
// Consecutive days with at least one completed Rebuild step. Today may still be empty.
export function activeStreak(deck: WeeklyDeck, today: Date): number {
  const days = new Set<string>();
  for (const week of Object.values(deck.weeks)) for (const marks of Object.values(week.marks)) for (const mark of marks) {
    const at = new Date(mark.at);
    if (Number.isFinite(at.getTime())) days.add(dayKey(at));
  }
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}
