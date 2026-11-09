import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { loadModuleUrl } from './load-module.mjs';

const url=(file,replacements={})=>{
  let code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const [from,to] of Object.entries(replacements))code=code.replaceAll(from,to);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
};
const schemaUrl=url('../generation/schema.ts'),repoUrl=url('../generation/repository.ts',{"'./schema'":JSON.stringify(schemaUrl)}),engineUrl=url('../app/rebuild/idea-engine.ts'),diversityUrl=url('../generation/diversity.ts'),studioUrl=url('../generation/prompt-studio.ts',{"'../app/rebuild/idea-engine'":JSON.stringify(engineUrl)}),serviceUrl=url('../generation/service.ts',{"'./prompt-studio'":JSON.stringify(studioUrl),"'../app/rebuild/idea-engine'":JSON.stringify(engineUrl),"'./diversity'":JSON.stringify(diversityUrl)});
const safeFetchUrl=url('../generation/safe-fetch.ts'),providerUrl=url('../generation/provider.ts',{"'./safe-fetch'":JSON.stringify(safeFetchUrl)}),providerErrorsUrl=url('../generation/provider-errors.ts');
const {GenerationRepository}=await import(repoUrl),{GenerationService}=await import(serviceUrl),{createModelProvider}=await import(providerUrl);
const {resolveModelConfig}=await import(providerUrl);
const preserveUrl=url('../app/preserve-extras.ts'),preserveMap={"'../preserve-extras'":JSON.stringify(preserveUrl)};
const practice=await import(url('../app/rebuild/practice-model.ts',preserveMap));
const {projectFromIdea}=await import(loadModuleUrl(new URL('../app/rebuild/project-import.ts',import.meta.url)));
const deck=await import(url('../app/rebuild/weekly-deck-model.ts',{"'./idea-engine'":JSON.stringify(engineUrl),...preserveMap}));
function database(){
  const sqlite=new DatabaseSync(':memory:');
  return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){const info=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(info.changes)}};},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};}};},sqlite};
}
async function repo(owner='owner',db=database()){const store=new GenerationRepository(db,owner);await store.ensure();return {store,db};}
const project={title:'Kağıt akustiği',text:'Katlanmış kağıttan sesi farklı yönlere yansıtan bir masa nesnesi yap.',domain:'Akustik',type:'project',kind:'BUILD',goal:'make'};
const topic={title:'Buzun kayganlığı',text:'Basınç ve yüzey erimesi buzun kayganlığını nasıl değiştirir?',domain:'Yüzey fiziği',type:'research',kind:'RESEARCH',goal:'research'};
const plan={description:'Katlanmış yüzeylerden oluşan bir ses yansıtıcısı.',goal:'İki katlama geometrisinin ses yönüne etkisini karşılaştır.',scope:'Bir akşam; kağıt ve telefonla tek prototip.',tasks:['İki farklı kağıt katlama geometrisi çiz','Katlanmış iki reflektörü aynı ses kaynağıyla karşılaştır','Duyulan farkları prototipin üzerinde işaretle'],approach:'Telefonu aynı mesafede tut.'};
const questions={subquestions:['Buz yüzeyinde sıvı tabaka ne zaman oluşur?','Basınç erime sıcaklığını nasıl değiştirir?','Kayma hızı sürtünme ısısını nasıl etkiler?','Yüzey pürüzlülüğünün rolü nedir?']};
const response=output=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});

test('no configured provider fails explicitly; there is no local fallback',async()=>{
  let calls=0;await assert.rejects(createModelProvider({},async()=>{calls++;return response(project);})({}),/not-configured/);assert.equal(calls,0);
  const {store}=await repo();const service=new GenerationService(store,async()=>{throw Error('offline');},'test');
  await assert.rejects(service.generate({type:'project'}),/offline/);assert.deepEqual(await store.all(),[]);
});

test('Gemini uses server-side key and schema, ignores thought parts and never falls back on quota errors',async()=>{
  const config=resolveModelConfig({AI_PROVIDER:'gemini',GEMINI_API_KEY:'test-gemini-key',OPENAI_API_KEY:'unused-openai'});
  assert.equal(config.model,'gemini-3.8-flash');assert.equal(config.modelPinned,false);assert.equal(resolveModelConfig({GEMINI_API_KEY:'k',GEMINI_MODEL:' gemini-x '}).model,'gemini-x');assert.equal(config.apiKey,'test-gemini-key');
  assert.equal(resolveModelConfig({AI_PROVIDER:'gemini',OPENAI_API_KEY:'unused'}).apiKey,undefined);
  assert.throws(()=>resolveModelConfig({AI_PROVIDER:'invalid'}),/config-invalid/);
  let sent,calls=0;
  const provider=createModelProvider(config,async(endpoint,options)=>{calls++;sent={endpoint:String(endpoint),headers:options.headers,body:JSON.parse(options.body)};return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private thought'},{text:JSON.stringify(project)}]}}]});});
  assert.deepEqual(await provider({name:'test',instructions:'Generate',input:{request:'new'},schema:{type:'object'}}),project);
  assert.equal(calls,1);assert.equal(sent.headers['x-goog-api-key'],'test-gemini-key');assert.ok(!sent.endpoint.includes('test-gemini-key'));
  assert.equal(sent.body.generationConfig.responseMimeType,'application/json');assert.deepEqual(sent.body.generationConfig.responseSchema,{type:'object'});
  calls=0;await assert.rejects(createModelProvider({...config,model:'gemini-x',modelPinned:true},async()=>{calls++;return new Response('quota',{status:429});})({name:'test',input:{},schema:{}}),/provider-http-429/);assert.equal(calls,1);
  const hosts=new Set();calls=0;await assert.rejects(createModelProvider(config,async endpoint=>{calls++;hosts.add(new URL(endpoint).host);return new Response('quota',{status:429});})({name:'test',input:{},schema:{}}),/provider-http-429/);assert.equal(calls,3);assert.deepEqual([...hosts],['generativelanguage.googleapis.com']);
  for(const payload of [{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{finishReason:'MAX_TOKENS'}]},{candidates:[{finishReason:'STOP',content:{parts:[{text:'not json'}]}}]}])await assert.rejects(createModelProvider(config,async()=>Response.json(payload))({name:'test',input:{},schema:{}}));
});

test('Gemini receives every output contract through generation, novelty, vocabulary and accepted plans',async()=>{
  const {store}=await repo();const contracts=[];
  const provider=createModelProvider({provider:'gemini',apiKey:'test-only-key'},async(endpoint,options)=>{
    const body=JSON.parse(options.body),wire=body.generationConfig.responseSchema;
    // Simulate an upstream that cannot invent the application's missing fields.
    if(!wire)return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"suggestion":"A new idea"}'}]}}]});
    const instructions=body.systemInstruction.parts[0].text;
    const full=JSON.parse(instructions.slice(instructions.lastIndexOf('\n')+1));
    contracts.push(full);
    const verify=(source,converted)=>{
      assert.equal(converted.type,source.type);
      for(const key of ['enum','required','minItems','maxItems'])assert.deepEqual(converted[key],source[key]);
      for(const key of ['additionalProperties','minLength','maxLength'])assert.equal(converted[key],undefined);
      if(source.properties){assert.deepEqual(Object.keys(converted.properties),Object.keys(source.properties));assert.deepEqual(converted.propertyOrdering,Object.keys(source.properties));for(const key in source.properties)verify(source.properties[key],converted.properties[key]);}
      if(source.items)verify(source.items,converted.items);
    };
    verify(full,wire);
    const input=JSON.parse(body.contents[0].parts[0].text);
    let output;
    if(wire.properties.duplicate)output={duplicate:false};
    else if(wire.properties.tasks)output=plan;
    else if(wire.properties.subquestions)output=questions;
    else if(wire.properties.words)output={words:['arrive','borrow','quiet','instead','nearby'].map(word=>({word,meaning:'örnek anlam',example:`We use ${word} here.`}))};
    else output=input.requestType==='research'?topic:project;
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output)}]}}]});
  });
  const service=new GenerationService(store,provider,'gemini/test');
  const idea=await service.generate({type:'project'});
  assert.deepEqual((await service.accept(idea.id)).projectPlan,plan);
  const research=await service.generate({type:'research'});
  assert.deepEqual((await service.accept(research.id)).researchPlan,questions);
  assert.equal((await service.generate({type:'vocabulary',goal:'english'})).words.length,5);
  assert.equal(contracts.length,8);
  assert.equal((await store.all()).length,3);
  assert.equal(contracts[0].properties.text.maxLength,240);
});
test('provider sends strict server-side schema and rejects incomplete, refusal and malformed outputs',async()=>{
  let sent;const provider=createModelProvider({apiKey:'test-only-key',model:'configured-model'},async(endpoint,options)=>{sent={endpoint:String(endpoint),...JSON.parse(options.body)};return response(project);});
  assert.deepEqual(await provider({name:'test',instructions:'instructions',input:{request:'new'},schema:{type:'object'}}),project);
  assert.equal(sent.model,'configured-model');assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.endpoint,'https://api.openai.com/v1/responses');
  for(const payload of [{status:'incomplete',output:[]},{status:'completed',output:[{content:[{type:'refusal'}]}]},{status:'completed',output:[{content:[{type:'output_text',text:'invalid'}]}]}])await assert.rejects(createModelProvider({apiKey:'test'},async()=>Response.json(payload))({name:'x',input:{},schema:{}}));
});
test('generation persists fresh concepts, expands only after acceptance and retries accepted plans idempotently',async()=>{
  const {store}=await repo();const calls=[];const service=new GenerationService(store,async request=>{calls.push(request);return request.name==='orbit_accepted_plan'?plan:project;},'test-model',()=>.2);
  const idea=await service.generate({type:'project'});
  assert.equal(calls.length,2);assert.equal(idea.projectPlan,undefined);assert.equal((await store.all()).length,1);
  const accepted=await service.accept(idea.id);assert.deepEqual(accepted.projectPlan,plan);assert.equal(calls.length,3);assert.equal(accepted.status,'accepted');
  assert.deepEqual(await service.accept(idea.id),accepted);assert.equal(calls.length,3);
  const imported=projectFromIdea(accepted);assert.deepEqual(imported.project.tasks,plan.tasks);assert.equal(imported.workspace.description,plan.description);assert.ok(imported.workspace.notes[0].body.includes(plan.scope));assert.equal(imported.project.id,accepted.resultingId);
});
test('research acceptance creates topic-specific questions, preserves main question and can resume after reload',async()=>{
  const {store}=await repo();const calls=[];const service=new GenerationService(store,async request=>{calls.push(request);return request.name==='orbit_accepted_plan'?questions:topic;},'test');
  const idea=await service.generate({type:'research'});assert.equal(idea.researchPlan,undefined);
  const accepted=await service.accept(idea.id);assert.equal(calls.length,3);
  let state=practice.acceptIntoPractice(practice.emptyPractice(),accepted);
  state=practice.updateQuestion(state,accepted.resultingId,state.research[0].questions[0].id,{explored:true,note:'Kısa kanıt notu'});
  const roundtrip=practice.normalizePractice(JSON.parse(JSON.stringify(state)));
  assert.equal(roundtrip.research[0].question,topic.text);assert.equal(roundtrip.research[0].questions[0].explored,true);assert.equal(roundtrip.research[0].questions[0].note,'Kısa kanıt notu');
  assert.deepEqual(practice.acceptIntoPractice(roundtrip,accepted),roundtrip);
});
test('exact and near duplicates are rejected, never rerolled from stored history',async()=>{
  const {store}=await repo();let calls=0;const service=new GenerationService(store,async()=>{calls++;return project;},'test');await service.generate({type:'project'});
  await assert.rejects(service.generate({type:'project'}),error=>error.code==='no-novel-result');assert.equal(calls,5);assert.equal((await store.all()).length,1);
  const semantic=new GenerationService(store,async request=>request.name==='orbit_novelty'?{duplicate:true}:{...project,title:'Ses masası',text:'Bir masa objesiyle sesin yönünün nasıl değiştiğini karşılaştır.'},'test');
  await assert.rejects(semantic.generate({type:'project'}),error=>error.code==='no-novel-result');assert.equal((await store.all()).length,1);
});
test('unexpected directions are requested without using saved interests as a restrictive ranking',async()=>{
  const {store}=await repo();let prompt;const service=new GenerationService(store,async request=>{if(request.name==='orbit_suggestion')prompt=request;return topic;},'test',()=>.9);
  await service.generate({type:'surprise'});assert.match(prompt.input.direction,/outside/);assert.equal(prompt.input.goal,'any');assert.match(prompt.instructions,/NEVER as a restrictive/);
});
test('Surprise cannot become workout/English, plans must match request and questions cannot be generic duplicate entries',async()=>{
  const {store}=await repo();for(const wrong of [{...project,type:'meal',goal:'body'},{...project,type:'speaking',goal:'english'}])await assert.rejects(new GenerationService(store,async()=>wrong,'test').generate({type:'surprise'}));
  await assert.rejects(new GenerationService(store,async()=>topic,'test').generate({type:'project'}));
  await assert.rejects(new GenerationService(store,async()=>project,'test').generate({goal:'body'}),error=>error.code==='workouts-not-supported');
  const service=new GenerationService(store,async request=>request.name==='orbit_accepted_plan'?{subquestions:['Same','Same','Same','Same']}:topic,'test');const idea=await service.generate({type:'research'});await assert.rejects(service.accept(idea.id));assert.equal((await store.get(idea.id)).status,'generated');
});
test('history is durable and paginated; decisions, ownership, concurrency leases and limits hold in SQLite',async()=>{
  const {store,db}=await repo();const other=(await repo('other',db)).store;
  for(let index=0;index<35;index++)await store.insert({...project,id:`idea-${index}`,generatedAt:new Date().toISOString(),model:'test',status:'generated'},`fingerprint-${index}`);
  await store.decision('idea-0','skipped');assert.equal((await store.get('idea-0')).status,'skipped');assert.equal(await other.get('idea-0'),null);
  const page=await store.page(Number.MAX_SAFE_INTEGER);assert.equal(page.items.length,30);assert.equal((await store.page(Number(page.next))).items.length,5);
  assert.equal(await store.acquire('a'),true);assert.equal(await store.acquire('b'),false);await store.release('wrong');assert.equal(await store.acquire('c'),false);await store.release('a');assert.equal(await store.acquire('b'),true);
  for(let index=0;index<20;index++)assert.equal(await store.allowRequest(),true);assert.equal(await store.allowRequest(),false);
});
test('new week resets only weekly marks; vocabulary, incomplete research, project and speaking history survive',()=>{
  let state=practice.emptyPractice();state.activeProjectId='generated-project';state.sessions=[{id:'session',at:'2026-08-25T12:00:00Z',seconds:42,prompt:'A real prompt',words:['use']}];
  state.research=[{id:'research',ideaId:'idea',title:'Current',question:'Question?',startedAt:'2026-08-25T12:00:00Z',questions:[{id:'q',text:'Why?',explored:false,note:'',evidence:'',implication:'',unknown:''}],synthesis:{explanation:'',keyPoints:'',openQuestions:''},sources:[],images:[],quiz:null}];state.currentResearchId='research';
  const prior=JSON.stringify(state);let weekly=deck.ensureWeek(deck.emptyDeck(),'2026-08-24');weekly=deck.completeGoal(weekly,'2026-08-24','body',{id:'sport',at:'2026-08-25T12:00:00Z'});weekly=deck.ensureWeek(weekly,'2026-08-31');
  assert.deepEqual(weekly.weeks['2026-08-31'].marks,{});assert.equal(JSON.stringify(state),prior);assert.deepEqual(practice.normalizePractice(JSON.parse(prior)),state);assert.equal(practice.speakingCount(state,'2026-08-31'),0);assert.equal(practice.speakingCount(state,'2026-08-24'),1);
});
test('spaced review returns struggling words after 10 minutes and known words at increasing intervals',()=>{
  const now='2026-08-30T12:00:00Z';let state={...practice.emptyPractice(),words:[{id:'w',word:'afford',meaning:'gücü yetmek',example:'I can afford it.',addedAt:now,dueAt:now,reviews:0,successes:0}]};
  state=practice.reviewWord(state,'w',true,now);assert.equal(state.words[0].dueAt,'2026-08-31T12:00:00.000Z');assert.equal(practice.dueWords(state,Date.parse(now)).length,0);
  state=practice.reviewWord(state,'w',true,'2026-08-31T12:00:00Z');assert.equal(state.words[0].dueAt,'2026-09-03T12:00:00.000Z');
  state=practice.reviewWord(state,'w',false,'2026-09-03T12:00:00Z');assert.equal(state.words[0].dueAt,'2026-09-03T12:10:00.000Z');assert.equal(state.words[0].successes,0);assert.equal(state.words[0].reviews,3);assert.equal(practice.dueWords(state,Date.parse('2026-09-03T12:11:00Z')).length,1);
});

