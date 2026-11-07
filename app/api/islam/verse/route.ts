import { loadVerses, parseVerseRef } from '../../../../learn/quran-source';
import { failure, invalid, json, requireUser, sourceCache } from '../../../../learn/route-kit';

export const dynamic = 'force-dynamic';

// GET /api/islam/verse?ref=2:255 or ?ref=112:1-4 (at most 12 ayahs). Text comes from the source, never from a model.
export async function GET(request: Request) {
  try {
    requireUser(request, false);
    const ref = parseVerseRef(new URL(request.url).searchParams.get('ref'));
    if (!ref) throw invalid('Geçersiz ayet referansı. Örnek: 2:255 veya 112:1-4 (en çok 12 ayet).');
    return json(await loadVerses(ref, { cache: sourceCache(), signal: request.signal }));
  } catch (error) { return failure(error, 'Orbit islam verse failed'); }
}
