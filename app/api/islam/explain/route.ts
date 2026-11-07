import { loadLessonSources } from '../../../../learn/islam-sources';
import { EXPLAIN_RULES, EXPLAIN_SCHEMA, EXPLANATION_NOTICE, modelInput, parseExplanation } from '../../../../learn/islam-ai';
import { findLesson } from '../../../../learn/islam-curriculum';
import { failure, generateValid, invalid, json, prepareModel, readJson, requireUser, sourceCache } from '../../../../learn/route-kit';

export const dynamic = 'force-dynamic';

// POST { lessonId } -> the lesson's ayah/hadith texts (from the source) and an AI "açıklama" that is grounded in them.
// The lesson must exist in the static curriculum: the client cannot supply its own "ayah" or topic text.
export async function POST(request: Request) {
  try {
    const owner = requireUser(request, true);
    const body = await readJson(request, 1024);
    const lesson = findLesson(body.lessonId);
    if (!lesson) throw invalid('Bilinmeyen ders.');
    const model = await prepareModel(owner, request);
    const sources = await loadLessonSources(lesson, { cache: sourceCache(), signal: request.signal });
    const explanation = await generateValid(model, { name: 'orbit_islam_explain', instructions: EXPLAIN_RULES, schema: EXPLAIN_SCHEMA, temperature: 0.3, input: modelInput(lesson, sources) },
      raw => parseExplanation(raw, lesson, sources), 2, 'unverified-content');
    return json({
      lessonId: lesson.id, verses: sources.verses, hadiths: sources.hadiths,
      aciklama: { kind: 'ai-aciklama', notice: EXPLANATION_NOTICE, ...explanation, basedOn: [...lesson.verses, ...lesson.hadiths] },
    });
  } catch (error) { return failure(error, 'Orbit islam explanation failed'); }
}