test('vocabulary is generated afresh, retained on acceptance and never taught twice',async()=>{
  const {store}=await repo();
  const words=['afford','instead','notice','borrow','quiet'].map(word=>({word,meaning:`Meaning of ${word}`,example:`I use ${word} in daily life.`}));
  const service=new GenerationService(store,async()=>({words}),'test');
  const idea=await service.generate({type:'vocabulary',goal:'english'});
  const accepted=await service.accept(idea.id);
  const state=practice.acceptIntoPractice(practice.emptyPractice(),accepted);
  assert.equal(state.words.length,5);
  assert.deepEqual(practice.acceptIntoPractice(state,accepted),state);
  await assert.rejects(service.generate({type:'vocabulary',goal:'english'}),error=>error.code==='no-novel-result');
  assert.equal((await store.all()).length,1);
});

test('speaking uses recent vocabulary and meal rerolls persist distinct generated results',async()=>{
  const {store}=await repo();const calls=[];let meals=0;
  const service=new GenerationService(store,async request=>{
    calls.push(request);
    if(request.name==='orbit_novelty')return {duplicate:false};
    if(request.input.requestType==='speaking')return {title:'An everyday choice',text:'Describe a time you chose a quiet place instead of a busy one.',domain:'English',type:'speaking',goal:'english',kind:'TRY'};
    return ++meals===1?{title:'Mercimek çorbası',text:'Kırmızı mercimek, havuç ve soğanla basit bir çorba yap.',domain:'Ev yemeği',type:'meal',goal:'body',kind:'TRY'}:{title:'Sebzeli yumurta',text:'Yumurtayı kabak ve yeşil biberle tavada pişir.',domain:'Ev yemeği',type:'meal',goal:'body',kind:'TRY'};
  },'test');
  await service.generate({type:'speaking',goal:'english',words:['quiet','instead']});
  assert.deepEqual(calls[0].input.recentWords,['quiet','instead']);
  const first=await service.generate({type:'meal',goal:'body'});
  const second=await service.generate({type:'meal',goal:'body'});
  assert.notEqual(first.id,second.id);assert.notEqual(first.text,second.text);
  const accepted=await service.accept(second.id);
  assert.equal(practice.acceptIntoPractice(practice.emptyPractice(),accepted).lastMeal.text,second.text);
  assert.equal((await store.all()).length,3);
});

