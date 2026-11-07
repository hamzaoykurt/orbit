// English learning: shared constants, output validators and the placement test logic. Pure functions only (no I/O),
// so every rule here is covered by tests without a model or a database.
import { PLACEMENT_BANK } from './placement-bank';
import type { PlacementItem } from './placement-bank';

export const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type Level = typeof LEVELS[number];
export const isLevel = (value: unknown): value is Level => typeof value === 'string' && (LEVELS as readonly string[]).includes(value);

// Points per finished stop. Sent to the client with every daily flow so the rules live on the server.
export const ENGLISH_XP = { pattern: 10, speaking: 30, writing: 20, reading: 20, dailyBonus: 10, streakMinStops: 2 } as const;

export const MISTAKE_TYPES = ['article', 'tense', 'preposition', 'word_order', 'agreement', 'plural', 'spelling', 'vocabulary', 'punctuation', 'other'] as const;

const asObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Trimmed string when it has 1..max characters, else ''. Over-long model output is rejected, never silently cut. */
export const fit = (value: unknown, max: number) => { const text = typeof value === 'string' ? value.trim() : ''; return text.length >= 1 && text.length <= max ? text : ''; };
export const normalize = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/;
export const hasArabicScript = (value: string) => ARABIC_SCRIPT.test(value);
export const wordCount = (value: string) => (value.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
export const sentenceCount = (value: string) => value.split(/[.!?…]+(?:\s|$)/).filter(part => /\p{L}/u.test(part)).length;

/** Stable id for a phrase (FNV-1a over the normalised text) so the client can deduplicate and key spaced repetition. */
export function phraseId(text: string) {
  let hash = 0x811c9dc5;
  for (const char of normalize(text)) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `ph-${hash.toString(16).padStart(8, '0')}`;
}

/** Unbiased shuffle with the platform RNG. */
export function shuffled<T>(items: readonly T[], random: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) { const swap = Math.floor(random() * (index + 1)); [copy[index], copy[swap]] = [copy[swap], copy[index]]; }
  return copy;
}

// ---------------------------------------------------------------- daily flow
export type Phrase = { id: string; text: string; tr: string; usage: string; example: { a: string; b: string } };
export type DailyFlow = {
  phrases: Phrase[];
  speaking: { title: string; setting: string; aiRole: string; userRole: string; goal: string; opening: string; usePhraseIds: string[] };
  writing: { prompt: string; promptTr: string; minSentences: number };
  reading: { topic: string };
};
const str = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const FLOW_SCHEMA = object({
  phrases: { type: 'array', minItems: 3, maxItems: 3, items: object({ text: str(90), tr: str(120), usage: str(160), a: str(120), b: str(120) }) },
  speaking: object({ title: str(40), setting: str(160), aiRole: str(60), userRole: str(60), goal: str(160), opening: str(140) }),
  writing: object({ prompt: str(160), promptTr: str(180) }),
  readingTopic: str(60),
});

export function parseFlow(raw: unknown, knownPhrases: string[]): DailyFlow | null {
  const source = asObject(raw);
  const known = new Set(knownPhrases.map(normalize));
  const phrases: Phrase[] = [];
  for (const item of Array.isArray(source.phrases) ? source.phrases : []) {
    const entry = asObject(item);
    const text = fit(entry.text, 90), tr = fit(entry.tr, 120), usage = fit(entry.usage, 160), a = fit(entry.a, 120), b = fit(entry.b, 120);
    // A pattern is a spoken chunk (2+ words); a single word is the vocabulary drill this feature replaces.
    if (!text || !tr || !usage || !a || !b || wordCount(text) < 2 || hasArabicScript(text) || known.has(normalize(text))) continue;
    if (phrases.some(existing => normalize(existing.text) === normalize(text))) continue;
    phrases.push({ id: phraseId(text), text, tr, usage, example: { a, b } });
  }
  const speaking = asObject(source.speaking), writing = asObject(source.writing);
  const title = fit(speaking.title, 40), setting = fit(speaking.setting, 160), aiRole = fit(speaking.aiRole, 60), userRole = fit(speaking.userRole, 60), goal = fit(speaking.goal, 160), opening = fit(speaking.opening, 140);
  const prompt = fit(writing.prompt, 160), promptTr = fit(writing.promptTr, 180), topic = fit(source.readingTopic, 60);
  if (phrases.length !== 3 || !title || !setting || !aiRole || !userRole || !goal || !opening || !prompt || !promptTr || !topic) return null;
  return {
    phrases,
    speaking: { title, setting, aiRole, userRole, goal, opening, usePhraseIds: phrases.map(phrase => phrase.id) },
    writing: { prompt, promptTr, minSentences: 2 },
    reading: { topic },
  };
}

