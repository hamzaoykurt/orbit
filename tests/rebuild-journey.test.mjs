import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../app/rebuild/journey-model.ts',import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('26-week phases derive from dates with exact boundaries and no invented start',()=>{
  assert.equal(model.defaultPhases.reduce((sum,phase)=>sum+phase.weeks,0),26);
  assert.equal(model.journeyPosition('','2026-08-30').started,false);
  assert.equal(model.journeyPosition('2026-08-31','2026-08-30').future,true);
  assert.equal(model.journeyPosition('2026-08-03','2026-08-30').week,4);
  assert.equal(model.journeyPosition('2026-08-03','2026-08-31').phase,1);
  assert.equal(model.journeyPosition('2026-08-03','2027-01-31').complete,false);
  assert.equal(model.journeyPosition('2026-08-03','2027-02-01').complete,true);
  assert.equal(model.journeyPosition('2026-08-03','2027-02-01').week,26);
});
test('weekly history crosses month, year and daylight saving boundaries',()=>{
  assert.equal(model.calendarWeek('2026-01-01'),'2025-12-29');
  assert.equal(model.calendarWeek('2026-08-30'),'2026-08-24');
  assert.equal(model.addDays('2026-03-28',2),'2026-03-30');
  assert.equal(model.validDate('2026-02-31'),false);
});
test('new and migrated journeys have no fake experiments, outputs, ratings or reviews',()=>{
  const journey=model.normalizeJourney(undefined);
  assert.deepEqual(journey.experiments,[]);assert.deepEqual(journey.outputs,[]);assert.deepEqual(journey.reviews,{});
  assert.equal(journey.startDate,'');
  const saved={...journey,startDate:'2026-08-03',phases:[{...journey.phases[0],name:'My phase'}],outputs:[{id:'out-1',title:'My output',date:'2026-08-30',link:'https://example.com'}]};
  const hydrated=model.normalizeJourney(JSON.parse(JSON.stringify(saved)));
  assert.equal(hydrated.phases.length,6);assert.equal(hydrated.phases[0].name,'My phase');assert.equal(hydrated.outputs[0].id,'out-1');
});
test('closing and editing a week keeps its original closure and other weeks intact',()=>{
  const base=model.emptyJourney();
  const review={flow:'Designing',forced:'',best:'Prototype',more:'Testing',learned:'',closedAt:''};
  const first=model.closeWeek(base,'2026-08-24',review,'2026-08-30T12:00:00Z');
  assert.deepEqual(base.reviews,{});
  const next=model.closeWeek(first,'2026-08-31',{...review,best:'Second prototype'},'2026-09-06T12:00:00Z');
  const edited=model.closeWeek(next,'2026-08-24',{...review,more:'More designing'},'2026-09-07T12:00:00Z');
  assert.equal(edited.reviews['2026-08-24'].closedAt,'2026-08-30T12:00:00Z');
  assert.equal(edited.reviews['2026-08-24'].more,'More designing');
  assert.equal(edited.reviews['2026-08-31'].best,'Second prototype');
  assert.throws(()=>model.closeWeek(base,'2026-02-31',review));
  assert.throws(()=>model.closeWeek(base,'2026-08-24',{flow:' ',forced:'',best:'',more:'',learned:''}));
});
test('observations require repeated comparable ratings; unrated and archived records do not distort them',()=>{
  const entry={id:'one',name:'Arayüz',made:'A working UI',archived:false,ratings:{...model.emptyRatings,flow:5}};
  assert.deepEqual(model.observations([entry]),[]);
  assert.deepEqual(model.observations([entry,{...entry,id:'two',ratings:model.emptyRatings}]),[]);
  const result=model.observations([entry,{...entry,id:'two',name:'arayüz',ratings:{...model.emptyRatings,flow:3}},{...entry,id:'archived',archived:true}]);
  assert.equal(result.length,1);assert.equal(result[0].count,2);assert.equal(result[0].mean,4);
  assert.deepEqual(model.observations([entry,{...entry,name:'Game design',id:'three'}]),[]);
});
test('output links cannot execute code or carry embedded credentials',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,hi','https://user:secret@example.com','file:///tmp/test'])assert.equal(model.safeLink(value),'');
  assert.equal(model.safeLink('https://example.com/work'),'https://example.com/work');
});
