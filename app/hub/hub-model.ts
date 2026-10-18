export type HubPlatform = 'youtube' | 'twitter' | 'github' | 'instagram' | 'web';

// Single source for the Hub categories: filter chips, the Groq prompt and validation of model output all read this list.
// Links saved earlier may carry other category names (e.g. "Yapay Zeka", "GitHub"); those are shown exactly as stored.
export const HUB_CATEGORIES = [
  'Yapay Zekâ', 'Yazılım ve Kod', 'Tasarım', 'Araçlar', 'Eğitim ve Kurs', 'Haber ve Makale', 'Video ve İzleme', 'İlham ve Referans',
  'İş ve Girişimcilik', 'Pazarlama', 'Sağlık ve Spor', 'Finans', 'Eğlence ve Oyun', 'Alışveriş', 'Diğer',
] as const;

// Old names the model (or older saves) used, mapped to the current list. Only applied to NEW model output.
const CATEGORY_ALIASES: Record<string, (typeof HUB_CATEGORIES)[number]> = {
  'yapay zeka': 'Yapay Zekâ', 'yazılım geliştirme': 'Yazılım ve Kod', 'yazılım': 'Yazılım ve Kod', 'kod': 'Yazılım ve Kod', 'github': 'Yazılım ve Kod',
  'haberler': 'Haber ve Makale', 'haber': 'Haber ve Makale', 'makale': 'Haber ve Makale', 'iş dünyası': 'İş ve Girişimcilik', 'girişimcilik': 'İş ve Girişimcilik',
  'eğitim': 'Eğitim ve Kurs', 'kurs': 'Eğitim ve Kurs', 'video': 'Video ve İzleme', 'ilham': 'İlham ve Referans', 'referans': 'İlham ve Referans',
  'sağlık': 'Sağlık ve Spor', 'spor': 'Sağlık ve Spor', 'eğlence': 'Eğlence ve Oyun', 'oyun': 'Eğlence ve Oyun',
};

export const matchHubCategory = (value: unknown): string => {
  if (typeof value !== 'string') return 'Diğer';
  const key = value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
  return HUB_CATEGORIES.find(item => item.toLocaleLowerCase('tr') === key) ?? CATEGORY_ALIASES[key] ?? 'Diğer';
};

export const HUB_NOTE_MAX = 2000;
/** Personal note: text only, line breaks kept, trimmed and capped; empty means no note. */
export const cleanHubNote = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const note = value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim().slice(0, HUB_NOTE_MAX).trim();
  return note || undefined;
};

/** Server-side guard for /api/state: only string notes survive, capped. Returns a copy; other state is untouched. */
export const clampHubNotes = (state: unknown): unknown => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const record = state as Record<string, unknown>;
  if (!Array.isArray(record.hubLinks)) return state;
  return { ...record, hubLinks: record.hubLinks.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !('note' in entry)) return entry;
    const { note, ...rest } = entry as Record<string, unknown>;
    const clean = cleanHubNote(note);
    return clean ? { ...rest, note: clean } : rest;
  }) };
};

export type HubEmbeddedLink = {
  url: string;
  platform: HubPlatform;
  title: string;
  summary: string;
  thumbnailUrl?: string;
};

export type HubLink = {
  id: string;
  url: string;
  platform: HubPlatform;
  title: string;
  summary: string;
  /** "Ne işe yarar": one sentence on what the page is for. Optional; older links do not have it. */
  purpose?: string;
  /** True when the page could not be read and the analysis is a guess from the domain and meta data. */
  estimated?: boolean;
  /** True when the text is still in the source language because no Turkish version could be produced. */
  untranslated?: boolean;
  /** Personal note written by the user. Never touched by re-analysis. */
  note?: string;
  thumbnailUrl?: string;
  author?: string;
  categories: string[];
  mainCategory: string;
  addedBy: string;
  createdAt: string;
  embedded: HubEmbeddedLink[];
  images: string[];
};

export type HubAnalysis = Omit<HubLink, 'id' | 'addedBy' | 'createdAt'>;

