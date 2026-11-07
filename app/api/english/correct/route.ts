import { CORRECT_SCHEMA, isLevel, parseCorrection, sentenceCount } from '../../../../learn/english';
import { ENGLISH_RULES, failure, generateValid, invalid, json, prepareModel, readJson, requireUser, stringList, text } from '../../../../learn/route-kit';

export const dynamic = 'force-dynamic';

const RULES = `${ENGLISH_RULES}
The learner wrote 2-4 English sentences (input.text), answering input.prompt. Correct them.
- corrected: the full text with every real mistake fixed, changing as little as possible (keep the learner's meaning and voice).
- changes: one entry per fixed mistake. "from" is copied EXACTLY from the learner's text (the shortest wrong part), "to" is the fix, type is one of the allowed categories, reasonTr is ONE Turkish sentence explaining why. No entry for style preferences. If the text has no mistakes return an empty array and copy the text unchanged into corrected.
- naturalVersion: optionally one more natural way to say the whole text; an empty string when the original is already natural.
- praiseTr: one short, sincere Turkish sentence about something that worked (a good structure, a used phrase from input.phrases).`;

export async function POST(request: Request) {
  try {
    const owner = requireUser(request, true);
    const body = await readJson(request, 8192);
    if (!isLevel(body.level)) throw invalid();
    const level = body.level;
    const writing = text(body.text, 600), prompt = text(body.prompt, 200, false), phrases = stringList(body.phrases, 5, 120);
    if (!/\p{L}{2}/u.test(writing)) throw invalid('Düzeltmek için en az bir kelime yaz.');
    const model = await prepareModel(owner, request);
    const result = await generateValid(model, { name: 'orbit_english_correct', instructions: RULES, schema: CORRECT_SCHEMA, temperature: 0.2, input: { level, prompt, phrases, text: writing } }, raw => parseCorrection(raw, writing));
    const sentences = sentenceCount(writing);
    return json({ ...result, sentences, xp: sentences >= 2 ? 20 : 10 });
  } catch (error) { return failure(error, 'Orbit english correction failed'); }
}
