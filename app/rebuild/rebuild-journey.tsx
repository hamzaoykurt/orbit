'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, Minus, Plus, RotateCcw, Settings2, Sparkle, Trash2, X } from 'lucide-react';
import { addDays, calendarWeek, journeyPosition, localDay, validDate } from './journey-model';
import type { Journey } from './journey-model';
import { generateIdea, ideaPool } from './idea-engine';
import type { Idea } from './idea-engine';
import { attachIdea, completeGoal, configureGoals, ensureWeek, rememberIdea, undoCompletion, weekView } from './weekly-deck-model';
import type { LegacyActivity, WeeklyDeck, WeeklyGoal } from './weekly-deck-model';
import './rebuild-journey.css';

type Props = {
  journey: Journey; deck: WeeklyDeck; activities: LegacyActivity[]; selections: Record<string,string>; syncStatus: string;
  onUpdateDeck: (update: (current: WeeklyDeck) => WeeklyDeck) => void; onStartChange: (date: string) => void;
};
const shortDate = (date: string) => new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short'}).format(new Date(`${date}T12:00:00`));
const starter = (goal: WeeklyGoal): Idea => goal.kind === 'any'
  ? {id:`starter-${goal.id}`,kind:'TRY',goal:'make',text:goal.name}
  : ideaPool.find(idea=>idea.goal===goal.kind)!;

function Overlay({title,kind,children,onClose}: {title:string;kind:'idea'|'settings'|'context';children:ReactNode;onClose:()=>void}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous = document.activeElement as HTMLElement|null;
    const overflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter((node):node is HTMLElement=>node instanceof HTMLElement && !node.contains(container.current));
    const priorInert = siblings.map(node=>node.inert);
    siblings.forEach(node=>{node.inert=true;});
    document.body.style.overflow='hidden';
    container.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose();}
      if(event.key!=='Tab')return;
      const controls=Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,summary,a[href]')??[]).filter(node=>node.getClientRects().length);
      const first=controls[0], last=controls.at(-1);
      if(event.shiftKey && (document.activeElement===first || document.activeElement===container.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && (document.activeElement===last || document.activeElement===container.current)){event.preventDefault();first?.focus();}
    };
    window.addEventListener('keydown',keydown,true);
    return ()=>{siblings.forEach((node,index)=>{node.inert=priorInert[index];});document.body.style.overflow=overflow;window.removeEventListener('keydown',keydown,true);previous?.focus();};
  },[onClose]);
  return createPortal(<div className={`rd-overlay rd-overlay-${kind}`} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className={`rd-dialog rd-dialog-${kind}`} role="dialog" aria-modal="true" aria-label={title} ref={container} tabIndex={-1} onKeyDown={event=>event.stopPropagation()}>
      <button className="rd-icon rd-close" aria-label="Kapat" onClick={onClose}><X size={20}/></button>{children}
    </div>
  </div>,document.body);
}