/** Re-analysis refreshes only the description fields. title, category, tags and the personal note are never in the patch. */
export const buildReanalysisPatch = (link: HubLink, payload: Partial<HubAnalysis> & { error?: string }): { patch?: Partial<HubLink>; message: string } => {
  const worse = (payload.estimated || payload.untranslated) && Boolean(link.purpose) && !link.untranslated && !link.estimated;
  if (worse || !payload.summary) return { message: 'İçerik şu an daha iyi analiz edilemedi; mevcut bilgiler korundu.' };
  const patch: Partial<HubLink> = { summary: payload.summary, purpose: payload.purpose, estimated: payload.estimated, untranslated: payload.untranslated };
  if (!link.images.length && payload.images?.length) patch.images = payload.images;
  if (!link.thumbnailUrl && payload.thumbnailUrl) patch.thumbnailUrl = payload.thumbnailUrl;
  return { patch, message: payload.untranslated ? 'Açıklama güncellendi, ancak Türkçeye çevrilemedi.' : 'Açıklama ve “Ne işe yarar” güncellendi.' };
};

/** Search text for the Hub library: everything a person might remember, including the note. */
export const hubSearchText = (link: HubLink) => `${link.title} ${link.summary} ${link.purpose ?? ''} ${link.note ?? ''} ${link.url} ${link.categories.join(' ')}`.toLocaleLowerCase('tr');

export const normalizeHubLinks = (value: unknown): HubLink[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): HubLink[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Partial<HubLink>;
    if (typeof item.id !== 'string' || typeof item.url !== 'string' || typeof item.title !== 'string') return [];
    const platform: HubPlatform = ['youtube', 'twitter', 'github', 'instagram', 'web'].includes(item.platform ?? '') ? item.platform as HubPlatform : 'web';
    return [{
      id: item.id,
      url: item.url,
      platform,
      title: item.title,
      summary: typeof item.summary === 'string' ? item.summary : '',
      ...(typeof item.purpose === 'string' && item.purpose ? { purpose: item.purpose.slice(0, 400) } : {}),
      ...(item.estimated === true ? { estimated: true } : {}),
      ...(item.untranslated === true ? { untranslated: true } : {}),
      ...(cleanHubNote(item.note) ? { note: cleanHubNote(item.note) } : {}),
      thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : undefined,
      author: typeof item.author === 'string' ? item.author : undefined,
      categories: Array.isArray(item.categories) ? item.categories.filter((tag): tag is string => typeof tag === 'string').slice(0, 8) : [],
      mainCategory: typeof item.mainCategory === 'string' ? item.mainCategory : 'Diğer',
      addedBy: typeof item.addedBy === 'string' ? item.addedBy : 'Orbit',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
      embedded: Array.isArray(item.embedded) ? item.embedded.filter((link): link is HubEmbeddedLink => Boolean(link && typeof link === 'object' && typeof link.url === 'string')) : [],
      images: Array.isArray(item.images) ? item.images.filter((image): image is string => typeof image === 'string').slice(0, 8) : [],
    }];
  }).slice(0, 200);
};

export type WorkflowRole = 'SEN' | 'AI' | 'BERABER' | 'AUTO';
export type WorkflowSection = { title: string; text?: string; items?: { label: string; description?: string; url?: string }[] };
export type WorkflowCard = {
  id: string;
  index?: number;
  title: string;
  description: string;
  role?: WorkflowRole;
  timing: string;
  tone: string;
  sections: WorkflowSection[];
};

