import type { ResearchQuiz, ResearchTopic } from './practice-model';

export const angleLabels:Record<ResearchQuiz['questions'][number]['angle'],string>={why:'Neden',how:'Nasıl',compare:'Karşılaştır',apply:'Uygula',explain:'Kendi cümlenle',challenge:'Sorgula'};

export async function generateResearchQuiz(topic:ResearchTopic,signal?:AbortSignal):Promise<ResearchQuiz>{
  const response=await fetch('/api/research-quiz',{method:'POST',credentials:'same-origin',cache:'no-store',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({
    title:topic.title,mainQuestion:topic.question,
    notes:topic.questions.map(question=>({question:question.text,answer:question.note,evidence:question.evidence,implication:question.implication,unknown:question.unknown})),
    synthesis:topic.synthesis,sources:topic.sources.map(source=>({title:source.title,note:source.note}))
  })});
  const payload=await response.json().catch(()=>null) as {quiz?:ResearchQuiz;error?:string}|null;
  if(!response.ok||!payload?.quiz)throw new Error(payload?.error||'Test şu anda hazırlanamadı.');
  return payload.quiz;
}