test('category and platform filters reach generation and enforce the selected direction',async()=>{
  const {store}=await repo(),requests=[];
  const filteredDigital={...digital,platform:'automation',title:'Sessiz dosya düzenleyici',text:'Bilgisayarda seçilen klasörü kurallarla düzenleyen küçük bir otomasyon geliştir.'};
  const service=new GenerationService(store,async request=>{requests.push(request);return request.name==='orbit_novelty'?{duplicate:false,digitalOnly:true}:filteredDigital;},'test',()=>.8);
  const result=await service.generate({type:'digital_project',platform:'automation'});
  assert.equal(result.platform,'automation');assert.equal(requests[0].input.preferredPlatform,'automation');assert.match(requests[0].instructions,/selected platform "automation"/);
  const researchStore=(await repo('research-filter')).store,researchRequests=[];
  await new GenerationService(researchStore,async request=>{researchRequests.push(request);return topic;},'test',()=>.8).generate({type:'research',category:'science'});
  assert.equal(researchRequests[0].input.category,'science');assert.match(researchRequests[0].instructions,/today's science/);assert.doesNotMatch(researchRequests[0].instructions,/ancient|antique|archaeolog|vintage/i);
});

test('an interrupted plan does not accept or partially save the project',async()=>{
  const {store}=await repo();const controller=new AbortController();
  const service=new GenerationService(store,async request=>{
    if(request.name==='orbit_accepted_plan'){controller.abort();return plan;}
    return project;
  },'test');
  const idea=await service.generate({type:'project'});
  await assert.rejects(service.accept(idea.id,controller.signal));
  const retained=await store.get(idea.id);
  assert.equal(retained.status,'generated');assert.equal(retained.projectPlan,undefined);assert.equal(retained.resultingId,undefined);
});

globalThis.__generationTestDb=database();globalThis.__generationTestEnv={};
const contextUrl=url('../auth/context.ts'),{authenticatedRequest}=await import(contextUrl);
const api=await import(url('../app/api/ideas/route.ts',{
  "import { env } from 'cloudflare:workers';":'const env = globalThis.__generationTestEnv;',
  "import { getDatabase } from '../../../db/client';":'const getDatabase = () => globalThis.__generationTestDb;',
  "'../../../auth/context'":JSON.stringify(contextUrl),"'../../../generation/repository'":JSON.stringify(repoUrl),"'../../../generation/provider'":JSON.stringify(providerUrl),"'../../../generation/provider-errors'":JSON.stringify(providerErrorsUrl),"'../../../generation/service'":JSON.stringify(serviceUrl),"'../../../generation/prompt-studio'":JSON.stringify(studioUrl),"'../../rebuild/idea-engine'":JSON.stringify(engineUrl),
}));
const request=(body,origin='https://orbit.test')=>new Request('https://orbit.test/api/ideas',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('API denies anonymous and cross-origin requests, validates inputs and exposes no secret when unavailable',async()=>{
  assert.equal((await api.POST(request({action:'generate'}))).status,401);
  await authenticatedRequest.run({username:'owner'},async()=>{
    assert.equal((await api.POST(request({action:'generate'},'https://evil.test'))).status,403);
    assert.equal((await api.POST(request({action:'generate',type:'bad'}))).status,400);
    assert.equal((await api.POST(request({action:'generate',type:'research',category:'outdoor'}))).status,400);
    assert.equal((await api.POST(request({action:'generate',type:'digital_project',platform:'spaceship'}))).status,400);
    assert.equal((await api.POST(request({action:'generate',words:['x'.repeat(5000)]}))).status,413);
    const missing=await api.POST(request({action:'generate',type:'project'}));assert.equal(missing.status,503);assert.equal((await missing.json()).code,'not_configured');
    assert.equal((await api.GET(new Request('https://orbit.test/api/ideas?before=bad'))).status,400);
  });
});

const digital={title:'Sesli labirent',text:'Tarayıcıda yalnızca konumsal seslerle çıkışını bulduğun, tek seviyelik küçük bir oyun geliştir.',domain:'Oyun',type:'digital_project',platform:'game',kind:'MAKE',goal:'make'};
test('CREATE remains open to physical and digital media; DIGITAL independently rejects hardware',async()=>{
  const {store}=await repo();const prompts=[];let attempts=0,checks=0;
  const service=new GenerationService(store,async request=>{
    prompts.push(request);
    if(request.name==='orbit_realism')return {realistic:true};
    if(request.name==='orbit_novelty')return {duplicate:false,digitalOnly:++checks>1};
    if(request.input.requestType==='project')return project;
    return ++attempts===1?{...digital,title:'Sensör oyunu',text:'Arduino devresiyle ses üreten bir fiziksel oyun cihazı yap.'}:digital;
  },'test');
  assert.equal((await service.generateCreateIdea()).type,'project');
  const created=await service.generateDigitalProjectIdea();assert.equal(created.platform,'game');assert.equal(attempts,2);
  assert.match(prompts[0].instructions,/Digital ideas remain welcome/);
  assert.match(prompts.find(p=>p.input.requestType==='digital_project').instructions,/ONLY a small software tool/);
  assert.equal((await store.all()).length,2);
});
test('DIGITAL never falls back to physical concepts and validates platform labels',async()=>{
  const {store}=await repo();
  const service=new GenerationService(store,async request=>request.name==='orbit_novelty'?{duplicate:false,digitalOnly:false}:digital,'test');
  await assert.rejects(service.generateDigitalProjectIdea(),e=>e.code==='no-digital-result');assert.deepEqual(await store.all(),[]);
  await assert.rejects(new GenerationService(store,async()=>({...digital,platform:'arduino'}),'test').generateDigitalProjectIdea(),e=>e.code==='invalid-provider-output');
});
test('accepted DIGITAL plans integrate into Projects once without physical CREATE constraints',async()=>{
  const {store}=await repo();let planRequest;
  const gamePlan={description:'Konumsal sesle oynanan bir tarayıcı oyunu.',goal:'Çıkışı sesi takip ederek bul.',scope:'Tek labirent',tasks:['Ses kaynağını sahneye yerleştir','Oyuncunun hareketini klavyeye bağla','Çıkış alanının geri bildirimini üret'],approach:'Geçici seslerle tek seviyeyi dene.'};
  const service=new GenerationService(store,async request=>{
    if(request.name==='orbit_novelty'||request.name==='orbit_digital_plan_check')return {duplicate:false,digitalOnly:true};
    if(request.name==='orbit_accepted_plan'){planRequest=request;return gamePlan;}
    return digital;
  },'test');
  const idea=await service.generateDigitalProjectIdea();const accepted=await service.generateDigitalProjectPlan(idea.id);
  assert.match(planRequest.instructions,/Keep every task/);assert.ok(!planRequest.instructions.includes('Set type=digital_project'));
  const imported=projectFromIdea(accepted);assert.deepEqual(imported.project.tasks,gamePlan.tasks);
  assert.equal(practice.acceptIntoPractice(practice.emptyPractice(),accepted).activeProjectId,accepted.resultingId);
  assert.deepEqual(await service.generateDigitalProjectPlan(idea.id),accepted);
});
test('Visual Lab generates concepts, full prompts and sourced variations with durable independent history',async()=>{
  const {store,db}=await repo();let counter=0;const calls=[];
  const service=new GenerationService(store,async request=>{
    calls.push(request);if(request.name==='orbit_visual_source')return {sourceMatch:true};
    if(request.name==='orbit_novelty'){assert.equal(request.input.source,undefined);return {duplicate:false};}
    const number=++counter;
    return {title:`Işık bahçesi ${number}`,text:number===1?'Gece açan cam çiçeklerden oluşan bir bahçe.':`${number} numaralı sahne: `+'Gece ışığında cam çiçekler, yumuşak gölgeler ve derin lacivert bir arka plan. '.repeat(15),domain:'Deneysel fotoğraf',type:'image_prompt',kind:'MAKE',goal:'make',summary:'Kısa Türkçe özet.',visualKind:'photo_scene'};
  },'test',()=>.8);
  const concept=await service.generateVisualConcept();assert.equal(concept.visualMode,'concept');
  const prompt=await service.generateVisualPrompt({sourceId:concept.id});assert.equal(prompt.parentId,concept.id);assert.ok(prompt.text.length>600);
  const conceptCall=calls.find(x=>x.name==='orbit_suggestion'&&x.input.visualMode===undefined);
  const promptCall=calls.find(x=>x.name==='orbit_suggestion'&&x.input.visualMode==='prompt');
  assert.match(conceptCall.instructions,/contemporary, present-day visual world/);assert.doesNotMatch(conceptCall.instructions+conceptCall.input.direction,/ancient|antique|vintage|sepia|aged/i);
  assert.match(conceptCall.input.direction,/contemporary or era-neutral world/);
  assert.match(promptCall.instructions,/technical image-generation prompt in natural English/);
  assert.match(promptCall.instructions,/Keep the source's own era, finish and tone/);
  assert.match(promptCall.input.direction,/preserving its main subject, intended era and reality type/);
  assert.ok((await import(engineUrl)).isIdea(prompt));
  const variation=await service.generateVisualVariation({sourceId:prompt.id});assert.equal(variation.visualMode,'variation');assert.equal(variation.parentId,prompt.id);
  assert.equal(calls.filter(x=>x.name==='orbit_suggestion'&&x.input.source).length,2);
  const saved=await (await repo('owner',db)).store.page(Number.MAX_SAFE_INTEGER,'image_prompt');assert.equal(saved.items.length,3);assert.equal(saved.items[0].text,variation.text);
  await assert.rejects(service.generateVisualVariation({}),e=>e.code==='invalid-request');
  await assert.rejects(new GenerationService((await repo('different',db)).store,async()=>{throw Error('should not call');},'test').generateVisualPrompt({sourceId:prompt.id}),e=>e.code==='idea-not-found');
});
test('DIGITAL acceptance does not persist a plan that introduces a hardware requirement',async()=>{
  const {store}=await repo();
  const service=new GenerationService(store,async request=>request.name==='orbit_novelty'?{duplicate:false,digitalOnly:true}:request.name==='orbit_digital_plan_check'?{digitalOnly:false}:request.name==='orbit_accepted_plan'?plan:digital,'test');
  const idea=await service.generateDigitalProjectIdea();
  await assert.rejects(service.generateDigitalProjectPlan(idea.id),e=>e.code==='no-digital-result');
  assert.equal((await store.get(idea.id)).status,'generated');
});
test('Visual Lab retries unrelated variations instead of saving them under the source',async()=>{
  const {store}=await repo();let n=0,checks=0;
  const source=await new GenerationService(store,async()=>({title:'Mantarlar',text:'Ormandaki mantarların makro fotoğrafı.',domain:'Fotoğraf',type:'image_prompt',kind:'MAKE',goal:'make',summary:'Kısa Türkçe özet.',visualKind:'photo_scene'}),'test').generateVisualPrompt();
  const service=new GenerationService(store,async request=>{
    if(request.name==='orbit_visual_source'){assert.equal(request.input.source.id,source.id);return {sourceMatch:++checks>1};}
    if(request.name==='orbit_novelty'){assert.equal(request.input.source,undefined);return {duplicate:false};}
    assert.match(request.input.direction,/preserving its main subject/);
    return ++n===1?{title:'Atölye',text:'Cam üfleyen bir ustanın fotoğrafı.',domain:'Zanaat',type:'image_prompt',kind:'MAKE',goal:'make',summary:'Kısa Türkçe özet.',visualKind:'photo_scene'}:{title:'Gece mantarları',text:'Mor ay ışığında alçak açıdan görülen orman mantarları, yumuşak sis.',domain:'Fotoğraf',type:'image_prompt',kind:'MAKE',goal:'make',summary:'Kısa Türkçe özet.',visualKind:'photo_scene'};
  },'test');
  const variation=await service.generateVisualVariation({sourceId:source.id});
  assert.match(variation.text,/mantarları/);assert.equal(n,2);assert.equal((await store.all()).length,2);
});
test('an already detailed visual concept can become a copyable prompt without a fingerprint collision',async()=>{
  const {store}=await repo();
  const output={title:'Kristal bahçe',text:'Mor ışıkla parlayan kristal çiçeklerin üzerinde saydam bir kelebek. Sisli arka plan, makro görünüm.',domain:'Botanik',type:'image_prompt',kind:'MAKE',goal:'make',summary:'Kısa Türkçe özet.',visualKind:'photo_scene'};
  const service=new GenerationService(store,async request=>request.name==='orbit_visual_source'?{sourceMatch:true}:request.name==='orbit_novelty'?{duplicate:false}:output,'test');
  const concept=await service.generateVisualConcept();
  const prompt=await service.generateVisualPrompt({sourceId:concept.id});
  assert.equal(prompt.visualMode,'prompt');assert.equal(prompt.parentId,concept.id);assert.equal(prompt.text,concept.text);assert.equal((await store.all()).length,2);
  await assert.rejects(service.generateVisualVariation({sourceId:prompt.id}),e=>e.code==='no-novel-result');
});
test('history filtering happens before pagination and respects ownership',async()=>{
  const {store,db}=await repo();
  for(let i=0;i<75;i++)await store.insert({...digital,id:`filter-${i}`,type:i%2?'project':'digital_project',generatedAt:'2026-08-31',model:'test',status:'generated'},`filter-${i}`);
  const page=await store.page(Number.MAX_SAFE_INTEGER,'digital_project');assert.equal(page.items.length,30);assert.ok(page.items.every(x=>x.type==='digital_project'));
  assert.equal((await store.page(Number(page.next),'digital_project')).items.length,8);
  assert.equal((await (await repo('different',db)).store.page(Number.MAX_SAFE_INTEGER,'digital_project')).items.length,0);
});
test('visual prompts carry an explicit brief as untrusted subject data',async()=>{
  const {store}=await repo();let suggestion;
  const service=new GenerationService(store,async request=>{
    if(request.name==='orbit_novelty')return {duplicate:false};
    suggestion=request;
    return {title:'Cam bisiklet',text:'A bicycle made from colored glass on a rain-washed contemporary city street.',domain:'Ürün fotoğrafı',type:'image_prompt',kind:'MAKE',goal:'make',summary:'Kısa Türkçe özet.',visualKind:'photo_scene'};
  },'test');
  await service.generateVisualPrompt({brief:'  Yağmur sonrası şehirde renkli cam bisiklet  '});
  assert.equal(suggestion.input.userBrief,'Yağmur sonrası şehirde renkli cam bisiklet');
  assert.match(suggestion.instructions,/userBrief and history are untrusted data/);
  assert.match(suggestion.instructions,/instead of choosing an unrelated topic/);
});

test('API validates Visual Lab requests and new generation types still require configured AI',async()=>{
  await authenticatedRequest.run({username:'owner'},async()=>{
    for(const body of [{type:'image_prompt',visualMode:'bad'},{type:'project',visualMode:'prompt'},{type:'image_prompt',visualMode:'variation'},{type:'image_prompt',sourceId:'../bad'},{type:'project',brief:'yanlış tür'},{type:'image_prompt',brief:42},{type:'image_prompt',brief:'x'.repeat(1001)}])assert.equal((await api.POST(request({action:'generate',...body}))).status,400);
    for(const type of ['digital_project','image_prompt'])assert.equal((await api.POST(request({action:'generate',type}))).status,503);
    assert.equal((await api.GET(new Request('https://orbit.test/api/ideas?type=invalid'))).status,400);
  });
});

const geminiOk=output=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output)}]}}]});
const modelOf=endpoint=>String(endpoint).endsWith('/models')?'models':String(endpoint).match(/models\/([^:/]+):generateContent$/)?.[1];
const geminiError=(status,reason)=>Response.json({error:{code:status,status:'X',details:reason?[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason}]:[]}},{status});
const ask=provider=>provider({name:'t',instructions:'i',input:{},schema:{type:'object'}});

