'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, History, Minus, Plus, RotateCcw, Settings2, Sparkle, X } from 'lucide-react';
import { addDays, calendarWeek, journeyPosition, localDay, validDate } from './journey-model';
import type { Journey } from './journey-model';
import type { GeneratedIdea, IdeaRequest } from './idea-engine';
import { attachIdea, completeGoal, configureGoals, ensureWeek, undoCompletion, weekView } from './weekly-deck-model';
import type { LegacyActivity, WeeklyDeck, WeeklyGoal } from './weekly-deck-model';
import { acceptIntoPractice, dueWords, speakingCount, updateQuestion } from './practice-model';
import type { Practice, ResearchTopic } from './practice-model';
import { IdeaStudio } from './idea-studio';
import { EnglishPractice } from './english-practice';
import { FitnessLink } from './fitness-link';
import './rebuild-journey.css';

type Props = {
  journey:Journey;deck:WeeklyDeck;activities:LegacyActivity[];selections:Record<string,string>;syncStatus:string;
  practice:Practice;linkedProject:{id:string;title:string;progress:number}|null;
  onUpdateDeck:(update:(current:WeeklyDeck)=>WeeklyDeck)=>void;onStartChange:(date:string)=>void;
  onUpdatePractice:(update:(current:Practice)=>Practice)=>void;
  onCreateProject:(idea:GeneratedIdea)=>Promise<void>;onOpenProject:(id:string)=>void;
};
const shortDate=(date:string)=>new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short'}).format(new Date(`${date}T12:00:00`));
type OverlayKind='idea'|'settings'|'context'|'history';
function Overlay({title,kind,children,onClose}:{title:string;kind:OverlayKind;children:ReactNode;onClose:()=>void}) {
  const container=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    const siblings=Array.from(document.body.children).filter((node):node is HTMLElement=>node instanceof HTMLElement&&!node.contains(container.current));
    const priorInert=siblings.map(node=>node.inert);siblings.forEach(node=>{node.inert=true;});document.body.style.overflow='hidden';container.current?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose();}
      if(event.key!=='Tab')return;
      const controls=Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,summary,a[href]')??[]).filter(node=>node.getClientRects().length&&!node.closest('[inert]'));
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===container.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===container.current)){event.preventDefault();first?.focus();}
    };
    window.addEventListener('keydown',keydown,true);
    return()=>{siblings.forEach((node,index)=>{node.inert=priorInert[index];});document.body.style.overflow=overflow;window.removeEventListener('keydown',keydown,true);previous?.focus();};
  },[onClose]);
  return createPortal(<div className={`rd-overlay rd-overlay-${kind}`} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div className={`rd-dialog rd-dialog-${kind}`} role="dialog" aria-modal="true" aria-label={title} ref={container} tabIndex={-1} onKeyDown={event=>event.stopPropagation()}><button className="rd-icon rd-close" aria-label="Kapat" onClick={onClose}><X size={20}/></button>{children}</div></div>,document.body);
}
function ResearchQuestions({topic,onChange}:{topic:ResearchTopic;onChange:(id:string,change:{explored?:boolean;note?:string})=>void}) {
  return <div className="rd-questions">{topic.questions.map(question=><div key={question.id} className={question.explored?'explored':''}><button className="rd-question-toggle" aria-pressed={question.explored} onClick={()=>onChange(question.id,{explored:!question.explored})}><span>{question.explored&&<Check size={14}/>}</span><strong>{question.text}</strong></button><details><summary>{question.note?'Notu gör':'Kısa not ekle'} <span>isteğe bağlı</span></summary><textarea maxLength={500} aria-label={`${question.text} için not`} value={question.note} onChange={event=>onChange(question.id,{note:event.target.value})} placeholder="Bulduğun bir ayrıntı ya da kaynak…"/></details></div>)}</div>;
}
function Dots({count,target}:{count:number;target:number}){return <span className="rd-dots" aria-hidden="true">{Array.from({length:Math.min(target,10)},(_,index)=><i key={index} className={index<count?'filled':''}/>)}</span>;}

