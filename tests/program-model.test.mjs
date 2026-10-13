import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';
const M = await import(loadModuleUrl(new URL('../app/program/program-model.ts', import.meta.url)));
const D = await import(loadModuleUrl(new URL('../app/rebuild/weekly-deck-model.ts', import.meta.url)));

const monday = new Date(2026, 9, 12, 8, 0); // Mon 2026-10-12
const week = '2026-10-12';
const fresh = () => ({ program: M.emptyProgram(), deck: D.emptyDeck() });
const at = (day, hour = 8) => new Date(2026, 9, 12 + day, hour, 0);

test('default template is generic, valid and survives normalizeProgram unchanged', () => {
  const program = M.emptyProgram();
  assert.deepEqual(M.normalizeProgram(program), program);
  assert.deepEqual(M.normalizeProgram(undefined), program);
  assert.deepEqual(M.normalizeProgram(JSON.parse(JSON.stringify(program))), program);
  const text = JSON.stringify(program.template).toLocaleLowerCase('tr');
  for (const personal of ['mobile', 'legends', 'ezan', 'cs ile']) assert.ok(!text.includes(personal), personal);
});

test('normalizeProgram drops hostile or broken data but keeps valid progress', () => {
  const dirty = {
    template: { blocks: [{ id: '__proto__', name: 'x', slot: 'am', steps: [] }, { id: 'ok', name: 'N'.repeat(100), slot: 'pm', kind: 'nope', steps: [{ id: 's', t: '1', text: 'Yap' }, { id: 's', t: '', text: 'dup' }, { id: 'e', t: '', text: '  ' }] }], week: { 0: { pm: 'ok', am: 'ok' }, 9: { pm: 'ok' } }, bonus: { am: 5, pm: 'Yat' } },
    weeks: { '2026-10-12': { done: { '0:s': '2026-10-12T08:00', '__proto__': 'x', 'bad key!': 'y' }, moved: { '0:s': 9, '1:s': 3 }, days: { 0: 'z', 8: 'q' }, breaks: -4 }, '2026-10-13': { done: { a: 'b' } } },
    profile: { bankedXp: 'abc', badges: { first: '2026-10-12T08:00', '__proto__': 'x' }, bestStreak: 5 },
  };
  const out = M.normalizeProgram(dirty);
  assert.deepEqual(out.template.blocks.map(b => b.id), ['ok']);
  assert.equal(out.template.blocks[0].name.length, 40);
  assert.equal(out.template.blocks[0].kind, undefined);
  assert.deepEqual(out.template.blocks[0].steps.map(s => s.id), ['s']);
  assert.deepEqual(out.template.week['0'], { pm: 'ok' });
  assert.equal(out.template.bonus.am, '');
  assert.deepEqual(Object.keys(out.weeks), ['2026-10-12']);
  assert.deepEqual(out.weeks[week].done, { '0:s': '2026-10-12T08:00' });
  assert.deepEqual(out.weeks[week].moved, { '1:s': 3 });
  assert.deepEqual(out.weeks[week].days, { 0: 'z' });
  assert.equal(out.weeks[week].breaks, 0);
  assert.equal(out.profile.bankedXp, 0);
  assert.deepEqual(Object.keys(out.profile.badges), ['first']);
  assert.equal(out.profile.bestStreak, 5);
});

test('week keys follow Monday and a new week starts empty while old data stays', () => {
  assert.equal(M.weekKeyOf(new Date(2026, 9, 18, 23, 59)), '2026-10-12');
  assert.equal(M.weekKeyOf(new Date(2026, 9, 19, 0, 1)), '2026-10-19');
  assert.equal(M.dayIndexOf(new Date(2026, 9, 18)), 6);
  assert.equal(M.addDays('2026-10-26', -14), '2026-10-12');
  let { program, deck } = fresh();
  ({ program, deck } = M.toggleTask(program, deck, week, '0:a1', monday));
  assert.equal(M.dayTasks(program, '2026-10-19', 0).filter(t => t.done).length, 0);
  assert.equal(M.dayTasks(program, week, 0).filter(t => t.done).length, 1);
});

test('completing, undoing and the day-complete award keep XP consistent', () => {
  let { program, deck } = fresh();
  const tasks = M.dayTasks(program, week, 5).filter(t => !t.bonus);
  assert.ok(tasks.length >= 2);
  let last;
  for (const task of tasks) { last = M.toggleTask(program, deck, week, task.key, at(5)); program = last.program; deck = last.deck; }
  assert.equal(last.events.dayComplete, true);
  assert.equal(M.totalXp(program), tasks.length * M.XP_STEP + M.XP_DAY);
  assert.ok(M.dayStats(program, week, 5).complete);
  const undo = M.toggleTask(program, deck, week, tasks[0].key, at(5));
  assert.equal(M.totalXp(undo.program), (tasks.length - 1) * M.XP_STEP);
  assert.equal(Object.keys(undo.program.weeks[week].days).length, 0);
  const bonus = M.toggleTask(program, deck, week, '5:am:b', at(5)).program;
  assert.equal(M.totalXp(bonus), tasks.length * M.XP_STEP + M.XP_DAY + M.XP_BONUS);
});

