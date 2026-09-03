'use client';
import { useEffect, useMemo, useRef } from 'react';
import { navigation, useNavigationState } from '../use-navigation';
import { ArrowLeft, ArrowRight, Check, X, Lightbulb, Compass, Palette, Flag } from 'lucide-react';
import { analyzeProject, planningQuestions, suggestedTitle } from './project-advisor';
import { findDesignStyle } from './design-catalog';
import { DesignPicker } from './design-picker';
import { DesignPreview } from './design-preview';
import { lifecycleLabels } from './planning-types';
import type { CreationDraft, ProjectLifecycle, ProjectPlanning } from './planning-types';
import './project-planning.css';

const steps = [{id:'idea',name:'Fikir',icon:Lightbulb},{id:'questions',name:'Netleştir',icon:Compass},{id:'design',name:'Görsel dil',icon:Palette},{id:'review',name:'Başlangıç',icon:Flag}] as const;
export function ProjectCreator({draft:savedDraft,onChange,onClose,onDiscard,onSave}:{draft:CreationDraft;onChange:(draft:CreationDraft)=>void;onClose:()=>void;onDiscard:()=>void;onSave:(plan:ProjectPlanning)=>void}) {
  const [position,setPosition]=useNavigationState(`overlay:creator/position:${savedDraft.id}`,`${savedDraft.step}:${savedDraft.question}`,false,true);
  const [viewStep,viewQuestion]=position.split(':');
  const draft=useMemo(()=>({...savedDraft,step:viewStep as CreationDraft['step'],question:Number(viewQuestion)}),[savedDraft,viewStep,viewQuestion]);
  const dialog=useRef<HTMLDialogElement>(null), content=useRef<HTMLDivElement>(null), saving=useRef(false);
  const route=draft.lifecycle;
  const questions=planningQuestions(draft), index=Math.min(draft.question,questions.length-1), question=questions[index];
  const analysis=useMemo(()=>analyzeProject(draft),[draft]);
  const style=findDesignStyle(draft.selectedStyle);
  const step=steps.findIndex(s=>s.id===draft.step);
  const change=(update:Partial<CreationDraft>)=>{
    if(update.step!==undefined||update.question!==undefined)setPosition(`${update.step??draft.step}:${update.question??draft.question}`);
    onChange({...draft,...update});
  };
  useEffect(()=>{
    const element=dialog.current, previous=document.activeElement as HTMLElement|null, overflow=document.body.style.overflow;
    element?.showModal();document.body.style.overflow='hidden';
    return ()=>{element?.close();document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  useEffect(()=>{content.current?.scrollTo({top:0});content.current?.querySelector<HTMLElement>('[data-step-focus]')?.focus({preventScroll:true});},[draft.step,draft.question]);
  const next=()=>{
    if(draft.step==='idea')change({step:'questions',question:0,title:draft.title||suggestedTitle(draft.idea)});
    else if(draft.step==='questions')change(index<questions.length-1?{question:index+1}:{step:'design',selectedStyle:draft.selectedStyle||analysis.recommendations[0].styleId});
    else if(draft.step==='design')change({step:'review'});
    else if(style&&!saving.current){saving.current=true;const now=new Date().toISOString();onSave({version:1,createdAt:now,updatedAt:now,input:draft,analysis,selectedStyle:style.id,lifecycle:route||analysis.suggestedLifecycle,overrides:{}});}
  };
  const back=()=>{
    const previous=draft.step==='questions'&&index>0?`questions:${index-1}`:step>0?`${steps[step-1].id}:${draft.step==='design'?questions.length-1:draft.question}`:null;
    if(previous)navigation.backToView(`overlay:creator/position:${savedDraft.id}`,previous,`${savedDraft.step}:${savedDraft.question}`);
  };
  const ready=draft.step==='idea'?draft.idea.trim().length>=15:draft.step==='questions'?!question.options||!!draft.answers[question.id]:draft.step==='design'?!!style:!!draft.title.trim()&&!!style;
  return <dialog ref={dialog} className="pp-dialog pp-root" aria-labelledby="project-flow-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="pp-dialog-header"><span>PROJE ATÖLYESİ</span><button type="button" className="pp-icon-button" aria-label="Taslağı sakla ve kapat" onClick={onClose}><X size={20}/></button></header>
    <div className="pp-dialog-layout"><aside className="pp-rail"><ol aria-label="Proje oluşturma adımları">{steps.map((item,i)=>{const Icon=item.icon;return <li key={item.id} aria-current={step===i?'step':undefined} className={i<step?'is-complete':''}><span>{i<step?<Check size={18}/>:<Icon size={18}/>}</span><div><small>0{i+1}</small><strong>{item.name}</strong></div></li>;})}</ol><p>Fikirden ilk denemeye.<br/>Küçük, net, sana ait.</p><small>Kapatsan da taslağın saklanır.</small></aside>
    <div ref={content} className="pp-dialog-content"><div key={`${draft.step}-${draft.step==='questions'?index:0}`} className="pp-step">
      {draft.step==='idea'&&<><span className="pp-kicker">01 / BİR BAŞLANGIÇ NOKTASI</span><h2 id="project-flow-title" tabIndex={-1} data-step-focus>Aklında ne var?</h2><p>Birkaç cümleyle fikrini anlat. Kimin için olduğunu veya hangi sorunu çözmek istediğini ekleyebilirsin.</p><label className="pp-idea-label" htmlFor="project-idea">Proje fikrin</label><textarea id="project-idea" className="pp-idea-input" maxLength={1200} rows={5} value={draft.idea} onChange={e=>change({idea:e.target.value})} placeholder="Yapmak istediğim şey…"/><div className="pp-input-meta"><span>{draft.idea.trim().length<15?'En az 15 karakter; kısa bir açıklama yeterli.':'Güzel. Şimdi fikri birkaç seçimle netleştirelim.'}</span><span>{draft.idea.length}/1200</span></div><div className="pp-how"><Compass size={22}/><div><strong>Tüm cevapları bilmen gerekmiyor.</strong><p>Belirsiz kalanları araştırmaya, büyük kapsamı küçük bir denemeye çevireceğiz.</p></div></div></>}
      {draft.step==='questions'&&<><span className="pp-kicker">02 / KARAR {index+1} / {questions.length}</span><h2 id="project-flow-title" tabIndex={-1} data-step-focus>{question.title}</h2><p>{question.hint}</p><div className="pp-question-progress" aria-hidden="true">{questions.map((q,i)=><i key={q.id} className={i<=index?'is-active':''}/>)}</div>{question.options?<div className="pp-options" role="group" aria-label={question.title}>{question.options.map(option=><button type="button" key={option.id} className={draft.answers[question.id]===option.id?'is-selected':''} aria-pressed={draft.answers[question.id]===option.id} onClick={()=>change({answers:{...draft.answers,[question.id]:option.id}})}><span><strong>{option.label}</strong><small>{option.detail}</small></span><i>{draft.answers[question.id]===option.id?<Check size={16}/>:<ArrowRight size={16}/>}</i></button>)}</div>:<label className="pp-field">Farkın <small>İsteğe bağlı</small><textarea maxLength={300} rows={4} value={draft.answers[question.id]||''} onChange={e=>change({answers:{...draft.answers,[question.id]:e.target.value}})} placeholder={question.placeholder}/></label>}<p className="pp-fineprint">Cevabını geri dönüp değiştirebilirsin.</p></>}
      {draft.step==='design'&&<><span className="pp-kicker">03 / KARAKTER KAZANDIR</span><h2 id="project-flow-title" tabIndex={-1} data-step-focus>Nasıl bir his bıraksın?</h2><p>Fikrin ve seçimlerin üzerinden bir ana öneri, iki alternatif. İstersen koleksiyonun tamamından seç.</p><DesignPicker selected={draft.selectedStyle} recommendations={analysis.recommendations} onSelect={id=>change({selectedStyle:id})}/></>}
      {draft.step==='review'&&<><span className="pp-kicker">04 / İLK ADIM HAZIR</span><h2 id="project-flow-title" tabIndex={-1} data-step-focus>Fikrine bir yol aç.</h2><p>Bu bir ön değerlendirme; karar sende. Başlangıç yolunu şimdi, tüm sınıflandırmaları sonra değiştirebilirsin.</p><label className="pp-field">Proje adı<input maxLength={100} value={draft.title} onChange={e=>change({title:e.target.value})}/></label><div className="pp-review"><div className="pp-route-card"><span className="pp-kicker">ÖNERİLEN YOL</span><h3>{analysis.route}</h3><p>{analysis.routeReason}</p><dl><div><dt>Proje tipi</dt><dd>{analysis.type}</dd></div><div><dt>İlk kapsam</dt><dd>{analysis.scope}</dd></div><div><dt>Tek başına</dt><dd>{analysis.solo}</dd></div></dl></div>{style&&<div className="pp-review-style"><DesignPreview style={style}/><strong>{style.name}</strong><button type="button" className="pp-button" onClick={()=>change({step:'design'})}>Stili değiştir</button></div>}</div><h3>İlk üç adım</h3><ol className="pp-numbered">{analysis.firstSteps.map(text=><li key={text}>{text}</li>)}</ol><label className="pp-field">Başlangıç yolu<select value={route||analysis.suggestedLifecycle} onChange={e=>change({lifecycle:e.target.value as ProjectLifecycle})}>{Object.entries(lifecycleLabels).filter(([id])=>id!=='completed').map(([id,label])=><option key={id} value={id}>{label}{id===analysis.suggestedLifecycle?' · önerilen':''}</option>)}</select></label><p className="pp-fineprint">Cevaplarına dayalı yerel değerlendirme. Pazar talebi, rakipler ve teknik süre bağımsız olarak doğrulanmadı. AI fikir üretiminden ayrıdır.</p></>}
    </div></div></div>
    <footer className="pp-dialog-footer"><div>{step>0?<button type="button" className="pp-button" onClick={back}><ArrowLeft size={16}/> Geri</button>:<button type="button" className="pp-button" onClick={()=>{if(!draft.idea.trim()||window.confirm('Bu proje taslağı silinsin mi?'))onDiscard();}}>Taslağı sil</button>}</div><button type="button" className="pp-button pp-primary" disabled={!ready} onClick={next}>{draft.step==='review'?(draft.editingProjectId?'Değerlendirmeyi kaydet':(route||analysis.suggestedLifecycle)==='research'?'Proje ve araştırma oluştur':(route||analysis.suggestedLifecycle)==='mvp'?'MVP olarak oluştur':(route||analysis.suggestedLifecycle)==='paused'?'Daha sonra bakmak için sakla':(route||analysis.suggestedLifecycle)==='archived'?'Arşivde sakla':'Projelerime ekle'):'Devam et'}<ArrowRight size={17}/></button></footer>
  </dialog>;
}