// ---------------------------------------------------------------- role-play chat
export type ChatMessage = { role: 'ai' | 'user'; text: string };
export const CHAT_SCHEMA = object({ reply: str(300), hint: { type: 'string', maxLength: 100 } });
export const FEEDBACK_SCHEMA = object({
  corrections: { type: 'array', minItems: 0, maxItems: 2, items: object({ original: str(220), corrected: str(240), reasonTr: str(200) }) },
  natural: object({ original: { type: 'string', maxLength: 220 }, better: { type: 'string', maxLength: 240 } }),
  usedPhrases: { type: 'array', minItems: 0, maxItems: 3, items: str(120) },
  summaryTr: str(300),
});

export function parseChatTurn(raw: unknown, level: Level) {
  const source = asObject(raw);
  const reply = fit(source.reply, 300);
  const limit = level === 'A1' || level === 'A2' ? 30 : 45;
  if (!reply || hasArabicScript(reply) || wordCount(reply) > limit + 15) return null;
  const hint = typeof source.hint === 'string' && source.hint.trim().length <= 100 ? source.hint.trim() : '';
  return { reply, hint };
}

/** A claimed mistake must quote something the learner really wrote; otherwise the model invented it and it is dropped. */
export function parseFeedback(raw: unknown, userTexts: string[], phrases: string[]) {
  const source = asObject(raw);
  const written = userTexts.map(normalize);
  const wrote = (quote: string) => { const needle = normalize(quote); return needle.length > 0 && written.some(text => text.includes(needle)); };
  const corrections = (Array.isArray(source.corrections) ? source.corrections : []).flatMap(item => {
    const entry = asObject(item), original = fit(entry.original, 220), corrected = fit(entry.corrected, 240), reasonTr = fit(entry.reasonTr, 200);
    return original && corrected && reasonTr && normalize(original) !== normalize(corrected) && wrote(original) ? [{ original, corrected, reasonTr }] : [];
  }).slice(0, 2);
  const natural = asObject(source.natural), naturalOriginal = fit(natural.original, 220), naturalBetter = fit(natural.better, 240);
  const better = naturalOriginal && naturalBetter && wrote(naturalOriginal) && normalize(naturalOriginal) !== normalize(naturalBetter) ? { original: naturalOriginal, better: naturalBetter } : null;
  const supplied = new Map(phrases.map(phrase => [normalize(phrase), phrase]));
  const usedPhrases = [...new Set((Array.isArray(source.usedPhrases) ? source.usedPhrases : []).flatMap(item => {
    const claimed = supplied.get(normalize(typeof item === 'string' ? item : ''));
    if (!claimed) return [];
    // Verify the claim: most of the phrase's words must really occur in what the learner wrote.
    const words = normalize(claimed).split(' ');
    const haystack = new Set(written.flatMap(text => text.split(' ')));
    return words.filter(word => haystack.has(word)).length / words.length >= 0.7 ? [claimed] : [];
  }))];
  const summaryTr = fit(source.summaryTr, 300);
  return summaryTr ? { corrections, natural: better, usedPhrases, summaryTr } : null;
}

// ---------------------------------------------------------------- writing correction
export type Change = { from: string; to: string; type: typeof MISTAKE_TYPES[number]; reasonTr: string };
export const CORRECT_SCHEMA = object({
  corrected: str(700),
  changes: { type: 'array', minItems: 0, maxItems: 8, items: object({ from: str(120), to: str(140), type: { type: 'string', enum: [...MISTAKE_TYPES] }, reasonTr: str(200) }) },
  naturalVersion: { type: 'string', maxLength: 700 },
  praiseTr: str(200),
});

