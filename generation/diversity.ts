import type { GeneratedIdea, RebuildCategory } from '../app/rebuild/idea-engine';

// Server-side randomness is the source of variety. The model never picks from these lists: they are
// inspiration seeds, drawn fresh on every request, so repeats stop depending on the model's habits.
export const CONSTRAINT_LENSES = [
  'tek bir kelimeyle çalışan bir çözüm', 'tek renkle sınırlı', 'yalnızca tek ekranda olup biten', 'bütçesi sıfır lira', 'en fazla 20 dakikada ilk çıktı verir',
  'internetsiz çalışan', 'tek bir nesneyle yapılan', 'tek cümlelik bir kuralla işleyen', 'yalnızca sesle yapılan', 'sadece elde olan malzemeyle',
  'bir kişiye hediye olarak tasarlanmış', 'sonunda paylaşılabilir tek bir görseli olan', 'bir günde bitip ertesi gün tekrarlanabilen', 'tek cümleyle anlatılabilen', 'rakam ve ölçümle sonuç veren',
  'ters çevrilmiş bir alışkanlık üzerine kurulu', 'sayılarla sınırlı (üç adım, üç parça, üç dakika)', 'yalnızca telefonla yapılabilen', 'gürültüsüz, sessiz ortamda yapılan', 'bir komşuya ya da arkadaşa gösterilebilen',
];
export const PERSON_LENSES = [
  'bir ilkokul öğretmeninin yaşadığı sorun', 'gece vardiyasında çalışan birinin ihtiyacı', 'yeni taşınmış bir öğrencinin durumu', 'emekli bir bakkalın günü', 'kuryelik yapan birinin molası',
  'ilk kez ebeveyn olmuş birinin akşamı', 'uzaktan çalışan bir tasarımcının sıkıntısı', 'küçük bir kafe sahibinin boş saati', 'otobüsle uzun yol giden bir yolcu', 'görme engelli bir arkadaşın günlük işleri',
  'yeni mezun işsiz bir gencin haftası', 'balkonda bitki yetiştiren bir komşu', 'hasta ziyaretine giden biri', 'bir apartman yöneticisinin derdi', 'sınava hazırlanan bir lise öğrencisi',
  'tek başına yaşayan birinin pazar günü', 'bir köy muhtarının günlük işleri', 'turistlere şehri anlatan bir rehber', 'bir freelance yazarın sıkıştığı an', 'sürekli yer değiştiren bir gezgin',
];
export const FIELD_LENSES = [
  'müzik', 'mutfak', 'mimari', 'oyun tasarımı', 'ekonomi', 'psikoloji', 'bahçecilik', 'fotoğraf', 'dil bilimi', 'astronomi',
  'ulaşım', 'moda', 'çocuk gelişimi', 'hukuk günlüğü', 'hikâye yazarlığı', 'veri görselleştirme', 'ses kaydı', 'kentsel doku', 'tarım', 'spor istatistiği',
  'elektronik atık', 'kokular', 'harita yapımı', 'tiyatro', 'matematik oyunları',
];

