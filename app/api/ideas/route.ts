import { env } from 'cloudflare:workers';
import { authenticatedUser, unauthorized } from '../../../auth/context';
import { getDatabase } from '../../../db/client';
import { GenerationRepository } from '../../../generation/repository';
import { createModelProvider } from '../../../generation/provider';
import { GenerationError, GenerationService } from '../../../generation/service';
import { GENERATION_UNAVAILABLE } from '../../rebuild/idea-engine';
import type { IdeaRequest } from '../../rebuild/idea-engine';

export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers:{'Cache-Control':'private, no-store'} });
const bindings = () => env as unknown as { OPENAI_API_KEY?: string; OPENAI_MODEL?: string; OPENAI_BASE_URL?: string };
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
    const before=new URL(request.url).searchParams.get('before');
    if(before && (!/^\d+$/.test(before)||!Number.isSafeInteger(Number(before))||Number(before)<1))return json({error:'Geçersiz geçmiş sayfası.'},400);
    const store=new GenerationRepository(getDatabase(),owner);await store.ensure();
    return json(await store.page(before?Number(before):Number.MAX_SAFE_INTEGER));
  }catch{return json({error:'Üretim geçmişi şu anda yüklenemedi.'},503);}
}
export async function POST(request: Request) {
  const owner=authenticatedUser();if(!owner)return unauthorized();
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Geçersiz istek kaynağı.'},403);
  let store:GenerationRepository|undefined;let lock:string|undefined;
  try {
    const body=await readBody(request);
    if(!['generate','accept','decision'].includes(body.action))throw new GenerationError('invalid-request',400);
    if(body.action!=='generate' && (typeof body.id!=='string'||!/^[-\w]{1,100}$/.test(body.id)))throw new GenerationError('invalid-request',400);
    if(body.action==='generate' && ((body.type && !['project','research','surprise','activity','meal','vocabulary','speaking'].includes(body.type))||(body.goal&&!['any','make','research','social','english','body'].includes(body.goal))))throw new GenerationError('invalid-request',400);
    if(body.words && (!Array.isArray(body.words)||body.words.length>20||body.words.some((word:unknown)=>typeof word!=='string'||word.length>60)))throw new GenerationError('invalid-request',400);
    const config=bindings();
    store=new GenerationRepository(getDatabase(),owner);await store.ensure();
    if(body.action==='decision') {
      if(!['skipped','rejected'].includes(body.status))throw new GenerationError('invalid-request',400);
      if(!await store.get(body.id))throw new GenerationError('idea-not-found',404);
      await store.decision(body.id,body.status);return json({saved:true});
    }
    const existing=body.action==='accept'?await store.get(body.id):null;
    if(body.action==='accept'&&!existing)throw new GenerationError('idea-not-found',404);
    if(existing?.status==='accepted')return json({idea:existing});
    const requiresModel=body.action==='generate'||existing?.type==='project'||existing?.type==='research';
    if(requiresModel&&!config.OPENAI_API_KEY)return json({error:'AI üretimi şu anda kullanılamıyor. Sunucuda AI sağlayıcısı yapılandırılmalı.',code:'not_configured'},503);
    if(!await store.allowRequest())throw new GenerationError('rate-limited',429);
    const token=crypto.randomUUID();if(!await store.acquire(token))throw new GenerationError('generation-in-progress',409);lock=token;
    const service=new GenerationService(store,createModelProvider({apiKey:config.OPENAI_API_KEY,model:config.OPENAI_MODEL,baseUrl:config.OPENAI_BASE_URL}),config.OPENAI_MODEL||'gpt-5-mini');
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(95_000)]);
    const idea=body.action==='generate'?await service.generate({type:body.type,goal:body.goal,words:body.words} as IdeaRequest,signal):await service.accept(body.id,signal);
    return json({idea});
  }catch(error){
    const code=error instanceof GenerationError?error.code:'unavailable';
    const messages:Record<string,string>={'generation-in-progress':'Bir üretim zaten sürüyor. Bitince tekrar dene.','rate-limited':'Çok hızlı istek gönderildi. Bir dakika sonra tekrar dene.','no-novel-result':'Öncekilerden yeterince farklı bir fikir üretilemedi. Tekrar dene.','idea-not-found':'Bu fikir geçmişte bulunamadı.','invalid-request':'Geçersiz üretim isteği.'};
    return json({error:messages[code]||GENERATION_UNAVAILABLE,code},error instanceof GenerationError?error.status:503);
  }finally{if(store&&lock)await store.release(lock).catch(()=>{});}
}
