import { env } from 'cloudflare:workers';
import { authenticatedUser, bearerRequest, unauthorized } from '../../../auth/context';
import { getDatabase } from '../../../db/client';
import { GenerationRepository } from '../../../generation/repository';
import { createFailoverProvider, resolveModelConfig } from '../../../generation/provider';
import { providerFailureCode, providerFailureMessage, providerFailureStatus } from '../../../generation/provider-errors';
import type { ProviderBindings } from '../../../generation/provider';
import { GenerationError, GenerationService } from '../../../generation/service';
import { CREATE_CATEGORIES, DIGITAL_PLATFORMS, GENERATION_UNAVAILABLE, IDEA_DIFFICULTIES, IDEA_DURATIONS, IDEA_MOODS, REBUILD_CATEGORIES, RESEARCH_CATEGORIES, SOCIAL_CATEGORIES } from '../../rebuild/idea-engine';
import type { IdeaRequest, SuggestionType } from '../../rebuild/idea-engine';

export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers:{'Cache-Control':'private, no-store'} });
const bindings = () => env as unknown as ProviderBindings;
const suggestionTypes = ['project','digital_project','image_prompt','research','activity','meal','vocabulary','speaking'];
const categoriesByType:Record<string,Set<string>>={project:new Set(CREATE_CATEGORIES.map(item=>item.value)),research:new Set(RESEARCH_CATEGORIES.map(item=>item.value)),activity:new Set(SOCIAL_CATEGORIES.map(item=>item.value))};
const rebuildTypes=new Map<string,string>(REBUILD_CATEGORIES.map(item=>[item.value,item.type]));
const digitalPlatforms=new Set<string>(DIGITAL_PLATFORMS.filter(item=>item.value!=='surprise').map(item=>item.value));
async function readBody(request: Request) {
  const reader=request.body?.getReader(); if(!reader)throw new GenerationError('invalid-request',400);
  let size=0;let result='';const decoder=new TextDecoder();
  try { for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new GenerationError('request-too-large',413);}result+=decoder.decode(value,{stream:true});} }
  finally {reader.releaseLock();}
  try { const body=JSON.parse(result+decoder.decode());if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body; }
  catch {throw new GenerationError('invalid-request',400);}
}
export async function GET(request: Request) {
  const owner=authenticatedUser();if(!owner)return unauthorized();
  try {
    const params=new URL(request.url).searchParams;
    const before=params.get('before'),type=params.get('type');
    if(type!==null&&!suggestionTypes.includes(type))return json({error:'Geçersiz geçmiş türü.'},400);
    if(before && (!/^\d+$/.test(before)||!Number.isSafeInteger(Number(before))||Number(before)<1))return json({error:'Geçersiz geçmiş sayfası.'},400);
    const store=new GenerationRepository(getDatabase(),owner);await store.ensure();
    return json(await store.page(before?Number(before):Number.MAX_SAFE_INTEGER,(type??undefined) as SuggestionType|undefined));
  }catch{return json({error:'Üretim geçmişi şu anda yüklenemedi.'},503);}
}
export async function POST(request: Request) {
  const owner=authenticatedUser();if(!owner)return unauthorized();
  if(request.headers.get('origin')!==new URL(request.url).origin&&!(bearerRequest()&&!request.headers.get('origin')))return json({error:'Geçersiz istek kaynağı.'},403);
  let store:GenerationRepository|undefined;let lock:string|undefined;
  try {
    const body=await readBody(request);
    if(!['generate','accept','decision'].includes(body.action))throw new GenerationError('invalid-request',400);
    if(body.action!=='generate' && (typeof body.id!=='string'||!/^[-\w]{1,100}$/.test(body.id)))throw new GenerationError('invalid-request',400);
    if(body.action==='generate' && ((body.type && ![...suggestionTypes,'surprise'].includes(body.type))||(body.goal&&!['any','make','research','social','english','body'].includes(body.goal))))throw new GenerationError('invalid-request',400);
    // Rebuild v2 categories choose the card type themselves; a type, if sent, must agree. Legacy categories keep their per-type check.
    if(body.category){
      const mapped=rebuildTypes.get(String(body.category));
      if(mapped){if(body.type&&body.type!=='surprise'&&body.type!==mapped)throw new GenerationError('invalid-request',400);}
      else if(!categoriesByType[String(body.type)]?.has(String(body.category)))throw new GenerationError('invalid-request',400);
    }
    if(body.duration!==undefined&&!IDEA_DURATIONS.includes(body.duration))throw new GenerationError('invalid-request',400);
    if(body.difficulty!==undefined&&!IDEA_DIFFICULTIES.includes(body.difficulty))throw new GenerationError('invalid-request',400);
    if(body.mood!==undefined&&!IDEA_MOODS.includes(body.mood))throw new GenerationError('invalid-request',400);
    if(body.wilder!==undefined&&body.wilder!==true&&body.wilder!==false)throw new GenerationError('invalid-request',400);
    if(body.sourceIdeaId!==undefined&&(typeof body.sourceIdeaId!=='string'||!/^[-\w]{1,100}$/.test(body.sourceIdeaId)))throw new GenerationError('invalid-request',400);
    if(body.action==='generate'&&(Boolean(body.wilder)!==(body.sourceIdeaId!==undefined)||(body.wilder&&body.type==='image_prompt')))throw new GenerationError('invalid-request',400);
    if(body.platform&&(body.type!=='digital_project'||!digitalPlatforms.has(String(body.platform))))throw new GenerationError('invalid-request',400);
    if(body.words && (!Array.isArray(body.words)||body.words.length>20||body.words.some((word:unknown)=>typeof word!=='string'||word.length>60)))throw new GenerationError('invalid-request',400);
    if(body.visualMode && (body.type!=='image_prompt'||!['concept','prompt','variation'].includes(body.visualMode)))throw new GenerationError('invalid-request',400);
    if(body.sourceId && (body.type!=='image_prompt'||typeof body.sourceId!=='string'||!/^[-\w]{1,100}$/.test(body.sourceId)))throw new GenerationError('invalid-request',400);
    if(body.visualMode==='variation'&&!body.sourceId)throw new GenerationError('invalid-request',400);
    if(body.brief!==undefined&&(body.type!=='image_prompt'||typeof body.brief!=='string'||body.brief.length>1000))throw new GenerationError('invalid-request',400);
    const config=resolveModelConfig(bindings());
    store=new GenerationRepository(getDatabase(),owner);await store.ensure();
    if(body.action==='decision') {
      if(!['skipped','rejected'].includes(body.status))throw new GenerationError('invalid-request',400);
      if(!await store.get(body.id))throw new GenerationError('idea-not-found',404);
      await store.decision(body.id,body.status);return json({saved:true});
    }
    const existing=body.action==='accept'?await store.get(body.id):null;
    if(body.action==='accept'&&!existing)throw new GenerationError('idea-not-found',404);
    if(existing?.status==='accepted')return json({idea:existing});
    const requiresModel=body.action==='generate'||existing?.type==='project'||existing?.type==='digital_project'||existing?.type==='research';
    if(requiresModel&&!config.apiKey)return json({error:'AI bağlantısı henüz kurulmadı. Sunucuya seçilen sağlayıcının API anahtarı eklenmeli.',code:'not_configured'},503);
    if(!await store.allowRequest())throw new GenerationError('rate-limited',429);
    const token=crypto.randomUUID();if(!await store.acquire(token))throw new GenerationError('generation-in-progress',409);lock=token;
    const service=new GenerationService(store,createFailoverProvider(bindings()),`${config.provider}/${config.model}`);
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(95_000)]);
    const mappedType=body.category?rebuildTypes.get(String(body.category)):undefined;
    const idea=body.action==='generate'?await service.generate({type:body.type&&body.type!=='surprise'?body.type:mappedType??body.type,goal:body.goal,category:body.category,duration:body.duration,difficulty:body.difficulty,mood:body.mood,wilder:body.wilder===true,sourceIdeaId:body.sourceIdeaId,platform:body.platform,words:body.words,brief:body.brief?.trim(),visualMode:body.visualMode,sourceId:body.sourceId} as IdeaRequest,signal):existing?.type==='digital_project'?await service.generateDigitalProjectPlan(body.id,signal):existing?.type==='research'?await service.generateResearchPlan(body.id,signal):await service.accept(body.id,signal);
    return json({idea});
  }catch(error){
    const code=error instanceof GenerationError?error.code:providerFailureCode(error);
    // Log only a bounded diagnostic code, never keys, provider bodies or private input.
    console.warn('Orbit generation failed',code);
    if(code==='no-digital-result')return json({error:'Yalnızca yazılımdan oluşan, yeni bir dijital proje bulunamadı. Tekrar deneyebilirsin.',code},503);
    if(code==='visual-source-mismatch')return json({error:'AI görselin ana konusunu koruyamadı. Aynı kaynakla tekrar deneyebilirsin.',code},503);
    const messages:Record<string,string>={'generation-in-progress':'Bir üretim zaten sürüyor. Bitince tekrar dene.','wilder-limit':'Bu fikir en fazla 3 kez çılgınlaştırılabilir. Yeni bir fikir iste.','rate-limited':'Çok hızlı istek gönderildi. Bir dakika sonra tekrar dene.','no-novel-result':'Öncekilerden yeterince farklı bir fikir üretilemedi. Tekrar dene.','idea-not-found':'Bu fikir geçmişte bulunamadı.','invalid-request':'Geçersiz üretim isteği.','invalid-provider-output':'AI geçerli bir yanıt üretemedi. Tekrar dene; özel verilerin gönderilmedi.'};
    return json({error:messages[code]||providerFailureMessage(code)||GENERATION_UNAVAILABLE,code},error instanceof GenerationError?error.status:providerFailureStatus(code));
  }finally{if(store&&lock)await store.release(lock).catch(()=>{});}
}
