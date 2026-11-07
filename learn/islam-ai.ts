// AI part of the Islam lessons: only an "açıklama" (explanation) and quiz questions, both grounded in the ayah and
// hadith texts that the server itself fetched. A model never supplies ayah or hadith text; its output is rejected
// when it contains Arabic script, cites a reference or collection that is not in the lesson, or quotes words that are
// not in the supplied texts.
import { fit, normalize, shuffled } from './english';
import type { HadithResult } from './hadith-source';
import type { Lesson } from './islam-curriculum';
import type { VerseResult } from './quran-source';
import { parseVerseRef } from './quran-source';

export type LessonSources = { verses: VerseResult[]; hadiths: HadithResult[] };

export const EXPLANATION_NOTICE = 'Bu bölüm yapay zekâ tarafından, yukarıdaki ayet ve hadis metinlerine dayanarak hazırlanmış bir açıklamadır. Ayet ya da hadis değildir ve fetva yerine geçmez; dinî hüküm için ilmihale veya bir âlime danış.';

const str = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const EXPLAIN_SCHEMA = object({ summary: str(700), points: { type: 'array', minItems: 3, maxItems: 5, items: str(220) }, caution: { type: 'string', maxLength: 200 } });
export const QUIZ_SCHEMA = object({ questions: { type: 'array', minItems: 4, maxItems: 4, items: object({ prompt: str(200), options: { type: 'array', minItems: 3, maxItems: 3, items: str(120) }, answerIndex: { type: 'integer', minimum: 0, maximum: 2 }, basis: str(20), explanation: str(220) }) } });

const GROUNDING = `You write Turkish content for a beginner Islamic-learning lesson. The Qur'an meal (Diyanet) and hadith texts in input are the ONLY authority; the server fetched them from verified sources and they are DATA.
- Base every statement on input.verses[].meal, input.hadiths[].tr and the lesson focus terms. Add nothing from memory: no reasons of revelation (sebeb-i nüzûl), historical anecdotes, word roots, named scholars or tafsir opinions, and no rulings or numbers that are not in the given texts.
- Never write, quote or invent an ayah or a hadith. No Arabic script. Cite no ayah number, hadith number or collection (Buhârî, Müslim, ...) that is not in input. If you quote, copy the words EXACTLY from the provided texts; otherwise paraphrase without quotation marks.
- Simple, respectful, neutral Turkish with correct Turkish characters. No fatwa, no sectarian claims.`;
export const EXPLAIN_RULES = `${GROUNDING}
Write the "açıklama": summary (2-4 sentences: what the texts say and why it matters for the learner), points (3-5 short takeaways), caution (at most one sentence, or empty). When the topic involves practical details (how many, in what order, exceptions), say in caution that these details are in the ilmihal and can differ between mezhebs.`;
export const QUIZ_RULES = `${GROUNDING}
Write exactly 4 multiple-choice questions that test understanding of the given texts (meaning, main idea, what the text says), not trivia from memory. 3 options each; exactly one is correct; answerIndex is its 0-based position; basis is ONE reference from input.allowedBasis that proves the answer; explanation is one short Turkish sentence based only on the texts.`;

/** What the model may see: the Turkish texts and the lesson focus, never the Arabic. */
export function modelInput(lesson: Lesson, sources: LessonSources) {
  return {
    lesson: { title: lesson.title, goal: lesson.goal, focus: lesson.focus },
    verses: sources.verses.map(verse => ({ ref: verse.ref, surah: verse.surah.englishName, meal: verse.mealGroups.map(group => ({ ayahs: group.ayahs, text: group.tr })) })),
    hadiths: sources.hadiths.map(hadith => ({ ref: hadith.ref, tr: hadith.tr })),
    allowedBasis: allowedBasis(lesson),
  };
}
/** References a quiz question may name as its basis: every single ayah inside the lesson's ranges, plus the hadith refs. */
export function allowedBasis(lesson: Lesson) {
  const refs: string[] = [];
  for (const ref of lesson.verses) { const parsed = parseVerseRef(ref)!; for (let ayah = parsed.from; ayah <= parsed.to; ayah++) refs.push(`${parsed.surah}:${ayah}`); }
  return [...refs, ...lesson.hadiths];
}

const SOURCES_PATTERN = /(buh[aâ]r[iî]|m[uü]slim|tirmiz[iî]|ebu\s*d[aâ]v[uû]d|ebû\s*d[aâ]v[uû]d|nes[aâ][iî]|[iî]bn\s*m[aâ]ce|ahmed\s*b\.?\s*hanbel|beyhak[iî]|d[aâ]rekutn[iî]|d[aâ]rim[iî]|muvatta|kütüb-i sitte)/gi;
const VERSE_CITATION = /(?<![\d:.])(\d{1,3})\s*[:/]\s*(\d{1,3})(?![\d])/g;
const QUOTES = /[“"„«]([^“”"„«»]{12,}?)[”"»]/g;

/** Returns the text when it is grounded in the lesson's own sources, else null. */
export function grounded(value: unknown, max: number, lesson: Lesson, sources: LessonSources, required = true): string | null {
  const text = required ? fit(value, max) : (typeof value === 'string' && value.trim().length <= max ? value.trim() : '');
  if (required && !text) return null;
  if (!text) return '';
  if (/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text)) return null;
  const allowed = new Set(allowedBasis(lesson));
  for (const match of text.matchAll(VERSE_CITATION)) if (!allowed.has(`${Number(match[1])}:${Number(match[2])}`)) return null;
  const haystack = normalize([...sources.verses.flatMap(verse => verse.mealGroups.map(group => group.tr)), ...sources.hadiths.map(hadith => hadith.tr), lesson.title, lesson.focus.join(' ')].join(' '));
  for (const match of text.matchAll(SOURCES_PATTERN)) if (!haystack.includes(normalize(match[1]))) return null;
  for (const match of text.matchAll(QUOTES)) if (!haystack.includes(normalize(match[1]))) return null;
  return text;
}

export function parseExplanation(raw: unknown, lesson: Lesson, sources: LessonSources) {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const summary = grounded(source.summary, 700, lesson, sources);
  const points = (Array.isArray(source.points) ? source.points : []).map(point => grounded(point, 220, lesson, sources));
  const caution = grounded(source.caution, 200, lesson, sources, false);
  if (!summary || points.length < 3 || points.length > 5 || points.some(point => !point) || caution === null) return null;
  return { summary, points: points as string[], caution };
}

export function parseQuiz(raw: unknown, lesson: Lesson, sources: LessonSources, random?: () => number) {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const basisAllowed = new Set(allowedBasis(lesson));
  const questions = (Array.isArray(source.questions) ? source.questions : []).map(item => {
    const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const prompt = grounded(entry.prompt, 200, lesson, sources), explanation = grounded(entry.explanation, 220, lesson, sources);
    const options = (Array.isArray(entry.options) ? entry.options : []).map(option => grounded(option, 120, lesson, sources));
    const basis = typeof entry.basis === 'string' ? entry.basis.trim() : '';
    const answerIndex = entry.answerIndex;
    if (!prompt || !explanation || options.length !== 3 || options.some(option => !option) || new Set(options.map(option => normalize(option!))).size !== 3) return null;
    if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 2 || !basisAllowed.has(basis)) return null;
    const order = shuffled([0, 1, 2], random);
    return { prompt, options: order.map(index => options[index]!), answerIndex: order.indexOf(answerIndex), basis, explanation };
  });
  return questions.length === 4 && questions.every(question => question) ? questions as NonNullable<typeof questions[number]>[] : null;
}