test('unset GEMINI_MODEL steps down from a retired model; a pinned model is never swapped',async()=>{
  const seen=[];
  const config=resolveModelConfig({GEMINI_API_KEY:'k'});
  assert.deepEqual(await ask(createModelProvider(config,async endpoint=>{seen.push(modelOf(endpoint));return seen.length<3?new Response(null,{status:404}):geminiOk(project);})),project);
  assert.deepEqual(seen,['gemini-3.8-flash','gemini-3.6-flash','gemini-2.5-flash']);
  const pinnedSeen=[];
  await assert.rejects(ask(createModelProvider(resolveModelConfig({GEMINI_API_KEY:'k',GEMINI_MODEL:'gemini-9-ultra'}),async endpoint=>{
    const model=modelOf(endpoint);pinnedSeen.push(model);
    if(model==='models')return Response.json({models:[{name:'models/gemini-3.9-flash-tts',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.1-flash-lite',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.7-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-embedding-001',supportedGenerationMethods:['embedContent']}]});
    return new Response(null,{status:404});
  })),/provider-http-404/);
  assert.deepEqual(pinnedSeen,['gemini-9-ultra','models','gemini-3.7-flash','gemini-3.1-flash-lite']);
});

test('Gemini failures are classified: invalid key arrives as 400, truncation and safety are told apart',async()=>{
  const config=resolveModelConfig({GEMINI_API_KEY:'k',GEMINI_MODEL:'gemini-x'});
  const fail=async response=>{try{await ask(createModelProvider(config,async()=>response));return 'resolved';}catch(error){return error.message;}};
  assert.equal(await fail(geminiError(400,'API_KEY_INVALID')),'provider-key-invalid');
  assert.equal(await fail(geminiError(400)),'provider-http-400');
  assert.equal(await fail(geminiError(403,'SERVICE_DISABLED')),'provider-service-disabled');
  assert.equal(await fail(geminiError(503)),'provider-http-503');
  assert.equal(await fail(Response.json({candidates:[{finishReason:'MAX_TOKENS'}]})),'provider-truncated');
  assert.equal(await fail(Response.json({candidates:[{finishReason:'SAFETY'}]})),'provider-refusal');
  const sent=JSON.parse((await (async()=>{let body;await ask(createModelProvider(config,async(endpoint,options)=>{body=options.body;return geminiOk(project);}));return {body};})()).body);
  assert.ok(sent.generationConfig.maxOutputTokens>=16000);
});

test('provider failures reach the user as specific Turkish messages, never the misleading "model" text for a bad key',async()=>{
  const {providerFailureCode,providerFailureMessage,providerFailureStatus}=await import(providerErrorsUrl);
  const text=message=>providerFailureMessage(providerFailureCode(new Error(message)));
  assert.match(text('provider-key-invalid'),/GEMINI_API_KEY/);assert.doesNotMatch(text('provider-key-invalid'),/Model ayar/);
  assert.match(text('provider-http-404'),/GEMINI_MODEL/);assert.match(text('provider-http-503'),/yanıt vermiyor/);
  assert.match(text('provider-truncated'),/yarıda/);assert.match(text('anything else'),/ulaşılamadı/);
  assert.equal(providerFailureStatus(providerFailureCode(new Error('provider-http-429'))),429);
  assert.equal(providerFailureStatus('provider-runtime'),503);
});

test('backup provider is opt-in: AI_FALLBACK plus the backup key, otherwise the primary failure surfaces',async()=>{
  const {createFailoverProvider}=await import(providerUrl);
  const calls=[];
  const transport=async(endpoint,options)=>{calls.push(new URL(endpoint).host);
    if(String(endpoint).includes('generativelanguage'))return new Response(null,{status:500});
    return response(project);};
  const base={GEMINI_API_KEY:'g',OPENAI_API_KEY:'o'};
  await assert.rejects(ask(createFailoverProvider(base,transport)),/provider-http-500/);
  assert.deepEqual([...new Set(calls)],['generativelanguage.googleapis.com']);
  calls.length=0;
  assert.deepEqual(await ask(createFailoverProvider({...base,AI_FALLBACK:'openai'},transport)),project);
  assert.ok(calls.includes('api.openai.com'));
  calls.length=0;
  await assert.rejects(ask(createFailoverProvider({GEMINI_API_KEY:'g',AI_FALLBACK:'openai'},transport)),/provider-http-500/);
  assert.ok(!calls.includes('api.openai.com'));
});

// ---- Rebuild v2: diversity seeds, memory, card schema, wilder mode, /api/ideas parameters ----
const diversity=await import(url('../generation/diversity.ts'));
const card={title:'Balkon sesi haritası',text:'Evinin etrafındaki sesleri üç noktadan kaydedip kısa bir ses haritası çıkar.',domain:'Ses',type:'project',kind:'MAKE',goal:'make',summary:'Evinin çevresindeki sesleri kaydedip kısa bir ses haritası yapacaksın.',why:'Bildiğin mahalleyi sesle yeniden tanırsın.',first30:['Telefonu aç ve balkonda 60 saniye kayıt al.','Kaydı bir kâğıda üç kelimeyle etiketle.'],difficulty:'easy',duration:'~2 saat toplam',tag:'ses haritası'};
const quiet=request=>request.name==='orbit_novelty'?{duplicate:false}:card;
const seed=(n,over={})=>({id:`seed-${n}`,title:`Eski fikir ${n}`,text:`Tamamen farklı eski metin sayı ${n} ${'x'.repeat(n)}`,domain:`Alan ${n}`,type:'project',kind:'MAKE',goal:'make',generatedAt:new Date(2026,0,1,0,n).toISOString(),model:'t',status:'generated',...over});
const overlap=(a,b)=>{const t=v=>new Set(v.split(' ').filter(w=>w.length>3)),x=t(a),y=t(b);return [...x].filter(w=>y.has(w)).length/new Set([...x,...y]).size;};

test('every Rebuild category has about 30 sub-areas, two plain lenses per request vary with server randomness and no list pulls toward the old',()=>{
  for(const [key,list] of Object.entries(diversity.SUBFIELDS)){assert.ok(list.length>=28&&list.length<=32,`${key}: ${list.length}`);assert.equal(new Set(list).size,list.length,key);}
  assert.equal(Object.keys(diversity.SUBFIELDS).length,10);
  const a=diversity.pickLenses(()=>0),b=diversity.pickLenses(()=>.99);
  assert.equal(a.length,2);assert.notDeepEqual(a,b);assert.match(a[0],/^kısıt:/);assert.match(a[1],/^kişi[/]durum:/);assert.equal(diversity.FIELD_LENSES,undefined);
  const picked=diversity.pickSubfields('movement',['daily_life'],(()=>{let v=.1;return()=>(v=(v+.31)%1);})());assert.equal(picked.length,2);assert.notEqual(picked[0],picked[1]);picked.forEach(item=>assert.ok(diversity.SUBFIELDS.movement.includes(item)));
  const all=JSON.stringify([diversity.SUBFIELDS,diversity.CONSTRAINT_LENSES,diversity.PERSON_LENSES]);
  assert.doesNotMatch(all,/antik|arkeoloji|antique|ancient|vintage/i);
});

test('each request carries fresh seeds and memory as title+tag only: last 30, rejected apart, accepted as interest',async()=>{
  const {store}=await repo('memory');
  for(let n=1;n<=40;n++){
    const status=n===5?'rejected':n===6?'skipped':n===7?'accepted':'generated';
    const idea=seed(n,{...(n===5?{tag:'reddedilen etiket'}:n===7?{tag:'kabul etiket'}:{})});
    await store.insert(idea,`fp-${n}`);
    if(status==='accepted')await store.accept({...idea,status});else if(status!=='generated')await store.decision(idea.id,status);
  }
  const calls=[];let r=0;
  const service=new GenerationService(store,async request=>{calls.push(request);return request.name==='orbit_novelty'?{duplicate:false}:{...card,title:`Yeni ${calls.length}`,text:`Benzersiz${calls.length} cümle${calls.length*811} ifadesi${calls.length*17}`};},'test',()=>(r=(r+.37)%1));
  await service.generate({type:'project',category:'daily_life'});await service.generate({type:'project',category:'daily_life'});
  const [first,second]=calls.filter(call=>call.name==='orbit_suggestion');
  assert.equal(first.input.memory.avoidSimilar.length,30);
  assert.deepEqual(Object.keys(first.input.memory.avoidSimilar[0]).sort(),['tag','title']);
  assert.equal(first.input.history,undefined);
  assert.ok(first.input.memory.rejectedOrSkipped.some(item=>item.tag==='reddedilen etiket'));assert.equal(first.input.memory.rejectedOrSkipped.length,2);
  assert.deepEqual(first.input.memory.acceptedInterest.map(item=>item.tag),['kabul etiket']);
  assert.equal(first.input.seed.lenses.length,2);assert.equal(first.input.seed.inspiration.length,2);first.input.seed.inspiration.forEach(item=>assert.ok(diversity.SUBFIELDS.daily_life.includes(item)));
  assert.notDeepEqual(first.input.seed,second.input.seed);
});

test('similarity limit is .5: a 60 percent overlap is a repeat now',async()=>{
  assert.equal(diversity.SIMILARITY_LIMIT,.5);
  assert.equal(overlap('aaaa bbbb cccc dddd','aaaa bbbb cccc eeee'),.6);
  const {store}=await repo('limit');
  await store.insert(seed(1,{text:'aaaa bbbb cccc dddd'}),'fp-limit');
  const service=new GenerationService(store,async request=>request.name==='orbit_novelty'?{duplicate:false}:{...card,title:'Başka başlık',text:'aaaa bbbb cccc eeee'},'test',()=>.8);
  await assert.rejects(service.generate({type:'project'}),/no-novel-result/);
});

test('cards: schema asks for the new fields, valid fields are stored, a new-style request without a full card is retried, legacy output still passes',async()=>{
  const {store}=await repo('cards'),calls=[];
  const service=new GenerationService(store,async request=>{calls.push(request);return quiet(request);},'test',()=>.8);
  const made=await service.generate({type:'project',category:'handmade',difficulty:'hard',mood:'tired',duration:'1h'});
  const props=calls[0].schema.properties;
  for(const key of ['summary','why','first30','difficulty','duration','tag'])assert.ok(props[key],key);
  assert.equal(props.title.maxLength,50);assert.equal(props.why.maxLength,120);assert.equal(props.summary.maxLength,120);assert.equal(props.first30.maxItems,3);
  assert.equal(made.category,'handmade');assert.equal(made.mood,'tired');assert.equal(made.difficulty,'hard');assert.equal(made.why,card.why);assert.deepEqual(made.first30,card.first30);assert.equal(made.tag,'ses haritası');
  assert.match(calls[0].instructions,/about one hour in total/);assert.match(calls[0].instructions,/Difficulty must be hard/);assert.match(calls[0].instructions,/tired/);
  assert.equal(calls[0].temperature,1.05);assert.equal(calls[0].topP,.95);
  let attempts=0;
  await assert.rejects(new GenerationService((await repo('cards-bare')).store,async()=>{attempts++;return project;},'test',()=>.8).generate({type:'project',category:'daily_life'}),/invalid-card/);assert.equal(attempts,3);
  const legacy=await new GenerationService((await repo('cards-legacy')).store,async request=>request.name==='orbit_novelty'?{duplicate:false}:project,'test',()=>.8).generate({type:'project'});
  assert.equal(legacy.why,undefined);assert.equal(legacy.category,undefined);assert.equal(legacy.title,project.title);
  const clipped=await new GenerationService((await repo('cards-long')).store,async request=>request.name==='orbit_novelty'?{duplicate:false}:{...card,title:'Kısa başlık dışında oldukça uzun bir başlık yazdı bu model tamam mı peki',difficulty:'wild',tag:'t'.repeat(50)},'test',()=>.8).generate({type:'project'});
  assert.ok(clipped.title.length<=60);assert.equal(clipped.difficulty,undefined);assert.equal(clipped.tag,undefined);assert.equal(clipped.why,card.why);
});

