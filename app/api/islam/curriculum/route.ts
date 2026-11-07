import { CURRICULUM, CURRICULUM_NOTICE } from '../../../../learn/islam-curriculum';
import { failure, json, requireUser } from '../../../../learn/route-kit';

export const dynamic = 'force-dynamic';

// Static structure: topics and lessons with their ayah/hadith references. No text of any ayah or hadith is stored here.
export async function GET(request: Request) {
  try {
    requireUser(request, false);
    return json({ version: 1, notice: CURRICULUM_NOTICE, sections: CURRICULUM });
  } catch (error) { return failure(error, 'Orbit islam curriculum failed'); }
}
