export type GoalKind = 'body' | 'english' | 'make' | 'research' | 'social' | 'any';
export type SuggestionType = 'project' | 'digital_project' | 'image_prompt' | 'video_prompt' | 'research' | 'activity' | 'meal' | 'vocabulary' | 'speaking';
export type DigitalPlatform = 'mobile_app' | 'web_app' | 'desktop_app' | 'game' | 'browser_extension' | 'plugin' | 'automation' | 'interactive_experience';
export const RESEARCH_CATEGORIES = [{value:'surprise',label:'Karışık'},{value:'science',label:'Bilim'},{value:'technology',label:'Teknoloji'},{value:'society',label:'Toplum'},{value:'psychology',label:'Zihin'},{value:'nature',label:'Doğa'},{value:'arts',label:'Sanat'},{value:'future',label:'Gelecek'},{value:'everyday',label:'Gündelik hayat'}] as const;
export const SOCIAL_CATEGORIES = [{value:'surprise',label:'Karışık'},{value:'outdoor',label:'Açık hava'},{value:'indoor',label:'Kapalı alan'},{value:'digital',label:'Dijital'},{value:'culture',label:'Kültür'},{value:'community',label:'Topluluk'},{value:'creative',label:'Yaratıcı'},{value:'low_energy',label:'Düşük enerji'}] as const;
export const CREATE_CATEGORIES = [{value:'surprise',label:'Karışık'},{value:'physical',label:'Fiziksel'},{value:'electronics',label:'Elektronik'},{value:'visual',label:'Görsel'},{value:'craft',label:'El işi'},{value:'spatial',label:'Mekânsal'},{value:'experimental',label:'Deneysel'},{value:'software',label:'Yazılım'}] as const;
export const DIGITAL_PLATFORMS = [{value:'surprise',label:'Karışık'},{value:'mobile_app',label:'Mobil uygulama'},{value:'web_app',label:'Web uygulaması'},{value:'desktop_app',label:'Masaüstü'},{value:'game',label:'Oyun'},{value:'browser_extension',label:'Tarayıcı eklentisi'},{value:'plugin',label:'Eklenti'},{value:'automation',label:'Otomasyon'},{value:'interactive_experience',label:'İnteraktif deneyim'}] as const;
export type ResearchCategory = typeof RESEARCH_CATEGORIES[number]['value'];
export type SocialCategory = typeof SOCIAL_CATEGORIES[number]['value'];
export type CreateCategory = typeof CREATE_CATEGORIES[number]['value'];
// Rebuild v2 categories (server contract: oneri-rebuild-ingilizce.md, SUNUCU SÖZLEŞMESİ). Keys differ from the legacy per-type ones on purpose.
export const REBUILD_CATEGORIES = [{value:'digital_product',label:'Dijital ürün/uygulama',type:'digital_project'},{value:'creative_making',label:'Yaratıcı üretim',type:'project'},{value:'research_learning',label:'Araştırma/öğrenme',type:'research'},{value:'visual_design',label:'Görsel/tasarım',type:'project'},{value:'handmade',label:'Fiziksel/el işi',type:'project'},{value:'social_outdoor',label:'Sosyal/dışarı',type:'activity'},{value:'movement',label:'Spor/sağlık',type:'activity'},{value:'money_work',label:'Para/iş',type:'project'},{value:'play_fun',label:'Oyun/eğlence',type:'project'},{value:'daily_life',label:'Günlük hayat',type:'project'}] as const;
export type RebuildCategory = typeof REBUILD_CATEGORIES[number]['value'];
export const IDEA_DURATIONS = ['15m','1h','half_day','weekend'] as const;
export const IDEA_DIFFICULTIES = ['easy','medium','hard'] as const;
export const IDEA_MOODS = ['energetic','tired','curious','social','solo'] as const;
export type IdeaDuration = typeof IDEA_DURATIONS[number];
export type IdeaDifficulty = typeof IDEA_DIFFICULTIES[number];
export type IdeaMood = typeof IDEA_MOODS[number];
export const MAX_WILDER = 3;
// Prompt Studio (image_prompt v2 + video_prompt). Keys are the wire contract; labels are the Turkish UI text.
export const VISUAL_KINDS = [{value:'poster_type',label:'Tipografik afiş'},{value:'editorial',label:'Editoryal'},{value:'product',label:'Ürün'},{value:'photo_scene',label:'Sahne / fotoğraf'},{value:'illustration',label:'İllüstrasyon'},{value:'cgi_3d',label:'3D / CGI'},{value:'abstract',label:'Soyut'},{value:'logo_mark',label:'Logo / işaret'}] as const;
export const IMAGE_MODELS = [{value:'generic',label:'Genel'},{value:'midjourney',label:'Midjourney'},{value:'ideogram',label:'Ideogram'},{value:'gpt_image',label:'GPT-image'},{value:'flux',label:'Flux'}] as const;
export const TYPO_STYLES = [{value:'serif',label:'Serif'},{value:'grotesk',label:'Grotesk'},{value:'display',label:'Display (gösterişli başlık)'},{value:'handwritten',label:'El yazısı'},{value:'mono',label:'Mono (teknik)'}] as const;
export const TYPO_LAYOUTS = [{value:'center',label:'Ortada'},{value:'top',label:'Üstte'},{value:'bottom',label:'Altta'},{value:'left_stack',label:'Sola yaslı blok'},{value:'oversized_crop',label:'Dev boy, kadrajdan taşan'},{value:'vertical',label:'Dikey'},{value:'diagonal',label:'Çapraz'},{value:'scattered',label:'Dağınık / kinetik'}] as const;
export const TYPO_HIERARCHIES = [{value:'single',label:'Tek vurgu'},{value:'title_sub',label:'Başlık + alt yazı'},{value:'layered',label:'Çok katmanlı'}] as const;
export const TYPO_RELATIONS = [{value:'over_image',label:'Görselin üstünde'},{value:'behind_subject',label:'Nesnenin arkasında'},{value:'integrated',label:'Harfler görselin parçası'},{value:'type_only',label:'Yalnız yazı'}] as const;
export const VIDEO_KINDS = [{value:'kinetic_type',label:'Kinetik tipografi'},{value:'logo_animation',label:'Logo animasyonu'},{value:'motion_graphics',label:'Motion graphics'},{value:'product_3d',label:'3D ürün'},{value:'cinematic_scene',label:'Sinematik sahne'},{value:'loop',label:'Döngü / loop'},{value:'ui_animation',label:'UI animasyonu'}] as const;
export const VIDEO_DURATIONS = [5,10,15,30] as const;
export const VIDEO_ASPECTS = [{value:'9:16',label:'Dikey 9:16'},{value:'1:1',label:'Kare 1:1'},{value:'16:9',label:'Yatay 16:9'}] as const;
export const VIDEO_MODELS = [{value:'generic',label:'Genel'},{value:'veo',label:'Veo'},{value:'sora',label:'Sora'},{value:'kling',label:'Kling'},{value:'runway',label:'Runway'},{value:'remotion_ae',label:'Remotion / After Effects tarifi'}] as const;
const values = <T extends readonly {value:string}[]>(list:T) => list.map(item=>item.value) as T[number]['value'][];
export const PROMPT_STUDIO_VALUES = {visualKind:values(VISUAL_KINDS),imageModel:values(IMAGE_MODELS),typoStyle:values(TYPO_STYLES),typoLayout:values(TYPO_LAYOUTS),typoHierarchy:values(TYPO_HIERARCHIES),typoRelation:values(TYPO_RELATIONS),videoKind:values(VIDEO_KINDS),videoAspect:values(VIDEO_ASPECTS),videoModel:values(VIDEO_MODELS)} as const;
export type VisualKind = typeof VISUAL_KINDS[number]['value'];
export type VideoKind = typeof VIDEO_KINDS[number]['value'];
export type TypographySpec = { text?: string; style?: typeof TYPO_STYLES[number]['value']; layout?: typeof TYPO_LAYOUTS[number]['value']; hierarchy?: typeof TYPO_HIERARCHIES[number]['value']; relation?: typeof TYPO_RELATIONS[number]['value'] };
export type VideoSegment = { start: number; end: number; action: string; camera: string };
export type VideoSpec = { kind: VideoKind; durationSec: typeof VIDEO_DURATIONS[number]; aspect: typeof VIDEO_ASPECTS[number]['value']; timeline: VideoSegment[]; camera: string; motion: string; transitions: string; typographyAnimation: string; audio: string };
export type IdeaCategory = ResearchCategory|SocialCategory|CreateCategory|RebuildCategory;
export type WordSuggestion = { word: string; meaning: string; example: string };
export type ProjectPlan = { description: string; goal: string; scope: string; tasks: string[]; approach: string };
export type ResearchPlan = { subquestions: string[] };
export type Idea = {
  id: string; kind: 'MAKE' | 'RESEARCH' | 'TRY' | 'LEARN' | 'EXPLORE' | 'GO' | 'BUILD';
  goal: Exclude<GoalKind, 'any'>; text: string;
  title?: string; type?: SuggestionType; domain?: string; generatedAt?: string;
  projectPlan?: ProjectPlan; researchPlan?: ResearchPlan; resultingId?: string;
  words?: WordSuggestion[];
  platform?: DigitalPlatform;
  visualMode?: 'concept' | 'prompt' | 'variation';
  parentId?: string;
  // Prompt Studio: Turkish short summary of the English production brief, plus the options the brief was built from.
  summary?: string; visualKind?: VisualKind; targetModel?: string; typography?: TypographySpec; video?: VideoSpec;
  // Rebuild v2 card fields; all optional so records saved before them still open.
  category?: RebuildCategory; tag?: string; why?: string; first30?: string[]; difficulty?: IdeaDifficulty; duration?: string; mood?: IdeaMood;
  wilderOf?: string; wilderCount?: number;
};
export type GeneratedIdea = Idea & {
  title: string; type: SuggestionType; domain: string; generatedAt: string; model: string;
  status: 'generated' | 'skipped' | 'rejected' | 'accepted';
};
export type IdeaRequest = { goal?: GoalKind; type?: SuggestionType | 'surprise'; category?:IdeaCategory; platform?:DigitalPlatform; words?: string[]; brief?: string; visualMode?: 'concept' | 'prompt' | 'variation'; sourceId?: string; visualKind?: VisualKind; targetModel?: string; typoText?: string; typoStyle?: TypographySpec['style']; typoLayout?: TypographySpec['layout']; typoHierarchy?: TypographySpec['hierarchy']; typoRelation?: TypographySpec['relation']; videoKind?: VideoKind; videoDuration?: VideoSpec['durationSec']; aspect?: VideoSpec['aspect']; duration?: IdeaDuration; difficulty?: IdeaDifficulty; mood?: IdeaMood; wilder?: boolean; sourceIdeaId?: string; signal?: AbortSignal };
export const GENERATION_UNAVAILABLE = 'AI üretimi şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.';