export function RebuildJourney({journey,deck,activities,selections,syncStatus,practice,linkedProject,onUpdateDeck,onStartChange,onUpdatePractice,onCreateProject,onOpenProject}:Props) {
  const [today,setToday]=useState(localDay),[now,setNow]=useState(Date.now);
  const weekKey=calendarWeek(today),seed={activities,selections,curiosity:journey.focus[weekKey]?.curiosity,creation:journey.focus[weekKey]?.create};
  const week=weekView(deck,weekKey,seed),start=journey.startDate||deck.startedOn||weekKey,position=journeyPosition(start,today);
  const [expanded,setExpanded]=useState<string|null>(null),[overlay,setOverlay]=useState<OverlayKind|null>(null);
  const [generation,setGeneration]=useState<Omit<IdeaRequest,'signal'>>({type:'surprise'}),[generationKey,setGenerationKey]=useState(0),[historyOnly,setHistoryOnly]=useState(false);
  const [goalDraft,setGoalDraft]=useState<WeeklyGoal[]>([]),[dateDraft,setDateDraft]=useState(start),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const close=useCallback(()=>{setOverlay(null);setError('');},[setOverlay,setError]);
  const topic=practice.research.find(item=>item.id===practice.currentResearchId);
  const goalFor=(kind:WeeklyGoal['kind'])=>week.goals.find(goal=>goal.kind===kind);
  const sport=goalFor('body'),social=goalFor('social'),english=goalFor('english');
  const sportCount=sport?week.marks[sport.id]?.length||0:0,socialCount=social?week.marks[social.id]?.length||0:0;
  const sessions=speakingCount(practice,weekKey)+(english?week.marks[english.id]?.length||0:0);
  const due=dueWords(practice,now);
  useEffect(()=>{const refresh=()=>{setToday(localDay());setNow(Date.now());};const timer=window.setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  useEffect(()=>{if(deck.weeks[weekKey]&&deck.startedOn)return;onUpdateDeck(current=>ensureWeek(current,weekKey,{activities,selections,curiosity:journey.focus[weekKey]?.curiosity,creation:journey.focus[weekKey]?.create}));},[deck.weeks,deck.startedOn,weekKey,activities,selections,journey.focus,onUpdateDeck]);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),6000);return()=>window.clearTimeout(timer);},[notice]);
  const update=(change:(current:WeeklyDeck)=>WeeklyDeck)=>onUpdateDeck(current=>change(ensureWeek(current,weekKey,seed)));
  const openIdea=(request:Omit<IdeaRequest,'signal'>,history=false)=>{setGeneration(request);setGenerationKey(value=>value+1);setHistoryOnly(history);setOverlay('idea');};
  const done=(goal:WeeklyGoal)=>{const mark={id:crypto.randomUUID(),at:new Date().toISOString(),...(week.ideas[goal.id]?{idea:week.ideas[goal.id]}:{})};update(current=>completeGoal(current,weekKey,goal.id,mark));setNotice(`${goal.name}: tamamlanma kaydedildi.`);};
  const undo=(goal:WeeklyGoal)=>update(current=>undoCompletion(current,weekKey,goal.id));
  const saveIdea=async(idea:GeneratedIdea)=>{
    if(idea.type==='project'||idea.type==='digital_project'){await onCreateProject(idea);setNotice('Proje, planı ve akış diyagramıyla Projeler’e eklendi.');}
    else if(idea.type==='research'||idea.type==='vocabulary'){onUpdatePractice(current=>acceptIntoPractice(current,idea));setExpanded(idea.type==='research'?'research':'english');setNotice(idea.type==='research'?'Araştırma soruların hazır.':'Kelimeler kaydedildi.');}
    else if(idea.type==='activity'){update(current=>attachIdea(current,weekKey,idea,social?.id));setExpanded('social');setNotice('Bu haftanın sosyal fikri kaydedildi.');}
    else if(idea.type==='meal'){onUpdatePractice(current=>acceptIntoPractice(current,idea));setExpanded('body');setNotice('Yemek fikri kaydedildi.');}
    else if(idea.type==='speaking'){onUpdatePractice(current=>({...current,speakingPrompt:{id:idea.id,text:idea.text,words:current.words.slice(-5).map(word=>word.word)}}));setExpanded('english');}
  };
  const toggle=(name:string)=>setExpanded(value=>value===name?null:name);
  const expansion=(name:string,content:ReactNode)=><div className="rd-expansion" id={`rd-detail-${name}`} inert={expanded!==name} aria-hidden={expanded!==name}><div><div className="rd-domain-detail">{content}</div></div></div>;
  const rowHeading=(name:string,title:string,summary:ReactNode)=><button className="rd-domain-toggle" aria-expanded={expanded===name} aria-controls={`rd-detail-${name}`} onClick={()=>toggle(name)}><span className="rd-domain-title">{title}</span><span className="rd-domain-summary">{summary}</span><ChevronDown size={16}/></button>;
  return <section className="rebuild-deck rd-instrument" aria-label="Rebuild haftalık alanı">
    <header className="rd-heading"><div><span className="rd-kicker">REBUILD</span><h1>Bu hafta<span>.</span></h1><p>{shortDate(weekKey)} — {shortDate(addDays(weekKey,6))}</p></div><button className="rd-week-index" aria-label={`26 haftalık yolculuk · hafta ${position.week}`} onClick={()=>{setDateDraft(start);setOverlay('context');}}><span><b>{String(position.week).padStart(2,'0')}</b><i>/ 26</i><ArrowUpRight size={15}/></span><small>{position.complete?'yolculuk tamamlandı':position.future?'başlangıç yaklaşıyor':'küçük adımlarla'}</small></button></header>
    <div className="rd-list-tools"><span>KENDİ RİTMİNDE</span><button className="rd-icon" aria-label="Haftalık hedefleri düzenle" onClick={()=>{setGoalDraft(week.goals.filter(goal=>['body','english','social'].includes(goal.kind)).map(goal=>({...goal})));setOverlay('settings');}}><Settings2 size={17}/></button></div>
    <div className="rd-domains">
      <section className={`rd-domain rd-sport ${expanded==='body'?'is-open':''}`}>
        <div className="rd-domain-line">{rowHeading('body','Spor',<><Dots count={sportCount} target={sport?.target||3}/><span>{sportCount} / {sport?.target||3}</span></>)}{sport&&<button className="rd-complete" aria-label="Spor: bir seans tamamla" disabled={sportCount>=sport.target} onClick={()=>done(sport)}><Check size={20}/></button>}</div>
        <div className="rd-row-action"><FitnessLink/></div>
        {expansion('body',<><p className="rd-inline-copy">Programın ve hareketlerin Fitness’te. Burada yalnızca tamamladığın seansı işaretle.</p>{practice.lastMeal&&<p className="rd-inline-copy"><strong>Yemek fikrin</strong><br/>{practice.lastMeal.text}</p>}<div className="rd-detail-actions"><button className="rd-text-button" onClick={()=>openIdea({type:'meal',goal:'body'})}>Ne yesem? <Sparkle size={15}/></button>{sport&&sportCount>0&&<button className="rd-text-button" onClick={()=>undo(sport)}><RotateCcw size={15}/> Son işareti geri al</button>}</div></>)}
      </section>
      <section className={`rd-domain rd-english-row ${expanded==='english'?'is-open':''}`}>
        <div className="rd-domain-line">{rowHeading('english','English',<span>{practice.words.length} kelime · {due.length} tekrar · {sessions} / {english?.target||2} konuşma</span>)}</div><div className="rd-row-action"><button className="rd-text-button" onClick={()=>toggle('english')}>{expanded==='english'?'Kapat':'Devam et'} <ArrowRight size={15}/></button></div>
        {expansion('english',<EnglishPractice practice={practice} onUpdate={onUpdatePractice}/>)}
      </section>
      <section className={`rd-domain rd-research-row ${expanded==='research'?'is-open':''}`}>
        <div className="rd-domain-line">{rowHeading('research','Research',<span>{topic?`${topic.questions.filter(question=>question.explored).length} / ${topic.questions.length}`:'Yeni bir meraka yer aç.'}</span>)}</div>{topic&&<p className="rd-current-title">{topic.question}</p>}
        <div className="rd-row-action">{topic?<button className="rd-text-button" onClick={()=>toggle('research')}>Devam et <ArrowRight size={15}/></button>:<button className="rd-text-button" onClick={()=>openIdea({type:'research',goal:'research'})}>Bana bir konu ver <Sparkle size={15}/></button>}</div>
        {expansion('research',<>{topic&&<><ResearchQuestions topic={topic} onChange={(id,change)=>onUpdatePractice(current=>updateQuestion(current,topic.id,id,change))}/>{topic.questions.every(question=>question.explored)&&<p className="rd-inline-copy">Bu araştırmadaki tüm soruları keşfettin. Geçmişte saklanıyor.</p>}</>}<div className="rd-detail-actions">{topic&&<button className="rd-text-button" onClick={()=>openIdea({type:'research',goal:'research'})}>Yeni konu <Sparkle size={15}/></button>}<button className="rd-text-button" onClick={()=>setOverlay('history')}><History size={15}/> Araştırma geçmişi</button></div></>)}
      </section>
      <section className={`rd-domain rd-create-row ${expanded==='make'?'is-open':''}`}>
        <div className="rd-domain-line">{rowHeading('make','Create',<span>{linkedProject?`${linkedProject.progress}%`:'Henüz bağlı bir proje yok.'}</span>)}</div>{linkedProject&&<p className="rd-current-title">{linkedProject.title}</p>}
        <div className="rd-row-action">{linkedProject?<button className="rd-text-button" onClick={()=>onOpenProject(linkedProject.id)}>Projeyi aç <ArrowUpRight size={16}/></button>:<button className="rd-text-button" onClick={()=>openIdea({type:'project',goal:'make'})}>Bana bir proje ver <Sparkle size={15}/></button>}</div>
        {expansion('make',<><p className="rd-inline-copy">İlginç ne yapabilirim? Yazılım, fiziksel üretim, elektronik, fotoğraf, el işi veya beklenmedik bir deney. Her alana açık.</p>{linkedProject&&<button className="rd-text-button" onClick={()=>openIdea({type:'project',goal:'make'})}>Başka bir proje fikri <Sparkle size={15}/></button>}<button className="rd-text-button" onClick={()=>openIdea({type:'project'},true)}><History size={15}/> Create geçmişi</button></>)}
      </section>
      <section className={`rd-domain rd-digital-row ${expanded==='digital'?'is-open':''}`}>
        <div className="rd-domain-line">{rowHeading('digital','Digital',<span>Yeni bir dijital projeye hazır.</span>)}</div>
        <div className="rd-row-action"><button className="rd-text-button" onClick={()=>openIdea({type:'digital_project',goal:'make'})}>Bana bir dijital proje ver <Sparkle size={15}/></button></div>
        {expansion('digital',<><p className="rd-inline-copy">Bilgisayarda ne geliştirebilirim? Mobil uygulamalar, web ve masaüstü araçları, oyunlar, eklentiler, simülasyonlar. Yalnızca yazılım; her seferinde yeni bir fikir.</p><button className="rd-text-button" onClick={()=>openIdea({type:'digital_project'},true)}><History size={15}/> Digital geçmişi</button></>)}
      </section>
      <section className={`rd-domain rd-visual-row ${expanded==='visual'?'is-open':''}`}>
        <div className="rd-domain-line">{rowHeading('visual','Visual Lab',<span>Yeni bir görsel dünya keşfet.</span>)}</div>
        <div className="rd-row-action"><button className="rd-text-button" onClick={()=>openIdea({type:'image_prompt',visualMode:'prompt',goal:'make'})}>Bana bir görsel promptu ver <Sparkle size={15}/></button></div>
        {expansion('visual',<><p className="rd-inline-copy">Rastgele bir konu, atmosfer ve görsel yaklaşım. Promptu kopyala, kullandığın görsel üretim aracına taşı. Burada görsel değil, metin üretilir.</p><div className="rd-detail-actions"><button className="rd-text-button" onClick={()=>openIdea({type:'image_prompt',visualMode:'concept',goal:'make'})}>Önce bir konsept bul <Sparkle size={15}/></button><button className="rd-text-button" onClick={()=>openIdea({type:'image_prompt'},true)}><History size={15}/> Visual Lab geçmişi</button></div></>)}
      </section>
      <section className={`rd-domain rd-social-row ${expanded==='social'?'is-open':''}`}>
        <div className="rd-domain-line">{rowHeading('social','Social',<><Dots count={socialCount} target={social?.target||1}/><span>{socialCount} / {social?.target||1}</span></>)}{social&&<button className="rd-complete" aria-label="Social: bir aksiyon tamamla" disabled={socialCount>=social.target} onClick={()=>done(social)}><Check size={20}/></button>}</div>
        {expansion('social',<><p className="rd-inline-copy">{social&&week.ideas[social.id]?week.ideas[social.id].text:'Bu hafta alıştığın rutinin dışında bir şey yap.'}</p><div className="rd-detail-actions"><button className="rd-text-button" onClick={()=>openIdea({type:'activity',goal:'social'})}>Bana bir fikir ver <Sparkle size={15}/></button>{social&&socialCount>0&&<button className="rd-text-button" onClick={()=>undo(social)}><RotateCcw size={15}/> Son işareti geri al</button>}</div></>)}
      </section>
      {week.goals.filter(goal=>goal.kind==='any').map(goal=><section className="rd-domain" key={goal.id}><div className="rd-domain-line"><span className="rd-domain-title">{goal.name}</span><span className="rd-domain-summary">{week.marks[goal.id]?.length||0} / {goal.target}</span><button className="rd-complete" aria-label={`${goal.name}: tamamla veya geri al`} onClick={()=>{if((week.marks[goal.id]?.length||0)>=goal.target)undo(goal);else done(goal);}}><Check size={20}/></button></div></section>)}
    </div>
    <footer className="rd-trigger-area"><button className="rd-trigger" onClick={()=>openIdea({type:'surprise'})}><span className="rd-trigger-object" aria-hidden="true"><Sparkle size={29} strokeWidth={1.15}/></span><span><strong>Beni şaşırt</strong><small>Alıştığın alanın dışına çık.</small></span></button></footer>
    <button className="rd-text-button rd-history-trigger" onClick={()=>openIdea({type:'surprise'},true)}>Üretim geçmişi <History size={14}/></button>
    {(syncStatus==='error'||syncStatus==='offline')&&<p className="rd-sync" role="status">Cihazında saklandı. Sunucuya eşitleme bekleniyor.</p>}<div className={`rd-notice ${notice?'visible':''}`} role="status" aria-live="polite">{notice}</div>
    {overlay==='idea'&&<Overlay title="Yeni bir ihtimal" kind="idea" onClose={close}><IdeaStudio key={generationKey} request={generation} onSave={saveIdea} onClose={close} historyOnly={historyOnly}/></Overlay>}
    {overlay==='history'&&<Overlay title="Araştırma geçmişi" kind="history" onClose={close}><span className="rd-kicker">MERAKININ İZİ</span><h2>Araştırma geçmişi.</h2>{!practice.research.length&&<p className="rd-inline-copy">Kabul ettiğin konular ve notların burada saklanacak.</p>}{[...practice.research].reverse().map(item=><details className="rd-research-history" key={item.id}><summary><strong>{item.title}</strong><small>{new Date(item.startedAt).toLocaleDateString('tr-TR')} · {item.questions.filter(question=>question.explored).length} / {item.questions.length}</small></summary>{item.source==='project-planning'&&<p className="rd-inline-copy">Proje değerlendirmesinden · Başlangıç soruları</p>}<p>{item.question}</p><ResearchQuestions topic={item} onChange={(id,change)=>onUpdatePractice(current=>updateQuestion(current,item.id,id,change))}/><button className="rd-text-button" onClick={()=>{onUpdatePractice(current=>({...current,currentResearchId:item.id}));setExpanded('research');close();}}>Bu araştırmaya devam et <ArrowRight size={15}/></button></details>)}</Overlay>}
    {overlay==='settings'&&<Overlay title="Haftanın ayarı" kind="settings" onClose={close}><span className="rd-kicker">KENDİ RİTMİN</span><h2>Haftanın ayarı.</h2><p className="rd-dialog-intro">Spor, konuşma ve sosyal hedeflerin gelecek haftalara taşınır. Araştırmaların ve projelerin haftayla sınırlı değil.</p><form onSubmit={event=>{event.preventDefault();if(goalDraft.some(goal=>!Number.isInteger(goal.target)||goal.target<1||goal.target>99)){setError('1–99 arasında bir sayı seç.');return;}update(current=>configureGoals(current,weekKey,week.goals.map(goal=>goalDraft.find(draft=>draft.id===goal.id)||goal)));close();setNotice('Haftalık hedeflerin kaydedildi.');}}><div className="rd-goal-editor">{goalDraft.map(goal=><div className="rd-edit-row" key={goal.id}><strong>{goal.kind==='body'?'Spor':goal.kind==='english'?'Konuşma':'Sosyal'}</strong><div className="rd-stepper"><button type="button" aria-label={`${goal.name} sayısını azalt`} disabled={goal.target<=1} onClick={()=>setGoalDraft(items=>items.map(item=>item.id===goal.id?{...item,target:item.target-1}:item))}><Minus size={14}/></button><input aria-label={`${goal.name} haftalık hedef`} type="number" min={1} max={99} value={goal.target} onChange={event=>setGoalDraft(items=>items.map(item=>item.id===goal.id?{...item,target:Number(event.target.value)}:item))}/><button type="button" aria-label={`${goal.name} sayısını artır`} disabled={goal.target>=99} onClick={()=>setGoalDraft(items=>items.map(item=>item.id===goal.id?{...item,target:item.target+1}:item))}><Plus size={14}/></button></div></div>)}</div>{error&&<p className="rd-error" role="alert">{error}</p>}<footer className="rd-editor-footer"><button className="rd-text-button" type="button" onClick={close}>Vazgeç</button><button className="primary-button" type="submit">Kaydet <Check size={16}/></button></footer></form></Overlay>}
    {overlay==='context'&&<Overlay title="26 haftalık yolculuk" kind="context" onClose={close}><span className="rd-kicker">BÜYÜK RESİM</span><h2>26 hafta.<br/>Kendine doğru.</h2><p className="rd-dialog-intro">Şimdi yalnızca bu haftaya yer aç.</p><ol className="rd-phases">{journey.phases.map((phase,index)=><li key={phase.id} className={index===position.phase?'current':''}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{phase.name}</strong>{index===position.phase&&<p>{phase.objective}</p>}</div>{index===position.phase&&<ArrowRight size={16}/>}</li>)}</ol><details className="rd-date-edit"><summary>Başlangıç tarihini değiştir <ChevronDown size={14}/></summary><form onSubmit={event=>{event.preventDefault();if(!validDate(dateDraft)){setError('Geçerli bir tarih seç.');return;}onStartChange(dateDraft);close();}}><label>Yolculuğun başlangıcı<input type="date" value={dateDraft} required onChange={event=>setDateDraft(event.target.value)}/></label><button className="rd-text-button" type="submit">Kaydet <Check size={16}/></button></form>{error&&<p role="alert">{error}</p>}</details></Overlay>}
  </section>;
}