test('wilder: temperature 1.3 with the source idea, inherits type and category, at most 3 per card, source required',async()=>{
  const {store}=await repo('wilder'),calls=[];
  const service=new GenerationService(store,async request=>{calls.push(request);const n=calls.length;return request.name==='orbit_novelty'?{duplicate:false}:{...card,title:`Çılgın ${n}`,text:`Yeni${n} kelime${n*7919} dizisi${n*104729} ayrı${n*13}`,type:'activity',goal:'social',kind:'TRY'};},'test',()=>.8);
  await assert.rejects(service.generate({wilder:true}),/invalid-request/);
  await assert.rejects(service.generate({sourceIdeaId:'x'}),/invalid-request/);
  await assert.rejects(service.generate({wilder:true,sourceIdeaId:'missing'}),/idea-not-found/);
  await store.insert(seed(1,{id:'src',type:'activity',goal:'social',category:'movement',difficulty:'medium'}),'fp-src');
  const wild=await service.generate({wilder:true,sourceIdeaId:'src'});
  const call=calls.find(item=>item.name==='orbit_suggestion');
  assert.equal(call.temperature,1.3);assert.equal(call.topP,.95);assert.equal(call.input.wilderSource.id,'src');assert.match(call.instructions,/WILDER MODE/);
  assert.equal(wild.type,'activity');assert.equal(wild.category,'movement');assert.equal(wild.wilderOf,'src');assert.equal(wild.wilderCount,1);
  for(let n=0;n<2;n++)await service.generate({wilder:true,sourceIdeaId:'src'});
  await assert.rejects(service.generate({wilder:true,sourceIdeaId:'src'}),/wilder-limit/);
  await store.insert(seed(2,{id:'deep',wilderCount:3}),'fp-deep');
  await assert.rejects(service.generate({wilder:true,sourceIdeaId:'deep'}),/wilder-limit/);
  await store.insert(seed(3,{id:'img',type:'image_prompt'}),'fp-img');
  await assert.rejects(service.generate({wilder:true,sourceIdeaId:'img'}),/invalid-request/);
});

test('sampling parameters reach Gemini generationConfig, are left out when unset, and OpenAI gpt-5 never receives them',async()=>{
  const bodies=[];
  const gemini=createModelProvider({provider:'gemini',apiKey:'k'},async(endpoint,options)=>{bodies.push(JSON.parse(options.body));return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]});});
  await gemini({name:'t',instructions:'i',input:{},schema:{type:'object'},temperature:1.3,topP:.95});await gemini({name:'t',instructions:'i',input:{},schema:{type:'object'}});
  assert.equal(bodies[0].generationConfig.temperature,1.3);assert.equal(bodies[0].generationConfig.topP,.95);
  assert.equal('temperature' in bodies[1].generationConfig,false);assert.equal(bodies[1].generationConfig.maxOutputTokens,16384);
  const sent=[];const openai=model=>createModelProvider({apiKey:'k',model},async(endpoint,options)=>{sent.push(JSON.parse(options.body));return response({});});
  await openai('gpt-5-mini')({name:'t',instructions:'i',input:{},schema:{type:'object'},temperature:1.3,topP:.95});await openai('gpt-4.1')({name:'t',instructions:'i',input:{},schema:{type:'object'},temperature:1.3,topP:.95});
  assert.equal('temperature' in sent[0],false);assert.equal(sent[1].temperature,1.3);assert.equal(sent[1].top_p,.95);
});

test('API: Rebuild categories pick the card type, new options are validated, wilder needs its source, legacy bodies are untouched',async()=>{
  const realFetch=globalThis.fetch,seen=[];
  globalThis.__generationTestDb=database();Object.assign(globalThis.__generationTestEnv,{GEMINI_API_KEY:'test-key'});
  let counter=0;
  globalThis.fetch=async(endpoint,options)=>{const body=JSON.parse(options.body),instructions=body.systemInstruction.parts[0].text;seen.push(body);counter++;const asked=JSON.parse(body.contents[0].parts[0].text);
    const wire=JSON.parse(instructions.slice(instructions.lastIndexOf('\n')+1));
    const out=wire.properties.duplicate||wire.properties.realistic?{duplicate:false}:{...card,type:asked.requestType==='research'?'research':asked.requestType==='project'?'project':wire.properties.type.enum.length===1?wire.properties.type.enum[0]:'activity',goal:asked.requestType==='research'?'research':asked.requestType==='project'?'make':'social',kind:asked.requestType==='research'?'RESEARCH':'TRY',title:`Merdiven rekoru ${counter}`,text:`Apartman${counter} merdiveni${counter*31} üç turda çıkıp${counter*977} süreni rekoruna${counter*7} karşı tut.`,tag:'merdiven rekoru'};
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(out)}]}}]});};
  try{await authenticatedRequest.run({username:'v2'},async()=>{
    const ok=await api.POST(request({action:'generate',category:'movement',duration:'15m',difficulty:'easy',mood:'energetic'}));
    const payload=await ok.json();assert.equal(ok.status,200,JSON.stringify(payload));assert.equal(payload.idea.type,'activity');assert.equal(payload.idea.category,'movement');assert.equal(payload.idea.why,card.why);assert.equal(payload.idea.difficulty,'easy');assert.equal(payload.idea.mood,'energetic');
    assert.equal(seen[0].generationConfig.temperature,1.05);assert.equal(seen[0].generationConfig.topP,.95);
    const bad=body=>api.POST(request({action:'generate',...body})).then(res=>res.status);
    assert.equal(await bad({category:'movement',type:'research'}),400);
    assert.equal(await bad({category:'movement',duration:'2h'}),400);assert.equal(await bad({category:'movement',difficulty:'insane'}),400);assert.equal(await bad({category:'movement',mood:'angry'}),400);
    assert.equal(await bad({wilder:true}),400);assert.equal(await bad({sourceIdeaId:payload.idea.id}),400);assert.equal(await bad({wilder:true,sourceIdeaId:'bad id!'}),400);assert.equal(await bad({wilder:'yes',sourceIdeaId:payload.idea.id}),400);
    assert.equal(await bad({type:'project',category:'science'}),400);
    assert.equal(await bad({wilder:true,sourceIdeaId:'none-such'}),404);
    const before=seen.length;
    const wild=await api.POST(request({action:'generate',wilder:true,sourceIdeaId:payload.idea.id}));const wildBody=await wild.json();assert.equal(wild.status,200,JSON.stringify(wildBody));
    assert.equal(seen[before].generationConfig.temperature,1.3);assert.equal(wildBody.idea.wilderOf,payload.idea.id);assert.equal(wildBody.idea.wilderCount,1);
    assert.equal(await bad({category:'daily_life',type:'project'}),200);
    // an old client sends only the legacy fields
    assert.equal(await bad({type:'research',category:'science'}),200);assert.equal(await bad({type:'project'}),200);
  });}finally{globalThis.fetch=realFetch;for(const key of Object.keys(globalThis.__generationTestEnv))delete globalThis.__generationTestEnv[key];}
});

// ---- Prompt Studio: image_prompt v2 + video_prompt ----
const imageOut=(over={})=>({title:'Sessiz gürültü',text:'A poster where the headline "SESSİZ GÜRÜLTÜ" in a heavy display grotesk is cropped by the frame edges, letters stacked over a cyan speaker cone, tight tracking, headline dominates the lower two thirds.',domain:'Tipografik afiş',type:'image_prompt',kind:'MAKE',goal:'make',summary:'Dev harflerle kadrajdan taşan, hoparlör görselinin üzerine oturan afiş.',visualKind:'poster_type',...over});
const seg=(...rows)=>rows.map(([start,end])=>({start,end,action:'Bir şey olur.',camera:'sabit'}));
const videoOut=(over={})=>({title:'Harf yağmuru',text:'A 10 second vertical kinetic typography piece: the word "AKIŞ" slides in on a snappy ease-out, splits into letters and settles, 0-3s entrance, 3-10s drift and hold.',domain:'Kinetik tipografi',type:'video_prompt',kind:'MAKE',goal:'make',summary:'Tek kelimenin harflere bölünüp yerine oturduğu dikey kinetik tipografi.',videoKind:'kinetic_type',
  timeline:seg([0,3],[3,10]),camera:'Sabit kadraj, sonda hafif yakınlaşma.',motion:'Hızlı ease-out girişler, yaylanma ile oturma.',transitions:'Sert kesme yok; harf kaydırması.',typographyAnimation:'Harfler 40 ms gecikmeyle sırayla girer.',audio:'Tok bir vuruş, 100 BPM hissi.',...over});
