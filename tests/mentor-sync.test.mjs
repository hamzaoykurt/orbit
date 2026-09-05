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
