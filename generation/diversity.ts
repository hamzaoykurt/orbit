import type { GeneratedIdea, RebuildCategory } from '../app/rebuild/idea-engine';

// Server-side randomness only varies the starting point; it never mixes unrelated fields. Every lens is an ordinary,
// realistic condition of a normal week. The model may use one lens if it fits naturally and must drop it otherwise.
export const CONSTRAINT_LENSES = [
  'bütçesi sıfır lira', 'en fazla 20 dakikada ilk çıktı verir', 'internetsiz yapılabilen', 'evde zaten olan malzemeyle', 'tek başına yapılabilen',
  'iş çıkışında yarım saatte yapılabilen', 'hafta içi akşam yapılabilen', 'evden çıkmadan yapılabilen', 'yürüme mesafesinde yapılabilen', 'sadece telefonla yapılabilen',
  'sessiz ortamda yapılabilen', 'bir kez yapılıp sonra tekrar edilebilen', 'sonunda elle tutulur ya da gösterilebilir bir çıktısı olan', 'ertesi gün devam ettirilebilen', 'ölçülebilir bir sonucu olan',
  'hafta sonu sabahı yapılabilen', 'hiç hazırlık gerektirmeyen', 'küçük bir adımla başlayan', 'rahat bir tempoda yapılan', 'kimseden randevu ya da izin istemeyen',
];
export const PERSON_LENSES = [
  'işten yorgun dönen biri', 'yeni taşınmış bir öğrenci', 'uzaktan çalışan biri', 'tek başına yaşayan biri', 'yeni mezun iş arayan biri',
  'vardiyalı çalışan biri', 'sınava hazırlanan biri', 'şehre yeni gelmiş biri', 'hafta içi boş akşamı olan biri', 'hafta sonu boş vakti olan biri',
  'ekran başında çok vakit geçiren biri', 'evde çok zaman geçiren biri', 'az bütçeli biri', 'kısa bir molası olan biri', 'yeni bir şeye başlamak isteyen biri',
];