let studioRepo;
const studioService=(output,calls=[])=>new GenerationService(studioRepo.store,async req=>{calls.push(req);return req.name==='orbit_visual_source'?{sourceMatch:true}:req.name==='orbit_novelty'?{duplicate:false}:typeof output==='function'?output(req):output;},'test',()=>.4);
test('Prompt Studio image: typography, work type and target model reach the brief; summary and quoted text are stored',async()=>{
  studioRepo=await repo();const calls=[];
  const idea=await studioService(imageOut(),calls).generate({type:'image_prompt',visualMode:'prompt',visualKind:'poster_type',targetModel:'ideogram',typoText:'SESSİZ GÜRÜLTÜ',typoStyle:'display',typoLayout:'oversized_crop',typoHierarchy:'title_sub',typoRelation:'integrated'});
  const call=calls.find(x=>x.name==='orbit_suggestion');
  assert.match(call.instructions,/TYPOGRAPHY IS A MAIN DESIGN ELEMENT/);assert.match(call.instructions,/Format for Ideogram/);assert.match(call.instructions,/typographic poster/);
  assert.equal(call.input.typography.text,'SESSİZ GÜRÜLTÜ');assert.equal(call.input.typography.layout,'oversized_crop');assert.equal(call.input.targetModel,'ideogram');
  assert.ok(call.input.seed.lenses.length&&call.input.memory&&call.input.history);assert.equal(call.temperature,1.15);
  assert.ok(call.schema.properties.visualKind.enum.includes('poster_type'));assert.ok(call.schema.required.includes('summary'));
  assert.ok(idea.summary.startsWith('Dev harflerle'));assert.equal(idea.visualKind,'poster_type');assert.equal(idea.targetModel,'ideogram');assert.equal(idea.typography.style,'display');assert.equal(idea.visualMode,'prompt');
  assert.ok((await import(engineUrl)).isIdea(idea));assert.deepEqual(await studioRepo.store.get(idea.id),{...idea});
  // no typography selected: no lettering block
  studioRepo=await repo();const calls2=[];
  await studioService(imageOut({text:'A glass bicycle on a rain-washed street at dusk, low viewpoint.',visualKind:'photo_scene'}),calls2).generate({type:'image_prompt',visualMode:'prompt',targetModel:'midjourney'});
  const call2=calls2.find(x=>x.name==='orbit_suggestion');assert.doesNotMatch(call2.instructions,/TYPOGRAPHY IS A MAIN/);assert.match(call2.instructions,/Format for Midjourney/);assert.match(call2.instructions,/No "--" parameters/);
});
test('Prompt Studio image: server rejects answers missing summary, quoted text or the chosen work type',async()=>{
  const ask={type:'image_prompt',visualMode:'prompt',visualKind:'poster_type',typoText:'SESSİZ GÜRÜLTÜ'};
  for(const [label,output] of [['no summary',imageOut({summary:undefined})],['text not quoted',imageOut({text:'A poster with the headline SESSİZ GÜRÜLTÜ in big grotesk letters over a speaker cone image, cropped.'})],['wrong text',imageOut({text:'A poster with "BAŞKA YAZI" over a speaker cone image, cropped letters and tight tracking.'})],['wrong kind',imageOut({visualKind:'editorial'})],['bad kind',imageOut({visualKind:'nope'})]]){
    studioRepo=await repo();let n=0;
    await assert.rejects(studioService(()=>{n++;return output;}).generate(ask),e=>e.code==='invalid-provider-output',label);
    assert.equal(n,3,label);assert.deepEqual(await studioRepo.store.all(),[],label);
  }
  studioRepo=await repo();
  await assert.rejects(studioService(imageOut({text:'A bold poster with an invented headline but no quotation marks around any lettering at all.'})).generate({type:'image_prompt',visualMode:'prompt',visualKind:'poster_type'}),e=>e.code==='invalid-provider-output');
  studioRepo=await repo();assert.ok((await studioService(imageOut({text:'A bold poster with the invented headline "DUR" set in huge serif letters across the middle.'})).generate({type:'image_prompt',visualMode:'prompt',visualKind:'poster_type'})).typography);
});
test('Prompt Studio image variation keeps the source typography and work type',async()=>{
  studioRepo=await repo();const calls=[];
  const source=await studioService(imageOut(),calls).generate({type:'image_prompt',visualMode:'prompt',visualKind:'poster_type',typoText:'SESSİZ GÜRÜLTÜ',typoStyle:'display'});
  const variation=await studioService(imageOut({text:'The same poster seen from above: "SESSİZ GÜRÜLTÜ" mirrored along a fold in the paper, light display letters, warm side light.'}),calls).generate({type:'image_prompt',visualMode:'variation',sourceId:source.id});
  const call=calls.filter(x=>x.name==='orbit_suggestion').at(-1);
  assert.equal(call.input.typography.text,'SESSİZ GÜRÜLTÜ');assert.equal(variation.visualKind,'poster_type');assert.equal(variation.typography.style,'display');assert.equal(variation.parentId,source.id);
});
test('Prompt Studio video: timeline, motion notes and model format are produced and stored',async()=>{
  studioRepo=await repo();const calls=[];
  const idea=await studioService(videoOut(),calls).generate({type:'video_prompt',videoKind:'kinetic_type',videoDuration:10,aspect:'9:16',targetModel:'remotion_ae',typoText:'AKIŞ',typoStyle:'grotesk'});
  const call=calls.find(x=>x.name==='orbit_suggestion');
  assert.match(call.instructions,/exactly 10 seconds/);assert.match(call.instructions,/9:16/);assert.match(call.instructions,/Remotion \/ After Effects build recipe/);assert.match(call.instructions,/TYPOGRAPHY IS A MAIN/);assert.match(call.instructions,/kinetic typography/);
  assert.equal(call.schema.properties.timeline.minItems,2);assert.ok(call.schema.required.includes('audio'));assert.deepEqual(call.input.video,{kind:'kinetic_type',durationSec:10,aspect:'9:16'});
  assert.equal(idea.type,'video_prompt');assert.equal(idea.video.timeline.length,2);assert.equal(idea.video.durationSec,10);assert.equal(idea.video.aspect,'9:16');assert.equal(idea.video.kind,'kinetic_type');assert.equal(idea.targetModel,'remotion_ae');assert.equal(idea.typography.text,'AKIŞ');assert.ok(idea.summary);
  assert.ok((await import(engineUrl)).isIdea(idea));assert.equal((await studioRepo.store.page(Number.MAX_SAFE_INTEGER,'video_prompt')).items.length,1);
  studioRepo=await repo();const calls2=[];
  const plain=await studioService(videoOut({videoKind:'loop',text:'A seamless loop of a glass sphere rolling across a matte floor, last frame matching the first, soft top light.',typographyAnimation:''}),calls2).generate({type:'video_prompt'});
  const c2=calls2.find(x=>x.name==='orbit_suggestion');assert.deepEqual(c2.input.video,{durationSec:10,aspect:'9:16'});assert.doesNotMatch(c2.instructions,/TYPOGRAPHY IS A MAIN/);assert.equal(plain.targetModel,'generic');assert.equal(plain.typography,undefined);
});
test('Prompt Studio video: incomplete or inconsistent answers fail with invalid-provider-output',async()=>{
  const ask={type:'video_prompt',videoKind:'kinetic_type',videoDuration:10,aspect:'16:9',typoText:'AKIŞ'};
  const cases={'no summary':videoOut({summary:''}),'no audio':videoOut({audio:undefined}),'no motion':videoOut({motion:''}),'one segment':videoOut({timeline:seg([0,10])}),'gap':videoOut({timeline:seg([0,3],[4,10])}),'overlap':videoOut({timeline:seg([0,5],[4,10])}),'not from zero':videoOut({timeline:seg([1,5],[5,10])}),'ends early':videoOut({timeline:seg([0,3],[3,9])}),'fractional':videoOut({timeline:seg([0,3.5],[3.5,10])}),'wrong kind':videoOut({videoKind:'loop'}),'text not quoted':videoOut({text:'A vertical piece where the word AKIŞ slides in on a snappy ease-out and settles into place.'}),'no type animation':videoOut({typographyAnimation:''}),'segment without camera':videoOut({timeline:[{start:0,end:3,action:'x'},{start:3,end:10,action:'y',camera:'z'}]})};
  for(const [label,output] of Object.entries(cases)){
    studioRepo=await repo();
    await assert.rejects(studioService(output).generate(ask),e=>e.code==='invalid-provider-output',label);
    assert.deepEqual(await studioRepo.store.all(),[],label);
  }
  studioRepo=await repo();assert.ok((await studioService(videoOut()).generate(ask)).video);
});
test('Prompt Studio video: variation and wilder rewrite inherit the source options and follow the existing limits',async()=>{
  studioRepo=await repo();const calls=[];
  const long=(text,extra={})=>videoOut({text,title:text.slice(2,14),timeline:seg([0,5],[5,15]),...extra});
  const source=await studioService(long('A fifteen second square piece: the word "AKIŞ" unfolds from a folded paper strip, serif letters, soft daylight, calm pacing.'),calls).generate({type:'video_prompt',videoKind:'kinetic_type',videoDuration:15,aspect:'1:1',targetModel:'veo',typoText:'AKIŞ',typoStyle:'serif'});
  assert.equal(source.video.durationSec,15);
  const variation=await studioService(long('Same paper strip idea but shot from the side with a slow dolly, "AKIŞ" lifting off the fold in serif capitals, long soft shadows.'),calls).generate({type:'video_prompt',visualMode:'variation',sourceId:source.id});
  const vcall=calls.filter(x=>x.name==='orbit_suggestion').at(-1);
  assert.deepEqual(vcall.input.video,{kind:'kinetic_type',durationSec:15,aspect:'1:1'});assert.equal(vcall.input.targetModel,'veo');assert.equal(vcall.input.typography.text,'AKIŞ');
  assert.equal(variation.parentId,source.id);assert.equal(variation.visualMode,'variation');assert.equal(variation.video.aspect,'1:1');assert.equal(variation.targetModel,'veo');
  await assert.rejects(studioService(videoOut()).generate({type:'video_prompt',visualMode:'variation'}),e=>e.code==='invalid-request');
  // wilder: type and options come from the source, temperature rises, the count is capped
  let wild;
  for(let i=1;i<=3;i++){
    wild=await studioService(long(['Letters spelling "AKIŞ" erupt from a flooded tram floor while ceiling fans spin and fluorescent tubes flicker.','Giant neon jellyfish carry the word "AKIŞ" through a drained swimming pool at midnight, camera orbiting slowly.','A bakery conveyor belt delivers bread loaves branded "AKIŞ", each exploding into confetti stencils, handheld whip pans.'][i-1]),calls).generate({wilder:true,sourceIdeaId:source.id});
    const wcall=calls.filter(x=>x.name==='orbit_suggestion').at(-1);
    assert.equal(wcall.temperature,1.3);assert.match(wcall.instructions,/WILDER MODE/);assert.equal(wcall.input.wilderSource.id,source.id);assert.equal(wcall.input.video.durationSec,15);
    assert.equal(wild.type,'video_prompt');assert.equal(wild.wilderOf,source.id);assert.equal(wild.video.aspect,'1:1');
  }
  await assert.rejects(studioService(long('A fourth wilder attempt with "AKIŞ" in the rain.')).generate({wilder:true,sourceIdeaId:source.id}),e=>e.code==='wilder-limit');
});
test('Prompt Studio API: bad options give 400 {error, code}; good ones pass validation; video history is filterable',async()=>{
  await authenticatedRequest.run({username:'owner'},async()=>{
    const bad=[
      {type:'image_prompt',visualKind:'nope'},{type:'video_prompt',visualKind:'poster_type'},{type:'project',visualKind:'editorial'},
      {type:'image_prompt',targetModel:'veo'},{type:'video_prompt',targetModel:'midjourney'},{type:'project',targetModel:'generic'},
      {type:'image_prompt',typoText:''},{type:'image_prompt',typoText:'x'.repeat(81)},{type:'image_prompt',typoText:'iki "tırnak"'},{type:'image_prompt',typoText:'satır\nsonu'},{type:'image_prompt',typoText:42},{type:'project',typoText:'Merhaba'},
      {type:'image_prompt',typoStyle:'comic'},{type:'image_prompt',typoLayout:'x'},{type:'image_prompt',typoHierarchy:'x'},{type:'image_prompt',typoRelation:'x'},
      {type:'video_prompt',videoKind:'nope'},{type:'video_prompt',videoDuration:7},{type:'video_prompt',videoDuration:'10'},{type:'video_prompt',aspect:'4:3'},{type:'image_prompt',videoDuration:10},{type:'image_prompt',aspect:'1:1'},{type:'image_prompt',videoKind:'loop'},
      {type:'video_prompt',visualMode:'concept'},{type:'video_prompt',visualMode:'variation'},{type:'video_prompt',brief:42},{type:'video_prompt',brief:'x'.repeat(1001)},{type:'video_prompt',wilder:true},
    ];
    for(const body of bad){const res=await api.POST(request({action:'generate',...body})),payload=await res.json();assert.equal(res.status,400,JSON.stringify(body));assert.equal(payload.code,'invalid-request',JSON.stringify(body));assert.equal(typeof payload.error,'string');}
    const good=[
      {type:'image_prompt',visualMode:'prompt',visualKind:'poster_type',targetModel:'flux',typoText:'Merhaba dünya',typoStyle:'handwritten',typoLayout:'diagonal',typoHierarchy:'layered',typoRelation:'behind_subject',brief:'Bir fikir'},
      {type:'image_prompt',visualKind:'logo_mark',targetModel:'gpt_image'},{type:'image_prompt',visualMode:'concept',typoText:'ÇĞİÖŞÜ'},
      {type:'video_prompt',videoKind:'ui_animation',videoDuration:30,aspect:'16:9',targetModel:'runway',typoText:'Başla',typoStyle:'mono',brief:'Bir fikir'},{type:'video_prompt',targetModel:'kling'},{type:'video_prompt',visualMode:'prompt'},
    ];
    for(const body of good){const res=await api.POST(request({action:'generate',...body})),payload=await res.json();assert.equal(res.status,503,JSON.stringify(body));assert.equal(payload.code,'not_configured',JSON.stringify(body));}
    assert.notEqual((await api.GET(new Request('https://orbit.test/api/ideas?type=video_prompt'))).status,400);
  });
});
test('Prompt Studio API end to end: a video request reaches Gemini with the studio schema and returns the stored idea',async()=>{
  const realFetch=globalThis.fetch,seen=[];
  globalThis.__generationTestDb=database();Object.assign(globalThis.__generationTestEnv,{GEMINI_API_KEY:'test-key'});
  globalThis.fetch=async(endpoint,options)=>{const body=JSON.parse(options.body),instructions=body.systemInstruction.parts[0].text;seen.push(body);
    const wire=JSON.parse(instructions.slice(instructions.lastIndexOf('\n')+1));
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(wire.properties.duplicate?{duplicate:false}:videoOut({text:'A ten second UI animation: cards slide in with a snappy ease-out and a toggle clicks over, 0-3s intro, 3-10s interaction.',videoKind:'ui_animation',typographyAnimation:'',timeline:seg([0,4],[4,10])}))}]}}]});};
  try{await authenticatedRequest.run({username:'video'},async()=>{
    const res=await api.POST(request({action:'generate',type:'video_prompt',videoKind:'ui_animation',videoDuration:10,aspect:'9:16',targetModel:'sora'})),payload=await res.json();
    assert.equal(res.status,200,JSON.stringify(payload));assert.equal(payload.idea.type,'video_prompt');assert.equal(payload.idea.video.kind,'ui_animation');assert.equal(payload.idea.video.timeline.length,2);assert.equal(payload.idea.targetModel,'sora');
    const sent=seen[0],instructions=sent.systemInstruction.parts[0].text;assert.match(instructions,/Format for Sora/);assert.equal(sent.generationConfig.temperature,1.15);
    const history=await (await api.GET(new Request('https://orbit.test/api/ideas?type=video_prompt'))).json();assert.equal(history.items.length,1);assert.equal(history.items[0].video.durationSec,10);
  });}finally{globalThis.fetch=realFetch;for(const key of Object.keys(globalThis.__generationTestEnv))delete globalThis.__generationTestEnv[key];}
});

