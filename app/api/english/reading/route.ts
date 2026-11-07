import { isLevel, parseReading, READING_SCHEMA, READING_WORDS } from '../../../../learn/english';
import { ENGLISH_RULES, failure, generateValid, invalid, json, prepareModel, readJson, requireUser, stringList, text } from '../../../../learn/route-kit';

export const dynamic = 'force-dynamic';

const RULES = `${ENGLISH_RULES}
Write an original, engaging reading passage about input.topic (or, when it is empty, a curiosity-sparking everyday subject that fits input.interests). Length for the level: input.wordRange words.
Use well-known, general knowledge only: no news, no invented statistics, studies, quotes or named people/companies, no claim that something is "recent". If a number is not common knowledge, leave it out.
- title: short English title.
- questions: exactly 3 comprehension questions (mix detail and inference), 3 options each, exactly ONE option is correct according to the text, answerIndex is its 0-based position, explanationTr is one Turkish sentence pointing to the part of the text that decides it.
- glossary: 5-8 harder words that appear in the text (write them exactly as they appear, lower case) with their Turkish meaning in this context.
Do not reuse the titles in input.recentTitles. When input.phrases are given, you may use one or two naturally.`;

export async function POST(request: Request) {
  try {
    const owner = requireUser(request, true);
    const body = await readJson(request, 8192);
    if (!isLevel(body.level)) throw invalid();
    const level = body.level;
    const topic = text(body.topic, 60, false), interests = stringList(body.interests, 5, 40), phrases = stringList(body.phrases, 5, 120), recentTitles = stringList(body.recentTitles, 10, 80);
    const model = await prepareModel(owner, request);
    const [low, high] = READING_WORDS[level];
    const reading = await generateValid(model, { name: 'orbit_english_reading', instructions: RULES, schema: READING_SCHEMA, temperature: 0.9,
      input: { level, topic, interests, phrases, recentTitles, wordRange: `${low}-${high}` } }, raw => parseReading(raw, level));
    return json({ id: crypto.randomUUID(), level, generatedAt: new Date().toISOString(), ...reading, xp: 20 });
  } catch (error) { return failure(error, 'Orbit english reading failed'); }
}