test('postponing moves an open task to the chosen day, keeps its key, and refuses done or bonus tasks', () => {
  let { program, deck } = fresh();
  const key = '0:d1';
  program = M.postpone(program, week, key, 3);
  assert.ok(!M.dayTasks(program, week, 0).some(t => t.key === key));
  const moved = M.dayTasks(program, week, 3).find(t => t.key === key);
  assert.equal(moved.movedFrom, 0);
  program = M.postpone(program, week, key, 0);
  assert.ok(M.dayTasks(program, week, 0).some(t => t.key === key));
  program = M.toggleTask(program, deck, week, key, monday).program;
  assert.equal(M.postpone(program, week, key, 2), program);
  assert.equal(M.postpone(program, week, '1:am:b', 2), program);
  assert.equal(M.postpone(program, week, 'nope', 2), program);
});

test('pulling yesterdays leftovers to today moves only earlier open regular tasks', () => {
  let { program, deck } = fresh();
  program = M.toggleTask(program, deck, week, '0:a1', monday).program;
  const result = M.pullToToday(program, week, 2);
  const openBefore = [0, 1].flatMap(day => M.dayTasks(program, week, day)).filter(t => !t.bonus && !t.done).length;
  assert.equal(result.moved, openBefore);
  assert.ok(M.dayTasks(result.program, week, 2).some(t => t.movedFrom === 0));
  assert.ok(M.dayTasks(result.program, week, 0).every(t => t.bonus || t.done));
  assert.ok(M.dayTasks(result.program, week, 2).some(t => t.bonus), 'bonus stays');
});

test('a moved-in task reopens a finished day and cancels its award', () => {
  let { program, deck } = fresh();
  for (const t of M.dayTasks(program, week, 5).filter(t => !t.bonus)) program = M.toggleTask(program, deck, week, t.key, at(5)).program;
  assert.ok(program.weeks[week].days['5']);
  program = M.postpone(program, week, '0:d1', 5);
  assert.equal(program.weeks[week].days['5'], undefined);
});

test('Rebuild bridge adds one deterministic mark per task, never twice, and undo removes it', () => {
  let { program, deck } = fresh();
  const spor = key => deck.weeks[week]?.marks.body?.length ?? 0;
  let r = M.toggleTask(program, deck, week, '0:a1', monday); program = r.program; deck = r.deck;
  assert.equal(spor(), 1);
  assert.equal(deck.weeks[week].marks.body[0].id, 'prog:0:a1');
  r = M.toggleTask(program, deck, week, '0:a1', monday); program = r.program; deck = r.deck;
  assert.equal(spor(), 0);
  // a manual Rebuild mark and the program mark are different ids; the goal target caps the total.
  deck = D.completeGoal(D.ensureWeek(deck, week), week, 'body', { id: 'manual-1', at: monday.toISOString() });
  for (const key of ['0:a1', '0:a2', '2:a1', '2:a2']) { r = M.toggleTask(program, deck, week, key, monday); program = r.program; deck = r.deck; }
  assert.equal(spor(), 3, 'target is 3');
  // tasks without a goal kind never touch Rebuild
  const before = JSON.stringify(deck);
  r = M.toggleTask(program, deck, week, '0:c1', monday);
  assert.equal(JSON.stringify(r.deck), before);
});

test('levels, titles and streaks', () => {
  assert.deepEqual(M.levelOf(0), { level: 1, title: 'Uykucu', inLevel: 0, step: 100 });
  assert.equal(M.levelOf(250).level, 3);
  assert.equal(M.levelOf(99999).title, 'Orbit Efsanesi');
  let { program, deck } = fresh();
  for (const day of [3, 4, 5]) for (const t of M.dayTasks(program, week, day).filter(t => !t.bonus)) { const r = M.toggleTask(program, deck, week, t.key, at(day)); program = r.program; deck = r.deck; }
  assert.equal(M.currentStreak(program, at(5)), 3);
  assert.equal(M.currentStreak(program, at(6)), 3, 'today may still be empty');
  assert.equal(M.currentStreak(program, at(7)), 0);
  assert.equal(program.profile.bestStreak, 3);
  assert.ok(program.profile.badges.streak3 && program.profile.badges.first && program.profile.badges.fullday);
});

