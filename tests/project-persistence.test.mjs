import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadModuleUrl } from './load-module.mjs';
const load = path => import(loadModuleUrl(new URL(path,import.meta.url)));
const sync = await load('../app/state-sync.ts');
const planning = await load('../app/projects/planning-types.ts');
const { analyzeProject } = await load('../app/projects/project-advisor.ts');
const { applyPlanning } = await load('../app/projects/planning-actions.ts');
const { projectFromIdea } = await load('../app/rebuild/project-import.ts');
const input = {...planning.newCreationDraft('project-test'),idea:'Masaüstünde ekran görüntülerini düzenleyen yerel bir uygulama',title:'Görsel arşiv',selectedStyle:'bento',answers:{validation:'build',scope:'one'}};
const plan = {version:1,input,analysis:analyzeProject(input),selectedStyle:'bento',lifecycle:'mvp',overrides:{priority:'Önce bunu dene'},createdAt:'2026-08-31',updatedAt:'2026-08-31'};
const workspace = () => applyPlanning({description:'',diagrams:[],notes:[],links:[]},plan);
function storage() {const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}

test('plan, style, tasks and flow survive JSON reload and normalization',()=>{
  const original=workspace(),restored=JSON.parse(JSON.stringify(original));
  assert.deepEqual(planning.normalizePlanning(restored.planning),plan);
  assert.deepEqual(restored.diagrams,original.diagrams);
  assert.equal(restored.diagrams.length,1);
  assert.equal(restored.diagrams[0].edges.length,restored.diagrams[0].nodes.length-1);
  assert.equal(restored.diagrams[0].nodes.length,5);
  assert.match(restored.notes[0].body,/İlk kapsam/);
  assert.ok(restored.diagrams[0].nodes.every(node=>node.x<=820&&node.y<=520&&node.label.length<=140));
});
test('reevaluation preserves user diagrams, notes, overrides, creation time and deleted flows',()=>{
  const original=workspace();original.diagrams[0].nodes[0].label='Elle düzenlenen başlangıç';original.notes[0].body='Kendi kararım';
  const updated=applyPlanning(original,{...plan,createdAt:'2026-09-01',overrides:{},selectedStyle:'editorial'});
  assert.deepEqual(updated.diagrams,original.diagrams);assert.deepEqual(updated.notes,original.notes);
  assert.deepEqual(updated.planning.overrides,plan.overrides);assert.equal(updated.planning.selectedStyle,'editorial');assert.equal(updated.planning.createdAt,plan.createdAt);
  assert.deepEqual(applyPlanning({...original,diagrams:[]},plan).diagrams,[]);
});
test('closing before debounce or failed network replays pending planning over stale server',()=>{
  const device=storage(),base={projectWorkspaces:{p:{description:'old',diagrams:[],notes:[],links:[]}},profile:{name:'Owner'}};
  const local={...base,projectWorkspaces:{p:workspace()}},remote={...base,profile:{name:'Updated elsewhere'}};
  sync.journalState(device,JSON.stringify(local),JSON.stringify(base));
  const pending=sync.readPending(device);
  const restored=sync.rebaseState(JSON.parse(pending.base),JSON.parse(pending.state),remote);
  assert.deepEqual(restored.projectWorkspaces.p,local.projectWorkspaces.p);
  assert.equal(restored.profile.name,'Updated elsewhere');
  sync.acknowledgeState(device,JSON.stringify(base));assert.ok(sync.readPending(device));
  sync.acknowledgeState(device,JSON.stringify(local));assert.equal(sync.readPending(device),null);
});
test('an older save receipt does not clear newer edits; explicit reversions survive replay',()=>{
  const device=storage();sync.journalState(device,'{"title":"second"}','{"title":"first"}');
  sync.acknowledgeState(device,'{"title":"intermediate"}');
  assert.deepEqual(sync.readPending(device),{state:'{"title":"second"}',base:'{"title":"intermediate"}'});
  assert.deepEqual(sync.rebaseState({title:'intermediate'},{title:'first'},{title:'intermediate'}),{title:'first'});
});
test('concurrent project and nested resource changes merge by stable IDs without reviving deletions',()=>{
  const base={projects:[{id:'a',title:'A'},{id:'b',title:'B'}],workspaces:{a:{style:'calm',notes:[{id:'n',body:'old'}]}}};
  const local={projects:[{id:'a',title:'Renamed'}],workspaces:{a:{style:'bold',notes:[{id:'n',body:'old'}]}}};
  const remote={projects:[...base.projects,{id:'c',title:'Other project'}],workspaces:{a:{style:'calm',notes:[{id:'n',body:'Updated elsewhere'}]}}};
  const merged=sync.rebaseState(base,local,remote);
  assert.deepEqual(merged.projects,[{id:'a',title:'Renamed'},{id:'c',title:'Other project'}]);
  assert.deepEqual(merged.workspaces.a,{style:'bold',notes:[{id:'n',body:'Updated elsewhere'}]});
});
test('imported digital projects receive their actual plan, software route, tags and normalized planning',()=>{
  const idea={id:'idea-test',resultingId:'generated-test',title:'Ses oyunu',text:'Yalnızca sesle yön bulduğun bir tarayıcı oyunu yap.',domain:'Ses tasarımı',type:'digital_project',platform:'game',status:'accepted',generatedAt:'2026-08-31',projectPlan:{description:'Sesle yön bulma oyunu.',goal:'Üç ses kaynağıyla çıkışı bul.',scope:'Tek bir labirent',tasks:['Konumsal ses kaynaklarını yerleştir','Oyuncu hareketini bağla','Çıkışa ulaşmayı sesle bildir'],approach:'Görüntüsüz tek seviye ile test et.'}};
  const imported=projectFromIdea(idea);
  assert.deepEqual(imported.project.tasks,idea.projectPlan.tasks);
  assert.deepEqual(imported.workspace.planning.analysis.firstSteps,idea.projectPlan.tasks);
  assert.match(imported.workspace.planning.analysis.route,/Oyun/);
  assert.equal(imported.workspace.planning.analysis.mvp,idea.projectPlan.scope);
  assert.ok(planning.normalizePlanning(JSON.parse(JSON.stringify(imported.workspace.planning))));
  assert.equal(imported.workspace.diagrams.length,1);assert.equal(imported.project.tags.length,2);
});
test('software, electronics and physical creation keep distinct local routes',()=>{
  assert.match(analyzeProject({...input,idea:'fitness app ama ai destekli'}).type,/dijital/);
  assert.match(analyzeProject({...input,idea:'Arduino sensör ve devre deneyi'}).type,/Elektronik/);
  assert.match(analyzeProject({...input,idea:'Ahşap fiziksel masa nesnesi'}).type,/Fiziksel/);
  assert.match(analyzeProject({...input,idea:'Ahşap fiziksel masa nesnesi'},'desktop_app').type,/Masaüstü/);
});

const sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE orbit_state (workspace_id TEXT PRIMARY KEY,state_json TEXT,revision INTEGER,updated_at TEXT)');
globalThis.__stateTestDb={prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;}};}};
const contextUrl=loadModuleUrl(new URL('../auth/context.ts',import.meta.url));
const {authenticatedRequest}=await import(contextUrl);
let code=ts.transpileModule(readFileSync(new URL('../app/api/state/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
code=code.replace("import { ensureOrbitSchema } from '../../../db/client';",'const ensureOrbitSchema=async()=>globalThis.__stateTestDb;').replace("'../../../auth/context'",JSON.stringify(contextUrl));
const api=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const put=(state,revision)=>api.PUT(new Request('https://os.cosmibit.com/api/state',{method:'PUT',headers:{origin:'https://os.cosmibit.com','Content-Type':'application/json'},body:JSON.stringify({state,revision})}));
test('D1 round-trip preserves planning; stale or pre-update clients cannot silently replace state',async()=>{
  assert.equal((await put({private:true},0)).status,401);
  await authenticatedRequest.run({username:'owner'},async()=>{
    const original={projectWorkspaces:{p:workspace()}};
    const saved=await put(original,0);assert.equal(saved.status,200);assert.equal((await saved.json()).revision,1);
    const payload=await (await api.GET()).json();assert.deepEqual(payload.state,original);
    const updated={...original,profile:{name:'New'}};
    assert.equal((await put(updated,1)).status,200);
    const stale=await put({projectWorkspaces:{}},1);assert.equal(stale.status,409);
    assert.deepEqual((await stale.json()).state,updated);
    assert.equal((await put({projectWorkspaces:{}})).status,409);
    assert.equal((await put({projectWorkspaces:{}},0)).status,409);
    assert.deepEqual((await (await api.GET()).json()).state,updated);
  });
});
