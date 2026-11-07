import { loadLessonSources } from '../../../../learn/islam-sources';
import { modelInput, parseQuiz, QUIZ_RULES, QUIZ_SCHEMA } from '../../../../learn/islam-ai';
import { findLesson } from '../../../../learn/islam-curriculum';
import { failure, generateValid, invalid, json, prepareModel, readJson, requireUser, sourceCache } from '../../../../learn/route-kit';

export const dynamic = 'force-dynamic';

// POST { lessonId } -> 4 multiple-choice questions about the lesson's ayah/hadith texts. The answers are returned too
// (the client checks them offline); every question names the ayah or hadith that proves its answer.
export async function POST(request: Request) {
  try {
    const owner = requireUser(request, true);
    const body = await readJson(request, 1024);
    const lesson = findLesson(body.lessonId);
    if (!lesson) throw invalid('Bilinmeyen ders.');
    const model = await prepareModel(owner, request);
    const sources = await loadLessonSources(lesson, { cache: sourceCache(), signal: request.signal });
    const questions = await generateValid(model, { name: 'orbit_islam_quiz', instructions: QUIZ_RULES, schema: QUIZ_SCHEMA, temperature: 0.4, input: modelInput(lesson, sources) },
      raw => parseQuiz(raw, lesson, sources), 2, 'unverified-content');
    return json({ lessonId: lesson.id, generatedAt: new Date().toISOString(), kind: 'ai-quiz', questions: questions.map(question => ({ id: `q-${crypto.randomUUID()}`, ...question })) });
  } catch (error) { return failure(error, 'Orbit islam quiz failed'); }
}
