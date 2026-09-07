import type { ProjectWorkspaceData } from './projects/project-types';
import type { ResearchTopic, Practice } from './rebuild/practice-model';

export type MentorProject = { kind:'project'; name:string; description?:string; goal?:string; scope?:string; type?:string; stage?:string; nextAction?:string; tasks:string[]; tags:string[]; designLanguage?:string };
export type MentorResearch = { kind:'research'; title:string; mainQuestion:string; subquestions:string[]; optionalOutput?:string };
export type MentorImport = MentorProject | MentorResearch;
export type MentorProjectView = { id:string; name:string; goal?:string; stage:string; type:string; scope:string; nextAction:string; progress:number; tasks:string[]; completed:string[]; designLanguage:string; notes:string[]; lastActivity:string };
export const MENTOR_DOCUMENT_SCHEMA='orbit.mentor.v1';

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

const field=(name:string,value:string|number|boolean|undefined)=>`${name}: ${value===undefined||value===''?'—':value}`;
export function projectContext(project:MentorProjectView){return ['PROJECT CONTEXT','',field('name',project.name),field('goal',project.goal||project.scope||project.type),field('type',project.type),field('stage',project.stage),field('scope',project.scope),field('next_action',project.nextAction),`completed_tasks:\n${project.completed.length?project.completed.map(x=>`- ${x}`).join('\n'):'- none'}`,`remaining_tasks:\n${project.tasks.length?project.tasks.map(x=>`- ${x}`).join('\n'):'- none'}`,field('design_language',project.designLanguage),`recent_notes:\n${project.notes.length?project.notes.slice(0,3).map(x=>`- ${x}`).join('\n'):'- none'}`].join('\n');}
export function researchContext(topic:ResearchTopic){const completed=topic.questions.filter(q=>q.explored),remaining=topic.questions.filter(q=>!q.explored);const notes=[topic.synthesis.explanation,...completed.map(q=>q.note)].filter(Boolean).slice(0,4);return ['RESEARCH CONTEXT','',field('title',topic.title),field('main_question',topic.question),`completed_questions:\n${completed.length?completed.map(q=>`- ${q.text}`).join('\n'):'- none'}`,`remaining_questions:\n${remaining.length?remaining.map(q=>`- ${q.text}`).join('\n'):'- none'}`,`notes:\n${notes.length?notes.map(x=>`- ${x.replace(/\s+/g,' ').slice(0,240)}`).join('\n'):'- none'}`].join('\n');}

export type MentorSnapshot={
  generatedAt:Date;weekStart:string;
  rebuild:{research:string;create:string;digital:string;visual:string;social:string};
  projects:MentorProjectView[];research:ResearchTopic[];practice:Practice;recentlyCompleted:string[];
};

const oneLine=(value:string,max=120)=>{const clean=value.replace(/\s+/g,' ').trim();return clean.length<=max?clean:`${clean.slice(0,max-1).trimEnd()}…`;};
const compactTask=(value:string)=>{const clean=value.replace(/\s+/g,' ').trim();const core=clean.split(/\s+(?:—|–|\||•)\s+|(?<=[.!?])\s+/)[0]||clean;return oneLine(core,84);};
const researchOnly=(value:string)=>/araştır|research|explor|incele|keşfet/i.test(value)&&!/uygula|geliştir|build|tasarla|kodla|prototip/i.test(value);
const mentorStage=(project:MentorProjectView)=>{
  const stage=normalized(project.stage);
  if(/tamam|complete|done|arsiv|archive/.test(stage)||(project.progress>=100&&project.tasks.length===0))return 'COMPLETE';
  if(/bekle|pause|hold/.test(stage))return 'PAUSED';
  if(/fikir|idea|backlog/.test(stage))return 'IDEA';
  const experimental=/r&d|research|experiment|deney|laboratuvar|lab\b/i.test(`${project.name} ${project.type}`);
  const implementation=/\b(build|implement|develop|code|ship|launch)\b|kodla|geliştir|uygula|yayınla|inşa et|entegrasyon|prototip(?:i)?\s+(?:hazırla|oluştur|üret)/i.test([project.nextAction,...project.tasks].join(' '));
  if(/arastir|research|explore|incele/.test(stage)||researchOnly(project.nextAction)||(experimental&&!implementation))return 'EXPLORE';
  return 'BUILD';
};
const projectBlock=(project:MentorProjectView)=>{
  const tasks=project.tasks.filter(Boolean),shown=tasks.slice(0,4);
  return ['',oneLine(project.name,100),field('stage',mentorStage(project)),field('progress',`${Math.min(100,Math.max(0,project.progress))}%`),field('next_action',compactTask(project.nextAction||shown[0]||'none')),...(shown.length?['open_tasks:',...shown.map(task=>`- ${compactTask(task)}`),...(tasks.length>shown.length?[`+ ${tasks.length-shown.length} more`]:[])]:[])];
};

