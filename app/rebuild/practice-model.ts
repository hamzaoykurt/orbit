import type { GeneratedIdea, WordSuggestion } from './idea-engine';

export type VocabularyWord = WordSuggestion & { id: string; addedAt: string; dueAt: string; lastReviewedAt?: string; reviews: number; successes: number };
export type ResearchSource = { id: string; title: string; url: string; note: string };
export type ResearchImage = { id: string; url: string; name: string; caption: string; createdAt: string };
export type ResearchQuizQuestion = { id: string; prompt: string; angle: 'why'|'how'|'compare'|'apply'|'explain'|'challenge'; hint: string; keyPoints: string[]; answer: string; rating?: 'again'|'partial'|'known' };
export type ResearchQuiz = { id: string; generatedAt: string; questions: ResearchQuizQuestion[] };
export type ResearchTopic = {
  id: string; ideaId: string; title: string; question: string; startedAt: string; source?: 'project-planning'|'mentor'; projectId?: string; optionalOutput?: string;
  questions: { id: string; text: string; explored: boolean; note: string; evidence: string; implication: string; unknown: string }[];
  synthesis: { explanation: string; keyPoints: string; openQuestions: string };
  sources: ResearchSource[]; images: ResearchImage[]; quiz: ResearchQuiz | null;
};
export type SpeakingSession = { id: string; at: string; seconds: number; prompt: string; words: string[] };
export type Practice = {
  version: 1; words: VocabularyWord[]; research: ResearchTopic[]; currentResearchId: string | null;
  activeProjectId: string | null; sessions: SpeakingSession[]; speakingPrompt: { id: string; text: string; words: string[] } | null;
  lastMeal: {id:string;text:string}|null;
};
export const emptyPractice = (): Practice => ({version:1,words:[],research:[],currentResearchId:null,activeProjectId:null,sessions:[],speakingPrompt:null,lastMeal:null});
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const str=(value:unknown,max=1000)=>typeof value==='string'?value.slice(0,max):'';
const validTime=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function normalizePractice(value: unknown): Practice {
  const source=obj(value),base=emptyPractice();
  const words:VocabularyWord[]=(Array.isArray(source.words)?source.words:[]).flatMap(raw=>{
    const word=obj(raw);if(!str(word.id)||!str(word.word)||!str(word.meaning)||!validTime(word.addedAt)||!validTime(word.dueAt))return [];
    return [{id:str(word.id,100),word:str(word.word,60),meaning:str(word.meaning,160),example:str(word.example,300),addedAt:word.addedAt,dueAt:word.dueAt,reviews:Math.max(0,Number(word.reviews)||0),successes:Math.max(0,Number(word.successes)||0),...(validTime(word.lastReviewedAt)?{lastReviewedAt:word.lastReviewedAt}:{})}];
  });
  const research:ResearchTopic[]=(Array.isArray(source.research)?source.research:[]).flatMap(raw=>{
    const item=obj(raw);if(!str(item.id)||!str(item.title)||!str(item.question)||!Array.isArray(item.questions))return [];
    const questions=item.questions.flatMap(raw=>{const q=obj(raw);return str(q.id)&&str(q.text)?[{id:str(q.id,140),text:str(q.text,240),explored:q.explored===true,note:str(q.note,4000),evidence:str(q.evidence,4000),implication:str(q.implication,4000),unknown:str(q.unknown,2000)}]:[];});
    const synthesisRaw=obj(item.synthesis);
    const sources:ResearchSource[]=(Array.isArray(item.sources)?item.sources:[]).flatMap(raw=>{const source=obj(raw);return str(source.id)&&str(source.title)&&/^https?:\/\//.test(str(source.url,2000))?[{id:str(source.id,100),title:str(source.title,200),url:str(source.url,2000),note:str(source.note,1000)}]:[];});
    const images:ResearchImage[]=(Array.isArray(item.images)?item.images:[]).flatMap(raw=>{const image=obj(raw);return str(image.id)&&str(image.url,2000)?[{id:str(image.id,100),url:str(image.url,2000),name:str(image.name,200),caption:str(image.caption,500),createdAt:str(image.createdAt,40)}]:[];});
    const quizRaw=obj(item.quiz);
    const quizQuestions:ResearchQuizQuestion[]=(Array.isArray(quizRaw.questions)?quizRaw.questions:[]).flatMap(raw=>{const q=obj(raw),angle=str(q.angle);return str(q.id)&&str(q.prompt)&&['why','how','compare','apply','explain','challenge'].includes(angle)?[{id:str(q.id,100),prompt:str(q.prompt,500),angle:angle as ResearchQuizQuestion['angle'],hint:str(q.hint,300),keyPoints:(Array.isArray(q.keyPoints)?q.keyPoints:[]).filter((point):point is string=>typeof point==='string').map(point=>point.slice(0,300)).slice(0,5),answer:str(q.answer,4000),...(['again','partial','known'].includes(str(q.rating))?{rating:str(q.rating) as ResearchQuizQuestion['rating']}:{})}]:[];});
    const quiz=str(quizRaw.id)&&quizQuestions.length?{id:str(quizRaw.id,100),generatedAt:str(quizRaw.generatedAt,40),questions:quizQuestions}:null;
    const source=item.source==='project-planning'||item.source==='mentor'?item.source:undefined;
    return [{id:str(item.id,100),ideaId:str(item.ideaId,100),title:str(item.title,120),question:str(item.question,600),startedAt:str(item.startedAt,40),questions,synthesis:{explanation:str(synthesisRaw.explanation,8000),keyPoints:str(synthesisRaw.keyPoints,5000),openQuestions:str(synthesisRaw.openQuestions,5000)},sources,images,quiz,...(source?{source}:{}) ,...(source==='project-planning'?{projectId:str(item.projectId,100)}:{}),...(typeof item.optionalOutput==='string'?{optionalOutput:str(item.optionalOutput,2000)}:{})}];
  });
  const sessions:SpeakingSession[]=(Array.isArray(source.sessions)?source.sessions:[]).flatMap(raw=>{const item=obj(raw);return str(item.id)&&validTime(item.at)?[{id:str(item.id,100),at:item.at,seconds:Math.max(0,Number(item.seconds)||0),prompt:str(item.prompt,600),words:(Array.isArray(item.words)?item.words:[]).filter((word):word is string=>typeof word==='string').slice(0,20)}]:[];});
  const prompt=obj(source.speakingPrompt);
  const meal=obj(source.lastMeal);
  return {...base,words,research,sessions,lastMeal:str(meal.id)&&str(meal.text)?{id:str(meal.id,100),text:str(meal.text,600)}:null,currentResearchId:research.some(item=>item.id===source.currentResearchId)?String(source.currentResearchId):null,activeProjectId:typeof source.activeProjectId==='string'?source.activeProjectId:null,speakingPrompt:str(prompt.id)&&str(prompt.text)?{id:str(prompt.id,100),text:str(prompt.text,600),words:(Array.isArray(prompt.words)?prompt.words:[]).filter((word):word is string=>typeof word==='string').slice(0,20)}:null};
}
export function acceptIntoPractice(practice:Practice,idea:GeneratedIdea):Practice {
  if(idea.status!=='accepted'||!idea.resultingId)throw new Error('Kabul edilmiş fikir gerekli.');
  if(idea.type==='project'||idea.type==='digital_project')return {...practice,activeProjectId:idea.resultingId};
  if(idea.type==='meal')return {...practice,lastMeal:{id:idea.id,text:idea.text}};
  if(idea.type==='research'&&idea.researchPlan){
    const exists=practice.research.some(topic=>topic.id===idea.resultingId);
    const topic:ResearchTopic={id:idea.resultingId,ideaId:idea.id,title:idea.title,question:idea.text,startedAt:idea.generatedAt,questions:idea.researchPlan.subquestions.map((text,index)=>({id:`${idea.resultingId}-${index}`,text,explored:false,note:'',evidence:'',implication:'',unknown:''})),synthesis:{explanation:'',keyPoints:'',openQuestions:''},sources:[],images:[],quiz:null};
    return {...practice,currentResearchId:idea.resultingId,research:exists?practice.research:[...practice.research,topic]};
  }
  if(idea.type==='vocabulary'&&idea.words){
    const existing=new Set(practice.words.map(word=>word.word.toLocaleLowerCase('en')));
    return {...practice,words:[...practice.words,...idea.words.filter(word=>!existing.has(word.word.toLocaleLowerCase('en'))).map((word,index)=>({...word,id:`${idea.id}-${index}`,addedAt:idea.generatedAt,dueAt:idea.generatedAt,reviews:0,successes:0}))]};
  }
  return practice;
}
export function reviewWord(practice:Practice,id:string,known:boolean,at=new Date().toISOString()):Practice {
  return {...practice,words:practice.words.map(word=>{
    if(word.id!==id)return word;
    const successes=known?word.successes+1:0;
    const days=[1,3,7,14,30][Math.min(4,Math.max(0,successes-1))];
    return {...word,reviews:word.reviews+1,successes,lastReviewedAt:at,dueAt:new Date(Date.parse(at)+(known?days*86400000:10*60000)).toISOString()};
  })};
}
export const dueWords=(practice:Practice,now=Date.now())=>practice.words.filter(word=>Date.parse(word.dueAt)<=now).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
export function updateQuestion(practice:Practice,topicId:string,questionId:string,change:Partial<ResearchTopic['questions'][number]>):Practice {
  return {...practice,research:practice.research.map(topic=>topic.id===topicId?{...topic,questions:topic.questions.map(question=>question.id===questionId?{...question,...change,...(change.note!==undefined?{note:change.note.slice(0,4000)}:{}),...(change.evidence!==undefined?{evidence:change.evidence.slice(0,4000)}:{}),...(change.implication!==undefined?{implication:change.implication.slice(0,4000)}:{}),...(change.unknown!==undefined?{unknown:change.unknown.slice(0,2000)}:{})}:question)}:topic)};
}
export function updateResearchTopic(practice:Practice,topicId:string,change:(topic:ResearchTopic)=>ResearchTopic):Practice {
  return {...practice,research:practice.research.map(topic=>topic.id===topicId?change(topic):topic)};
}
export function speakingCount(practice:Practice,week:string) {
  const start=new Date(`${week}T00:00:00`).getTime(),end=new Date(`${week}T00:00:00`);end.setDate(end.getDate()+7);
  return practice.sessions.filter(session=>Date.parse(session.at)>=start&&Date.parse(session.at)<end.getTime()).length;
}
