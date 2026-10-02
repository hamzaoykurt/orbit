'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { navigation, useNavigationState } from '../use-navigation';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, History, Minus, Plus, RotateCcw, Settings2, Sparkle, X } from 'lucide-react';
import { addDays, calendarWeek, journeyPosition, localDay, validDate } from './journey-model';
import type { Journey } from './journey-model';
import { CREATE_CATEGORIES, DIGITAL_PLATFORMS, RESEARCH_CATEGORIES, SOCIAL_CATEGORIES } from './idea-engine';
import type { CreateCategory, DigitalPlatform, GeneratedIdea, IdeaRequest, ResearchCategory, SocialCategory } from './idea-engine';
import { attachIdea, completeGoal, configureGoals, ensureWeek, undoCompletion, weekView } from './weekly-deck-model';
import type { LegacyActivity, WeeklyDeck, WeeklyGoal } from './weekly-deck-model';
import { acceptIntoPractice, dueWords, speakingCount } from './practice-model';
import type { Practice, ResearchTopic } from './practice-model';
import { IdeaStudio } from './idea-studio';
import { EnglishPractice } from './english-practice';
import { FitnessLink } from './fitness-link';
import { ResearchNotebook } from './research-notebook';
import type { FitnessSummary } from '../../integrations/profitness/protocol';
import './rebuild-journey.css';
import './rebuild-experience.css';

