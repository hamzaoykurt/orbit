export type GoalKind = 'body' | 'english' | 'make' | 'research' | 'social' | 'any';
export type Idea = { id: string; kind: 'MAKE' | 'RESEARCH' | 'TRY' | 'LEARN' | 'EXPLORE' | 'GO' | 'BUILD'; goal: Exclude<GoalKind, 'any'>; text: string };
export type IdeaRequest = { goal?: GoalKind; exclude: string[]; signal?: AbortSignal };
// A server-backed provider can be injected here without changing the deck UI.
// The existing /api/organize extracts tasks; it is deliberately not used as a generator.
export type IdeaProvider = (request: IdeaRequest) => Promise<Idea | null>;

const seeds: [Idea['kind'], Idea['goal'], string][] = [
  ['MAKE','make','1997’de tasarlanmış gibi görünen, modern bir müzik çalar arayüzü yap.'],
  ['BUILD','make','Yerçekiminin her 10 saniyede değiştiği küçük bir tarayıcı oyunu yap.'],
  ['MAKE','make','2045’te yürüyüşçülerin kullanacağı hayali bir yön bulma cihazı tasarla.'],
  ['TRY','make','3D yazıcıdan çıkabilecek ilk küçük nesneni tasarla.'],
  ['EXPLORE','make','Dikdörtgen kullanmadan bir arayüz tasarla. Kendine bir saat ver.'],
  ['BUILD','make','Three.js ile dokununca tepki veren tek bir nesne yap.'],
  ['MAKE','make','Bir şarkıyı hiç yazı kullanmadan bir posterle anlat.'],
  ['TRY','make','Bir yaprağı, bir fişi ve bir haritayı küçük bir kolajda buluştur.'],
  ['MAKE','make','Gündelik üç sesten 20 saniyelik bir ses manzarası oluştur.'],
  ['BUILD','make','Kâğıttan, kendi ağırlığını taşıyan küçük bir köprü yap.'],
  ['MAKE','make','Hayali bir doğa tarihi müzesi için tek bir etkileşim tasarla.'],
  ['EXPLORE','make','Tek renk kullanarak aynı duyguyu üç farklı görselle anlat.'],
  ['TRY','make','Daha önce çizmediğin bir nesneyi, kalemi kaldırmadan çiz.'],
  ['MAKE','make','Bir yapay zekâ görselindeki hatayı seç ve onu bilinçli bir tasarıma dönüştür.'],
  ['BUILD','make','Gün boyunca ışığa göre rengi değişen küçük bir web sayfası yap.'],
  ['TRY','make','Basit bir ritim yaz; aynı ritmi üç farklı nesneyle çal.'],
  ['MAKE','make','Bir masalı altı karelik, yazısız bir çizgi hikâyeye dönüştür.'],
  ['TRY','make','Bir tarifte yalnızca tek malzemeyi değiştir. İki versiyonu karşılaştır.'],
  ['RESEARCH','research','Bir uzay aracı yakıt kullanmadan yönünü nasıl değiştirebilir?'],
  ['RESEARCH','research','Bilim insanları soyu tükenmiş hayvanların renklerini nasıl tahmin ediyor?'],
  ['LEARN','research','Lagrange noktası nedir? Kâğıda çizip kendi cümlelerinle anlat.'],
  ['RESEARCH','research','Bir ahtapotun kolları ne kadar bağımsız karar verebilir?'],
  ['EXPLORE','research','Hiç bilmediğin bir müzik geleneğini dinle. Ritimde neyin farklı olduğunu bul.'],
  ['RESEARCH','research','Eski bir binanın yazlık ve kışlık odaları neden farklı yerlerde olur?'],
  ['LEARN','research','Bir mantar ağı ne yapar, ne yapmaz? Popüler bir iddiayı iki kaynakla kontrol et.'],
  ['RESEARCH','research','Bir parfümdeki kokular neden aynı anda kaybolmaz?'],
  ['EXPLORE','research','Bir kelimenin kökenini takip et. Başka bir dildeki akrabasını bul.'],
  ['LEARN','research','Gökyüzünde gördüğün bir yıldızın ışığı ne kadar eski olabilir?'],
  ['RESEARCH','research','Bir harita neyi göstermemeyi seçer? Aynı yerin iki haritasını karşılaştır.'],
  ['RESEARCH','research','Bir oyundaki bekleme süresi neden bazen iyi hissettirir? Üç örnek bul.'],
  ['LEARN','research','Seramikte sır ne işe yarar? Bir ustanın çalışma sürecini izle.'],
  ['RESEARCH','research','Bir şehirde gece duyulan sesler, gündüzden neden farklıdır?'],
  ['GO','social','Daha önce gitmediğin bir yere yürü. Beş sıra dışı ayrıntıyı fotoğrafla.'],
  ['GO','social','Bir arkadaşını kısa bir yürüyüşe davet et. Gideceğiniz yolu birlikte seçin.'],
  ['EXPLORE','social','Yakınındaki bir sergiye gir. Sadece bir işin önünde uzun süre kal.'],
  ['GO','social','Bir sahafa uğra. Hiç ilgilenmediğin bir raftan bir kitabı karıştır.'],
  ['TRY','social','Birine son zamanlarda ne öğrendiğini sor. Kendi cevabını da paylaş.'],
  ['GO','social','Bir atölye, söyleşi ya da açık buluşma bul ve bir tanesine katıl.'],
  ['EXPLORE','social','Bir arkadaşınla birbirinize daha önce duymadığınız birer şarkı dinletin.'],
  ['GO','social','Yakınındaki bir pazarı gez. Tanımadığın bir malzemenin nasıl kullanıldığını sor.'],
  ['TRY','english','Sevdiğin bir nesneyi İngilizce iki dakika anlat. Takılırsan daha basit bir cümle kur.'],
  ['LEARN','english','Kısa bir İngilizce videoyu izle. Sonra videoya bakmadan üç cümleyle anlat.'],
  ['TRY','english','Bir arkadaşınla on dakika İngilizce konuş. Konu: son keşfettiğin bir şey.'],
  ['EXPLORE','english','Hiç bilmediğin bir konu hakkında İngilizce kısa bir yazı oku. Bir sorunu sesli sor.'],
  ['MAKE','english','Bir hayali ürünün İngilizce 30 saniyelik tanıtımını seslendir.'],
  ['TRY','english','Günlük bir işi yaparken adımlarını İngilizce sesli anlat.'],
  ['LEARN','english','Bir film sahnesindeki kısa bir konuşmayı dinle ve kendi sesinle tekrar et.'],
  ['TRY','english','İngilizce bir konuşmada bir soru daha sor; cevabı gerçekten merak ettiğin bir soru.'],
  ['TRY','body','Kendi antrenman programından bir seansa yer aç. Bugünkü seviyene uygun tempoda yap.'],
  ['GO','body','Rahat bir tempoda yürüyüşe çık. Alıştığın rotanın bir bölümünü değiştir.'],
  ['TRY','body','Sevdiğin bir şarkıyla kısa bir hareket molası ver. Performans hedefi koyma.'],
  ['EXPLORE','body','Daha önce denemediğin bir hareket biçiminin başlangıç dersine göz at.'],
  ['GO','body','Mümkünse açık havada, kendini rahat hissettiğin uzunlukta bir yürüyüş yap.'],
  ['TRY','body','Bildiğin rahat hareketlerle kısa bir mobilite molası yap. Sınırlarını zorlama.'],
];
export const ideaPool: Idea[] = seeds.map(([kind,goal,text], index) => ({id:`orbit-seed-${index + 1}`,kind,goal,text}));
export function isIdea(value: unknown): value is Idea {
  if (!value || typeof value !== 'object') return false;
  const item = value as Idea;
  return typeof item.id === 'string' && typeof item.text === 'string' && item.text.trim().length > 0 && item.text.length <= 600
    && ['MAKE','RESEARCH','TRY','LEARN','EXPLORE','GO','BUILD'].includes(item.kind)
    && ['body','english','make','research','social'].includes(item.goal);
}
export function pickLocalIdea(request: IdeaRequest, random = Math.random): Idea {
  const pool = ideaPool.filter(idea => !request.goal || request.goal === 'any' || idea.goal === request.goal);
  // Exhaust the pool before repeating, then exclude at least the current card.
  const unseen = pool.filter(idea => !request.exclude.includes(idea.id));
  const candidates = unseen.length ? unseen : pool.filter(idea => idea.id !== request.exclude.at(-1));
  return candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))];
}
export function createIdeaGenerator(provider?: IdeaProvider) {
  return async (request: IdeaRequest): Promise<Idea> => {
    if (provider) {
      try {
        const result = await provider(request);
        if (request.signal?.aborted) throw new DOMException('Aborted','AbortError');
        if (isIdea(result) && !request.exclude.includes(result.id) && (!request.goal || request.goal === 'any' || result.goal === request.goal)) return result;
      } catch (error) { if (request.signal?.aborted) throw error; }
    }
    if (request.signal?.aborted) throw new DOMException('Aborted','AbortError');
    return pickLocalIdea(request);
  };
}
export const generateIdea = createIdeaGenerator();
