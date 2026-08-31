import { designCatalog } from './design-catalog';
import type { DesignAxis } from './design-catalog';
import type { AnswerKey, CreationDraft, ProjectAnalysis } from './planning-types';
import type { DigitalPlatform } from '../rebuild/idea-engine';

type Option = { id: string; label: string; detail: string };
export type PlanningQuestion = { id: AnswerKey; title: string; hint: string; options?: Option[]; placeholder?: string };
export function planningQuestions(draft: CreationDraft): PlanningQuestion[] {
  const questions: PlanningQuestion[] = [
    {id:'audience',title:'Önce kimin hayatında yer bulacak?',hint:'Herkes için başlamak zorunda değil. İlk kullanıcı grubunu seç.',options:[
      {id:'self',label:'Önce kendim',detail:'Kendi ihtiyacım veya merakım için.'},{id:'team',label:'Küçük bir ekip',detail:'Ortak bir işi kolaylaştırmak için.'},
      {id:'public',label:'Bir topluluk',detail:'Benzer ilgi veya ihtiyacı olanlar için.'},{id:'customers',label:'Potansiyel müşteriler',detail:'Belirli bir probleme çözüm arayanlar için.'}]},
    {id:'goal',title:'Bu projeden en çok ne bekliyorsun?',hint:'İlk sürümün neyi başarması gerektiğini belirleyelim.',options:[
      {id:'solve',label:'Bir sorunu çözmek',detail:'İşe yarayan küçük bir araç.'},{id:'learn',label:'Öğrenmek ve denemek',detail:'Yeni bir beceri veya yöntem.'},
      {id:'showcase',label:'İyi bir iş ortaya koymak',detail:'Portfolyo, anlatım veya görsel deneyim.'},{id:'income',label:'Gelir ihtimalini sınamak',detail:'Ödeme isteğini henüz varsaymadan.'}]},
    {id:'evidence',title:'Fikir hakkında şu an ne biliyoruz?',hint:'Burada rakip taraması yapmıyoruz; elindeki kanıtı soruyoruz.',options:[
      {id:'unknown',label:'Henüz araştırmadım',detail:'Şimdilik bir sezgi ve merak.'},{id:'seen',label:'Benzerlerini gördüm',detail:'Farkını netleştirebiliriz.'},
      {id:'tested',label:'İnsanlarla konuştum',detail:'Somut ihtiyaç veya geri bildirim duydum.'},{id:'paid',label:'Gerçek kullanım / ödeme var',detail:'İlk dış sinyalleri gözlemledim.'}]},
  ];
  if (draft.answers.evidence && draft.answers.evidence !== 'unknown') questions.push({id:'difference',title:'Senin yaklaşımın nerede ayrılıyor?',hint:'Tek cümle yeter. Henüz bilmiyorsan bunu araştırılacak bir soru olarak bırakalım.',placeholder:'Örn. Karmaşık panolar yerine tek günlük karar…'});
  questions.push(
    {id:'scope',title:'İlk sürüm kaç işi üstlenecek?',hint:'Küçültmek fikri zayıflatmaz; ilk denemeyi görünür kılar.',options:[
      {id:'one',label:'Tek bir işi iyi yapacak',detail:'Bir temel akış, bir somut sonuç.'},{id:'several',label:'Birkaç bağlantılı iş',detail:'Birlikte çalışan 2–3 özellik.'},{id:'platform',label:'Kapsamlı bir sistem',detail:'Birçok kullanıcı tipi veya modül.'}]},
    {id:'validation',title:'Tamamını yapmadan nasıl sınayabiliriz?',hint:draft.answers.scope==='platform'?'Büyük sistemden önce tek bir senaryoyu görünür hale getirelim.':'En ucuz öğrenme yolunu seç.',options:[
      {id:'manual',label:'Elle / no-code bir deneme',detail:'Mevcut araçlar, kâğıt veya basit bir maket.'},{id:'prototype',label:'Tıklanabilir / görsel prototip',detail:'Deneyimin nasıl hissettirdiğini göstermek.'},{id:'build',label:'Küçük çalışan sürüm',detail:'Tek bir gerçek işlevi test etmek.'},{id:'unsure',label:'Henüz emin değilim',detail:'Önce doğru deneyi tanımlayalım.'}]},
    {id:'capacity',title:'İlk denemeye ne kadar yer açabilirsin?',hint:'Bu bir teslim sözü değil; önerilen kapsamın sınırı.',options:[
      {id:'weekend',label:'Bir hafta sonu',detail:'Tek bir deney ve küçük bir çıktı.'},{id:'week',label:'Yaklaşık bir hafta',detail:'Odaklanmış bir ilk sürüm.'},{id:'month',label:'Birkaç hafta',detail:'Biraz daha derin bir prototip.'}]},
    {id:'tone',title:'Ortaya çıkan şey nasıl hissettirsin?',hint:'Önerileri hem kullanım amacına hem bu karaktere göre sıralayacağız.',options:[
      {id:'calm',label:'Sakin ve net',detail:'İçerik ve işlev önde.'},{id:'playful',label:'Neşeli ve sıcak',detail:'Davetkâr, küçük sürprizli.'},{id:'bold',label:'Cesur ve deneysel',detail:'Güçlü, sıra dışı bir ifade.'},{id:'premium',label:'Zarif ve rafine',detail:'Ölçülü, yüksek görsel özen.'},{id:'immersive',label:'Mekânsal ve geleceksel',detail:'Katmanlar ve derinlik.'},{id:'retro',label:'Nostaljik ve karakterli',detail:'Geçmişten tanıdık izler.'}]},
  );
  return questions;
}
const normalize = (value: string) => value.toLocaleLowerCase('tr').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
type Medium = 'web' | 'mobile' | 'desktop' | 'game' | 'physical' | 'electronics' | 'content' | 'experiment';
const mediumSignals: Record<Medium, string[]> = {
  web:['web','site','dashboard','panel','takip','yonetim','planlama','uygulama','yazilim','app','saas','eklenti'],
  desktop:['masaustu','desktop','windows','macos','linux','pc yazilim'],
  mobile:['mobil','telefon','android','ios','apk'],game:['oyun','game','oynanis','oyuncu'],
  physical:['fiziksel','masa nesnesi','urun tasarimi','maket','kagit','ahsap','3d baski'],
  electronics:['arduino','elektronik','sensor','devre','mikrodenetleyici','robot'],
  content:['yayin','bulten','dergi','video','belgesel','icerik','podcast'],experiment:['simulasyon','deney','gorsellestir','enstalasyon'],
};
const media: Record<Medium,{label:string;build:string;test:string;tech:string[];extension:string}> = {
  desktop:{label:'Masaüstü uygulaması',build:'Tek dosya veya veri kümesiyle ana işlevi çalışan bir masaüstü prototipine bağla',test:'Hedef işletim sisteminde kurulum, dosya izinleri ve veriyi yeniden açmayı dene',tech:['Hedef işletim sistemine uygun tek masaüstü çatısı','Önce yerel dosya / veri saklama; uzaktaki servisleri gerekirse ekle'],extension:'İhtiyaç doğrulanırsa toplu işlem ve klavye kısayollarını ekle'},
  electronics:{label:'Elektronik / donanım prototipi',build:'Tek giriş ve çıkışı düşük gerilimli geliştirme kartında sınayan devreyi prototiple',test:'Sensör girdisi ile beklenen tepkiyi ölç; bağlantı ve güç sınırlarını kontrol et',tech:['Bileşen veri sayfaları ve devre simülasyonu','Tek geliştirme kartı, düşük gerilim ve gerekli ölçüm araçları'],extension:'İlk işlev doğrulanınca muhafaza ve bağlantı dayanıklılığını iyileştir'},
  web:{label:'Web / dijital araç',build:'Tek temel akışın giriş ve sonuç ekranını çalışan bir web prototipinde bağla',test:'İlk kullanıcının temel işi yardım almadan tamamlayıp tamamlayamadığını gözle',tech:['İlk arayüz: HTML / CSS ve gerektiği kadar JavaScript','Veri saklama ihtiyacını kanıtladıktan sonra sunucu / veritabanı ekle'],extension:'Temel akış işe yararsa paylaşım veya dışa aktarmayı değerlendir'},
  mobile:{label:'Mobil deneyim',build:'Bir telefon ekran boyutunda temel etkileşimi ve sonuç durumunu prototiple',test:'Akışı gerçek telefonda dokunma, klavye ve geri dönüş davranışıyla dene',tech:['Önce dokunulabilir ekran prototipi','Cihaz özelliği gerekliyse ilgili platform API’sini küçük bir denemeyle doğrula'],extension:'Gerçek ihtiyaç oluşursa çevrimdışı kullanım veya bildirim ekle'},
  game:{label:'Oyun / oynanabilir deneyim',build:'Tek mekaniği, kısa bir oynanış döngüsü ve bitiş koşuluyla çalıştır',test:'Bir kişinin oyunu açıklama olmadan denemesini izle; takıldığı anı kaydet',tech:['Tek bir 2D / 3D oyun motoru veya tarayıcı tuvali','İlk testte geçici görseller ve tek sahne yeterli'],extension:'Temel döngü ilgi görürse ikinci bir mekanik veya bölüm dene'},
  physical:{label:'Fiziksel / ürün deneyi',build:'Tek işlevi sınayan ölçülü bir kâğıt, karton veya basit malzeme maketi yap',test:'Maketi kullanım koşulunda dene; boyut, tutuş ve işlev sorunlarını kaydet',tech:['Ölçekli çizim ve eldeki malzemeler','Üretim gerektirirse CAD ve malzeme denemesini ayrı doğrula'],extension:'İlk işlev doğrulanınca malzeme ve üretim yöntemini iyileştir'},
  content:{label:'İçerik / yayın',build:'Tek formatta bir pilot içerik veya örnek yayın hazırla',test:'Pilot içeriği ilk okuyucu / izleyiciyle dene; neyi anladığını sor',tech:['Mevcut yazı, ses veya video düzenleme aracı','Özel platform geliştirmeden küçük bir yayın kanalı'],extension:'İlk içerik ilgi görürse ikinci bölüm ve yayın ritmini dene'},
  experiment:{label:'Yaratıcı / araştırma deneyi',build:'Tek değişkeni görünür kılan küçük bir etkileşim veya deney düzeneği kur',test:'Bir kişinin sonucu yorumlamasını iste; neyin anlaşılmadığını kaydet',tech:['Deneyin gerektirdiği tek görselleştirme / prototipleme aracı','Teknik belirsizliği ayrı, küçük bir denemeyle sınırla'],extension:'İlk deney anlaşılırsa ikinci bir senaryo veya değişken ekle'},
};
export const suggestedTitle = (idea: string) => {
  const phrase=idea.trim().split(/[.!?\n]/)[0];
  return phrase.length<=65?phrase:phrase.slice(0,65).replace(/\s+\S*$/,'')+'…';
};
export function analyzeProject(draft: CreationDraft, platform?: DigitalPlatform): ProjectAnalysis {
  const input=normalize(`${draft.idea} ${draft.answers.difference || ''}`), a=draft.answers;
  const medium=(Object.entries(mediumSignals) as [Medium,string[]][]).map(([id,words])=>({id,score:words.reduce((sum,word)=>sum+(input.includes(word)?word.length>6?2:1:0),0)})).sort((x,y)=>y.score-x.score)[0];
  const platforms: Record<DigitalPlatform, Medium> = {mobile_app:'mobile',web_app:'web',desktop_app:'desktop',game:'game',browser_extension:'web',plugin:'desktop',automation:'desktop',interactive_experience:'web'};
  const recipe=media[platform ? platforms[platform] : medium.score?medium.id:'experiment'];
  const axes: Record<DesignAxis,number>={clarity:3,expression:2,trust:2,density:2,depth:1,nostalgia:0,play:1};
  const signals: { words:string[]; weights:Partial<Record<DesignAxis,number>> }[]=[
    {words:['finans','para','gorev','takip','plan','dashboard','yonetim','not'],weights:{clarity:2,trust:2,density:2}},
    {words:['portfolyo','medya','gorsel','sanat','yaratici','sergi'],weights:{expression:2,depth:1}},
    {words:['oyun','eglence','cocuk','topluluk'],weights:{play:2,expression:1}},
    {words:['3d','sanal','mekan','immersive'],weights:{depth:3,expression:1}},
    {words:['retro','nostalji','eski','analog'],weights:{nostalgia:4,expression:1}},
    {words:['premium','luks','sinema','estetik'],weights:{trust:1,expression:2,depth:1}},
  ];
  for(const signal of signals){const matches=Math.min(2,signal.words.filter(word=>input.includes(word)).length);for(const [axis,weight] of Object.entries(signal.weights))axes[axis as DesignAxis]+=matches*weight!;}
  if(a.audience==='team'||a.audience==='customers'){axes.trust+=2;axes.clarity+=1;}
  if(a.goal==='solve'){axes.clarity+=2;axes.density+=1;}
  if(a.goal==='showcase')axes.expression+=2;
  const toneWeights: Record<string,Partial<Record<DesignAxis,number>>>={calm:{clarity:3,trust:1},playful:{play:4,expression:1},bold:{expression:4},premium:{trust:3,expression:2},immersive:{depth:4},retro:{nostalgia:5}};
  for(const [axis,weight] of Object.entries(toneWeights[a.tone||'']||{}))axes[axis as DesignAxis]+=weight!;
  for(const axis of Object.keys(axes) as DesignAxis[])axes[axis]=Math.min(5,axes[axis]);
  const axisReasons:Record<DesignAxis,string>={clarity:'işlevin hızlı anlaşılmasını',expression:'karakterli bir görsel ifadeyi',trust:'güven veren bir sunumu',density:'birden fazla bilgiyi birlikte okumayı',depth:'katman ve derinliği',nostalgia:'nostaljik karakteri',play:'sıcak ve oyunlu etkileşimi'};
  const leading=(Object.keys(axes) as DesignAxis[]).sort((x,y)=>axes[y]-axes[x]).slice(0,2);
  const recommendations=designCatalog.map(style=>({style,score:Object.entries(axes).reduce((sum,[axis,value])=>sum-Math.abs(value-style.affinity[axis as DesignAxis])*(value>=4?1.7:1),0)})).sort((x,y)=>y.score-x.score).slice(0,3).map(({style})=>({styleId:style.id,reason:`${recipe.label} bağlamı ve seçimlerin ${leading.map(axis=>axisReasons[axis]).join(' ve ')} öne çıkarıyor. ${style.name} bu ihtiyaçlarla örtüşüyor.`}));
  const broad=a.scope==='platform', uncertain=a.evidence==='unknown'||!a.evidence;
  const audience={self:'Önce kendin',team:'Küçük bir ekip',public:'İlgili bir topluluk',customers:'Problemi yaşayan potansiyel müşteriler'}[a.audience||'self']||'İlk kullanıcı henüz net değil';
  const title=draft.title.trim()||suggestedTitle(draft.idea);
  const anchor=`“${title}”`;
  const firstSteps=[
    `${anchor} için ${audience.toLocaleLowerCase('tr')} bağlamında tek bir kullanım senaryosu ve beklenen sonucu yaz.`,
    a.validation==='manual'?`${anchor} fikrinin temel sonucunu mevcut araçlarla / elle üret; ilk denemede otomasyonu ertele.`:`${anchor}: ${recipe.build.toLocaleLowerCase('tr')}.`,
    `${anchor}: ${recipe.test.toLocaleLowerCase('tr')}.`,
  ];
  return {version:1,source:'local',summary:draft.idea.trim(),type:recipe.label,
    difficulty:broad?'Yüksek · kapsam küçültülmeli':a.validation==='manual'?'Düşük / orta · elle deneme':'Orta · teknik doğrulama gerekli',
    mvpFit:broad?'Daraltınca uygun':a.validation==='unsure'?'Önce test yöntemi seçilmeli':'Küçük bir ilk denemeye uygun',
    revenue:a.goal==='income'?'Ödeme isteği doğrulanacak; model henüz seçilmedi':'İlk sürüm için gelir hedefi yok',audience,
    suggestedLifecycle:uncertain?'research':broad?'mvp':a.validation==='build'?'mvp':'idea',
    priority:a.evidence==='paid'||a.evidence==='tested'?'Öncelikli deneme':'Keşif · diğer işlerinle karşılaştır',
    scope:broad?'Tek kullanıcı tipi + tek temel işlev':a.scope==='several'?'Bir çekirdek akış, diğer özellikler sonra':'Tek çekirdek kullanım senaryosu',
    solo:broad?'İlk deney tek başına; tüm sistem için yeniden değerlendir':'Küçük prototip tek başına denenebilir',
    technical:a.validation==='manual'?'Başlangıçta düşük':medium.id==='physical'?'Malzeme / üretim denemesi gerekli':'Prototipte sınırlı; entegrasyonlar ayrı doğrulanmalı',
    designIntensity:axes.expression>=4?'Yüksek':'Dengeli',contentIntensity:medium.id==='content'?'Yüksek':'Düşük / orta',
    route:uncertain?'Önce belirsizliği azalt':broad?'Fikri MVP’ye indir':'Küçük bir denemeyle başla',
    routeReason:uncertain?'Henüz dış kanıt yok. Benzer çözümleri ve ilk kullanıcı ihtiyacını araştır; ilgi varmış gibi plan yapma.':broad?'Birden fazla modül ilk denemeyi geciktirir. Tek kullanıcı, tek problem ve tek sonucu seç.':'Elindeki sinyali küçük bir prototiple sınayabilirsin. Sonuç, sonraki kapsamı belirlesin.',
    mvp:`${anchor}: ${audience.toLocaleLowerCase('tr')} için tek bir sonuç üreten ${a.validation==='manual'?'elle yürütülen deneme':'küçük prototip'}. ${broad?'Diğer modüller, üyelik katmanları ve otomasyon ilk sürümün dışında.':'Birden fazla senaryo ve ek özellikler ilk doğrulamadan sonra.'} ${a.capacity==='weekend'?'Hafta sonu hedefi yalnızca bu deneme.':a.capacity==='week'?'Bir haftalık zaman kutusunda önce bu akışı sına.':'Birkaç haftayı ayrı öğrenme denemelerine böl.'}`,
    firstSteps,nextWeek:[`${anchor} denemesinden gelen en önemli sürtünmeyi düzelt.`,`${anchor} için ${recipe.extension.toLocaleLowerCase('tr')}.`],technologies:recipe.tech,
    research:[`${anchor} fikrinin hedeflediği işi ${audience.toLocaleLowerCase('tr')} bugün nasıl çözüyor?`,`${anchor} ile aynı ihtiyaca cevap veren hangi alternatifler var; hangi kanıtla karşılaştırılabilir?`,a.difference?.trim()?`“${a.difference.trim()}” farkı ilk kullanıcı için gerçekten önemli mi?`:`${anchor} için mevcut alternatiflerden ayrılan en küçük, sınanabilir fark ne olabilir?`,`${anchor} prototipinde hangi gözlenebilir sonuç devam etmeye değer olduğunu gösterir?`],
    features:[recipe.extension,'Geri bildirim doğrularsa ikinci bir kullanıcı senaryosu'],
    risks:[...(uncertain?['Kullanıcı ilgisi ve rakip farkı henüz doğrulanmadı.']:['Paylaşılan kullanım / ödeme sinyali bağımsız olarak doğrulanmadı.']),...(broad?['Mevcut kapsam tek kişilik ilk deneme için büyük.']:[]),...(a.goal==='income'?['Gelir modeli ve ödeme isteği varsayım; fiyat veya kazanç tahmini yapılmadı.']:[]),'Süre ve zorluk, beceri ve teknik ayrıntılar bilinmeden yalnızca ön tahmindir.'],recommendations,
  };
}

// A provider can replace this adapter without changing the wizard or persisted model.
export interface ProjectAdvisor { analyze(draft: CreationDraft, signal?: AbortSignal): Promise<ProjectAnalysis> }
export const localProjectAdvisor: ProjectAdvisor = { async analyze(draft,signal){signal?.throwIfAborted();return analyzeProject(draft);} };