export const SUBFIELDS: Record<RebuildCategory, string[]> = {
  digital_product: ['tarayıcı eklentisi', 'küçük bir oyun mekaniği', 'otomasyon betiği', 'erişilebilirlik aracı', 'kişisel veri günlüğü', 'sesle çalışan araç', 'klavye kısayolu aracı', 'tek sayfalık hesap makinesi', 'WhatsApp/Telegram botu', 'dosya düzenleme aracı',
    'ekran okuma deneyi', 'kamera ile çalışan araç', 'konum tabanlı mini uygulama', 'yapay zekâ destekli yazı aracı', 'masaüstü widget', 'veri kazıma ve özetleme', 'tema/renk üreteci', 'etkileşimli hikâye', 'alışkanlık dışı bir günlük aracı', 'zamanlayıcı varyasyonu',
    'çevrimdışı çalışan not aracı', 'Excel yerine mini araç', 'öğrenme kartı oluşturucu', 'ses/müzik üreteci', 'fiyat takibi', 'QR/barkod ile çalışan araç', 'kod üretimi deneyi', 'canlı veri paneli', 'çok oyunculu mini oyun', 'emoji ve sembol dili'],
  creative_making: ['kısa film', 'müzik parçası', 'şarkı sözü', 'podcast bölümü', 'kısa öykü', 'çizgi roman sayfası', 'fotoğraf serisi', 'masa oyunu tasarımı', 'video oyunu fikri prototipi', 'stop-motion',
    'şiir', 'ses manzarası kaydı', 'zine', 'senaryo sahnesi', 'canlı performans', 'mini belgesel', 'karakter yaratımı', 'dünya kurma', 'parodi', 'beat yapımı',
    'kolaj', 'komik skeç', 'albüm kapağı + parça adı seti', 'bulmaca tasarımı', 'mektup serisi', 'radyo oyunu', 'yaratıcı yazma sınırlaması', 'ritim oyunu', 'tek planlı video', 'yeniden yorumlama'],
  research_learning: ['bir mesleğin gizli işleyişi', 'şehir içi bir sistem', 'beslenme ve uyku bilimi', 'dil öğrenme tekniği', 'ekonomik bir olgu', 'hava ve iklim verisi', 'bir icadın hikâyesi', 'hayvan davranışı', 'insan hafızası', 'enerji kaynakları',
    'internetin altyapısı', 'bir mutfak bilimi sorusu', 'toplu taşıma verisi', 'ses ve müzik fiziği', 'bitkilerin iletişimi', 'oyun kuramı', 'kentsel yeşil alan', 'robotik', 'seyahat psikolojisi', 'sosyal medya davranışı',
    'dil ve ağız farkları', 'gıda tedarik zinciri', 'kuantum fikirleri sade anlatım', 'tasarım psikolojisi', 'güvenlik ve gizlilik', 'ilaçsız uyku hijyeni', 'mikroorganizmalar', 'uzay çöpü', 'hukukun gündelik yüzü', 'harita ve yön bulma'],
  visual_design: ['afiş tasarımı', 'logo setleri', 'ikon seti', 'tipografi denemesi', 'renk paleti çalışması', 'infografik', 'ambalaj tasarımı', 'ürün mockup', 'illüstrasyon serisi', 'arayüz yenileme',
    'tek renkli poster', 'kitap kapağı', 'sticker seti', 'harita illüstrasyonu', 'geometrik desen', 'karakter tasarımı', 'sosyal medya şablonu', 'veri posteri', 'emoji seti', 'albüm kapağı',
    'el yazısı font', 'bir mahallenin ikon haritası', 'duvar kâğıdı deseni', 'menü tasarımı', 'otobüs durağı posteri', 'kartvizit', 'hareketli kapak', 'tek sayfalık CV tasarımı', 'oyun kartı tasarımı', 'gölge ve ışık fotoğrafı'],
  handmade: ['ahşap küçük mobilya', '3D baskı aparatı', 'Arduino sensörü', 'dikiş/onarım', 'seramik', 'mum/sabun', 'saksı ve terrarium', 'kâğıt katlama', 'çanta/cüzdan', 'tamir kafe denemesi',
    'LED lamba', 'kitaplık düzeni', 'balkon bahçesi', 'örgü', 'el yapımı kart', 'deri işleme', 'kutu oyunu yapımı', 'cam boyama', 'nesne dönüştürme (upcycling)', 'maket',
    'ev yapımı çini mürekkep', 'kendin yap raf', 'mini sera', 'telefon standı', 'mutfak aleti onarımı', 'baskı kalıbı', 'elektronik saat', 'ilmek ve düğüm', 'tahta oyun', 'bisiklet bakım seti'],
  social_outdoor: ['komşuyla ortak proje', 'mahalle keşfi', 'piknik/oyun günü', 'gönüllü bir saat', 'yeni insanlarla yürüyüş', 'bir esnafı tanıma', 'şehirde fotoğraf avı', 'topluluk buluşması', 'kitap/film değişimi', 'ortak yemek akşamı',
    'sokak müziği dinleme turu', 'eski bir arkadaşı arama', 'bir okulda konuşma', 'gece gökyüzü seyri', 'pazar yeri keşfi', 'çiçek/bitki takası', 'ortak oyun gecesi', 'yaşlı bir komşuya yardım', 'yeni bir semtte kahve', 'tanımadığın biriyle sohbet cümlesi',
    'doğa temizliği', 'ödünç alma/verme', 'şehir bulmacası', 'hikâye toplama', 'çocuklarla yaratıcı oyun', 'bir sanatçıyı ziyaret', 'sesli kitap yürüyüşü', 'yerel müze', 'bir mekânı yeniden keşif', 'dayanışma kutusu'],
  movement: ['15 dakikalık hareket meydan okuması', 'yeni bir spor denemesi', 'dengeyi zorlayan hareket', 'esneme oyunu', 'merdiven/yokuş challenge', 'dans öğrenme', 'yürüyüş + görev', 'ip atlama', 'yoga pozu serisi', 'bisiklet rotası',
    'yüzme denemesi', 'koşu intervali oyunu', 'parkour temelleri', 'masa başı mini hareketler', 'denge tahtası', 'topla oyun', 'boks gölgesi', 'yeni bir yürüyüş rotası', 'jonglörlük', 'plank süre hedefi',
    'tırmanma duvarı', 'sabah kısa rutin', 'çocukluk oyunu geri getirme', 'kano/kürek denemesi', 'kısa dans videosu', 'esnek ayak bileği/omuz çalışması', 'gülme ve nefes oyunu', 'alışılmadık bir ulaşım şekli', 'oyunlaştırılmış adım hedefi', 'kendi rekorunu kırma günü'],
  money_work: ['küçük bir ürün satma denemesi', 'freelance mini hizmet', 'ikinci el alım-satım', 'beceri paketleme', 'yerel bir esnafa teklif', 'dijital şablon satışı', 'abonelik temizliği', 'bütçe deneyi', 'fiyatlandırma testi', 'iş portfolyosu',
    'LinkedIn/CV yenileme', 'öğrenci işi arayışı', 'ürün fikrini 10 kişiyle sınama', 'el işi satışı', 'e-posta bülteni başlatma', 'ücretsiz denemelik ders verme', 'bir müşteri problemi çözme', 'gelir kalemi listeleme', 'küçük otomasyon satma', 'pazar yeri keşfi',
    'tasarruf meydan okuması', 'mikro eğitim videosu', 'yerel rehberlik hizmeti', 'ev eşyası satma', 'fotoğraf satışı', 'çeviri/yazı işi', 'cold e-posta denemesi', 'bir ay giderleri analizi', 'sosyal medya hesabı denemesi', 'ağ kurma kahvesi'],
  play_fun: ['kendine mini turnuva', 'bulmaca avı', 'kural koyarak bir gün', 'şans oyunu tasarımı', 'sözsüz iletişim oyunu', 'evde macera oyunu', 'tek kelimelik hikâye', 'rekor denemesi', 'kart oyunu icadı', 'gizli görev listesi',
    'şehirde fotoğraf bingosu', 'kendi dilini icat et', 'saklambaç varyasyonu', 'zar ile karar günü', 'mini hazine avı', 'kelime oyunu', 'parmak oyunu', 'trivia yarışı', 'challenge zinciri', 'eski oyunu yeniden icat',
    'ters gün (her şeyi tersten yap)', 'sessiz film çekimi', 'oyun kuralını bozma', 'komik ödül töreni', 'minecraft/çizim yarışması', 'aile oyun akşamı', 'bilmece yazma', 'hayali şehir kurma', 'mikrofonla spiker olma', 'emoji tahmin oyunu'],
  daily_life: ['dolap düzeni', 'tek tencere yemek', 'uyku öncesi rutin', 'masa düzeni', 'alışveriş listesi hilesi', 'sabah hazırlığı kısaltma', 'dijital çöp temizliği', 'kahve/çay ritüeli', 'evde bitki bakımı', 'küçük bir tamir',
    'mutfak sihri (az malzeme)', 'fatura/evrak düzeni', 'ev içi yürüyüş', 'çamaşır/bulaşık hilesi', 'fotoğraf arşivi düzeni', 'telefon ekranı sadeleştirme', 'hafta menüsü planı', 'hediye hazırlama', 'kokuları değiştirme', 'ses ve ışık ortamı',
    'saklama kutuları', 'günlük tutma yöntemi', 'zaman bloklama hilesi', 'yolda yapılacak mini görev', 'tek bir şeyi bırakma deneyi', 'bir hafta sadece X', 'çanta/cüzdan boşaltma', 'minimal sabah', 'komşu ile paylaşım', 'yemek hazırlığı (meal prep)'],
};

const pick = <T,>(list: readonly T[], random: () => number) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
/** Exactly three lenses per request: a constraint, a person/situation and a two-field blend. */
export function pickLenses(random: () => number = Math.random): string[] {
  const first = pick(FIELD_LENSES, random);
  let second = pick(FIELD_LENSES, random);
  for (let guard = 0; second === first && guard < 6; guard++) second = pick(FIELD_LENSES, random);
  if (second === first) second = FIELD_LENSES[(FIELD_LENSES.indexOf(first) + 1) % FIELD_LENSES.length];
  return [`kısıt: ${pick(CONSTRAINT_LENSES, random)}`, `kişi/durum: ${pick(PERSON_LENSES, random)}`, `iki alanı birleştir: ${first} + ${second}`];
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
