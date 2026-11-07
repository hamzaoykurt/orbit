// Loads every ayah and hadith a lesson refers to (in parallel, cached) from their sources.
import { loadHadith, parseHadithRef } from './hadith-source';
import type { Lesson } from './islam-curriculum';
import type { LessonSources } from './islam-ai';
import { loadVerses, parseVerseRef } from './quran-source';
import type { KvLike } from './quran-source';

export async function loadLessonSources(lesson: Lesson, deps: { transport?: typeof fetch; cache?: KvLike | null; signal?: AbortSignal } = {}): Promise<LessonSources> {
  const [verses, hadiths] = await Promise.all([
    Promise.all(lesson.verses.map(ref => loadVerses(parseVerseRef(ref)!, deps))),
    Promise.all(lesson.hadiths.map(ref => loadHadith(parseHadithRef(ref)!, deps))),
  ]);
  return { verses, hadiths };
}