export function RebuildJourney({journey,deck,activities,selections,syncStatus,onUpdateDeck,onStartChange}: Props) {
  const [today,setToday]=useState(localDay);
  const weekKey=calendarWeek(today);
  const seed={activities,selections,curiosity:journey.focus[weekKey]?.curiosity,creation:journey.focus[weekKey]?.create};
  const week=weekView(deck,weekKey,seed);
  const start=journey.startDate||deck.startedOn||weekKey;
  const position=journeyPosition(start,today);
  const [expanded,setExpanded]=useState<string|null>(null);
  const [overlay,setOverlay]=useState<'idea'|'settings'|'context'|null>(null);
  const [idea,setIdea]=useState<Idea|null>(null);
  const [ideaGoal,setIdeaGoal]=useState<string|undefined>();
  const [drawing,setDrawing]=useState(false);
  const [drawNumber,setDrawNumber]=useState(0);
  const [goalDraft,setGoalDraft]=useState<WeeklyGoal[]>([]);
  const [dateDraft,setDateDraft]=useState(start);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState<{text:string;undo?:{week:string;goal:string;mark:string}}|null>(null);
  const request=useRef<AbortController|null>(null);
  const recent=useRef(deck.seenIdeas);

  useEffect(()=>{
    const update=()=>setToday(localDay());
    const timer=window.setInterval(update,30_000);
    window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[]);
  useEffect(()=>{
    if(deck.weeks[weekKey] && deck.startedOn)return;
    onUpdateDeck(current=>ensureWeek(current,weekKey,{activities,selections,curiosity:journey.focus[weekKey]?.curiosity,creation:journey.focus[weekKey]?.create}));
  },[deck.weeks,deck.startedOn,weekKey,activities,selections,journey.focus,onUpdateDeck]);
  useEffect(()=>()=>request.current?.abort(),[]);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(null),6000);return ()=>window.clearTimeout(timer);},[notice]);
  const close=useCallback(()=>{request.current?.abort();setOverlay(null);setDrawing(false);setError('');},[setOverlay,setDrawing,setError]);
  const update=(change:(current:WeeklyDeck)=>WeeklyDeck)=>onUpdateDeck(current=>change(ensureWeek(current,weekKey,seed)));
  const draw=async (goal?:WeeklyGoal) => {
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setDrawing(true);setError('');
    try {
      const next=await generateIdea({goal:goal?.kind,exclude:[...recent.current,...Object.values(week.ideas).map(item=>item.id),...(goal?[starter(goal).id]:[]),...(idea?[idea.id]:[])],signal:controller.signal});
      if(overlay==='idea'&&idea)await new Promise(resolve=>window.setTimeout(resolve,150));
      if(controller.signal.aborted)return;
      recent.current=[...recent.current.filter(id=>id!==next.id),next.id].slice(-100);
      update(current=>rememberIdea(current,next.id));setIdea(next);setDrawNumber(value=>value+1);setDrawing(false);
    } catch {if(!controller.signal.aborted){setDrawing(false);setError('Fikir açılamadı. Bir kez daha dene.');}}
  };
  const openIdea=(goal?:WeeklyGoal)=>{setIdea(null);setIdeaGoal(goal?.id);setOverlay('idea');void draw(goal);};
  const done=(goal:WeeklyGoal, includeStarter=false)=>{
    const count=week.marks[goal.id]?.length??0;
    if(expanded===goal.id){document.getElementById(`rd-toggle-${goal.id}`)?.focus();setExpanded(null);}
    if(count>=goal.target){update(current=>undoCompletion(current,weekKey,goal.id));setNotice({text:`${goal.name}: son işaret geri alındı.`});return;}
    const evidence=week.ideas[goal.id]??(includeStarter?starter(goal):undefined);
    const mark={id:crypto.randomUUID(),at:new Date().toISOString(),...(evidence?{idea:evidence}:{})};
    update(current=>completeGoal(current,weekKey,goal.id,mark));setExpanded(null);
    setNotice({text:`${goal.name} · ${count+1} / ${goal.target}`,undo:{week:weekKey,goal:goal.id,mark:mark.id}});
  };
  const saveIdea=()=>{
    if(!idea)return;
    const next=attachIdea(ensureWeek(deck,weekKey,seed),weekKey,idea,ideaGoal);
    const destination=next.weeks[weekKey].goals.find(goal=>next.weeks[weekKey].ideas[goal.id]?.id===idea.id)!;
    update(current=>attachIdea(current,weekKey,idea,ideaGoal));setExpanded(destination.id);close();
    setNotice({text:`${destination.name} · fikir bu haftaya alındı.`});
  };
  const saveGoals=()=>{
    if(goalDraft.some(goal=>!goal.name.trim() || !Number.isInteger(goal.target) || goal.target<1 || goal.target>99)){setError('Hedeflere bir ad ve 1–99 arasında bir sayı ver.');return;}
    update(current=>configureGoals(current,weekKey,goalDraft));setExpanded(null);close();setNotice({text:'Hedeflerin bu hafta ve gelecek haftalar için kaydedildi.'});
  };

  return <section className="rebuild-deck" aria-label="Rebuild haftalık alanı">
    <header className="rd-heading">
      <div><span className="rd-kicker">REBUILD</span><h1>Bu hafta<span>.</span></h1><p>{shortDate(weekKey)} — {shortDate(addDays(weekKey,6))}</p></div>
      <button className="rd-week-index" aria-label={`26 haftalık yolculuk · hafta ${position.week}`} onClick={()=>{setDateDraft(start);setOverlay('context');}}>
        <span><b>{String(position.week).padStart(2,'0')}</b><i>/ 26</i><ArrowUpRight size={15}/></span>
        <small>{position.complete?'yolculuk tamamlandı':position.future?'başlangıç yaklaşıyor':'küçük adımlarla'}</small>
      </button>
    </header>
    <div className="rd-weekly">
      <div className="rd-list-tools"><span>NEYİ YAPMAK İSTİYORSUN?</span><button className="rd-icon" aria-label="Haftalık hedefleri düzenle" onClick={()=>{setGoalDraft(week.goals.map(goal=>({...goal})));setOverlay('settings');}}><Settings2 size={17}/></button></div>
      <div className="rd-goals">{week.goals.map((goal,index)=>{
        const count=week.marks[goal.id]?.length??0, complete=count>=goal.target, isOpen=expanded===goal.id;
        const topic=week.ideas[goal.id]??starter(goal);
        return <div key={goal.id} className={`rd-goal ${isOpen?'is-open':''} ${complete?'is-done':''}`}>
          <div className="rd-goal-line">
            <button className="rd-goal-toggle" id={`rd-toggle-${goal.id}`} aria-expanded={isOpen} aria-controls={`rd-detail-${goal.id}`} onClick={()=>setExpanded(isOpen?null:goal.id)}>
              <span className="rd-row-index" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
              <span className="rd-goal-name">{goal.name}{week.ideas[goal.id]&&<i aria-label="Bu hafta için fikir var"/>}</span>
              <span className="rd-count" key={count}><strong>{count}</strong><span>/ {goal.target}</span></span><ChevronDown className="rd-chevron" size={16}/>
            </button>
            <button className="rd-complete" aria-label={`${goal.name}: ${complete?'son işareti geri al':'bir tamamlanma ekle'}`} aria-pressed={complete} onClick={()=>done(goal)}><Check size={19}/></button>
          </div>
          <div className="rd-expansion" id={`rd-detail-${goal.id}`} inert={!isOpen} aria-hidden={!isOpen}><div><div className="rd-goal-detail">
            <span className="rd-kicker">{week.ideas[goal.id]?'BU HAFTANIN FİKRİ':'BURADAN BAŞLAYABİLİRSİN'}</span><p>{topic.text}</p>
            <div className="rd-detail-actions"><button className="rd-text-button" onClick={()=>openIdea(goal)}><RotateCcw size={15}/> Başka fikir</button><button className="rd-done-action" onClick={()=>done(goal,true)}>{complete?<><RotateCcw size={15}/> Son işareti geri al</>:<><Check size={17}/> Yaptım</>}</button></div>
          </div></div></div>
        </div>;
      })}{!week.goals.length&&<p className="rd-empty">Bu haftayı boş bıraktın. Bir fikir çek ya da düzenle düğmesinden küçük bir hedef ekle.</p>}</div>
    </div>
    <footer className="rd-trigger-area"><button className="rd-trigger" onClick={()=>openIdea()}><span className="rd-trigger-object" aria-hidden="true"><Sparkle size={29} strokeWidth={1.15}/></span><span><strong>Bana bir şey ver</strong><small>Bir fikir çek. Nereye götüreceğine bak.</small></span><ArrowDownRight size={20}/></button></footer>
    {(syncStatus==='error'||syncStatus==='offline')&&<p className="rd-sync" role="status">Cihazında saklandı. Sunucuya eşitleme bekleniyor.</p>}
    <div className={`rd-notice ${notice?'visible':''}`} role="status" aria-live="polite">{notice&&<><span>{notice.text}</span>{notice.undo&&<button onClick={()=>{const action=notice.undo!;onUpdateDeck(current=>undoCompletion(current,action.week,action.goal,action.mark));setNotice({text:'İşaret geri alındı.'});}}>Geri al</button>}</>}</div>

    {overlay==='idea'&&<Overlay title="Bana bir şey ver" kind="idea" onClose={close}>
      <div className="rd-draw-brand"><Sparkle size={18}/><span>REBUILD / BİR İHTİMAL DAHA</span></div>
      <div className={`rd-idea-stage ${drawing?'is-drawing':''}`} aria-live="polite" aria-busy={drawing}>{idea&&<div className="rd-drawn-idea" key={drawNumber}><span className="rd-kicker">{idea.kind}</span><h2>{idea.text}</h2></div>}{!idea&&<span className="rd-kicker">Bir fikir açılıyor…</span>}{error&&<p role="alert">{error}</p>}</div>
      <div className="rd-idea-bottom"><div className="rd-idea-actions"><button className="primary-button" disabled={!idea||drawing} onClick={saveIdea}><Plus size={18}/> Bu haftaya al</button><button className="rd-another" disabled={drawing} onClick={()=>void draw(week.goals.find(goal=>goal.id===ideaGoal))}><RotateCcw size={18}/> Başka</button></div><span className="rd-idea-footnote">Sadece merak ettiğin için.</span></div>
    </Overlay>}

    {overlay==='settings'&&<Overlay title="Haftanın ayarı" kind="settings" onClose={close}>
      <span className="rd-kicker">KENDİ RİTMİN</span><h2>Haftanın ayarı.</h2><p className="rd-dialog-intro">Bir kez ayarla. Gelecek hafta da buradalar.</p>
      <form onSubmit={event=>{event.preventDefault();saveGoals();}}>
        <div className="rd-goal-editor">{goalDraft.map((goal,index)=><div className="rd-edit-row" key={goal.id}>
          <input aria-label={`Hedef ${index+1} adı`} value={goal.name} maxLength={80} required onChange={event=>setGoalDraft(items=>items.map(item=>item.id===goal.id?{...item,name:event.target.value}:item))}/>
          <div className="rd-stepper"><button type="button" aria-label={`${goal.name||'Hedef'} sayısını azalt`} disabled={goal.target<=1} onClick={()=>setGoalDraft(items=>items.map(item=>item.id===goal.id?{...item,target:item.target-1}:item))}><Minus size={14}/></button><input aria-label={`Hedef ${index+1} haftalık sayı`} type="number" min={1} max={99} value={goal.target||''} required onChange={event=>setGoalDraft(items=>items.map(item=>item.id===goal.id?{...item,target:Number(event.target.value)}:item))}/><button type="button" aria-label={`${goal.name||'Hedef'} sayısını artır`} disabled={goal.target>=99} onClick={()=>setGoalDraft(items=>items.map(item=>item.id===goal.id?{...item,target:item.target+1}:item))}><Plus size={14}/></button></div>
          <button className="rd-icon" type="button" aria-label={`${goal.name||'Hedef'} hedefini kaldır`} onClick={()=>setGoalDraft(items=>items.filter(item=>item.id!==goal.id))}><Trash2 size={16}/></button>
        </div>)}</div>
        <button className="rd-text-button rd-add-goal" type="button" disabled={goalDraft.length>=12} onClick={()=>setGoalDraft(items=>[...items,{id:`goal-${crypto.randomUUID()}`,name:'',target:1,kind:'any'}])}><Plus size={16}/> Küçük bir hedef ekle</button>
        {error&&<p className="rd-error" role="alert">{error}</p>}
        <footer className="rd-editor-footer"><button className="rd-text-button" type="button" onClick={close}>Vazgeç</button><button className="primary-button" type="submit">Kaydet <Check size={16}/></button></footer>
      </form>
    </Overlay>}

    {overlay==='context'&&<Overlay title="26 haftalık yolculuk" kind="context" onClose={close}>
      <span className="rd-kicker">BÜYÜK RESİM</span><h2>26 hafta.<br/>Kendine doğru.</h2><p className="rd-dialog-intro">{position.complete?'Bu dönem tamamlandı. Haftalık alanını kullanmaya devam edebilirsin.':position.future?`${shortDate(start)} tarihinde başlıyor. Bu haftanı şimdiden kurabilirsin.`:'Şimdi yalnızca bu haftaya yer aç.'}</p>
      <ol className="rd-phases">{journey.phases.map((phase,index)=><li key={phase.id} className={index===position.phase?'current':''}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{phase.name}</strong>{index===position.phase&&<p>{phase.objective}</p>}</div>{index===position.phase&&<ArrowRight size={16}/>}</li>)}</ol>
      <details className="rd-date-edit"><summary>Başlangıç tarihini değiştir <ChevronDown size={14}/></summary><form onSubmit={event=>{event.preventDefault();if(!validDate(dateDraft)){setError('Geçerli bir tarih seç.');return;}onStartChange(dateDraft);close();}}><label>Yolculuğun başlangıcı<input type="date" value={dateDraft} required onInput={event=>setDateDraft(event.currentTarget.value)} onChange={event=>setDateDraft(event.target.value)}/></label><button className="rd-text-button" type="submit">Kaydet <Check size={16}/></button></form>{error&&<p role="alert">{error}</p>}</details>
    </Overlay>}
  </section>;
}