export function parseCorrection(raw: unknown, original: string) {
  const source = asObject(raw);
  const corrected = fit(source.corrected, 700), praiseTr = fit(source.praiseTr, 200);
  if (!corrected || !praiseTr) return null;
  const haystack = normalize(original);
  const changes: Change[] = (Array.isArray(source.changes) ? source.changes : []).flatMap(item => {
    const entry = asObject(item), from = fit(entry.from, 120), to = fit(entry.to, 140), reasonTr = fit(entry.reasonTr, 200);
    const type = (MISTAKE_TYPES as readonly string[]).includes(String(entry.type)) ? entry.type as Change['type'] : 'other';
    // The quoted wrong part must be in the learner's text, and the fix must really differ from it.
    return from && to && reasonTr && normalize(from) !== normalize(to) && haystack.includes(normalize(from)) ? [{ from, to, type, reasonTr }] : [];
  }).slice(0, 8);
  const naturalVersion = typeof source.naturalVersion === 'string' && source.naturalVersion.trim().length <= 700 ? source.naturalVersion.trim() : '';
  const perfect = changes.length === 0 && normalize(corrected) === haystack;
  return { original, corrected: perfect ? original : corrected, changes, perfect, naturalVersion: naturalVersion && normalize(naturalVersion) !== normalize(corrected) ? naturalVersion : '', praiseTr };
}

// ---------------------------------------------------------------- reading
export const READING_WORDS: Record<Level, [number, number]> = { A1: [70, 110], A2: [100, 150], B1: [130, 180], B2: [150, 220] };
export const READING_SCHEMA = object({
  title: str(80),
  text: str(1800),
  questions: { type: 'array', minItems: 3, maxItems: 3, items: object({ prompt: str(160), options: { type: 'array', minItems: 3, maxItems: 3, items: str(100) }, answerIndex: { type: 'integer', minimum: 0, maximum: 2 }, explanationTr: str(200) }) },
  glossary: { type: 'array', minItems: 5, maxItems: 8, items: object({ word: str(30), tr: str(60) }) },
});