export const SUBFIELDS: Record<RebuildCategory, string[]> = {
  digital_product: ['abonelik ve harcamaları listeleyen tek sayfalık araç', 'sekmeleri düzenleyen tarayıcı eklentisi', 'dosya adlarını toplu düzenleyen betik', 'PDF birleştirme ve bölme aracı', 'birim ve para çevirici', 'kişisel notlarda arama aracı', 'fatura ve ödeme hatırlatıcı', 'alışveriş listesi uygulaması', 'metin kısayolu genişletici', 'kopyalanan metinlerin geçmişi', 'Excel dosyasını temizleyen betik', 'günlük yapılacaklar sayfası', 'haftalık bütçe hesaplayıcı', 'fiyat takip betiği', 'toplantı notu şablonu aracı', 'pomodoro zamanlayıcı', 'kelime kartı çalışma aracı', 'telefon için hesap makinesi', 'otomatik yedekleme betiği', 'e-posta şablon aracı', 'CV bilgisini farklı formatlara çeviren araç', 'ekran görüntüsü düzenleme aracı', 'QR kod üreteci', 'garanti ve fatura takip listesi', 'markdown notlarını arayan masaüstü aracı', 'Telegram ile hatırlatma botu', 'tarayıcıda renk seçici', 'görsel boyutu küçültme aracı', 'proje saat takibi', 'CSV’den grafik çizen sayfa'],
  creative_making: ['kısa film', 'müzik parçası', 'şarkı sözü', 'podcast bölümü', 'kısa öykü', 'çizgi roman sayfası', 'fotoğraf serisi', 'masa oyunu tasarımı', 'günlük çizim alışkanlığı', 'şiir', 'ses kaydı koleksiyonu', 'zine', 'senaryo sahnesi', 'mini belgesel', 'karakter çizimi', 'beat yapımı', 'kolaj', 'bulmaca tasarımı', 'mektup yazma', 'el yazısı pratiği', 'sesli kitap kaydı', 'kısa video kurgusu', 'blog yazısı', 'enstrüman cover', 'tek sayfalık poster', 'fotoğraf albümü düzeni', 'çalışma kaydı videosu', 'kısa animasyon', 'hikâye taslağı', 'kitap incelemesi'],
  research_learning: ['bir mesleğin gizli işleyişi', 'şehir içi bir sistem', 'beslenme ve uyku bilimi', 'dil öğrenme tekniği', 'ekonomik bir olgu', 'hava ve iklim verisi', 'bir icadın hikâyesi', 'hayvan davranışı', 'insan hafızası', 'enerji kaynakları',
    'internetin altyapısı', 'bir mutfak bilimi sorusu', 'toplu taşıma verisi', 'ses ve müzik fiziği', 'bitkilerin iletişimi', 'oyun kuramı', 'kentsel yeşil alan', 'robotik', 'seyahat psikolojisi', 'sosyal medya davranışı',
    'dil ve ağız farkları', 'gıda tedarik zinciri', 'kuantum fikirleri sade anlatım', 'tasarım psikolojisi', 'güvenlik ve gizlilik', 'ilaçsız uyku hijyeni', 'mikroorganizmalar', 'uzay çöpü', 'hukukun gündelik yüzü', 'harita ve yön bulma'],
  visual_design: ['afiş tasarımı', 'logo setleri', 'ikon seti', 'tipografi denemesi', 'renk paleti çalışması', 'infografik', 'ambalaj tasarımı', 'ürün mockup', 'illüstrasyon serisi', 'arayüz yenileme',
    'tek renkli poster', 'kitap kapağı', 'sticker seti', 'harita illüstrasyonu', 'geometrik desen', 'karakter tasarımı', 'sosyal medya şablonu', 'veri posteri', 'emoji seti', 'albüm kapağı',
    'el yazısı font', 'bir mahallenin ikon haritası', 'duvar kâğıdı deseni', 'menü tasarımı', 'otobüs durağı posteri', 'kartvizit', 'hareketli kapak', 'tek sayfalık CV tasarımı', 'oyun kartı tasarımı', 'gölge ve ışık fotoğrafı'],
  handmade: ['ahşap küçük mobilya', '3D baskı aparatı', 'Arduino sensörü', 'dikiş/onarım', 'seramik', 'mum/sabun', 'saksı ve terrarium', 'kâğıt katlama', 'çanta/cüzdan', 'tamir kafe denemesi',
    'LED lamba', 'kitaplık düzeni', 'balkon bahçesi', 'örgü', 'el yapımı kart', 'deri işleme', 'kutu oyunu yapımı', 'cam boyama', 'nesne dönüştürme (upcycling)', 'maket',
    'ev yapımı çini mürekkep', 'kendin yap raf', 'mini sera', 'telefon standı', 'mutfak aleti onarımı', 'baskı kalıbı', 'elektronik saat', 'ilmek ve düğüm', 'tahta oyun', 'bisiklet bakım seti'],
  social_outdoor: ['mahalledeki bir koşu/yürüyüş grubuna katılma', 'kütüphanede okuma kulübü etkinliği', 'dernek ya da belediye gönüllülüğü', 'spor salonunda grup dersi', 'esnaf ya da kasiyerle kısa sohbet', 'eski bir tanıdığa kısa mesaj', 'bir kursun deneme dersi', 'konuşma kulübü (speaking club)', 'masa oyunu kafesinde açık oyun saati', 'fotoğraf yürüyüşü grubu', 'müzede ücretsiz giriş günü', 'online topluluk sohbetine katılma', 'hayvan barınağında gönüllülük', 'mahalle pazarında esnafla sohbet', 'yeni bir semtte tek başına kahve', 'meetup ya da konferans etkinliği', 'kitap fuarı ya da imza günü', 'halk eğitim merkezi kursu', 'yoga ya da tırmanma deneme dersi', 'dernek, kulüp ya da sohbet grubu', 'bir esnafla düzenli selamlaşma', 'yazılım ya da tasarım meetup’ı', 'birine kahve teklif eden kısa mesaj', 'doğa yürüyüşü topluluğu', 'çocukluk arkadaşına mesaj', 'hackathon ya da girişimcilik etkinliği', 'yerel bir topluluk grubunun etkinliği', 'ilgi alanı Discord ya da forum topluluğunda yorum', 'tırmanış salonu ya da koşu grubu', 'dil değişimi buluşması'],
  movement: ['15 dakikalık hareket meydan okuması', 'yeni bir spor denemesi', 'dengeyi zorlayan hareket', 'esneme oyunu', 'merdiven/yokuş challenge', 'dans öğrenme', 'yürüyüş + görev', 'ip atlama', 'yoga pozu serisi', 'bisiklet rotası',
    'yüzme denemesi', 'koşu intervali oyunu', 'parkour temelleri', 'masa başı mini hareketler', 'denge tahtası', 'topla oyun', 'boks gölgesi', 'yeni bir yürüyüş rotası', 'jonglörlük', 'plank süre hedefi',
    'tırmanma duvarı', 'sabah kısa rutin', 'çocukluk oyunu geri getirme', 'kano/kürek denemesi', 'kısa dans videosu', 'esnek ayak bileği/omuz çalışması', 'gülme ve nefes oyunu', 'alışılmadık bir ulaşım şekli', 'oyunlaştırılmış adım hedefi', 'kendi rekorunu kırma günü'],
  money_work: ['küçük bir ürün satma denemesi', 'freelance mini hizmet', 'ikinci el alım-satım', 'beceri paketleme', 'yerel bir esnafa teklif', 'dijital şablon satışı', 'abonelik temizliği', 'bütçe deneyi', 'fiyatlandırma testi', 'iş portfolyosu',
    'LinkedIn/CV yenileme', 'öğrenci işi arayışı', 'ürün fikrini 10 kişiyle sınama', 'el işi satışı', 'e-posta bülteni başlatma', 'ücretsiz denemelik ders verme', 'bir müşteri problemi çözme', 'gelir kalemi listeleme', 'küçük otomasyon satma', 'pazar yeri keşfi',
    'tasarruf meydan okuması', 'mikro eğitim videosu', 'yerel rehberlik hizmeti', 'ev eşyası satma', 'fotoğraf satışı', 'çeviri/yazı işi', 'cold e-posta denemesi', 'bir ay giderleri analizi', 'sosyal medya hesabı denemesi', 'ağ kurma kahvesi'],
  play_fun: ['günlük bulmaca rutini', 'kelime oyunu serisi', 'tek kişilik masa oyunu', 'yapboz yapma', 'satranç problemi çözme', 'sudoku ve mantık bulmacaları', 'solitaire turnuvası', 'hikâye odaklı bir oyunu bitirme', 'retro oyun akşamı', 'çevrimiçi satranç maçı', 'bir oyunu hızlı bitirme denemesi', 'lego ya da maket kurma', 'bilgi yarışması uygulaması', 'yeni bir oyun türünü deneme', 'çevrimiçi kooperatif oyun topluluğu', 'kâğıt kalem oyunları', 'kendi rekorunu kırma', 'kitap ya da dizi maratonu', 'kutu oyunu kuralları öğrenme', 'kart sayma oyunu', 'puzzle kutusu çözme', 'çizgi film ya da eski film gecesi', 'oyun jam’i izleme', 'bilmece çözme', 'tek kişilik dedektif oyunu', 'geri sayım bulmacası', 'mobil oyunda hedef koyma', 'harita oyunu (GeoGuessr tarzı)', 'müzik tahmin oyunu', 'kelime bulmaca dergisi'],
  daily_life: ['dolap düzeni', 'tek tencere yemek', 'uyku öncesi rutin', 'masa düzeni', 'alışveriş listesi hilesi', 'sabah hazırlığı kısaltma', 'dijital çöp temizliği', 'kahve/çay ritüeli', 'evde bitki bakımı', 'küçük bir tamir',
    'mutfak sihri (az malzeme)', 'fatura/evrak düzeni', 'ev içi yürüyüş', 'çamaşır/bulaşık hilesi', 'fotoğraf arşivi düzeni', 'telefon ekranı sadeleştirme', 'hafta menüsü planı', 'hediye hazırlama', 'kokuları değiştirme', 'ses ve ışık ortamı',
    'saklama kutuları', 'günlük tutma yöntemi', 'zaman bloklama hilesi', 'yolda yapılacak mini görev', 'tek bir şeyi bırakma deneyi', 'bir hafta sadece X', 'çanta/cüzdan boşaltma', 'minimal sabah', 'komşu ile paylaşım', 'yemek hazırlığı (meal prep)'],
};

