import { dayOrToday, ENGLISH_XP, FLOW_SCHEMA, isLevel, normalize, parseFlow, SITUATIONS } from '../../../../learn/english';
import type { Level } from '../../../../learn/english';
import { ENGLISH_RULES, failure, generateValid, invalid, json, prepareModel, readJson, requireUser, stringList } from '../../../../learn/route-kit';

export const dynamic = 'force-dynamic';

const FLOW_RULES = `${ENGLISH_RULES}
Create today's 10-minute English routine as one JSON object.
- phrases: exactly 3 useful everyday PATTERNS: complete spoken sentences or fixed expressions of 3-9 words (for example asking for help, politely refusing, making a plan), never single vocabulary words. They fit the level, are all different from input.knownPhrases, and belong to the situation input.situation so they can be used together. For each: text (English), tr (the natural Turkish equivalent), usage (one Turkish sentence: when you would say it), a and b (a two-line English example dialogue; the phrase appears in a or b).
- speaking: a realistic role-play in which the learner can naturally use at least two of today's phrases: title (Turkish, short), setting (English, one sentence), aiRole (who the AI plays, English), userRole (who the learner plays, English), goal (Turkish, one sentence: what the learner should achieve), opening (the AI's first line, English, at most 20 words, ends with a question).
- writing: prompt (English, one sentence asking for two sentences about today's situation) and promptTr (its Turkish translation).
- readingTopic: one concrete, curiosity-sparking everyday topic for a 150 word text (English, at most 60 characters); prefer input.interests when given.
Do not reuse the scenarios in input.recentScenarios. When input.recentMistakes lists errors, build one example dialogue that models the correct form.`;

export async function POST(request: Request) {
  try {
    const owner = requireUser(request, true);
    const body = await readJson(request, 8192);
    if (body.level !== undefined && !isLevel(body.level)) throw invalid();
    const level: Level = body.level ?? 'A2';
    const day = dayOrToday(body.day);
    if (!day) throw invalid();
    const knownPhrases = stringList(body.knownPhrases, 60, 120), interests = stringList(body.interests, 5, 40), recentMistakes = stringList(body.recentMistakes, 5, 120), recentScenarios = stringList(body.recentScenarios, 10, 60);
    const model = await prepareModel(owner, request);
    const situation = SITUATIONS[crypto.getRandomValues(new Uint32Array(1))[0] % SITUATIONS.length];
    const flow = await generateValid(model, { name: 'orbit_english_flow', instructions: FLOW_RULES, schema: FLOW_SCHEMA, temperature: 1,
      input: { level, situation, knownPhrases: knownPhrases.slice(-40), interests, recentMistakes, recentScenarios } }, raw => parseFlow(raw, knownPhrases));
    // Defence in depth: the novelty rule is enforced here too, whatever the model did.
    if (flow.phrases.some(phrase => knownPhrases.some(known => normalize(known) === normalize(phrase.text)))) throw invalid();
    return json({ flowId: crypto.randomUUID(), day, level, minutes: { phrases: 3, speaking: 3, writing: 2, reading: 2 }, ...flow, xp: ENGLISH_XP });
  } catch (error) { return failure(error, 'Orbit english flow failed'); }
}