export function isIdea(value: unknown): value is Idea {
  if (!value || typeof value !== 'object') return false;
  const item = value as Idea;
  return typeof item.id === 'string' && typeof item.text === 'string' && item.text.trim().length > 0 && item.text.length <= (item.type === 'image_prompt' || item.type === 'video_prompt' ? 2400 : 600)
    && ['MAKE','RESEARCH','TRY','LEARN','EXPLORE','GO','BUILD'].includes(item.kind)
    && ['body','english','make','research','social'].includes(item.goal);
}

// All new suggestions come from the authenticated server. No local idea pool or fallback.
async function api<T>(body: object, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const response = await fetch('/api/ideas', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || GENERATION_UNAVAILABLE);
  return payload as T;
}
export async function generateIdea({ signal, ...request }: IdeaRequest): Promise<GeneratedIdea> {
  const { idea } = await api<{ idea: GeneratedIdea }>({ action: 'generate', ...request }, signal);
  if (!isIdea(idea) || !idea.generatedAt || !idea.type) throw new Error(GENERATION_UNAVAILABLE);
  return idea;
}
export async function acceptIdea(id: string, signal?: AbortSignal): Promise<GeneratedIdea> {
  return (await api<{ idea: GeneratedIdea }>({ action: 'accept', id }, signal)).idea;
}
export async function recordIdeaDecision(id: string, status: 'skipped' | 'rejected', signal?: AbortSignal) {
  await api({ action: 'decision', id, status }, signal);
}
export async function generationHistory(before = '', signal?: AbortSignal, type?: SuggestionType): Promise<{ items: GeneratedIdea[]; next: string | null }> {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  if (type) params.set('type', type);
  const response = await fetch(`/api/ideas${params.size ? `?${params}` : ''}`, { cache: 'no-store', credentials: 'same-origin', signal });
  const payload = await response.json() as { items: GeneratedIdea[]; next: string | null; error?: string };
  if (!response.ok) throw new Error(payload.error || 'Üretim geçmişi yüklenemedi.');
  return payload;
}
