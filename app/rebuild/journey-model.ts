export type Ratings = { flow: number; curiosity: number; process: number; improve: number; again: number };
export type Experiment = { id: string; name: string; made: string; date: string; note: string; ratings: Ratings; archived: boolean; projectId: string };
export type Output = { id: string; title: string; date: string; tag: string; note: string; link: string; image: string; projectId: string };
export type Phase = { id: string; name: string; description: string; objective: string; weeks: number; evidence: string };
export type Reflection = { flow: string; forced: string; best: string; more: string; learned: string; closedAt: string };
export type WeekFocus = { body: string; create: string; explore: string; curiosity: string; career: boolean; checks: string[] };
export type Journey = { version: 1; startDate: string; phases: Phase[]; focus: Record<string, WeekFocus>; experiments: Experiment[]; outputs: Output[]; reviews: Record<string, Reflection> };
export const emptyRatings: Ratings = { flow: 0, curiosity: 0, process: 0, improve: 0, again: 0 };
export const defaultFocus: WeekFocus = { body: '3 antrenmana yer aç', create: 'Bir şeyi bitir', explore: 'Bir yönü dene', curiosity: '', career: false, checks: [] };
export const defaultPhases: Phase[] = [
  { id: 'reactivate', name: 'REACTIVATE', description: 'Hareket et. Merak et. Üret. İnsanların arasına karış.', objective: 'Beden, merak, sosyal hayat ve üretime yeniden yer aç.', weeks: 4, evidence: '' },
  { id: 'explore', name: 'EXPLORE', description: 'Farklı şeyler dene. Seni içine çeken işi fark et.', objective: 'Farklı üretim biçimlerini küçük, gerçek deneylerle test et.', weeks: 5, evidence: '' },
  { id: 'deep-dive', name: 'DEEP DIVE', description: 'Biraz daha kal. Zor kısmını da tanı.', objective: 'Güçlü bir yön seç; ilk heyecanın ötesine geçecek kadar zaman ver.', weeks: 4, evidence: '' },
  { id: 'release', name: 'RELEASE', description: 'Bitir. Paylaş. Dışarıdan bir ses duy.', objective: 'Ürettiklerini dünyaya aç ve gerçek geri bildirim topla.', weeks: 4, evidence: '' },
  { id: 'money', name: 'MONEY EXPERIMENT', description: 'Sevdiğin üretimin bağımsız bir karşılığını ara.', objective: 'Severek yaptığın bir şeyle küçük bir gelir deneyi yap.', weeks: 5, evidence: '' },
  { id: 'review', name: 'REVIEW / NEXT SEASON', description: 'Geride kalan izlere bak. Sonraki mevsimi seç.', objective: 'Altı ayın deneyimlerinden bir sonraki hayat dönemini tasarla.', weeks: 4, evidence: '' },
];
export function localDay(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
export function addDays(key: string, days: number) { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate()+days); return localDay(date); }
export function calendarWeek(key: string) { const date = new Date(`${key}T12:00:00`); return addDays(key,-((date.getDay()+6)%7)); }
export function emptyJourney(): Journey { return { version: 1, startDate: '', phases: defaultPhases, focus: {}, experiments: [], outputs: [], reviews: {} }; }
const textValue = (value: unknown) => typeof value === 'string' ? value : '';
const ratingValue = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
export function normalizeJourney(value: Partial<Journey> | undefined): Journey {
  const base = emptyJourney();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  return { ...base, startDate: typeof value.startDate === 'string' && validDate(value.startDate) ? value.startDate : '',
    phases: defaultPhases.map((phase,index) => { const stored = Array.isArray(value.phases) ? value.phases[index] : undefined; return { ...phase, ...(stored && typeof stored === 'object' ? stored : {}), id: phase.id, weeks: phase.weeks }; }),
    focus: value.focus && typeof value.focus === 'object' && !Array.isArray(value.focus) ? value.focus : {},
    experiments: Array.isArray(value.experiments) ? value.experiments.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string').map(item => ({ ...item, made:textValue(item.made), note:textValue(item.note), date:textValue(item.date), projectId:textValue(item.projectId), archived:Boolean(item.archived), ratings: Object.fromEntries(Object.keys(emptyRatings).map(key => [key,ratingValue(item.ratings?.[key as keyof Ratings])])) as Ratings })) : [],
    outputs: Array.isArray(value.outputs) ? value.outputs.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string').map(item=>({...item,date:textValue(item.date),tag:textValue(item.tag),note:textValue(item.note),link:textValue(item.link),image:textValue(item.image),projectId:textValue(item.projectId)})) : [],
    reviews: value.reviews && typeof value.reviews === 'object' && !Array.isArray(value.reviews) ? value.reviews : {},
  };
}
export function journeyPosition(start: string, today: string) {
  if (!validDate(start)) return { week: 1, phase: 0, started: false, complete: false, future: false };
  // UTC day arithmetic avoids 23/25-hour daylight saving days.
  const elapsed = Math.floor((Date.parse(today)-Date.parse(start))/86400000);
  const rawWeek = Math.floor(elapsed/7)+1;
  const week = Math.max(1,Math.min(26,rawWeek));
  let offset = 0;
  const phase = defaultPhases.findIndex(item => { offset += item.weeks; return week <= offset; });
  return { week, phase: Math.max(0,phase), started: elapsed >= 0, complete: rawWeek > 26, future: elapsed < 0 };
}
export function safeLink(value: unknown) { if (typeof value !== 'string' || !value.trim()) return ''; try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } }
export function observations(experiments: Experiment[]) {
  const groups = new Map<string,Experiment[]>();
  for (const entry of experiments.filter(item => !item.archived && item.made.trim())) {
    const key = entry.name.trim().toLocaleLowerCase('tr');
    groups.set(key,[...(groups.get(key) ?? []),entry]);
  }
  return [...groups.values()].flatMap(entries => {
    const rated = entries.filter(item => item.ratings.flow >= 1 && item.ratings.flow <= 5);
    if (rated.length < 2) return [];
    const mean = rated.reduce((sum,item) => sum+item.ratings.flow,0)/rated.length;
    const again = entries.filter(item => item.ratings.again >= 1 && item.ratings.again <= 5);
    const againMean = again.length ? again.reduce((sum,item) => sum+item.ratings.again,0)/again.length : 0;
    return [{ name: entries[0].name, count: rated.length, mean, text: mean >= 4 ? `${rated.length} deneyde akış ortalaman ${mean.toFixed(1).replace('.',',')}/5. Bu yönde çalışırken daha kolay yoğunlaşıyorsun.` : again.length >= 2 && againMean >= 4 ? `Akış ortalaman ${mean.toFixed(1).replace('.',',')}/5; buna rağmen yeniden deneme isteğin yüksek (${againMean.toFixed(1).replace('.',',')}/5).` : `${rated.length} deneyde akış ortalaman ${mean.toFixed(1).replace('.',',')}/5. Yeni bir denemeyle karşılaştırabilirsin.` }];
  });
}
export function closeWeek(journey: Journey, key: string, review: Reflection, now = new Date().toISOString()): Journey {
  if (!validDate(key)) throw new Error('Geçerli bir hafta seç.');
  if (![review.flow,review.forced,review.best,review.more,review.learned].some(value => value.trim())) throw new Error('Haftayı kapatmadan önce en az bir soruya yanıt ver.');
  return { ...journey, reviews: { ...journey.reviews, [key]: { ...review, closedAt: journey.reviews[key]?.closedAt || now } } };
}