export function mentorContext(s:MentorSnapshot){
  const weekBoundary=new Date(`${s.weekStart}T00:00:00`),endBoundary=new Date(weekBoundary);endBoundary.setDate(endBoundary.getDate()+7);
  const end=new Date(`${s.weekStart}T12:00:00`);end.setDate(end.getDate()+6);
  const stages=s.projects.map(project=>({project,stage:mentorStage(project)}));
  const active=stages.filter(item=>item.stage==='BUILD'||item.stage==='EXPLORE').sort((a,b)=>b.project.progress-a.project.progress).slice(0,6);
  const ideas=stages.filter(item=>item.stage==='IDEA').map(item=>item.project);
  const paused=stages.filter(item=>item.stage==='PAUSED').map(item=>item.project);
  const completedProjects=stages.filter(item=>item.stage==='COMPLETE').map(item=>item.project.name);
  const completedNames=new Set(stages.filter(item=>item.stage==='COMPLETE').map(item=>normalized(item.project.name)));
  const due=s.practice.words.filter(word=>word.successes<3&&Date.parse(word.dueAt)<=s.generatedAt.getTime()).length;
  const learned=s.practice.words.filter(word=>word.successes>0&&word.lastReviewedAt&&Date.parse(word.lastReviewedAt)>=weekBoundary.getTime()&&Date.parse(word.lastReviewedAt)<endBoundary.getTime()).length;
  const speaking=s.practice.sessions.filter(session=>Date.parse(session.at)>=weekBoundary.getTime()&&Date.parse(session.at)<endBoundary.getTime()).length;
  const currentResearch=s.practice.currentResearchId?s.research.find(item=>item.id===s.practice.currentResearchId):undefined;
  const research=currentResearch&&currentResearch.questions.some(question=>!question.explored)?currentResearch:null;
  const taskCompletions=s.recentlyCompleted.filter(item=>!completedNames.has(normalized(item.split(':')[0]||'')));
  const recent=[...completedProjects,...taskCompletions].map(item=>oneLine(item,110)).filter((item,index,all)=>item&&all.indexOf(item)===index).slice(0,5);
  return ['MENTOR CONTEXT','',field('generated_at',s.generatedAt.toLocaleString('tr-TR')),field('week_start',s.weekStart),field('week_end',end.toISOString().slice(0,10)),'','REBUILD',field('english',`${due} due · ${speaking} speaking`),field('research',s.rebuild.research),field('create',s.rebuild.create),field('digital',s.rebuild.digital),field('visual_lab',s.rebuild.visual),field('social',s.rebuild.social),'','FOCUS / ACTIVE PROJECTS',...(active.length?active.flatMap(item=>projectBlock(item.project)):['none']),'','IDEAS / BACKLOG',...(ideas.length?[...ideas.slice(0,3).map(project=>`- ${oneLine(project.name,100)}`),...(ideas.length>3?[`+ ${ideas.length-3} more ideas`]:[])]:['none']),'','PAUSED',...(paused.length?paused.slice(0,5).map(project=>`- ${oneLine(project.name,100)}`):['none']),'','CURRENT RESEARCH',...(research?['',oneLine(research.title,120),field('main_question',oneLine(research.question,180)),field('progress',`${research.questions.filter(question=>question.explored).length}/${research.questions.length}`),'remaining_questions:',...research.questions.filter(question=>!question.explored).slice(0,3).map(question=>`- ${oneLine(question.text,150)}`)]:['none']),'','ENGLISH',field('words_due',due),field('words_learned_this_week',learned),field('speaking_sessions_this_week',speaking),'','RECENTLY COMPLETED',...(recent.length?recent.map(item=>`- ${item}`):['none']),'','BACKLOG',field('idea_count',ideas.length),field('paused_count',paused.length),'recent_ideas:',...(ideas.length?ideas.slice(0,3).map(project=>`- ${oneLine(project.name,100)}`):['- none'])].join('\n');
}

const jsonRecord=(value:unknown):Record<string,unknown>|null=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const jsonString=(value:unknown,max:number)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):undefined;
const jsonList=(value:unknown,maxItems:number,maxLength:number)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&Boolean(item.trim())).map(item=>item.trim().slice(0,maxLength)).slice(0,maxItems):[];
export function parseMentorJson(input:string):MentorImport|null{
  let root:unknown;try{root=JSON.parse(input);}catch{return null;}
  const document=jsonRecord(root);if(!document)return null;
  if(document.schema!==undefined&&document.schema!==MENTOR_DOCUMENT_SCHEMA)return null;
  const source=jsonRecord(document.mentor_response)||jsonRecord(document.record)||document;
  const kind=String(source.kind||'').toLocaleLowerCase('en-US');
  if(kind==='project'){
    const name=jsonString(source.name,100);if(!name)return null;
    return {kind,name,description:jsonString(source.description,1200),goal:jsonString(source.goal,600),scope:jsonString(source.scope,500),type:jsonString(source.type,120),stage:jsonString(source.stage,40),nextAction:jsonString(source.next_action??source.nextAction,300),tasks:jsonList(source.tasks,40,300),tags:jsonList(source.tags,8,60),designLanguage:jsonString(source.design_language??source.designLanguage,160)};
  }
  if(kind==='research'){
    const title=jsonString(source.title,120),mainQuestion=jsonString(source.main_question??source.mainQuestion,600);if(!title||!mainQuestion)return null;
    return {kind,title,mainQuestion,subquestions:jsonList(source.subquestions,30,300),optionalOutput:jsonString(source.optional_output??source.optionalOutput,500)};
  }
  return null;
}

export function mentorJsonDocument(context:string,generatedAt:Date){return {
  schema:MENTOR_DOCUMENT_SCHEMA,version:1,document_type:'mentor_context',generated_at:generatedAt.toISOString(),context,
  mentor_response:null,
  response_format:{
    project:{kind:'project',name:'',description:'',goal:'',scope:'',type:'',stage:'IDEA | EXPLORE | BUILD | PAUSED | COMPLETE',next_action:'',tasks:[],tags:[],design_language:''},
    research:{kind:'research',title:'',main_question:'',subquestions:[],optional_output:''},
  },
};}
export function serializeMentorDocument(context:string,generatedAt:Date){return JSON.stringify(mentorJsonDocument(context,generatedAt),null,2);}

export function mentorMetadata(workspace:ProjectWorkspaceData):ProjectWorkspaceData{return {...workspace,mentor:{source:'mentor',importedAt:new Date().toISOString()}};}
