import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function moduleUrl(file, imports={}) {
  let source=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const [path,url] of Object.entries(imports))source=source.replaceAll(`from '${path}'`,`from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const engineUrl=moduleUrl('../app/rebuild/idea-engine.ts');
const engine=await import(engineUrl);
const model=await import(moduleUrl('../app/rebuild/weekly-deck-model.ts',{'./idea-engine':engineUrl}));
const week='2026-08-24', nextWeek='2026-08-31';
const mark=(id,idea)=>({id,at:'2026-08-30T12:00:00Z',...(idea?{idea}:{})});
const fresh=()=>model.ensureWeek(model.emptyDeck(),week);

test('first visit needs no setup; weekly rollover resets counts and ideas, not defaults or history',()=>{
  let deck=fresh();
  assert.deepEqual(deck.weeks[week].goals.map(goal=>goal.target),[3,2,1,1,1]);
  assert.equal(deck.startedOn,week);
  deck=model.attachIdea(deck,week,engine.ideaPool[0]);
  deck=model.completeGoal(deck,week,'make',mark('one',engine.ideaPool[0]));
  const history=JSON.stringify(deck.weeks[week]);
  const next=model.ensureWeek(deck,nextWeek);
  assert.deepEqual(next.weeks[nextWeek].marks,{});
  assert.deepEqual(next.weeks[nextWeek].ideas,{});
  assert.equal(JSON.stringify(next.weeks[week]),history);
  assert.equal(next.startedOn,week);
  assert.equal(model.ensureWeek(next,nextWeek),next);
});

test('completion is bounded, idempotent, reversible and keeps the original idea as evidence',()=>{
  const idea=engine.ideaPool[0];
  const initial=fresh();
  let deck=model.completeGoal(initial,week,'body',mark('a',idea));
  assert.equal(initial.weeks[week].marks.body,undefined);
  assert.equal(model.completeGoal(deck,week,'body',mark('a')),deck);
  deck=model.completeGoal(deck,week,'body',mark('b'));
  deck=model.completeGoal(deck,week,'body',mark('c'));
  assert.equal(model.completeGoal(deck,week,'body',mark('d')),deck);
  assert.equal(deck.weeks[week].marks.body.length,3);
  assert.deepEqual(deck.weeks[week].marks.body[0].idea,idea);
  deck=model.undoCompletion(deck,week,'body','b');
  assert.deepEqual(deck.weeks[week].marks.body.map(item=>item.id),['a','c']);
  deck=model.undoCompletion(deck,week,'body');
  assert.equal(deck.weeks[week].marks.body.length,1);
});

test('editing goals keeps old weeks and marks intact, including rename, remove and custom goal',()=>{
  let deck=model.completeGoal(fresh(),week,'body',mark('a'));
  const prior=JSON.stringify(deck.weeks[week]);
  deck=model.ensureWeek(deck,nextWeek);
  const goals=deck.defaults.filter(goal=>goal.id!=='social').map(goal=>goal.id==='body'?{...goal,name:'Hareket',target:4}:goal);
  goals.push({id:'custom',name:'Piyano',target:2,kind:'any'});
  deck=model.configureGoals(deck,nextWeek,goals);
  assert.equal(JSON.stringify(deck.weeks[week]),prior);
  assert.equal(deck.defaults[0].name,'Hareket');
  assert.equal(deck.weeks[nextWeek].goals.at(-1).name,'Piyano');
  const future=model.ensureWeek(deck,'2026-09-07');
  assert.equal(future.weeks['2026-09-07'].goals[0].target,4);
  assert.equal(future.weeks['2026-09-07'].goals.some(goal=>goal.id==='social'),false);
});

test('saving suggestions routes to relevant goals, respects custom destination, and preserves completed work',()=>{
  const [first,second]=engine.ideaPool;
  let deck=model.attachIdea(fresh(),week,first);
  assert.equal(deck.weeks[week].ideas.make.id,first.id);
  deck=model.completeGoal(deck,week,'make',mark('first',first));
  deck=model.attachIdea(deck,week,second);
  assert.equal(deck.weeks[week].goals.find(goal=>goal.id==='make').target,2);
  assert.equal(deck.weeks[week].marks.make[0].idea.id,first.id);
  assert.equal(deck.defaults.find(goal=>goal.id==='make').target,1);
  deck=model.attachIdea(deck,week,second);
  assert.equal(deck.weeks[week].goals.find(goal=>goal.id==='make').target,2);
  deck=model.configureGoals(deck,week,[{id:'custom',name:'Deneme',target:1,kind:'any'}]);
  deck=model.attachIdea(deck,week,first,'custom');
  assert.equal(deck.weeks[week].ideas.custom.id,first.id);
  deck=model.attachIdea(deck,week,engine.ideaPool.find(idea=>idea.goal==='social'));
  assert.equal(deck.weeks[week].goals.at(-1).kind,'social');
  assert.equal(deck.defaults.some(goal=>goal.kind==='social'),false);
});

test('migration reuses real weekly activities once and does not count expression as English',()=>{
  const seed={activities:[
    {id:'a',date:'2026-08-25',areaId:'body',title:'Antrenman'},
    {id:'b',date:'2026-08-26',areaId:'language',title:'Ses kaydı / diksiyon'},
    {id:'c',date:'2026-08-26',areaId:'language',title:'Konuşma'},
    {id:'old',date:'2026-08-01',areaId:'body',title:'Antrenman'},
  ],selections:{[`${week}-curiosity`]:'Uydu nasıl döner?'}};
  const deck=model.ensureWeek(model.emptyDeck(),week,seed);
  assert.equal(deck.weeks[week].marks.body.length,1);
  assert.equal(deck.weeks[week].marks.english.length,1);
  assert.equal(deck.weeks[week].ideas.research.text,'Uydu nasıl döner?');
  assert.equal(model.ensureWeek(deck,week,seed),deck);
  assert.equal(model.ensureWeek(deck,nextWeek,seed).weeks[nextWeek].marks.body.length,0);
});

test('reload preserves empty configuration, week snapshots, completion evidence and seen ideas',()=>{
  let deck=model.attachIdea(fresh(),week,engine.ideaPool[0]);
  deck=model.completeGoal(deck,week,'make',mark('one',engine.ideaPool[0]));
  const roundtrip=model.normalizeDeck(JSON.parse(JSON.stringify(deck)));
  assert.deepEqual(roundtrip,deck);
  assert.deepEqual(model.normalizeDeck({defaults:[]}).defaults,[]);
  const damaged=model.normalizeDeck({defaults:[{id:'a',name:' Test ',target:-5},{id:'a',name:'duplicate',target:3}],weeks:{invalid:{goals:[]}},seenIdeas:[null,'okay']});
  assert.equal(damaged.defaults.length,1);
  assert.equal(damaged.defaults[0].target,1);
  assert.deepEqual(damaged.weeks,{});
  assert.deepEqual(damaged.seenIdeas,['okay']);
  assert.throws(()=>model.ensureWeek(deck,'2026-08-30'));
});

test('local deck covers all seven idea types, routes every idea and avoids repeats until exhaustion',()=>{
  assert.equal(new Set(engine.ideaPool.map(idea=>idea.kind)).size,7);
  assert.ok(engine.ideaPool.length>=50);
  assert.ok(engine.ideaPool.every(engine.isIdea));
  const seen=[];
  for(let i=0;i<engine.ideaPool.length;i++){
    const idea=engine.pickLocalIdea({exclude:seen},()=>0);
    assert.ok(!seen.includes(idea.id));seen.push(idea.id);
  }
  assert.notEqual(engine.pickLocalIdea({exclude:seen},()=>.999).id,seen.at(-1));
  for(const goal of ['body','english','make','research','social'])assert.equal(engine.pickLocalIdea({goal,exclude:[]}).goal,goal);
});

test('optional provider has validation, cancellation and honest local fallback',async()=>{
  const local=await engine.createIdeaGenerator(async()=>{throw Error('offline');})({goal:'research',exclude:[]});
  assert.equal(local.goal,'research');
  const invalid=await engine.createIdeaGenerator(async()=>({text:'invalid'}))({goal:'english',exclude:[]});
  assert.equal(invalid.goal,'english');
  const offered={...engine.ideaPool[0],id:'provider-1'};
  assert.deepEqual(await engine.createIdeaGenerator(async()=>offered)({exclude:[]}),offered);
  const controller=new AbortController();controller.abort();
  await assert.rejects(engine.generateIdea({exclude:[],signal:controller.signal}),{name:'AbortError'});
});

test('extra ideas survive reload even with twelve custom defaults; unsafe keys are ignored',()=>{
  let deck=model.configureGoals(fresh(),week,Array.from({length:12},(_,i)=>({id:`custom-${i}`,name:`Goal ${i}`,target:1,kind:'any'})));
  deck=model.attachIdea(deck,week,engine.ideaPool[0]);
  assert.equal(deck.weeks[week].goals.length,13);
  assert.equal(model.normalizeDeck(JSON.parse(JSON.stringify(deck))).weeks[week].goals.length,13);
  const normalized=model.normalizeDeck({defaults:[{id:'__proto__',name:'Invalid',target:1}]});
  assert.equal(normalized.defaults.length,0);
});
