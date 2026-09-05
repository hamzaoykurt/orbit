import type { ProjectWorkspaceData } from './projects/project-types';
import type { ResearchTopic, Practice } from './rebuild/practice-model';

export type MentorProject = { kind:'project'; name:string; description?:string; goal?:string; scope?:string; type?:string; stage?:string; nextAction?:string; tasks:string[]; tags:string[]; designLanguage?:string };
export type MentorResearch = { kind:'research'; title:string; mainQuestion:string; subquestions:string[]; optionalOutput?:string };
export type MentorImport = MentorProject | MentorResearch;
export type MentorProjectView = { id:string; name:string; goal?:string; stage:string; type:string; scope:string; nextAction:string; progress:number; tasks:string[]; completed:string[]; designLanguage:string; notes:string[]; lastActivity:string };

const keys:Record<string,string>={name:'name',title:'title',description:'description',goal:'goal',scope:'scope',type:'type',stage:'stage',next_action:'nextAction',nextaction:'nextAction',tasks:'tasks',tags:'tags',design_language:'designLanguage',designlanguage:'designLanguage',main_question:'mainQuestion',mainquestion:'mainQuestion',subquestions:'subquestions',optional_output:'optionalOutput',optionaloutput:'optionalOutput'};
const clean=(value:string)=>value.trim().replace(/^```(?:text)?\s*/i,'').replace(/```\s*$/,'').trim();
const list=(value:string)=>value.split(/\r?\n|,/).map(item=>item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/,'').trim()).filter(Boolean);

export function parseMentorOutput(input:string):MentorImport|null{
  const text=clean(input); const first=text.split(/\r?\n/).find(line=>line.trim())?.trim().toUpperCase();
  const kind=first==='PROJECT'?'project':first==='RESEARCH'?'research':null;if(!kind)return null;
  const values:Record<string,string>={};let current='';
  for(const raw of text.split(/\r?\n/).slice(1)){
    const match=raw.match(/^\s*([a-zA-Z_ ]+)\s*:\s*(.*)$/);
    if(match){const key=keys[match[1].trim().toLowerCase().replace(/\s+/g,'_')];if(key){current=key;values[key]=match[2].trim();continue;}}
    if(current&&raw.trim())values[current]+=`\n${raw.trim()}`;
  }
  if(kind==='project'){
    if(!values.name?.trim())return null;
    return {kind,name:values.name.trim().slice(0,100),description:values.description?.trim(),goal:values.goal?.trim(),scope:values.scope?.trim(),type:values.type?.trim(),stage:values.stage?.trim(),nextAction:values.nextAction?.trim(),tasks:list(values.tasks||'').slice(0,40),tags:list(values.tags||'').slice(0,8),designLanguage:values.designLanguage?.trim()};
  }
  if(!values.title?.trim()||!values.mainQuestion?.trim())return null;
  return {kind,title:values.title.trim().slice(0,120),mainQuestion:values.mainQuestion.trim().slice(0,600),subquestions:list(values.subquestions||'').slice(0,30),optionalOutput:values.optionalOutput?.trim()};
}

const normalized=(value:string)=>value.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export function similarity(a:string,b:string){const x=normalized(a),y=normalized(b);if(!x||!y)return 0;if(x===y)return 1;const A=new Set(x.split(' ')),B=new Set(y.split(' '));const overlap=[...A].filter(word=>B.has(word)).length;return overlap/Math.max(A.size,B.size);}
export function findSimilar<T>(name:string,items:T[],label:(item:T)=>string){return items.map(item=>({item,score:similarity(name,label(item))})).sort((a,b)=>b.score-a.score).find(match=>match.score>=.65)?.item??null;}