export function parseReading(raw: unknown, level: Level, random?: () => number) {
  const source = asObject(raw);
  const title = fit(source.title, 80), text = fit(source.text, 1800);
  if (!title || !text || hasArabicScript(text)) return null;
  const [low, high] = READING_WORDS[level], count = wordCount(text);
  if (count < Math.floor(low * 0.8) || count > Math.ceil(high * 1.25)) return null;
  const questions = (Array.isArray(source.questions) ? source.questions : []).flatMap(item => {
    const entry = asObject(item), prompt = fit(entry.prompt, 160), explanationTr = fit(entry.explanationTr, 200);
    const options = (Array.isArray(entry.options) ? entry.options : []).map(option => fit(option, 100));
    const answerIndex = entry.answerIndex;
    if (!prompt || !explanationTr || options.length !== 3 || options.some(option => !option) || new Set(options.map(normalize)).size !== 3) return [];
    if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 2) return [];
    // Models favour the middle option; shuffle and re-point the answer so the position carries no signal.
    const order = shuffled([0, 1, 2], random);
    return [{ prompt, options: order.map(index => options[index]), answerIndex: order.indexOf(answerIndex), explanationTr }];
  });
  if (questions.length !== 3) return null;
  const lower = text.toLowerCase();
  const glossary = (Array.isArray(source.glossary) ? source.glossary : []).flatMap(item => {
    const entry = asObject(item), word = fit(entry.word, 30), tr = fit(entry.tr, 60);
    return word && tr && new RegExp(`(^|[^\\p{L}])${word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(lower) ? [{ word, tr }] : [];
  }).slice(0, 8);
  if (glossary.length < 3) return null;
  return { title, text, wordCount: count, questions, glossary };
}

// ---------------------------------------------------------------- placement test (deterministic, no model)
export const PLACEMENT_STEPS = 8;
const KIND_PLAN = ['read', 'gap', 'say', 'read', 'read', 'gap', 'say', 'read'] as const;
export const PLACEMENT_INSTRUCTIONS = { read: 'Metni oku, soruyu yanıtla.', gap: 'Boşluğu doldur.', say: 'Bunu İngilizce nasıl söylersin?' } as const;
export type PlacementAnswer = { id: string; choice: number };
const byId = new Map(PLACEMENT_BANK.map(item => [item.id, item]));
const levelIndex = (level: Level) => LEVELS.indexOf(level);

/** The question that must follow the given answers. Replaying from the answers keeps the server stateless and the answers verifiable. */
export function nextPlacementItem(answers: PlacementAnswer[]): PlacementItem {
  let position = 1; // staircase: start at A2, up after a correct answer, down after a wrong one
  const used = new Set<string>();
  for (const answer of answers) {
    const item = byId.get(answer.id)!;
    used.add(item.id);
    position = Math.max(0, Math.min(LEVELS.length - 1, position + (answer.choice === item.answer ? 1 : -1)));
  }
  const wanted = KIND_PLAN[answers.length];
  const free = (level: number) => PLACEMENT_BANK.filter(item => levelIndex(item.level) === level && !used.has(item.id));
  for (const distance of [0, 1, -1, 2, -2, 3, -3]) {
    const pool = free(position + distance);
    const pick = pool.find(item => item.kind === wanted) ?? pool[0];
    if (pick) return pick;
  }
  throw new Error('placement-bank-exhausted');
}

export type PlacementCheck = { ok: true; answers: PlacementAnswer[] } | { ok: false };
export function checkPlacementAnswers(value: unknown): PlacementCheck {
  if (!Array.isArray(value) || value.length > PLACEMENT_STEPS) return { ok: false };
  const answers: PlacementAnswer[] = [];
  for (const raw of value) {
    const entry = asObject(raw);
    const item = typeof entry.id === 'string' ? byId.get(entry.id) : undefined;
    if (!item || typeof entry.choice !== 'number' || !Number.isInteger(entry.choice) || entry.choice < 0 || entry.choice >= item.options.length) return { ok: false };
    // Replaying must serve exactly this question at this step: a forged, repeated or out-of-order id is refused.
    if (nextPlacementItem(answers).id !== item.id) return { ok: false };
    answers.push({ id: item.id, choice: entry.choice });
  }
  return { ok: true, answers };
}

export function placementResult(answers: PlacementAnswer[]) {
  let sum = 0;
  const review = answers.map(answer => {
    const item = byId.get(answer.id)!, correct = answer.choice === item.answer;
    // Mean of (level of each question +/- 0.5): a correct answer says the learner is above that level, a wrong one below it.
    sum += levelIndex(item.level) + (correct ? 0.5 : -0.5);
    return { id: item.id, correct, correctIndex: item.answer };
  });
  const cefr = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.round(sum / answers.length)))];
  return { cefr, correct: review.filter(entry => entry.correct).length, total: answers.length, review };
}

// ---------------------------------------------------------------- shared request parsing
export const SITUATIONS = [
  'ordering at a café', 'asking for directions in a new city', 'a job interview', 'meeting a new neighbour', 'at the pharmacy', 'booking a hotel room', 'making plans with a friend',
  'returning a product to a shop', 'small talk with a colleague', 'phoning to reschedule an appointment', 'at the airport', 'asking a colleague for help', 'at the doctor\'s',
  'looking at a flat to rent', 'talking about a film or series', 'sharing good news', 'buying a train ticket', 'politely complaining in a restaurant', 'talking about hobbies',
  'asking for a discount', 'joining a gym', 'borrowing something from a friend', 'giving a friend advice', 'apologising for a mistake', 'declining an invitation politely',
  'at the supermarket', 'taking a taxi', 'at the hair salon', 'a call to tech support', 'introducing yourself at a meetup',
] as const;

export const dayOrToday = (value: unknown) => {
  if (value === undefined) return new Date().toISOString().slice(0, 10);
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  const valid = parsed !== null && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  return valid ? value as string : null;
};
