import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const url=(file,replacements={})=>{
  let code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const [from,to] of Object.entries(replacements))code=code.replaceAll(from,to);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
};
const schemaUrl=url('../generation/schema.ts'),repoUrl=url('../generation/repository.ts',{"'./schema'":JSON.stringify(schemaUrl)}),serviceUrl=url('../generation/service.ts');
const providerUrl=url('../generation/provider.ts'),engineUrl=url('../app/rebuild/idea-engine.ts');
const {GenerationRepository}=await import(repoUrl),{GenerationService}=await import(serviceUrl),{createModelProvider}=await import(providerUrl);
const {resolveModelConfig}=await import(providerUrl);
const practice=await import(url('../app/rebuild/practice-model.ts'));
const {projectFromIdea}=await import(url('../app/rebuild/project-import.ts'));
const deck=await import(url('../app/rebuild/weekly-deck-model.ts',{"'./idea-engine'":JSON.stringify(engineUrl)}));
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
  assert.equal(config.model,'gemini-2.0-flash');assert.equal(config.apiKey,'test-gemini-key');
  assert.equal(resolveModelConfig({AI_PROVIDER:'gemini',OPENAI_API_KEY:'unused'}).apiKey,undefined);
  assert.throws(()=>resolveModelConfig({AI_PROVIDER:'invalid'}),/config-invalid/);
  let sent,calls=0;
  const provider=createModelProvider(config,async(endpoint,options)=>{calls++;sent={endpoint:String(endpoint),headers:options.headers,body:JSON.parse(options.body)};return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private thought'},{text:JSON.stringify(project)}]}}]});});
  assert.deepEqual(await provider({name:'test',instructions:'Generate',input:{request:'new'},schema:{type:'object'}}),project);
  assert.equal(calls,1);assert.equal(sent.headers['x-goog-api-key'],'test-gemini-key');assert.ok(!sent.endpoint.includes('test-gemini-key'));
  assert.equal(sent.body.generationConfig.responseMimeType,'application/json');assert.deepEqual(sent.body.generationConfig.responseSchema,{type:'object'});
  calls=0;await assert.rejects(createModelProvider(config,async()=>{calls++;return new Response('quota',{status:429});})({name:'test',input:{},schema:{}}),/provider-http-429/);assert.equal(calls,1);
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
  assert.equal(contracts.length,6);
  assert.equal((await store.all()).length,3);
  assert.equal(contracts[0].properties.text.maxLength,600);
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
  assert.equal(calls.length,1);assert.equal(idea.projectPlan,undefined);assert.equal((await store.all()).length,1);
  const accepted=await service.accept(idea.id);assert.deepEqual(accepted.projectPlan,plan);assert.equal(calls.length,2);assert.equal(accepted.status,'accepted');
  assert.deepEqual(await service.accept(idea.id),accepted);assert.equal(calls.length,2);
  const imported=projectFromIdea(accepted);assert.deepEqual(imported.project.tasks,plan.tasks);assert.equal(imported.workspace.description,plan.description);assert.ok(imported.workspace.notes[0].body.includes(plan.scope));assert.equal(imported.project.id,accepted.resultingId);
});
test('research acceptance creates topic-specific questions, preserves main question and can resume after reload',async()=>{
  const {store}=await repo();const calls=[];const service=new GenerationService(store,async request=>{calls.push(request);return request.name==='orbit_accepted_plan'?questions:topic;},'test');
  const idea=await service.generate({type:'research'});assert.equal(idea.researchPlan,undefined);
  const accepted=await service.accept(idea.id);assert.equal(calls.length,2);
  let state=practice.acceptIntoPractice(practice.emptyPractice(),accepted);
  state=practice.updateQuestion(state,accepted.resultingId,state.research[0].questions[0].id,{explored:true,note:'Kısa kanıt notu'});
  const roundtrip=practice.normalizePractice(JSON.parse(JSON.stringify(state)));
  assert.equal(roundtrip.research[0].question,topic.text);assert.equal(roundtrip.research[0].questions[0].explored,true);assert.equal(roundtrip.research[0].questions[0].note,'Kısa kanıt notu');
  assert.deepEqual(practice.acceptIntoPractice(roundtrip,accepted),roundtrip);
});
test('exact and near duplicates are rejected, never rerolled from stored history',async()=>{
  const {store}=await repo();let calls=0;const service=new GenerationService(store,async()=>{calls++;return project;},'test');await service.generate({type:'project'});
  await assert.rejects(service.generate({type:'project'}),error=>error.code==='no-novel-result');assert.equal(calls,4);assert.equal((await store.all()).length,1);
  const semantic=new GenerationService(store,async request=>request.name==='orbit_novelty'?{duplicate:true}:{...project,title:'Ses masası',text:'Bir masa objesiyle sesin yönünün nasıl değiştiğini karşılaştır.'},'test');
  await assert.rejects(semantic.generate({type:'project'}),error=>error.code==='no-novel-result');assert.equal((await store.all()).length,1);
});
test('unexpected directions are requested without using saved interests as a restrictive ranking',async()=>{
  const {store}=await repo();let prompt;const service=new GenerationService(store,async request=>{prompt=request;return topic;},'test',()=>.9);
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
  state.research=[{id:'research',ideaId:'idea',title:'Current',question:'Question?',startedAt:'2026-08-25T12:00:00Z',questions:[{id:'q',text:'Why?',explored:false,note:''}]}];state.currentResearchId='research';
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
  "'../../../auth/context'":JSON.stringify(contextUrl),"'../../../generation/repository'":JSON.stringify(repoUrl),"'../../../generation/provider'":JSON.stringify(providerUrl),"'../../../generation/service'":JSON.stringify(serviceUrl),"'../../rebuild/idea-engine'":JSON.stringify(engineUrl),
}));
const request=(body,origin='https://orbit.test')=>new Request('https://orbit.test/api/ideas',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('API denies anonymous and cross-origin requests, validates inputs and exposes no secret when unavailable',async()=>{
  assert.equal((await api.POST(request({action:'generate'}))).status,401);
  await authenticatedRequest.run({username:'owner'},async()=>{
    assert.equal((await api.POST(request({action:'generate'},'https://evil.test'))).status,403);
    assert.equal((await api.POST(request({action:'generate',type:'bad'}))).status,400);
    assert.equal((await api.POST(request({action:'generate',words:['x'.repeat(5000)]}))).status,413);
    const missing=await api.POST(request({action:'generate',type:'project'}));assert.equal(missing.status,503);assert.equal((await missing.json()).code,'not_configured');
    assert.equal((await api.GET(new Request('https://orbit.test/api/ideas?before=bad'))).status,400);
  });
});