export const workflowPhases: WorkflowCard[] = [
  { id: 'idea', index: 0, title: 'Fikir', role: 'SEN', timing: 'Her proje başında', tone: 'sand', description: 'Ürünü, kullanıcıyı ve başarı ölçüsünü önce kafanda netleştir.', sections: [
    { title: 'Temel sorular', items: [
      { label: 'NE', description: 'Bu ürün tam olarak ne yapıyor? Tek cümleyle anlat.' },
      { label: 'KİM', description: 'Kim kullanacak? Spesifik bir kullanıcı profili tanımla.' },
      { label: 'NEDEN', description: 'Neden var olmalı ve bugünkü alternatif ne?' },
      { label: 'BAŞARI', description: 'İşe yaradığını hangi ölçülebilir sinyalle anlayacaksın?' },
    ] },
    { title: 'Çıkış kriteri', text: 'Belirsiz kalan her soru sonraki fazlarda engel olur. Fikir, hedef kitle ve başarı kriteri tek sayfada okunabilir olmalı.' },
  ] },
  { id: 'research', index: 1, title: 'Araştır', role: 'AI', timing: 'Her proje başında', tone: 'blue', description: 'Pazarı, gerçek kullanıcı ihtiyacını ve teknik sınırları araştır.', sections: [
    { title: 'Araştırma kanalları', items: [
      { label: 'Rakip analizi', description: 'Temel özellikler, fiyatlandırma, güçlü ve zayıf taraflar.' },
      { label: 'Sosyal sinyaller', description: 'Reddit, X ve topluluklardaki gerçek kullanıcı şikâyetleri.' },
      { label: 'Teknik analiz', description: 'API maliyeti, barındırma, riskler ve MVP süresi.' },
    ] },
    { title: 'Araçlar', items: [{ label: 'Deep Research' }, { label: 'Reddit / X' }, { label: 'Product Hunt' }] },
  ] },
  { id: 'design', index: 2, title: 'Tasarla', role: 'SEN', timing: 'Her proje başında', tone: 'rose', description: 'Referanslardan beslenen, tutarlı ve belgelenmiş bir UI/UX oluştur.', sections: [
    { title: 'Tasarım adımları', items: [
      { label: 'Referans topla', description: 'Benzer ürünlerde çalışan kalıpları incele.' },
      { label: 'Ekranları üret', description: 'Önce ana akışları, sonra durum ve boş ekranlarını tasarla.' },
      { label: 'DESIGN.md', description: 'Renk, tipografi, aralık, bileşen ve responsive kurallarını yaz.' },
      { label: 'Stil transferi', description: 'Ekran görüntüsü ve ölçüler üzerinden tasarım niyetini açıkla.' },
      { label: 'Mobil kontrol', description: 'Dar ekran, dokunma hedefleri, taşmalar ve klavye akışını doğrula.' },
    ] },
  ] },
  { id: 'plan', index: 3, title: 'Planla', role: 'BERABER', timing: 'Her proje başında', tone: 'violet', description: 'Teknik şartnameyi, küçük görevleri ve proje hafızasını kur.', sections: [
    { title: 'Kritik belgeler', items: [
      { label: 'AGENTS.md / CLAUDE.md', description: 'Amaç, teknoloji, klasör yapısı, kod kuralları ve yasaklar.' },
      { label: 'PLAN.md', description: 'Küçük, sıralı ve doğrulanabilir görevler.' },
      { label: 'PROGRESS.md', description: 'Tamamlananlar, bekleyenler, kararlar ve sorunlar.' },
      { label: 'DESIGN.md', description: 'Görsel sistem ve bileşen davranışları.' },
    ] },
  ] },
  { id: 'setup', index: 4, title: 'Kur', role: 'AUTO', timing: 'Tek seferlik', tone: 'cyan', description: 'Agent yapısını, bağlantıları, kuralları ve otomasyonu hazırla.', sections: [
    { title: 'Altyapı kurulumu', items: [
      { label: '.claude/ veya .agents/', description: 'Komut, agent, skill ve kural klasörleri.' },
      { label: 'Hooks', description: 'Araç kullanımından önce ve sonra çalışan zorunlu kontroller.' },
      { label: 'MCP / bağlayıcılar', description: 'GitHub, veritabanı, tasarım ve dış servis erişimleri.' },
      { label: 'İzinler', description: 'Minimum yetki, güvenli komutlar ve gizli anahtar yönetimi.' },
    ] },
  ] },
  { id: 'build', index: 5, title: 'İnşa Et', role: 'BERABER', timing: 'Her faz', tone: 'mint', description: 'Planla, onayla, küçük parçalar halinde uygula ve her adımı doğrula.', sections: [
    { title: 'Geliştirme döngüsü', text: 'Bağlamı oku → görevi seç → planı görünür kıl → uygula → test et → sonucu ve kalan riski kaydet.' },
    { title: 'Hız araçları', items: [
      { label: 'Bileşen kütüphaneleri', description: 'Hazır parçayı tasarım sistemine uyarlayarak kullan.' },
      { label: 'Görsel kontrol döngüsü', description: 'Ekran görüntüsü al, farkı analiz et, tekrar doğrula.' },
      { label: 'Agent görevleri', description: 'Test, inceleme ve güvenlik işlerini atomik sorumluluklara ayır.' },
    ] },
  ] },
  { id: 'review', index: 6, title: 'Review', role: 'AUTO', timing: 'Her faz sonu', tone: 'red', description: 'Eksikliği, regresyonu, kod kalitesini ve arayüz uyumunu denetle.', sections: [
    { title: 'Review ekibi', items: [
      { label: 'Completeness', description: 'İstenen kapsam gerçekten tamamlandı mı?' },
      { label: 'Tester', description: 'Build, tip, birim ve regresyon testleri.' },
      { label: 'Reviewer', description: 'Hata, güvenlik, performans ve bakım maliyeti.' },
      { label: 'UI checker', description: 'Tasarım sistemi, responsive davranış ve erişilebilirlik.' },
    ] },
  ] },
  { id: 'ship', index: 7, title: 'Yayınla', role: 'SEN', timing: 'Proje bitiminde', tone: 'indigo', description: 'Dağıt, izle, gerçek geri bildirim al ve yeni iterasyonu başlat.', sections: [
    { title: 'Yayın kanalları', items: [
      { label: 'Web', description: 'Cloudflare, Vercel veya Netlify.' },
      { label: 'Mobil', description: 'TestFlight / iç test, mağaza bilgileri ve ekran görüntüleri.' },
      { label: 'Backend', description: 'Production veritabanı, migration, yedek ve gizli anahtarlar.' },
    ] },
    { title: 'İzleme ve büyüme', items: [
      { label: 'Hata takibi', description: 'Sentry veya benzeri canlı hata görünürlüğü.' },
      { label: 'Analitik', description: 'Plausible, PostHog veya Mixpanel.' },
      { label: 'Arama', description: 'Algolia veya Meilisearch.' },
      { label: 'Otomasyon', description: 'n8n, Zapier veya platform workflow’ları.' },
    ] },
  ] },
];