const badIdeas=[
  {title:'Üç Hurda ve Üç Dakika: Masa Başı Mikro Tiyatrosu',text:'Çekmecedeki bozuk kulaklık ve kablolarla bir arkadaşınla üçer dakikalık doğaçlama sahneler oyna.'},
  {title:'Kozmik Koku Seansı: Öğrenci Evi Tanışma Çemberi',text:'Ev arkadaşlarını topla, baharatları gök cisimleriyle eşleştirip gözü kapalı kokla.'},
  {title:'Akşam yemeği',text:'Üç arkadaşını davet et ve birlikte yemek yapın.'},
  {title:'Mahalle yürüyüşü',text:'Arkadaşlarınla mahallede yürüyüşe çık.'},
];
const goodIdeas=[
  {title:'Mahalledeki yürüyüş grubuna katıl',text:'Bu hafta mahallendeki bir koşu ya da yürüyüş grubunun duyurusunu bul ve ilk buluşmaya git.',why:'Düzenli temas arkadaşlık getirir.',first30:['Grubun sayfasına bak ve kayıt ol.']},
  {title:'Kütüphanede okuma kulübüne git',text:'Kütüphanenin okuma kulübü etkinliğine katıl.'},
  {title:'Eski bir tanıdığa mesaj at',text:'Uzun zamandır konuşmadığın bir arkadaşına kısa bir mesaj yaz ve kahve teklif et.'},
  {title:'Yazılım meetup’ına kayıt ol',text:'Şehrindeki bir meetup’a kayıt ol; gidince bir kişiye ne üzerinde çalıştığını sor.'},
];
test('realism filter flags friend-required, group and gimmick ideas but passes plain solo or low-threshold ones',()=>{
  for(const idea of badIdeas)assert.ok(diversity.realismProblems(idea).length>0,idea.title);
  assert.ok(diversity.realismProblems(badIdeas[0]).includes('friend-required'));assert.ok(diversity.realismProblems(badIdeas[0]).includes('gimmick'));assert.ok(diversity.realismProblems(badIdeas[0]).includes('title-colon'));
  assert.ok(diversity.realismProblems(badIdeas[1]).includes('friend-required'));assert.ok(diversity.realismProblems(badIdeas[2]).includes('group-required'));
  for(const idea of goodIdeas)assert.deepEqual(diversity.realismProblems(idea),[],idea.title);
});

test('social ladder starts easy and moves up with accepted social cards',()=>{
  const accepted=n=>Array.from({length:n},(_,i)=>({id:String(i),type:'activity',category:'social_outdoor',status:'accepted'}));
  assert.equal(diversity.pickSocialStep([],()=>.9),'medium');assert.equal(diversity.pickSocialStep([],()=>.1),'very_easy');
  assert.equal(diversity.pickSocialStep(accepted(10),()=>.9),'advanced');assert.equal(diversity.pickSocialStep(accepted(10),()=>.05),'very_easy');
  for(let i=0;i<50;i++)assert.notEqual(diversity.pickSocialStep([],()=>i/50),'advanced');
});

test('social requests carry the ladder step, no lenses and the realism prompt; unrealistic output is rejected and retried',async()=>{
  const {store}=await repo('realism');const calls=[];let n=0;
  const social={title:'Mahalledeki yürüyüş grubuna katıl',text:'Bu hafta mahallendeki bir koşu ya da yürüyüş grubunun buluşmasına git ve bir kişiyle tanış.',domain:'Topluluk',type:'activity',kind:'TRY',goal:'social',summary:'Bu hafta bir yürüyüş grubuna gidip bir kişiyle tanışacaksın.',why:'Düzenli temas arkadaşlık getirir.',first30:['Şehrindeki yürüyüş gruplarını ara ve birine kayıt ol.'],difficulty:'easy',duration:'~1 saat',tag:'yürüyüş grubu'};
  const service=new GenerationService(store,async request=>{
    calls.push(request);
    if(request.name==='orbit_novelty')return {duplicate:false};
    if(request.name==='orbit_realism')return {realistic:true,needsOthers:false,gimmick:false};
    n++;
    if(n===1)return {...social,title:'Kozmik Koku Seansı: Tanışma Çemberi',text:'Ev arkadaşlarını topla ve baharatları gök cisimleriyle eşleştir.'};
    return social;
  },'test',()=>.1);
  const idea=await service.generate({type:'activity',category:'social_outdoor'});
  assert.equal(idea.title,'Mahalledeki yürüyüş grubuna katıl');
  const suggestions=calls.filter(c=>c.name==='orbit_suggestion');
  assert.equal(suggestions.length,2);
  assert.equal(suggestions[0].input.socialStep,'very_easy');assert.deepEqual(suggestions[0].input.seed.lenses,[]);
  assert.equal(suggestions[0].input.previousAttemptRejected,undefined);assert.match(suggestions[1].input.previousAttemptRejected,/friend-required/);
  assert.match(suggestions[0].instructions,/REALISM/);assert.match(suggestions[0].instructions,/Exposure ladder/);assert.match(suggestions[0].instructions,/never write "arkadaşınla"/);
  assert.doesNotMatch(suggestions[0].instructions,/surprising|twice as strange|blend at least two/);
});

test('AI self-check rejects ideas that fail the ordinary-person test and the service gives up after three tries',async()=>{
  const {store}=await repo('selfcheck');let checks=0;
  const idea={title:'Balkonda sessiz kitap saati',text:'Akşam yarım saat balkonda telefonsuz kitap oku.',domain:'Günlük',type:'project',kind:'MAKE',goal:'make',summary:'Akşam yarım saat telefonsuz kitap okuyacaksın.',why:'Kısa molalarda dikkatini toplamayı öğrenirsin.',first30:['Bir kitap seç ve balkona çık.'],difficulty:'easy',duration:'~30 dk',tag:'sakin mola'};
  const service=new GenerationService(store,async request=>{
    if(request.name==='orbit_realism'){checks++;return {realistic:checks>1,needsOthers:false,gimmick:false};}
    if(request.name==='orbit_novelty')return {duplicate:false};
    return {...idea,title:`Balkonda kitap ${checks}`,text:`Akşam balkonda telefonsuz kitap oku sayı${checks*97} kesin${checks*31}`};
  },'test');
  const out=await service.generate({type:'project',category:'daily_life'});
  assert.ok(out.id);assert.equal(checks,2);
  const strict=new GenerationService((await repo('selfcheck2')).store,async request=>request.name==='orbit_realism'?{realistic:true,needsOthers:true,gimmick:false}:request.name==='orbit_novelty'?{duplicate:false}:idea,'test');
  await assert.rejects(strict.generate({type:'project',category:'daily_life'}),/no-novel-result/);
});

test('research: concrete categories keep the old values, give the model topic hints, and a free topic is sanitized and passed as data',async()=>{
  const engine=await import(engineUrl);const values=engine.RESEARCH_CATEGORIES.map(item=>item.value);
  for(const old of ['surprise','science','technology','society','psychology','nature','arts','future','everyday'])assert.ok(values.includes(old),old);
  for(const fresh of ['space','dinosaurs','history','ancient','mythology','body_health','brain_psychology','animals','ocean','physics_universe','ai','software_internet','design_typography','engineering_inventions','economy_money','entrepreneurship','philosophy','geography_countries','language_words','cinema_games','sport_science','food_science'])assert.ok(values.includes(fresh),fresh);
  assert.equal(new Set(values).size,values.length);assert.equal(engine.RESEARCH_CATEGORIES.find(item=>item.value==='space').label,'Uzay & astronomi');
  assert.equal(engine.sanitizeTopic('  kara\n delikler\t<b>x</b> '+'a'.repeat(100)).length<=80,true);assert.equal(engine.sanitizeTopic('  kara\n delikler  '),'kara delikler');assert.equal(engine.sanitizeTopic(42),'');assert.equal(engine.sanitizeTopic(undefined),'');
  const {store}=await repo('topics');const calls=[];
  const service=new GenerationService(store,async request=>{calls.push(request);return request.name==='orbit_novelty'?{duplicate:false}:{...(request.input.requestType==='project'?project:topic),title:`Konu ${calls.length}`,text:`Soru${calls.length*131} nedir ve neden${calls.length*977} önemlidir`,why:'Konuyu sohbette anlatmayı öğrenirsin.',first30:['Bir makale aç.'],tag:'merak'};},'test');
  await service.generate({type:'research',category:'space'});await service.generate({type:'research',category:'surprise',topic:'  Kara\n delikler '});await service.generate({type:'project',topic:'kara delikler'});
  const [spaceCall,topicCall,projectCall]=calls.filter(c=>c.name==='orbit_suggestion');
  assert.match(spaceCall.instructions,/Uzay & astronomi/);assert.match(spaceCall.instructions,/black holes/);assert.deepEqual(spaceCall.input.seed.inspiration,[]);assert.equal(spaceCall.input.topic,undefined);
  assert.equal(topicCall.input.topic,'Kara delikler');assert.match(topicCall.instructions,/free topic/);assert.deepEqual(topicCall.input.seed.inspiration,[]);
  assert.equal(projectCall.input.topic,undefined);assert.match(spaceCall.instructions,/REALISM/);assert.match(spaceCall.instructions,/no colon subtitles/);
});

test('generation lock: per user and kind, freed after errors and aborts, taken over once the old request is stale',async()=>{
  const {store}=await repo('locks');const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
  try{
    assert.equal(await store.acquire('r1','research'),true);
    assert.equal(await store.acquire('p1','project'),true);assert.equal(await store.acquire('r2','research'),false);
    clock+=14_000;assert.equal(await store.acquire('r2','research'),false);
    clock+=2_000;assert.equal(await store.acquire('r3','research'),true);
    await store.release('r1','research');assert.equal(await store.acquire('r4','research'),false);
    await store.release('r3','research');assert.equal(await store.acquire('r5','research'),true);
    clock+=101_000;assert.equal(await store.acquire('r6','research'),true);
  }finally{Date.now=realNow;}
});

