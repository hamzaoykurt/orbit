import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const mentor=await import(loadModuleUrl(new URL('../app/mentor-sync.ts',import.meta.url)));

test('project import tolerates whitespace, bullets, multiline values and missing optional fields',()=>{
  const parsed=mentor.parseMentorOutput(`\nPROJECT\nname: Orbital Radio\ndescription: A quiet radio for space.\n  Second descriptive line.\nstage: EXPLORE\ntasks:\n - Sketch the flow\n * Build the tuner\ntags: audio, web\ndesign_language: Editorial / Swiss`);
  assert.equal(parsed.kind,'project');
  assert.equal(parsed.name,'Orbital Radio');
  assert.match(parsed.description,/Second descriptive line/);
  assert.deepEqual(parsed.tasks,['Sketch the flow','Build the tuner']);
  assert.deepEqual(parsed.tags,['audio','web']);
});

test('research import keeps the main question, subquestions and optional output',()=>{
  const parsed=mentor.parseMentorOutput(`RESEARCH\ntitle: Lagrange points\nmain_question: Why do Lagrange points exist?\nsubquestions:\n1. What balances in a rotating frame?\n2. Which points are stable?\noptional_output: A one-page diagram`);
  assert.equal(parsed.kind,'research');
  assert.equal(parsed.subquestions.length,2);
  assert.equal(parsed.optionalOutput,'A one-page diagram');
});

test('invalid output fails safely and practical duplicate matching catches close titles',()=>{
  assert.equal(mentor.parseMentorOutput('please make something'),null);
  const existing=[{title:'Orbital Radio'}];
  assert.equal(mentor.findSimilar('Orbital Radio Project',existing,item=>item.title),existing[0]);
  assert.equal(mentor.findSimilar('Cooking notebook',existing,item=>item.title),null);
});

test('project and research context stay compact and separate completed from remaining work',()=>{
  const project=mentor.projectContext({name:'Orbit',goal:'Teach mechanics',type:'Web',stage:'MVP',scope:'One simulation',nextAction:'Test controls',completed:['Draw orbit'],tasks:['Test controls'],designLanguage:'Minimalism',notes:['Keep it calm']});
  assert.match(project,/PROJECT CONTEXT/);assert.match(project,/completed_tasks:\n- Draw orbit/);assert.match(project,/remaining_tasks:\n- Test controls/);
  const research=mentor.researchContext({title:'Points',question:'Why?',questions:[{text:'Q1',explored:true,note:'N',evidence:'',implication:'',unknown:''},{text:'Q2',explored:false,note:'',evidence:'',implication:'',unknown:''}],synthesis:{explanation:'',keyPoints:'',openQuestions:''}});
  assert.match(research,/completed_questions:\n- Q1/);assert.match(research,/remaining_questions:\n- Q2/);
});

test('mentor JSON document round-trips a validated project or research response',()=>{
  const generatedAt=new Date('2026-09-07T10:00:00.000Z'),document=JSON.parse(mentor.serializeMentorDocument('MENTOR CONTEXT\nweek_start: 2026-09-07',generatedAt));
  assert.equal(document.schema,'orbit.mentor.v1');assert.equal(document.document_type,'mentor_context');assert.match(document.context,/MENTOR CONTEXT/);assert.equal(document.mentor_response,null);
  document.mentor_response={kind:'project',name:'Orbital Radio',stage:'EXPLORE',next_action:'Akışı çiz',tasks:['Akışı çiz'],tags:['audio']};
  const project=mentor.parseMentorJson(JSON.stringify(document));assert.equal(project.kind,'project');assert.equal(project.nextAction,'Akışı çiz');assert.deepEqual(project.tasks,['Akışı çiz']);
  const research=mentor.parseMentorJson(JSON.stringify({schema:'orbit.mentor.v1',mentor_response:{kind:'research',title:'Ses',main_question:'Ses nasıl yönlenir?',subquestions:['Yüzey neyi değiştirir?']}}));assert.equal(research.kind,'research');assert.equal(research.mainQuestion,'Ses nasıl yönlenir?');
  assert.equal(mentor.parseMentorJson(JSON.stringify({...document,schema:'unknown'})),null);assert.equal(mentor.parseMentorJson('{bad'),null);
});

test('mentor context groups projects, normalizes fields and keeps summaries compact',()=>{
  const project=(change)=>({id:'p',name:'Project',stage:'Aktif',type:'App',scope:'',nextAction:'Build it',progress:20,tasks:['One','Two','Three','Four','Five'],completed:[],designLanguage:'',notes:[],lastActivity:'',...change});
  const practice={version:1,words:[{word:'orbit',dueAt:'2026-09-01T00:00:00.000Z',addedAt:'2026-09-01T00:00:00.000Z',lastReviewedAt:'2026-09-08T10:00:00.000Z',successes:1,reviews:1}],sessions:[{at:'2026-09-09T10:00:00.000Z'}],research:[],currentResearchId:null,activeProjectId:null,speakingPrompt:null,lastMeal:null};
  const output=mentor.mentorContext({generatedAt:new Date('2026-09-10T10:00:00.000Z'),weekStart:'2026-09-07',rebuild:{research:'none',create:'none',digital:'Project 20%',visual:'2 saved',social:'0/1'},projects:[project({name:'Build',stage:'Aktif'}),project({name:'Explore',stage:'Aktif',nextAction:'Araştırma'}),project({name:'Future UI Experiments',stage:'Aktif',type:'R&D',nextAction:'Glass yüzeyler'}),project({name:'Idea',stage:'Fikir'}),project({name:'Paused',stage:'Beklemede'}),project({name:'Done',progress:100,tasks:[]})],research:[],practice,recentlyCompleted:['Done: '+('x'.repeat(200))]});
  assert.match(output,/week_start: 2026-09-07\nweek_end: 2026-09-13/);
  assert.match(output,/Build\nstage: BUILD/);assert.match(output,/Explore\nstage: EXPLORE/);
  assert.doesNotMatch(output,/Idea\nstage:/);assert.match(output,/IDEAS \/ BACKLOG\n- Idea/);
  assert.match(output,/speaking_sessions_this_week: 1/);assert.doesNotMatch(output,/speaking_sessions_this_week: .*speaking/);
  assert.match(output,/Future UI Experiments\nstage: EXPLORE/);assert.doesNotMatch(output,/FITNESS|fitness_sync|sport_manual_fallback/);
  assert.match(output,/RECENTLY COMPLETED\n- Done/);assert.doesNotMatch(output,/Done: x/);
  assert.match(output,/\+ 1 more/);assert.ok(output.split('\n').every(line=>line.length<=180));
});
