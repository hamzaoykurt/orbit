import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const notes=await import(loadModuleUrl(new URL('../app/notes/note-model.ts',import.meta.url)));
const projects=await import(loadModuleUrl(new URL('../app/projects/project-types.ts',import.meta.url)));
const practice=await import(loadModuleUrl(new URL('../app/rebuild/practice-model.ts',import.meta.url)));

test('legacy general notes migrate into guided notes without losing their writing',()=>{
  const [note]=notes.normalizeNotes([{id:'old',title:'Eski fikir',body:'Korunacak metin',date:'Dün',tone:'blue'}]);
  assert.equal(note.kind,'idea');assert.equal(note.body,'Korunacak metin');assert.deepEqual(note.links,[]);assert.deepEqual(note.images,[]);
});

test('legacy project notes receive a project-specific structure and unsafe links are dropped',()=>{
  const workspace=projects.normalizeWorkspace({description:'Amaç',notes:[{id:'old',title:'İlk not',body:'Eski içerik',links:[{id:'x',title:'Kötü',url:'javascript:alert(1)'}]}],links:[],diagrams:[]});
  assert.equal(workspace.notes[0].kind,'idea');assert.equal(workspace.notes[0].body,'Eski içerik');assert.deepEqual(workspace.notes[0].links,[]);
});

test('research notebooks migrate old answers and preserve structured notes, sources and quiz ratings',()=>{
  const source={...practice.emptyPractice(),research:[{id:'topic',ideaId:'idea',title:'Konu',question:'Neden?',startedAt:'2026-09-02',questions:[{id:'q',text:'Nasıl?',explored:true,note:'Kendi cevabım'}]}],currentResearchId:'topic'};
  const migrated=practice.normalizePractice(source),topic=migrated.research[0];
  assert.equal(topic.questions[0].note,'Kendi cevabım');assert.equal(topic.questions[0].evidence,'');assert.deepEqual(topic.sources,[]);assert.equal(topic.quiz,null);
  const withQuiz=practice.normalizePractice({...migrated,research:[{...topic,quiz:{id:'quiz',generatedAt:'2026-09-02T10:00:00Z',questions:[{id:'qq',prompt:'Neden böyle?',angle:'why',hint:'Bağlantıyı düşün',keyPoints:['Sebep','Sonuç'],answer:'Çünkü…',rating:'partial'}]}}]});
  assert.equal(withQuiz.research[0].quiz.questions[0].rating,'partial');assert.equal(withQuiz.research[0].quiz.questions[0].keyPoints.length,2);
});