test('API: a failed research generation frees the lock, so the next request is not answered with "already running"',async()=>{
  const realFetch=globalThis.fetch;let fail=true,n=0;
  globalThis.__generationTestDb=database();Object.assign(globalThis.__generationTestEnv,{GEMINI_API_KEY:'test-key'});
  globalThis.fetch=async(endpoint,options)=>{if(fail)throw new Error('network down');const body=JSON.parse(options.body),instructions=body.systemInstruction.parts[0].text,wire=JSON.parse(instructions.slice(instructions.lastIndexOf('\n')+1));
    const out=wire.properties.duplicate||wire.properties.realistic?{duplicate:false}:{...card,type:'research',goal:'research',kind:'RESEARCH',title:'Kara delik '+(++n),text:'Kara delikler '+n*7331+' ışığı '+n*9113+' yakalar '+n*3137+' görürüz '+n*5419+' sorusu '+n*1277,domain:'Uzay'};
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(out)}]}}]});};
  try{await authenticatedRequest.run({username:'lockuser'},async()=>{
    const first=await api.POST(request({action:'generate',type:'research',category:'space',topic:'kara delikler'}));assert.notEqual(first.status,200);assert.notEqual((await first.json()).code,'generation-in-progress');
    fail=false;
    const second=await api.POST(request({action:'generate',type:'research',category:'space',topic:'kara delikler'}));const payload=await second.json();assert.equal(second.status,200,JSON.stringify(payload));assert.equal(payload.idea.type,'research');
    assert.equal((await api.POST(request({action:'generate',type:'research',topic:42}))).status,400);
    {const third=await api.POST(request({action:'generate',type:'research',category:'space'}));assert.equal(third.status,200,JSON.stringify(await third.json()));}
  });}finally{globalThis.fetch=realFetch;for(const key of Object.keys(globalThis.__generationTestEnv))delete globalThis.__generationTestEnv[key];}
});

test('culture categories come right after Karışık and keep every older value',async()=>{
  const {RESEARCH_CATEGORIES}=await import(engineUrl),values=RESEARCH_CATEGORIES.map(item=>item.value);
  assert.deepEqual(values.slice(0,9),['surprise','culture_general','literature','music','art_history','traditions','world_cultures','turkish_culture','space']);
  assert.deepEqual(RESEARCH_CATEGORIES.slice(1,8).map(item=>item.label),['Genel kültür','Edebiyat & kitaplar','Müzik','Sanat tarihi & akımlar','Gelenekler & festivaller','Dünya kültürleri','Türk kültürü & tarihi']);
  for(const old of ['science','technology','society','psychology','nature','arts','future','everyday'])assert.ok(values.includes(old),old);
  const {store}=await repo('culture');let seen;
  await new GenerationService(store,async request=>{if(request.name==='orbit_suggestion')seen=request;return request.name==='orbit_novelty'?{duplicate:false}:{...topic,summary:'Müziğin nasıl doğduğunu öğreneceksin.',why:'Sohbette anlatılır.',first30:['Bir parça dinle.']};},'test').generate({type:'research',category:'music'});
  assert.match(seen.instructions,/famous composers/);assert.match(seen.instructions,/Müzik/);
});

test('short cards: summary is stored, over-long text is cut at a sentence or regenerated, the realism filter covers digital gimmicks',async()=>{
  const ok={...card,summary:'Evinin seslerini kaydedip küçük bir harita yapacaksın.',text:'Birinci cümle kısa ve açık. İkinci cümle de kısa. Üçüncü cümle fazla olduğu için kesilir.'};
  const {store}=await repo('short');
  const made=await new GenerationService(store,async request=>request.name==='orbit_novelty'?{duplicate:false}:ok,'test',()=>.8).generate({type:'project',category:'daily_life'});
  assert.equal(made.summary,ok.summary);assert.equal(made.text,'Birinci cümle kısa ve açık. İkinci cümle de kısa.');assert.ok(made.title.length<=50);
  let calls=0;const long={...ok,text:'Bu tek cümle çok uzun olduğu için hiçbir yerden güvenle kesilemez '.repeat(6)+'.'};
  await assert.rejects(new GenerationService((await repo('short2')).store,async()=>{calls++;return long;},'test',()=>.8).generate({type:'project',category:'daily_life'}),/invalid-card/);assert.equal(calls,3);
  const longSummary={...ok,summary:'Çok uzun bir özet cümlesi '.repeat(8)};calls=0;
  await assert.rejects(new GenerationService((await repo('short3')).store,async()=>{calls++;return longSummary;},'test',()=>.8).generate({type:'project',category:'daily_life'}),/invalid-card/);
  for(const bad of [{title:'Ruh Haline Göre Işık Enstalasyonu',text:'Metaforik bir interaktif deneyim kur.'},{title:'Oyunlaştırılmış çamaşır günü',text:'Çamaşırı oyunlaştır.'},{title:'Sanal evren kur',text:'Kendi sanal evrenini yap.'}])assert.ok(diversity.realismProblems(bad).includes('gimmick'),bad.title);
  assert.deepEqual(diversity.realismProblems({title:'Aboneliklerini listeleyen web aracı',text:'Aylık aboneliklerini tek sayfada toplayan küçük bir araç yaz.'}),[]);
  const digital={...ok,type:'digital_project',kind:'BUILD',goal:'make',platform:'web_app'};let prompt;
  await new GenerationService((await repo('short4')).store,async request=>{if(request.name==='orbit_suggestion')prompt=request;return request.name==='orbit_novelty'?{duplicate:false,digitalOnly:true}:digital;},'test',()=>.8).generate({type:'digital_project',platform:'web_app'});
  assert.match(prompt.instructions,/ONE person/);assert.match(prompt.instructions,/Aylık aboneliklerini listeleyen tek sayfalık web aracı/);assert.match(prompt.instructions,/No metaphor/);
  assert.equal(prompt.schema.properties.summary.maxLength,120);assert.equal(prompt.schema.properties.first30.items.maxLength,80);assert.equal(prompt.schema.properties.text.maxLength,240);
});

const electronics={title:'Bitki sulama uyarısı',summary:'Hazır kit ile bitkin susayınca ışık yakan bir devre kuracaksın.',text:'Hazır kitteki nem sensörünü Arduino’ya bağla. Kodu AI’a yazdır, toprak kuruyunca LED yansın.',domain:'Elektronik',type:'project',kind:'BUILD',goal:'make',why:'Hazır kit ile bir devre kurmayı ve AI ile kod yazdırmayı öğrenirsin.',first30:['Sensörü Arduino analog girişine bağla.','Değeri seri monitörde oku.'],difficulty:'easy',duration:'~3 saat toplam',tag:'nem sensörü'};
test('prefs: sanitized, passed as data, avoid areas never reach the user, learning outcome is mandatory, electronics is multidisciplinary',async()=>{
  const engine=await import(engineUrl);
  assert.deepEqual(engine.sanitizePrefs({likes:[' fizik ','Matematik','fizik','x'.repeat(50),42,'<b>biyoloji</b>',...Array(10).fill(0).map((_,i)=>'ilgi'+i)],avoid:['kimya'],level:'beginner'}),{likes:['fizik','Matematik','x'.repeat(30),'b biyoloji /b','ilgi0','ilgi1','ilgi2','ilgi3'],avoid:['kimya'],level:'beginner'});
  assert.equal(engine.sanitizePrefs({level:'expert'}),undefined);assert.equal(engine.sanitizePrefs('x'),undefined);assert.equal(engine.sanitizePrefs([]),undefined);assert.deepEqual(engine.sanitizePrefs({avoid:[],level:'advanced'}),{level:'advanced'});
  for(const bad of ['Kimyasal reaksiyonla pil yap','Asit ile paslanma deneyi','Molekül modeli kur'])assert.ok(diversity.realismProblems({title:bad,text:'Kısa bir metin.'},{avoid:['kimya']}).includes('avoided-topic'),bad);
  assert.deepEqual(diversity.realismProblems({title:'Sarkaç periyodunu ölç',text:'Bir ip ve telefonla sarkacın periyodunu ölç.'},{avoid:['kimya']}),[]);
  assert.ok(diversity.realismProblems({title:'Sensör devresi',text:'Devre kur.',why:'Eğlenceli bir iş.'},{learning:true}).includes('vague-learning'));
  assert.deepEqual(diversity.realismProblems({title:'Sensör devresi',text:'Devre kur.',why:'Ohm yasasını öğrenirsin.'},{learning:true}),[]);
  const {store}=await repo('prefs');const calls=[];let n=0;
  const service=new GenerationService(store,async request=>{calls.push(request);if(request.name==='orbit_novelty')return {duplicate:false};if(request.name==='orbit_realism')return {realistic:true};n++;
    return n===1?{...electronics,title:'Kimyasal pil devresi',text:'Asitli bir pil yapıp devreye bağla.'}:n===2?{...electronics,why:'Eğlenceli bir iş olur.',text:'Sensör devresi kur '+n*7919+' ve '+n*104729+' dene '+n*1299709}:{...electronics,text:'Sensörü oku '+n*15485863+' ve '+n*32452843+' ışığı yak '+n*49979687};},'test',()=>.5);
  const made=await service.generate({type:'project',category:'electronics',prefs:{likes:['fizik','matematik'],avoid:['kimya'],level:'beginner'}});
  const asks=calls.filter(c=>c.name==='orbit_suggestion');
  assert.equal(asks.length,3);assert.deepEqual(asks[0].input.prefs,{likes:['fizik','matematik'],avoid:['kimya'],level:'beginner'});
  assert.match(asks[0].instructions,/NEVER use, mention or touch any area in avoid/);assert.match(asks[0].instructions,/beginner level/);assert.match(asks[0].instructions,/multidisciplinary/);assert.match(asks[0].instructions,/ready-made starter kit/);assert.match(asks[0].instructions,/default is BEGINNER/);assert.match(asks[0].instructions,/AI-ASSISTED MAKING/);assert.doesNotMatch(asks[0].instructions,/Ohm|PWM|voltage divider/);assert.match(asks[0].instructions,/Sana katacağı/);
  assert.match(asks[1].input.previousAttemptRejected,/avoided-topic/);assert.match(asks[2].input.previousAttemptRejected,/vague-learning/);
  assert.equal(made.why,electronics.why);
  const review=calls.find(c=>c.name==='orbit_realism');assert.deepEqual(review.input.avoid,['kimya']);assert.ok(review.schema.properties.violatesAvoid);
  const viol=new GenerationService((await repo('prefs2')).store,async request=>request.name==='orbit_realism'?{violatesAvoid:true}:request.name==='orbit_novelty'?{duplicate:false}:electronics,'test',()=>.5);
  await assert.rejects(viol.generate({type:'project',category:'electronics',prefs:{avoid:['kimya']}}),/no-novel-result/);
  const none=[];await new GenerationService((await repo('prefs3')).store,async request=>{none.push(request);return request.name==='orbit_novelty'?{duplicate:false}:electronics;},'test',()=>.5).generate({type:'project',category:'electronics'});
  assert.equal(none.find(c=>c.name==='orbit_suggestion').input.prefs,undefined);
});
test('API: prefs must be an object; garbage inside is dropped',async()=>{
  const realFetch=globalThis.fetch,seen=[];globalThis.__generationTestDb=database();Object.assign(globalThis.__generationTestEnv,{GEMINI_API_KEY:'test-key'});
  globalThis.fetch=async(endpoint,options)=>{const body=JSON.parse(options.body),instructions=body.systemInstruction.parts[0].text,wire=JSON.parse(instructions.slice(instructions.lastIndexOf('\n')+1));seen.push(body);
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(wire.properties.duplicate||wire.properties.realistic?{duplicate:false}:electronics)}]}}]});};
  try{await authenticatedRequest.run({username:'prefsuser'},async()=>{
    assert.equal((await api.POST(request({action:'generate',type:'project',prefs:'kimya'}))).status,400);assert.equal((await api.POST(request({action:'generate',type:'project',prefs:['kimya']}))).status,400);
    const ok=await api.POST(request({action:'generate',type:'project',category:'electronics',prefs:{avoid:['kimya',7],level:'bogus'}}));assert.equal(ok.status,200,JSON.stringify(await ok.clone().json()));
    assert.ok(seen[0].contents[0].parts[0].text.includes('"prefs":{"avoid":["kimya"]}'));
  });}finally{globalThis.fetch=realFetch;for(const key of Object.keys(globalThis.__generationTestEnv))delete globalThis.__generationTestEnv[key];}
});