export const workflowInfrastructure: WorkflowCard[] = [
  { id: 'agent-folder', title: 'Agent klasörü', timing: 'Tek seferlik', tone: 'slate', description: 'Projenin işletim sistemi ve yol üzerindeki kuralları.', sections: [{ title: 'İçerik', items: [
    { label: 'settings', description: 'İzinler, hook bağlantıları ve model tercihleri.' },
    { label: 'commands', description: 'Deploy, hata düzeltme ve review gibi tekrarlı komutlar.' },
    { label: 'agents', description: 'Reviewer, debugger, refactorer ve security rollerinin tanımları.' },
    { label: 'hooks', description: 'Commit ve araç kullanımı öncesi otomatik kontroller.' },
    { label: 'rules', description: 'Belirli dosya yollarında devreye giren kurallar.' },
    { label: 'skills', description: 'Tekrarlanabilir iş akışı yetenekleri.' },
  ] }] },
  { id: 'docs', title: 'Proje hafızası', timing: 'Her proje başında', tone: 'blue', description: 'Kararları oturumlar arasında koruyan kısa ve güncel belgeler.', sections: [{ title: 'Belgeler', items: [
    { label: 'README', description: 'Kurulum, kullanım ve sistem özeti.' },
    { label: 'PLAN', description: 'Uygulama sırası ve kabul kriterleri.' },
    { label: 'PROGRESS', description: 'Mevcut durum, karar ve engeller.' },
    { label: 'DESIGN', description: 'Arayüz dili ve responsive kurallar.' },
  ] }] },
  { id: 'subagents', title: 'Subagents', timing: 'Tek seferlik', tone: 'violet', description: 'Her biri tek, sınırları belli işe odaklanan yardımcı roller.', sections: [{ title: 'Roller', items: [
    { label: 'Code reviewer', description: 'Hata, güvenlik ve bakım analizi.' },
    { label: 'Debugger', description: 'Tekrarlanabilir kök neden analizi.' },
    { label: 'Test runner', description: 'Doğrulama ve regresyon kapsamı.' },
    { label: 'UI checker', description: 'Görsel uyum ve responsive kontrol.' },
  ] }] },
  { id: 'hooks', title: 'Hooks', timing: 'Tek seferlik', tone: 'red', description: 'Atlanamayan otomatik kalite ve güvenlik kapıları.', sections: [{ title: 'Tipler', items: [
    { label: 'Pre-tool', description: 'Riskli veya yetkisiz eylemi çalışmadan engeller.' },
    { label: 'Post-tool', description: 'Format, lint, test veya kayıt işlemini tetikler.' },
    { label: 'Stop', description: 'Görev bitiminde kabul kriterlerini doğrular.' },
  ] }] },
  { id: 'mcp', title: 'MCP ve bağlayıcılar', timing: 'Tek seferlik', tone: 'mint', description: 'AI’nın gerçek sistemlere güvenli erişim köprüleri.', sections: [{ title: 'Öncelik', items: [
    { label: 'GitHub', description: 'Kod, issue, PR ve review bağlamı.' },
    { label: 'Veritabanı', description: 'Şema ve güvenli veri işlemleri.' },
    { label: 'Tasarım', description: 'Figma/Canva gibi kaynaklardan gerçek ölçüler.' },
    { label: 'Gözlemleme', description: 'Hata, log ve performans sinyalleri.' },
  ] }] },
  { id: 'teams', title: 'Agent Teams', timing: 'Her faz', tone: 'cyan', description: 'Bağımsız görevleri paralel, bağımlı işleri sıralı yürüt.', sections: [{ title: 'Takım yapısı', items: [
    { label: 'Lead', description: 'Kapsamı böler ve sonucu birleştirir.' },
    { label: 'Frontend / backend', description: 'Birbirinden bağımsız yüzeyleri uygular.' },
    { label: 'Test / review', description: 'Uygulamadan bağımsız doğrulama yapar.' },
  ] }] },
  { id: 'cycle', title: 'Görev Döngüsü', timing: 'Her faz', tone: 'orange', description: 'Her görevi aynı güvenli başlangıç ve bitiş adımlarıyla yönet.', sections: [{ title: 'Döngü', items: [
    { label: 'Başlat', description: 'Bağlamı ve kabul kriterlerini yükle.' },
    { label: 'Planla', description: 'Risk ve bağımlılıkları görünür kıl.' },
    { label: 'Onayla', description: 'Yönü doğrula.' },
    { label: 'Uygula', description: 'Küçük, geri alınabilir değişiklikler yap.' },
    { label: 'Bitir', description: 'Test et, farkı incele ve sonucu kaydet.' },
  ] }] },
  { id: 'prompts', title: 'Prompt Kütüphanesi', timing: 'Her zaman', tone: 'violet', description: 'Tasarım, araştırma, inceleme, optimizasyon ve güvenlik için hazır reçeteler.', sections: [{ title: 'Kapsam', items: [
    { label: 'Tasarım replikasyonu', description: 'Referansın görsel sistemini analiz edip mevcut ürüne uyarlama.' },
    { label: 'Landing page', description: 'Mesaj hiyerarşisi, kanıt, CTA ve responsive bölüm planı.' },
    { label: 'Code review', description: 'Kanıtlanabilir hata, güvenlik ve performans incelemesi.' },
    { label: 'Optimizasyon', description: 'Ölçüm, darboğaz sıralaması ve önce/sonra doğrulaması.' },
    { label: 'Güvenli kod', description: 'Yetki, girdi, gizli anahtar ve veri kaybı sınırları.' },
    { label: 'Deep Research', description: 'Birincil kaynaklı pazar ve teknik karar matrisi.' },
  ] }] },
  { id: 'skills', title: 'Skills', timing: 'Tek seferlik', tone: 'mint', description: 'Tekrarlanan işleri güvenilir talimat paketlerine dönüştüren yetenekler.', sections: [{ title: 'Avionix kataloğu', items: [
    { label: 'frontend-design', description: 'Üretim kalitesinde, ayırt edici web arayüzleri.' },
    { label: 'clone-website', description: 'Referansı analiz etme, uygulama ve görsel karşılaştırma döngüsü.' },
    { label: 'content-research-writer', description: 'Kaynaklı araştırmayı tutarlı içeriğe dönüştürme.' },
    { label: 'domain-name-brainstormer', description: 'Marka yönüne göre alan adı keşfi.' },
    { label: 'ui-design-intelligence', description: 'Bileşen, stil ve etkileşim kararı desteği.' },
  ] }, { title: 'Kurulum ilkesi', text: 'Skill’i yalnızca tekrar eden ve sınırları belli bir iş için kur. Talimatı kısa tut; gerekli örnek, şablon ve doğrulamayı paketin içinde sakla.' }] },
  { id: 'resources', title: 'Kaynaklar', timing: 'Her zaman', tone: 'blue', description: 'Tasarım ilhamı, motion, tipografi, görsel üretim ve bileşen katalogları.', sections: [{ title: 'Kategoriler', items: [
    { label: 'Web & SaaS', description: 'Landing, navbar, CTA ve ürün ekranı referansları.' },
    { label: 'Mobil', description: 'Native ve cross-platform ekran kalıpları.' },
    { label: 'Motion', description: '60fps etkileşim ve geçiş referansları.' },
    { label: 'Tipografi & renk', description: 'Font eşleme, açık lisanslı yüzler ve paletler.' },
    { label: 'Görsel üretim', description: 'Arka plan, mockup, görsel temizleme ve üretim.' },
    { label: 'AI & komponent', description: 'Şablon, skill ve hazır UI parçaları.' },
  ] }] },
  { id: 'stacks', title: 'Örnek Teknoloji Yığınları', timing: 'Her proje başında', tone: 'indigo', description: 'Proje türüne göre sade, güncel ve işletilebilir başlangıç noktaları.', sections: [
    { title: 'Web SaaS', items: [{ label: 'Frontend', description: 'Next.js · TypeScript · erişilebilir bileşen sistemi.' }, { label: 'Veri', description: 'Postgres · tip güvenli sorgu katmanı · migration.' }, { label: 'Kimlik', description: 'Sunucu doğrulamalı oturum ve minimum yetki.' }, { label: 'Dağıtım', description: 'Cloudflare veya Vercel · gözlemleme · yedek.' }] },
    { title: 'Enterprise web', items: [{ label: 'Backend', description: 'Spring Boot · Java/Kotlin · açık API sözleşmeleri.' }, { label: 'Veri', description: 'Postgres · Redis · kuyruk tabanlı uzun işler.' }, { label: 'Operasyon', description: 'Container · CI/CD · merkezi log ve metrik.' }] },
    { title: 'Mobil', items: [{ label: 'Android native', description: 'Kotlin · Jetpack Compose · Room.' }, { label: 'iOS native', description: 'Swift · SwiftUI · SwiftData.' }, { label: 'Cross-platform', description: 'React Native / Expo · TypeScript · platforma özel kaçış noktaları.' }] },
  ] },
  { id: 'recovery', title: 'Müdahale Noktaları', timing: 'Her zaman', tone: 'sand', description: 'AI kaybolduğunda kapsamı küçült ve son doğrulanmış noktaya dön.', sections: [{ title: 'Kurtarma protokolü', items: [
    { label: 'Durdur', description: 'Yeni değişiklik eklemeyi kes.' },
    { label: 'Kanıt topla', description: 'Hata, log, diff ve tekrar adımlarını çıkar.' },
    { label: 'Daralt', description: 'Sorunu tek dosya veya tek akışa indir.' },
    { label: 'Doğrula', description: 'Önce küçük düzeltmeyi, sonra tüm akışı test et.' },
  ] }] },
];