type Props = {
  journey:Journey;deck:WeeklyDeck;activities:LegacyActivity[];selections:Record<string,string>;syncStatus:string;
  practice:Practice;linkedProject:{id:string;title:string;progress:number}|null;
  fitness:{status:'idle'|'loading'|'ready'|'error';connected:boolean;entitled:boolean;summary:FitnessSummary|null;receivedAt:string|null};
  onUpdateDeck:(update:(current:WeeklyDeck)=>WeeklyDeck)=>void;onStartChange:(date:string)=>void;
  onUpdatePractice:(update:(current:Practice)=>Practice)=>void;
  onCreateProject:(idea:GeneratedIdea)=>Promise<void>;onOpenProject:(id:string)=>void;onCopyResearch:(topic:ResearchTopic)=>void;
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
function IdeaFilter({label,value,options,onChange}:{label:string;value:string;options:readonly {value:string;label:string}[];onChange:(value:string)=>void}){return <label className="rd-idea-filter"><span>{label}</span><select value={value} onChange={event=>onChange(event.target.value)}>{options.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;}

export function RebuildJourney({journey,deck,activities,selections,syncStatus,practice,linkedProject,fitness,onUpdateDeck,onStartChange,onUpdatePractice,onCreateProject,onOpenProject,onCopyResearch}:Props) {
  const [today,setToday]=useState(localDay),[now,setNow]=useState(Date.now);
  const weekKey=calendarWeek(today),seed={activities,selections,curiosity:journey.focus[weekKey]?.curiosity,creation:journey.focus[weekKey]?.create};
  const week=weekView(deck,weekKey,seed),start=journey.startDate||deck.startedOn||weekKey,position=journeyPosition(start,today);
  const [expanded,setExpanded]=useNavigationState<string|null>('rebuild:expanded',null,true),[overlay,setOverlay]=useNavigationState<OverlayKind|null>('overlay:rebuild',null,true);
  const [generation,setGeneration]=useState<Omit<IdeaRequest,'signal'>>({type:'surprise'}),[generationKey,setGenerationKey]=useState(0),[historyOnly,setHistoryOnly]=useState(false);
  const [researchCategory,setResearchCategory]=useState<ResearchCategory>('surprise'),[socialCategory,setSocialCategory]=useState<SocialCategory>('surprise'),[createCategory,setCreateCategory]=useState<CreateCategory>('surprise'),[digitalPlatform,setDigitalPlatform]=useState<'surprise'|DigitalPlatform>('surprise');
  const [goalDraft,setGoalDraft]=useState<WeeklyGoal[]>([]),[dateDraft,setDateDraft]=useState(start),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const close=useCallback(()=>{setOverlay(null);setError('');},[setOverlay,setError]);
  const topic=practice.research.find(item=>item.id===practice.currentResearchId);
  const goalFor=(kind:WeeklyGoal['kind'])=>week.goals.find(goal=>goal.kind===kind);
  const sport=goalFor('body'),social=goalFor('social'),english=goalFor('english');
  const syncedSport=fitness.connected&&fitness.entitled&&fitness.summary?.weekStartsOn===weekKey?fitness.summary:null;
  const sportCount=syncedSport?.completedThisWeek??0,sportTarget=syncedSport?.weeklyTarget??sport?.target??3,socialCount=social?week.marks[social.id]?.length||0:0;
  const sessions=speakingCount(practice,weekKey)+(english?week.marks[english.id]?.length||0:0);
  const due=dueWords(practice,now).filter(word=>word.successes<3);
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
  const areas=[
    {id:'english',title:'İngilizce',description:'Bir kelime öğren, kısa bir konuşma yap.',status:`${due.length} tekrar · ${sessions}/${english?.target||2} konuşma`,group:'rhythm'},
    {id:'body',title:'Spor ve beslenme',description:'Fitness ilerlemen ve yemek fikirlerin.',status:syncedSport?`${sportCount}/${sportTarget} seans`:'Fitness bağlantısı',group:'rhythm'},
    {id:'social',title:'Sosyal hayat',description:'Küçük bir etkinlik, gerçek bir bağlantı.',status:`${socialCount}/${social?.target||1} etkinlik`,group:'rhythm'},
    {id:'research',title:'Araştırma',description:topic?.title||'Merak ettiğin bir konuyu keşfet.',status:topic?`${topic.questions.filter(q=>q.explored).length}/${topic.questions.length} soru tamamlandı`:'Konu seç',group:'explore'},
    {id:'make',title:'Üret',description:linkedProject?.title||'Bir fikri küçük bir projeye dönüştür.',status:linkedProject?`%${linkedProject.progress} ilerleme`:'Proje fikirleri',group:'explore'},
    {id:'digital',title:'Dijital projeler',description:'Uygulama, oyun veya otomasyon geliştir.',status:'Platform seç',group:'explore'},
    {id:'visual',title:'Görsel atölye',description:'Konsept bul, prompt üret, varyasyon dene.',status:'Görsel fikirler',group:'explore'}
  ];
  const activeArea=areas.find(area=>area.id===expanded);
  const recommended=areas.find(area=>area.id===(due.length||!practice.words.length?'english':topic?'research':'make'))!;
  const openArea=(id:string|null)=>{if(id===null)navigation.backToView('rebuild:expanded',null,null);else setExpanded(id);};
  useEffect(()=>{const frame=window.requestAnimationFrame(()=>document.querySelector<HTMLElement>('.rx-workspace-title, .rx-home-title')?.focus({preventScroll:true}));return()=>window.cancelAnimationFrame(frame);},[expanded]);
  const settingsButton=<button className="rd-text-button" onClick={()=>{setGoalDraft(week.goals.filter(goal=>['english','social'].includes(goal.kind)).map(goal=>({...goal})));setOverlay('settings');}}><Settings2 size={16}/> Hedefleri düzenle</button>;
  return <section className="rebuild-deck rd-instrument rx-rebuild" aria-label="Rebuild haftalık alanı">
    {!activeArea&&<header className="rd-heading"><div><span className="rd-kicker">REBUILD</span><h1>Bu hafta<span>.</span></h1><p>{shortDate(weekKey)} — {shortDate(addDays(weekKey,6))}</p></div><button className="rd-week-index" aria-label={`26 haftalık yolculuk · hafta ${position.week}`} onClick={()=>{setDateDraft(start);setOverlay('context');}}><span><b>{String(position.week).padStart(2,'0')}</b><i>/ 26</i><ArrowUpRight size={15}/></span><small>{position.complete?'yolculuk tamamlandı':position.future?'başlangıç yaklaşıyor':'küçük adımlarla'}</small></button></header>}
    {!activeArea?<div className="rx-home">
      <section className="rx-focus"><div><span className="rd-kicker">BUGÜN BİR KÜÇÜK ADIM</span><h2 className="rx-home-title" tabIndex={-1}>{recommended.id==='english'?'Birkaç dakikanı İngilizceye ayır.':recommended.id==='research'?'Merak ettiğin soruya geri dön.':'Bir fikre başlangıç yap.'}</h2><p>Hepsini yapman gerekmiyor. Bir alan seç, kaldığın yerden devam et.</p></div><button className="rd-done-action" onClick={()=>openArea(recommended.id)}>Başla <ArrowRight size={17}/></button></section>
      <div className="rx-section-heading"><h2>Haftalık ritmin</h2>{settingsButton}</div>
      <div className="rx-area-grid">{areas.filter(area=>area.group==='rhythm').map(area=><button className="rx-area" key={area.id} onClick={()=>openArea(area.id)}><span className="rx-area-status">{area.status}</span><h3>{area.title}</h3><p>{area.description}</p><span className="rx-area-link">Devam et <ArrowRight size={16}/></span></button>)}</div>
      {week.goals.filter(goal=>goal.kind==='any').map(goal=><div className="rx-custom-goal" key={goal.id}><strong>{goal.name}</strong><span>{week.marks[goal.id]?.length||0}/{goal.target}</span><button className="rd-text-button" onClick={()=>{if((week.marks[goal.id]?.length||0)>=goal.target)undo(goal);else done(goal);}}><Check size={16}/>{(week.marks[goal.id]?.length||0)>=goal.target?'Geri al':'Tamamla'}</button></div>)}
      <div className="rx-section-heading"><div><h2>Üret ve keşfet</h2><p>Acele etmeden, bir merakın peşinden.</p></div></div>
      <div className="rx-area-grid rx-explore-grid">{areas.filter(area=>area.group==='explore').map(area=><button className="rx-area" key={area.id} onClick={()=>openArea(area.id)}><span className="rx-area-status">{area.status}</span><h3>{area.title}</h3><p>{area.description}</p><span className="rx-area-link">Alanı aç <ArrowRight size={16}/></span></button>)}</div>
      <footer className="rx-home-footer"><button className="rd-text-button" onClick={()=>openIdea({type:'surprise'})}><Sparkle size={17}/> Beni şaşırt</button><button className="rd-text-button" onClick={()=>openIdea({type:'surprise'},true)}><History size={16}/> Üretim geçmişi</button></footer>
    </div>:<div className="rx-workspace" key={activeArea.id}>
      <div className="rx-workspace-bar"><button className="rd-text-button" onClick={()=>openArea(null)}><ArrowLeft size={16}/> Rebuild’e dön</button>{settingsButton}</div>
      <header className="rx-workspace-heading"><span className="rd-kicker">{activeArea.status}</span><h1 className="rx-workspace-title" tabIndex={-1}>{activeArea.title}</h1>{!['english','research'].includes(activeArea.id)&&<p>{activeArea.description}</p>}</header>
      {expanded==='english'&&<EnglishPractice practice={practice} onUpdate={onUpdatePractice}/>}
      {expanded==='body'&&<section className="rx-content-card"><h3>Bu haftaki hareketin</h3><p className="rd-inline-copy">{fitness.status==='loading'?'Fitness özeti yükleniyor…':fitness.status==='error'?'Fitness özeti şu anda yenilenemedi. Kayıtların etkilenmedi.':!fitness.connected?'Bağlantı isteğe bağlı. Fitness’i bağladığında gerçek seansların burada otomatik görünür.':!fitness.entitled?'Orbit Premium Fitness Sync bu hesapta etkin değil.':syncedSport?`Bu hafta ${sportCount} / ${sportTarget} seans tamamlandı. Kayıtlarını Fitness’ta yönetebilirsin.`:'İlk Fitness özeti bekleniyor.'}</p><FitnessLink/><hr/><h3>Beslenme fikri</h3>{practice.lastMeal&&<p className="rd-inline-copy">{practice.lastMeal.text}</p>}<button className="rd-done-action" onClick={()=>openIdea({type:'meal',goal:'body'})}><Sparkle size={16}/> Yemek fikri bul</button></section>}
      {expanded==='social'&&<section className="rx-content-card"><h3>Bu haftanın etkinliği</h3><p className="rd-inline-copy">{social&&week.ideas[social.id]?week.ideas[social.id].text:'İstersen kendi etkinliğini yap, istersen yeni bir fikir bul.'}</p><IdeaFilter label="Etkinlik türü" value={socialCategory} options={SOCIAL_CATEGORIES} onChange={value=>setSocialCategory(value as SocialCategory)}/><div className="rd-detail-actions"><button className="rd-text-button" onClick={()=>openIdea({type:'activity',goal:'social',category:socialCategory})}><Sparkle size={16}/> Etkinlik fikri bul</button></div>{social&&<div className="rd-completion-panel"><button className="rd-completion-action" disabled={socialCount>=social.target} onClick={()=>done(social)}><Check size={16}/>{socialCount>=social.target?'Haftalık hedef tamamlandı':'Etkinliği yaptım'}</button>{socialCount>0&&<button className="rd-text-button" onClick={()=>undo(social)}><RotateCcw size={15}/> Son kaydı geri al</button>}</div>}</section>}
      {expanded==='research'&&<>{topic?<ResearchNotebook key={topic.id} topic={topic} onChange={change=>onUpdatePractice(current=>({...current,research:current.research.map(item=>item.id===topic.id?change(item):item)}))}/>:<div className="rx-content-card"><h3>Neyi merak ediyorsun?</h3><p>Bir konu seç; sorularını ve bulgularını burada biriktir.</p></div>}<details className="rx-options" open={!topic}><summary>{topic?'Konu seçenekleri ve geçmiş':'Araştırma konusu bul'}</summary><IdeaFilter label="Konu kategorisi" value={researchCategory} options={RESEARCH_CATEGORIES} onChange={value=>setResearchCategory(value as ResearchCategory)}/><div className="rd-detail-actions"><button className="rd-done-action" onClick={()=>openIdea({type:'research',goal:'research',category:researchCategory})}><Sparkle size={16}/> {topic?'Yeni konu bul':'Konu bul'}</button><button className="rd-text-button" onClick={()=>setOverlay('history')}><History size={15}/> Araştırma geçmişi</button>{topic&&<button className="rd-text-button" onClick={()=>onCopyResearch(topic)}>Bağlamı kopyala</button>}</div></details></>}
      {expanded==='make'&&<section className="rx-content-card">{linkedProject&&<div className="rx-linked-project"><span className="rd-kicker">DEVAM EDEN PROJEN</span><h3>{linkedProject.title}</h3><button className="rd-done-action" onClick={()=>onOpenProject(linkedProject.id)}>Projeyi aç <ArrowUpRight size={16}/></button></div>}<h3>Yeni bir şey üret</h3><p>Fiziksel bir nesne, yazılım, elektronik veya küçük bir deney.</p><IdeaFilter label="Üretim alanı" value={createCategory} options={CREATE_CATEGORIES} onChange={value=>setCreateCategory(value as CreateCategory)}/><div className="rd-detail-actions"><button className="rd-done-action" onClick={()=>openIdea({type:'project',goal:'make',category:createCategory})}><Sparkle size={16}/> Proje fikri bul</button><button className="rd-text-button" onClick={()=>openIdea({type:'project'},true)}><History size={15}/> Geçmiş</button></div></section>}
      {expanded==='digital'&&<section className="rx-content-card"><h3>Hangi platformda üretmek istersin?</h3><p>Seçtiğin platforma uygun küçük ve uygulanabilir bir proje bul.</p><IdeaFilter label="Dijital platform" value={digitalPlatform} options={DIGITAL_PLATFORMS} onChange={value=>setDigitalPlatform(value as 'surprise'|DigitalPlatform)}/><div className="rd-detail-actions"><button className="rd-done-action" onClick={()=>openIdea({type:'digital_project',goal:'make',...(digitalPlatform==='surprise'?{}:{platform:digitalPlatform})})}><Sparkle size={16}/> Dijital proje fikri bul</button><button className="rd-text-button" onClick={()=>openIdea({type:'digital_project'},true)}><History size={15}/> Geçmiş</button></div></section>}
      {expanded==='visual'&&<section className="rx-visual-paths"><button className="rx-area" onClick={()=>openIdea({type:'image_prompt',visualMode:'prompt',goal:'make'})}><span className="rd-kicker">DOĞRUDAN ÜRET</span><h3>Görsel promptu</h3><p>Hazır promptu görsel üretim aracına taşı.</p><span className="rx-area-link">Prompt hazırla <ArrowRight size={16}/></span></button><button className="rx-area" onClick={()=>openIdea({type:'image_prompt',visualMode:'concept',goal:'make'})}><span className="rd-kicker">ÖNCE FİKRİ BUL</span><h3>Görsel konsept</h3><p>Konuyu keşfet, beğenirsen prompta dönüştür.</p><span className="rx-area-link">Konsept bul <ArrowRight size={16}/></span></button><button className="rd-text-button" onClick={()=>openIdea({type:'image_prompt'},true)}><History size={15}/> Görsel üretim geçmişi</button></section>}
    </div>}
    {(syncStatus==='error'||syncStatus==='offline')&&<p className="rd-sync" role="status">Cihazında saklandı. Sunucuya eşitleme bekleniyor.</p>}<div className={`rd-notice ${notice?'visible':''}`} role="status" aria-live="polite">{notice}</div>
    {overlay==='idea'&&<Overlay title="Yeni bir ihtimal" kind="idea" onClose={close}><IdeaStudio key={generationKey} request={generation} onSave={saveIdea} onClose={close} historyOnly={historyOnly}/></Overlay>}
    {overlay==='history'&&<Overlay title="Araştırma geçmişi" kind="history" onClose={close}><span className="rd-kicker">MERAKININ İZİ</span><h2>Araştırma geçmişi.</h2>{!practice.research.length&&<p className="rd-inline-copy">Kabul ettiğin konular ve notların burada saklanacak.</p>}{[...practice.research].reverse().map(item=><details className="rd-research-history" key={item.id}><summary><strong>{item.title}</strong><small>{new Date(item.startedAt).toLocaleDateString('tr-TR')} · {item.questions.filter(question=>question.explored).length} / {item.questions.length}</small></summary>{item.source==='project-planning'&&<p className="rd-inline-copy">Proje değerlendirmesinden · Başlangıç soruları</p>}<p>{item.question}</p><p className="rd-inline-copy">{item.sources.length} kaynak · {item.images.length} görsel · Notların ve testin korunur.</p><button className="rd-text-button" onClick={()=>{onUpdatePractice(current=>({...current,currentResearchId:item.id}));setExpanded('research');close();}}>Bu araştırmaya devam et <ArrowRight size={15}/></button></details>)}</Overlay>}
    {overlay==='settings'&&<Overlay title="Haftanın ayarı" kind="settings" onClose={close}><span className="rd-kicker">KENDİ RİTMİN</span><h2>Haftanın ayarı.</h2><p className="rd-dialog-intro">Konuşma ve sosyal hedeflerin gelecek haftalara taşınır. Spor hedefi ve tamamlanma durumu Fitness tarafından yönetilir.</p><form onSubmit={event=>{event.preventDefault();if(goalDraft.some(goal=>!Number.isInteger(goal.target)||goal.target<1||goal.target>99)){setError('1–99 arasında bir sayı seç.');return;}update(current=>configureGoals(current,weekKey,week.goals.map(goal=>goalDraft.find(draft=>draft.id===goal.id)||goal)));close();setNotice('Haftalık hedeflerin kaydedildi.');}}><div className="rd-goal-editor">{goalDraft.map(goal=><div className="rd-edit-row" key={goal.id}><strong>{goal.kind==='english'?'Konuşma':'Sosyal'}</strong><div className="rd-stepper"><button type="button" aria-label={`${goal.name} sayısını azalt`} disabled={goal.target<=1} onClick={()=>setGoalDraft(items=>items.map(item=>item.id===goal.id?{...item,target:item.target-1}:item))}><Minus size={14}/></button><input aria-label={`${goal.name} haftalık hedef`} type="number" min={1} max={99} value={goal.target} onChange={event=>setGoalDraft(items=>items.map(item=>item.id===goal.id?{...item,target:Number(event.target.value)}:item))}/><button type="button" aria-label={`${goal.name} sayısını artır`} disabled={goal.target>=99} onClick={()=>setGoalDraft(items=>items.map(item=>item.id===goal.id?{...item,target:item.target+1}:item))}><Plus size={14}/></button></div></div>)}</div>{error&&<p className="rd-error" role="alert">{error}</p>}<footer className="rd-editor-footer"><button className="rd-text-button" type="button" onClick={close}>Vazgeç</button><button className="primary-button" type="submit">Kaydet <Check size={16}/></button></footer></form></Overlay>}
    {overlay==='context'&&<Overlay title="26 haftalık yolculuk" kind="context" onClose={close}><span className="rd-kicker">BÜYÜK RESİM</span><h2>26 hafta.<br/>Kendine doğru.</h2><p className="rd-dialog-intro">Şimdi yalnızca bu haftaya yer aç.</p><ol className="rd-phases">{journey.phases.map((phase,index)=><li key={phase.id} className={index===position.phase?'current':''}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{phase.name}</strong>{index===position.phase&&<p>{phase.objective}</p>}</div>{index===position.phase&&<ArrowRight size={16}/>}</li>)}</ol><details className="rd-date-edit"><summary>Başlangıç tarihini değiştir <ChevronDown size={14}/></summary><form onSubmit={event=>{event.preventDefault();if(!validDate(dateDraft)){setError('Geçerli bir tarih seç.');return;}onStartChange(dateDraft);close();}}><label>Yolculuğun başlangıcı<input type="date" value={dateDraft} required onChange={event=>setDateDraft(event.target.value)}/></label><button className="rd-text-button" type="submit">Kaydet <Check size={16}/></button></form>{error&&<p role="alert">{error}</p>}</details></Overlay>}
  </section>;
}
