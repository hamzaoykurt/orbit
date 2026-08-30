export type ActivityArea = 'body' | 'curiosity' | 'creativity' | 'language' | 'solo' | 'social' | 'career' | 'space';
export type Exercise = { name: string; sets: string; reps: string; weight: string };
export type ActivityDraft = {
  areaId: ActivityArea; title: string; date: string; duration: number;
  note: string; source: string; next: string; person: string; stage: string;
  prediction: string; exercises: Exercise[]; stops: string[];
};
export type ActivityEntry = {
  areaId: ActivityArea; title: string; date: string; duration: number; note: string; rating: number;
  details: { version: 1; source: string; next: string; person: string; stage: string; prediction: string; exercises: Exercise[]; stops: string[] };
};
export const activityLabels: Record<ActivityArea, { name: string; title: string; action: string }> = {
  body: { name: 'BEDEN / SEANS DEFTERİ', title: 'Bugünün antrenmanı', action: 'Seansı tamamla' },
  curiosity: { name: 'MERAK / ARAŞTIRMA DEFTERİ', title: 'Bir sorunun peşinde.', action: 'Bulguyu deftere ekle' },
  creativity: { name: 'YARATICILIK / ÇALIŞMA MASASI', title: 'Bugün ne ürettin?', action: 'Çalışmayı arşivle' },
  language: { name: 'DİL / PRATİK ODASI', title: 'Söz sende.', action: 'Pratiği tamamla' },
  solo: { name: 'SOLO / KEŞİF GÜNLÜĞÜ', title: 'Nerelere gittin?', action: 'Keşfi günlüğe ekle' },
  social: { name: 'SOSYAL / BAĞLANTI NOTU', title: 'Bir sohbetten kalan.', action: 'Teması hatırla' },
  career: { name: 'KARİYER / DENEY PANOSU', title: 'Fikri dışarı çıkar.', action: 'Deney adımını kaydet' },
  space: { name: 'UZAY / DENEY RAPORU', title: 'Tahmin et. Dene. Karşılaştır.', action: 'Deneyi raporla' },
};
export function createActivityDraft(areaId: ActivityArea, title: string, date: string): ActivityDraft {
  return { areaId, title, date, duration: 0, note: '', source: '', next: '', person: '', prediction: '',
    stage: areaId === 'creativity' ? 'Taslak' : areaId === 'career' ? 'Örnek iş' : '',
    exercises: [{ name: '', sets: '', reps: '', weight: '' }], stops: [''] };
}
export function activityError(draft: ActivityDraft): string {
  if (!draft.title.trim()) return 'Önce bu çalışmaya bir isim ver.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date)) || new Date(draft.date).toISOString().slice(0,10) !== draft.date) return 'Geçerli bir tarih seç.';
  if (!Number.isFinite(draft.duration) || draft.duration < 0 || draft.duration > 1440) return 'Süre 0–1440 dakika arasında olmalı.';
  if (['body', 'creativity', 'language', 'career', 'space'].includes(draft.areaId) && draft.duration < 1) return 'Bu çalışma için harcadığın süreyi ekle.';
  if (draft.areaId === 'curiosity' && !draft.note.trim()) return 'Bulduğun cevabı ya da henüz açık kalan soruyu yaz.';
  if (draft.areaId === 'social' && !draft.person.trim()) return 'Kiminle veya hangi toplulukla görüştüğünü yaz.';
  if (draft.areaId === 'solo' && !draft.stops.some(stop => stop.trim())) return 'Rotana en az bir durak ekle.';
  if (draft.areaId === 'space' && (!draft.prediction.trim() || !draft.note.trim())) return 'Tahminini ve gözlemlediğin sonucu yaz.';
  if (draft.source.trim()) {
    try { const url = new URL(draft.source); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return 'Bağlantı http veya https ile başlamalı.'; }
    catch { return 'Geçerli bir kaynak bağlantısı ekle.'; }
  }
  return '';
}
export function buildActivityEntry(draft: ActivityDraft): ActivityEntry {
  const error = activityError(draft);
  if (error) throw new Error(error);
  const exercises = draft.areaId === 'body' ? draft.exercises.filter(row => row.name.trim()).map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,value.trim()])) as Exercise) : [];
  const stops = draft.areaId === 'solo' ? draft.stops.map(stop => stop.trim()).filter(Boolean) : [];
  const notes = [
    ...exercises.map(row => [row.name, row.sets && `${row.sets} set`, row.reps && `${row.reps} tekrar`, row.weight && `${row.weight} kg`].filter(Boolean).join(' · ')),
    stops.length ? `Rota: ${stops.join(' → ')}` : '',
    draft.person.trim() && `Kiminle: ${draft.person.trim()}`,
    draft.stage && `Aşama: ${draft.stage}`,
    draft.prediction.trim() && `Tahmin: ${draft.prediction.trim()}`,
    draft.note.trim(), draft.source.trim() && `Kaynak / çıktı: ${draft.source.trim()}`,
    draft.next.trim() && `Sonraki adım: ${draft.next.trim()}`,
  ].filter(Boolean).join('\n');
  return { areaId: draft.areaId, title: draft.title.trim(), date: draft.date, duration: Math.round(draft.duration), note: notes, rating: 3,
    details: { version: 1, exercises, stops, source: draft.source.trim(), next: draft.next.trim(), person: draft.person.trim(), stage: draft.stage, prediction: draft.prediction.trim() } };
}