test('streak continues across the week boundary', () => {
  let { program, deck } = fresh();
  for (const day of [6, 7]) { const w = M.weekKeyOf(at(day)); for (const t of M.dayTasks(program, w, M.dayIndexOf(at(day))).filter(t => !t.bonus)) { const r = M.toggleTask(program, deck, w, t.key, at(day)); program = r.program; deck = r.deck; } }
  assert.equal(M.currentStreak(program, at(7)), 2);
});

test('badge events fire once and breaks give XP', () => {
  let { program, deck } = fresh();
  let r = M.toggleTask(program, deck, week, '0:a1', monday);
  assert.deepEqual(r.events.newBadges.map(b => b.id), ['first']);
  r = M.toggleTask(r.program, r.deck, week, '0:a2', monday);
  assert.deepEqual(r.events.newBadges.map(b => b.id), ['morning']);
  r = M.toggleTask(r.program, r.deck, week, '0:b1', monday);
  assert.deepEqual(r.events.newBadges, []);
  program = r.program; deck = r.deck;
  for (let i = 0; i < 3; i++) { r = M.addBreak(program, deck, week, monday); program = r.program; }
  assert.ok(program.profile.badges.rest);
  assert.equal(M.weekXp(program.weeks[week]), 2 * M.XP_STEP + 3 * M.XP_BREAK);
});

test('template editing: blocks, steps, assignment and bonus stay valid; deleting a block clears its days', () => {
  let { program } = fresh();
  program = M.addBlock(program, 'pm');
  const block = program.template.blocks.at(-1);
  program = M.updateBlock(program, block.id, { name: 'Yürüyüş', kind: 'body' });
  program = M.addStep(program, block.id, '18:00', 'Parkta yürü');
  const stepId = M.normalizeProgram(program).template.blocks.at(-1).steps[0].id;
  program = M.updateStep(program, block.id, stepId, { text: 'Sahilde yürü' });
  program = M.assignBlock(program, 1, 'pm', block.id);
  assert.equal(M.dayTasks(program, week, 1).find(t => t.blockId === block.id).text, 'Sahilde yürü');
  assert.equal(M.assignBlock(program, 1, 'am', block.id).template.week['1'].am, undefined, 'slot must match');
  program = M.setBonus(program, 'day', 'Su iç');
  assert.ok(M.dayTasks(program, week, 2).some(t => t.bonus && t.text === 'Su iç'));
  program = M.removeStep(program, block.id, stepId);
  assert.equal(M.dayTasks(program, week, 1).filter(t => t.blockId === block.id).length, 0);
  program = M.removeBlock(program, block.id);
  assert.equal(program.template.week['1'].pm, undefined);
  assert.equal(M.resetTemplate(program).template.blocks.length, M.defaultTemplate().blocks.length);
});

test('progress survives template edits and removed steps keep their XP', () => {
  let { program, deck } = fresh();
  program = M.toggleTask(program, deck, week, '0:a1', monday).program;
  program = M.removeStep(program, 'am-move', 'a1');
  assert.equal(M.totalXp(program), M.XP_STEP);
  assert.ok(program.weeks[week].done['0:a1']);
});

test('52 weeks of heavy use stay far below the 512 KB state limit, compaction banks XP and keeps streak data', () => {
  let { program, deck } = fresh();
  for (let w = 0; w < 52; w++) {
    const wk = M.addDays('2025-10-13', w * 7);
    for (let day = 0; day < 7; day++) {
      const when = new Date(2025, 9, 13 + w * 7 + day, 20);
      for (const t of M.dayTasks(program, wk, day)) { const r = M.toggleTask(program, deck, wk, t.key, when); program = r.program; deck = r.deck; }
    }
    program = M.addBreak(program, deck, wk, new Date(2025, 9, 13 + w * 7, 12)).program;
  }
  const bytes = Buffer.byteLength(JSON.stringify(program));
  const deckBytes = Buffer.byteLength(JSON.stringify(deck));
  console.log(`# program 52 weeks: ${bytes} bytes, deck marks: ${deckBytes} bytes`);
  assert.ok(bytes < 200 * 1024, `program ${bytes}`);
  const xp = M.totalXp(program), streak = M.currentStreak(program, new Date(2026, 9, 11, 12));
  const compact = M.compactWeeks(program, 12, new Date(2026, 9, 12));
  assert.equal(M.totalXp(compact), xp);
  assert.equal(M.currentStreak(compact, new Date(2026, 9, 11, 12)), streak);
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) < bytes * 0.6);
  assert.deepEqual(M.normalizeProgram(compact), compact);
});