const field=(name:string,value:string|number|undefined)=>`${name}: ${value===undefined||value===''?'—':value}`;
export function projectContext(project:MentorProjectView){return ['PROJECT CONTEXT','',field('name',project.name),field('goal',project.goal||project.scope||project.type),field('type',project.type),field('stage',project.stage),field('scope',project.scope),field('next_action',project.nextAction),`completed_tasks:\n${project.completed.length?project.completed.map(x=>`- ${x}`).join('\n'):'- none'}`,`remaining_tasks:\n${project.tasks.length?project.tasks.map(x=>`- ${x}`).join('\n'):'- none'}`,field('design_language',project.designLanguage),`recent_notes:\n${project.notes.length?project.notes.slice(0,3).map(x=>`- ${x}`).join('\n'):'- none'}`].join('\n');}
export function researchContext(topic:ResearchTopic){const completed=topic.questions.filter(q=>q.explored),remaining=topic.questions.filter(q=>!q.explored);const notes=[topic.synthesis.explanation,...completed.map(q=>q.note)].filter(Boolean).slice(0,4);return ['RESEARCH CONTEXT','',field('title',topic.title),field('main_question',topic.question),`completed_questions:\n${completed.length?completed.map(q=>`- ${q.text}`).join('\n'):'- none'}`,`remaining_questions:\n${remaining.length?remaining.map(q=>`- ${q.text}`).join('\n'):'- none'}`,`notes:\n${notes.length?notes.map(x=>`- ${x.replace(/\s+/g,' ').slice(0,240)}`).join('\n'):'- none'}`].join('\n');}

export type MentorSnapshot={generatedAt:Date;week:string;rebuild:{sport:string;english:string;research:string;create:string;digital:string;visual:string;social:string};projects:MentorProjectView[];research:ResearchTopic[];practice:Practice;recentlyCompleted:string[];counts:{active:number;paused:number;idea:number}};
export function mentorContext(s:MentorSnapshot){const projects=s.projects.filter(p=>!['Tamamlandı','Arşiv'].includes(p.stage)).sort((a,b)=>b.progress-a.progress).slice(0,6);const research=s.research.filter(r=>r.questions.some(q=>!q.explored)).slice(-3);const recentWords=s.practice.words.slice(-5).map(w=>w.word);const due=s.practice.words.filter(w=>Date.parse(w.dueAt)<=s.generatedAt.getTime()).length;return ['MENTOR CONTEXT','',field('generated_at',s.generatedAt.toLocaleString('tr-TR')),field('current_week',s.week),'','REBUILD',field('sport',s.rebuild.sport),field('english',s.rebuild.english),field('research',s.rebuild.research),field('create',s.rebuild.create),field('digital',s.rebuild.digital),field('visual_lab',s.rebuild.visual),field('social',s.rebuild.social),'','ACTIVE PROJECTS',...(projects.length?projects.flatMap(p=>['',`- name: ${p.name}`,`  stage: ${p.stage}`,`  type: ${p.type||'—'}`,`  scope: ${p.scope||'—'}`,`  next_action: ${p.nextAction||'—'}`,`  progress: ${p.progress}%`,`  current_tasks: ${p.tasks.slice(0,4).join(' | ')||'—'}`,`  design_language: ${p.designLanguage||'—'}`,`  last_activity: ${p.lastActivity||'—'}`]):['- none']),'','CURRENT RESEARCH',...(research.length?research.flatMap(r=>['',`- title: ${r.title}`,`  main_question: ${r.question}`,`  progress: ${r.questions.filter(q=>q.explored).length}/${r.questions.length}`,`  remaining_questions: ${r.questions.filter(q=>!q.explored).slice(0,4).map(q=>q.text).join(' | ')||'—'}`]):['- none']),'','ENGLISH',field('words_due',due),field('recent_words',recentWords.join(', ')),field('speaking_sessions_this_week',s.rebuild.english),'','RECENTLY COMPLETED',...(s.recentlyCompleted.length?s.recentlyCompleted.slice(0,8).map(x=>`- ${x}`):['- none']),'','BACKLOG SUMMARY',field('active_count',s.counts.active),field('paused_count',s.counts.paused),field('idea_count',s.counts.idea)].join('\n');}

export function mentorMetadata(workspace:ProjectWorkspaceData):ProjectWorkspaceData{return {...workspace,mentor:{source:'mentor',importedAt:new Date().toISOString()}};}