export const hubResources = [
  { group: 'Web tasarım', links: ['curated.design', 'landing.love', 'saaspo.com', 'godly.website', 'navbar.gallery', 'cta.gallery', 'land-book.com', 'siteinspire.com', 'screenlane.com', 'mobbin.com', 'rebrand.gallery', 'dribbble.com', 'awwwards.com', 'behance.net'] },
  { group: 'Mobil tasarım', links: ['rexpo.io', 'creative-tim.com', 'pro.gluestack.io', 'applighter.com', 'designsystem.line.me', 'figma.com/community/mobile-apps'] },
  { group: 'Motion', links: ['60fps.design', 'appmotion.design'] },
  { group: 'Tipografi ve renk', links: ['coolors.co', 'fontpair.co', 'freefaces.gallery', 'fontshare.com'] },
  { group: 'Görsel üretim', links: ['grainient.supply', 'remove.bg', 'klingai.com', 'figmify.ai', 'bentogrids.com'] },
  { group: 'AI ve bileşen', links: ['aitmpl.com', '21st.dev', 'skillsmp.com', 'component.gallery', 'hugeicons.com'] },
];

export const hubPromptRecipes = [
  { title: 'Tasarım replikasyonu', phase: 'Tasarla', description: 'Referans ekranı körlemesine kopyalamak yerine görsel sistemi ölçüp mevcut ürüne uyarla.', prompt: 'Bu referansı analiz et: tipografi, renk, boşluk, grid, yüzey, radius, gölge, durumlar ve responsive kırılımlar. Mevcut projenin tasarım dilini koruyarak aynı görsel niyeti uygula. Önce fark listesini ve planı yaz; sonra küçük parçalar halinde uygula ve ekran görüntüsüyle doğrula.' },
  { title: 'Frontend planı', phase: 'Planla', description: 'Uygulamadan önce eksik durumları ve mobil davranışı görünür kılar.', prompt: 'İstenen arayüzü kullanıcı akışlarına böl. Her akış için loading, empty, error, success ve offline durumlarını; klavye/erişilebilirlik gereksinimlerini; mobil ve masaüstü davranışını; kabul kriterlerini yaz. Mevcut bileşenleri yeniden kullanma fırsatlarını belirt.' },
  { title: 'Kod review', phase: 'Review', description: 'Bulguları önem ve kanıt sırasına göre raporlar.', prompt: 'Değişikliği hata, güvenlik, veri kaybı, yarış durumu, performans, erişilebilirlik ve responsive davranış açısından incele. Yalnızca kanıtlanabilir bulguları önem sırasıyla; dosya, satır, tetikleme koşulu ve en küçük düzeltmeyle raporla.' },
  { title: 'Optimizasyon', phase: 'Review', description: 'Ölçmeden yapılan mikro optimizasyonları engeller.', prompt: 'Önce darboğazı ölç. Ağ istekleri, bundle, render sayısı, büyük DOM, görseller, cache ve veri sorgularını ayrı değerlendir. En yüksek kullanıcı etkisine sahip üç problemi kanıtlarıyla sırala; davranışı değiştirmeyen en küçük iyileştirmeleri uygula ve önce/sonra ölçümünü paylaş.' },
  { title: 'Güvenli uygulama', phase: 'İnşa Et', description: 'Yetki ve veri sınırlarını önden kurar.', prompt: 'Girdi doğrulama, kimlik doğrulama, yetkilendirme, CSRF/origin, SSRF, XSS, gizli anahtarlar, rate limit, loglarda hassas veri ve silme işlemleri için tehdit modelini çıkar. Güvenliği istemciye bırakma; sunucu tarafında doğrula. Her risk için test edilebilir kabul kriteri ekle.' },
  { title: 'Deep Research', phase: 'Araştır', description: 'Kaynaklı, karar odaklı pazar ve teknik araştırma.', prompt: 'Bu ürün fikri için güncel ve birincil kaynaklara dayalı araştırma yap: hedef kullanıcı, mevcut çözümler, fiyatlar, şikâyetler, farklılaşma, teknik bağımlılıklar, API/hosting maliyeti, hukuki riskler ve iki haftalık MVP kapsamı. Gerçek ile çıkarımı ayır; her önemli iddiayı kaynakla destekle; sonunda karar matrisi oluştur.' },
];