const pick = <T,>(list: readonly T[], random: () => number) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
/** Two plain lenses per request: a practical constraint and an everyday situation. No field blending. */
export function pickLenses(random: () => number = Math.random): string[] {
  return [`kısıt: ${pick(CONSTRAINT_LENSES, random)}`, `kişi/durum: ${pick(PERSON_LENSES, random)}`];
}
/** Draws distinct sub-areas for the category; with no category a random one that fits the card family. */
export function pickSubfields(category: RebuildCategory | undefined, fallbackPool: readonly RebuildCategory[], random: () => number = Math.random, count = 2): string[] {
  const key = category && SUBFIELDS[category] ? category : pick(fallbackPool, random);
  const list = SUBFIELDS[key], chosen: string[] = [];
  for (let guard = 0; chosen.length < Math.min(count, list.length) && guard < 20; guard++) { const item = pick(list, random); if (!chosen.includes(item)) chosen.push(item); }
  return chosen;
}

const clip = (value: string, max: number) => value.length > max ? value.slice(0, max) : value;
const labelOf = (idea: GeneratedIdea) => ({ title: clip(idea.title, 80), tag: clip(idea.tag || idea.domain || '', 40) });
/** Memory handed to the model as DATA: last 30 as title+tag, rejected/skipped apart, accepted as interest signal. History is newest first. */
export function memoryFrom(history: GeneratedIdea[]) {
  const text = history.filter(idea => idea.type !== 'vocabulary' && idea.type !== 'speaking' && idea.type !== 'image_prompt');
  return {
    avoidSimilar: text.slice(0, 30).map(labelOf),
    rejectedOrSkipped: text.filter(idea => idea.status === 'rejected' || idea.status === 'skipped').slice(0, 20).map(labelOf),
    acceptedInterest: text.filter(idea => idea.status === 'accepted').slice(0, 10).map(labelOf),
  };
}
export const SIMILARITY_LIMIT = .5;

