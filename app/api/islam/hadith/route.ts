import { loadHadith, parseHadithRef } from '../../../../learn/hadith-source';
import { failure, invalid, json, requireUser, sourceCache } from '../../../../learn/route-kit';

export const dynamic = 'force-dynamic';

// GET /api/islam/hadith?ref=nawawi:3 (Kırk Hadis, 1-42). Text and source tag come from the source, never from a model.
export async function GET(request: Request) {
  try {
    requireUser(request, false);
    const number = parseHadithRef(new URL(request.url).searchParams.get('ref'));
    if (!number) throw invalid('Geçersiz hadis referansı. Örnek: nawawi:3 (1-42).');
    return json(await loadHadith(number, { cache: sourceCache(), signal: request.signal }));
  } catch (error) { return failure(error, 'Orbit islam hadith failed'); }
}
