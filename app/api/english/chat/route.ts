import { CHAT_SCHEMA, FEEDBACK_SCHEMA, isLevel, parseChatTurn, parseFeedback } from '../../../../learn/english';
import type { ChatMessage } from '../../../../learn/english';
import { ENGLISH_RULES, failure, generateValid, invalid, json, prepareModel, readJson, requireUser, stringList, text } from '../../../../learn/route-kit';

export const dynamic = 'force-dynamic';

const TURN_RULES = `${ENGLISH_RULES}
You play input.scenario.aiRole in a short role-play with the learner (input.scenario.userRole). Continue it: reply with ONE short message that reacts to the learner's last message and moves the conversation on, ending with a question or a next step. At most 25 words for A1/A2 and 40 words for B1/B2; plain English at the learner's level; stay in character.
Never correct mistakes inside the reply (feedback comes at the end). If the learner writes Turkish, answers off-topic or is unclear, answer gently in simple English and keep the scene going.
hint: one short English phrase (at most 12 words) the learner could use next, preferably one of input.phrases; use an empty string when none fits.`;
const FINISH_RULES = `${ENGLISH_RULES}
The role-play is over. Review ONLY the learner's own messages (role "user").
- corrections: up to 2 messages that really contain a mistake. "original" must be copied EXACTLY from a learner message; "corrected" is the fixed version; reasonTr is one Turkish sentence saying why. If there are no mistakes return an empty array. Never invent a mistake.
- natural: pick one learner sentence that is correct but could sound more natural and give the better version ("original" copied exactly); otherwise two empty strings.
- usedPhrases: the strings from input.phrases that the learner really used (same wording or very close). Never claim a phrase that is absent.
- summaryTr: 1-2 warm Turkish sentences; say what went well first.`;

export async function POST(request: Request) {
  try {
    const owner = requireUser(request, true);
    const body = await readJson(request, 16384);
    if (!isLevel(body.level)) throw invalid();
    const level = body.level;
    const scenarioIn = body.scenario && typeof body.scenario === 'object' && !Array.isArray(body.scenario) ? body.scenario as Record<string, unknown> : null;
    if (!scenarioIn) throw invalid();
    const scenario = { title: text(scenarioIn.title, 60), setting: text(scenarioIn.setting, 200), aiRole: text(scenarioIn.aiRole, 60), userRole: text(scenarioIn.userRole, 60), goal: text(scenarioIn.goal, 200) };
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12) throw invalid();
    const messages = body.messages.map((item): ChatMessage => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      if (entry.role !== 'ai' && entry.role !== 'user') throw invalid();
      return { role: entry.role === 'ai' ? 'ai' : 'user', text: text(entry.text, 400) };
    }).slice(-8);
    const phrases = stringList(body.phrases, 5, 120);
    if (body.finish !== undefined && typeof body.finish !== 'boolean') throw invalid();
    if (body.turn !== undefined && (typeof body.turn !== 'number' || !Number.isInteger(body.turn) || body.turn < 0 || body.turn > 50)) throw invalid();
    const userTexts = messages.filter(message => message.role === 'user').map(message => message.text);
    const finish = body.finish === true;
    // A turn answers the learner's last message; feedback needs at least one learner message to review.
    if (finish ? userTexts.length === 0 : messages.at(-1)!.role !== 'user') throw invalid();
    const model = await prepareModel(owner, request);
    if (!finish) {
      const turn = typeof body.turn === 'number' ? body.turn : userTexts.length;
      const reply = await generateValid(model, { name: 'orbit_english_chat', instructions: TURN_RULES, schema: CHAT_SCHEMA, temperature: 0.8, input: { level, scenario, phrases, messages } }, raw => parseChatTurn(raw, level));
      return json({ reply: reply.reply, hint: reply.hint, turn, endSuggested: turn >= 6 });
    }
    const feedback = await generateValid(model, { name: 'orbit_english_feedback', instructions: FINISH_RULES, schema: FEEDBACK_SCHEMA, temperature: 0.3, input: { level, scenario, phrases, messages } }, raw => parseFeedback(raw, userTexts, phrases));
    const turns = typeof body.turn === 'number' && body.turn >= userTexts.length ? body.turn : userTexts.length;
    return json({ feedback, userTurns: turns, xp: turns >= 3 ? 30 : 10 });
  } catch (error) { return failure(error, 'Orbit english chat failed'); }
}