// Post-generation realism filter. The prompt asks for plain, solo-doable ideas; this catches what slips through.
// Text is normalised (no diacritics, dotless i -> i) before matching.
const plain = (value: string) => value.normalize('NFKD').toLocaleLowerCase('tr').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// "Do X with your friend(s)": the idea assumes people the user may not have. Messaging or inviting ONE existing contact stays allowed.
const FRIEND_REQUIRED = [
  /\barkadas(?:lar)?(?:in|im|iniz)?(?:la|le)\b/, /\barkadas\w*(?:iyla|lariyla)\b/, /\b(?:ev|oda) arkadas/, /\barkadas grubu/,
  /\b(?:dostunla|dostlarinla|dostlarla)\b/, /\bbirlikte oynayacagin/, /\barkadas(?:lar)?(?:ini|larini) (?:davet|topla|cagir|bir araya)/,
];
const GROUP_REQUIRED = [/\b(?:\d+|iki|uc|dort|bes|alti|birkac) (?:kisi|arkadas|komsu)\w* (?:davet|topla|cagir)/, /\b(?:davet et|bir araya getir|cagir)\w*\b.*\b(?:arkadas|komsular|ev arkadas)/];
const GIMMICK = /\b(?:kozmik|galaktik|seans|tiyatro|dogaclama|skec|fihrist|cember|mistik|buyulu|efsanevi|epik|absurt|canlandir\w*|rol yap\w*|gizli ajan|hazine avi|kod adi|enstalasyon|instalasyon|metafor\w*|interaktif deneyim|oyunlastir\w*|sanal evren|dijital ritueli?|ruhani|gizemli|buyucu|simya)\b|\b(?:uc|3) \w+ ve (?:uc|3) \w+/;
export type RealismProblem = 'friend-required' | 'group-required' | 'gimmick' | 'title-colon' | 'avoided-topic' | 'vague-learning';
// Chemistry vocabulary, applied whenever the user's avoid list names chemistry (kimya / chemistry).
const CHEMISTRY = /\b(?:kimya\w*|reaksiyon\w*|tepkime\w*|asit\w*|asidik|molekul\w*|periyodik tablo|katalizor\w*|cozelti\w*|titrasyon|chemi\w*)\b/;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** True when the text touches an area the user asked never to see. Matching is by word start, so "kimya" also catches "kimyasal". */
export function touchesAvoided(text: string, avoid: readonly string[] = []): boolean {
  const body = plain(text);
  return avoid.some(raw => { const term = plain(raw); if (!term) return false; if (/^(kimya|chem)/.test(term) && CHEMISTRY.test(body)) return true; return new RegExp('(?:^| )' + escapeRegExp(term)).test(body); });
}
// "Sana katacağı" must name something learnable. A why with no learning marker is rejected for project, digital and research cards.
const LEARNING = /(?:ogren|kavra|anlay|anlar|anlat|beceri|bilgi|kesfet|tanir|yapabil|cikar|kulturle|sohbet|hesapla|kodla|ogrenir|oluyorsun|kazan)/;
export const hasLearningOutcome = (why: string) => LEARNING.test(plain(why));
export function realismProblems(fields: { title: string; text: string; summary?: string; why?: string; first30?: string[] }, options: { avoid?: readonly string[]; learning?: boolean } = {}): RealismProblem[] {
  const body = plain([fields.title, fields.summary ?? '', fields.text, fields.why ?? '', ...(fields.first30 ?? [])].join(' . '));
  const found: RealismProblem[] = [];
  if (FRIEND_REQUIRED.some(pattern => pattern.test(body))) found.push('friend-required');
  if (GROUP_REQUIRED.some(pattern => pattern.test(body))) found.push('group-required');
  if (GIMMICK.test(body)) found.push('gimmick');
  if (fields.title.includes(':')) found.push('title-colon');
  if (options.avoid?.length && touchesAvoided(body, options.avoid)) found.push('avoided-topic');
  if (options.learning && fields.why && !hasLearningOutcome(fields.why)) found.push('vague-learning');
  return found;
}

// Social ladder (exposure steps). Past accepted social cards move the user up gradually; with no history the mix is easy-weighted.
export const SOCIAL_STEPS = ['very_easy', 'medium', 'advanced'] as const;
export type SocialStep = typeof SOCIAL_STEPS[number];
export function pickSocialStep(history: GeneratedIdea[], random: () => number = Math.random): SocialStep {
  const done = history.filter(idea => idea.type === 'activity' && idea.category !== 'movement' && idea.status === 'accepted').length;
  const weights: [number, number, number] = done < 2 ? [.7, .3, 0] : done < 5 ? [.35, .55, .1] : done < 9 ? [.15, .55, .3] : [.1, .4, .5];
  let roll = random();
  for (let index = 0; index < 3; index++) { roll -= weights[index]; if (roll < 0) return SOCIAL_STEPS[index]; }
  return SOCIAL_STEPS[1];
}
