'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ArrowRight, History, Plus, RotateCcw, Sparkle } from 'lucide-react';
import { acceptIdea, generateIdea, generationHistory, recordIdeaDecision, GENERATION_UNAVAILABLE } from './idea-engine';
import type { GeneratedIdea, IdeaRequest } from './idea-engine';

export function IdeaStudio({request,onSave,onClose,historyOnly=false}:{request:Omit<IdeaRequest,'signal'>;onSave:(idea:GeneratedIdea)=>void;onClose:()=>void;historyOnly?:boolean}) {
  const [idea,setIdea]=useState<GeneratedIdea|null>(null);
  const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [history,setHistory]=useState<GeneratedIdea[]>([]),[showHistory,setShowHistory]=useState(historyOnly),[next,setNext]=useState<string|null>(null);
  const [fromHistory,setFromHistory]=useState(false);
  const controller=useRef<AbortController|null>(null);
  const requestRef=useRef(request);
  const mounted=useRef(true);
  const start=()=>{controller.current?.abort();const next=new AbortController();controller.current=next;setError('');return next;};
  async function draw(previous:GeneratedIdea|null=null) {
    const active=start();setBusy(true);setSaving(false);setIdea(null);setShowHistory(false);setFromHistory(false);
    try {
      if(previous&&previous.status!=='accepted')await recordIdeaDecision(previous.id,'skipped',active.signal);
      const value=await generateIdea({...requestRef.current,signal:active.signal});
      if(!active.signal.aborted)setIdea(value);
    }catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:GENERATION_UNAVAILABLE);}
    finally{if(!active.signal.aborted)setBusy(false);}
  }
  async function loadHistory(append=false) {
    const active=start();setBusy(true);setShowHistory(true);
    try {const result=await generationHistory(append?next||'':'',active.signal);if(!active.signal.aborted){setHistory(items=>append?[...items,...result.items]:result.items);setNext(result.next);}}
    catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:'Geçmiş yüklenemedi.');}
    finally{if(!active.signal.aborted)setBusy(false);}
  }
  async function save() {
    if(!idea||busy||saving)return;
    const active=start();setSaving(true);
    try {const result=await acceptIdea(idea.id,active.signal);if(!active.signal.aborted&&mounted.current){onSave(result);onClose();}}
    catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:GENERATION_UNAVAILABLE);}
    finally{if(!active.signal.aborted)setSaving(false);}
  }
  async function reject() {
    if(!idea)return;const active=start();setBusy(true);
    try{await recordIdeaDecision(idea.id,'rejected',active.signal);if(!active.signal.aborted)onClose();}
    catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:'Kararın kaydedilemedi.');}
    finally{if(!active.signal.aborted)setBusy(false);}
  }
  const initialize=useEffectEvent(()=>historyOnly?loadHistory():draw());
  useEffect(()=>{mounted.current=true;const timer=window.setTimeout(()=>void initialize(),0);return()=>{window.clearTimeout(timer);mounted.current=false;controller.current?.abort();};},[]);
  const label=idea?.type==='project'?'Projelere ekle':idea?.type==='research'?'Bu konuyu seç':idea?.type==='meal'?'Bu yemeği seç':'Bu haftaya al';
  return <>
    <div className="rd-draw-brand"><Sparkle size={18}/><span>{fromHistory?'ÜRETİM GEÇMİŞİ / ÖNCEKİ KAYIT':'REBUILD / YENİ BİR İHTİMAL'}</span></div>
    {showHistory?<div className="rd-generation-history"><h2>Üretim geçmişi.</h2><p>Önceden üretilenler. Bunlar yeni öneriler olarak sunulmaz.</p>
      {history.map(item=><button key={item.id} onClick={()=>{setIdea(item);setFromHistory(true);setShowHistory(false);setError('');}}><span><strong>{item.title}</strong><small>{new Date(item.generatedAt).toLocaleDateString('tr-TR')} · {item.status==='accepted'?'Kaydedildi':item.status==='skipped'?'Geçildi':item.status==='rejected'?'Reddedildi':'Üretildi'}</small></span><ArrowRight size={17}/></button>)}
      {!history.length&&!busy&&<p>Henüz üretilmiş bir fikir yok.</p>}{busy&&<p role="status">Geçmiş yükleniyor…</p>}{next&&<button disabled={busy} onClick={()=>void loadHistory(true)}>Daha eski kayıtlar</button>}
    </div>:<div className={`rd-idea-stage ${busy?'is-drawing':''}`} aria-live="polite" aria-busy={busy||saving}>
      {idea&&<div className="rd-drawn-idea" key={idea.id}><span className="rd-kicker">{idea.type==='meal'?'NE YESEM?':idea.kind} · {idea.domain}</span><h2>{idea.text}</h2>{saving&&<p role="status">{idea.type==='project'?'Bu fikre özel proje planı hazırlanıyor…':idea.type==='research'?'Bu konuya özel sorular hazırlanıyor…':'Kaydediliyor…'}</p>}</div>}
      {!idea&&<div className="rd-generation-message"><Sparkle size={32}/><h2>{busy?'Yeni bir fikir üretiliyor.':'Şu an bir fikir üretilemedi.'}</h2><p>{busy?'AI yeni bir öneri hazırlıyor ve önceki fikirlerle karşılaştırıyor.':'Hazır bir fikir havuzuna geçilmedi. Tekrar deneyebilirsin.'}</p></div>}
    </div>}
    {error&&<p className="rd-error rd-generation-error" role="alert">{error}</p>}
    <div className="rd-idea-bottom">
      {!showHistory&&<div className="rd-idea-actions"><button className="primary-button" disabled={!idea||busy||saving} onClick={()=>void save()}><Plus size={18}/>{idea?.status==='accepted'?'Kaydı aç / geri yükle':label}</button><button className="rd-another" disabled={busy||saving} onClick={()=>void draw(idea)}><RotateCcw size={18}/>{error&&!idea?'Tekrar dene':'Başka'}</button></div>}
      <div className="rd-idea-secondary">{!showHistory&&<button className="rd-text-button" disabled={busy||saving} onClick={()=>void loadHistory()}><History size={15}/> Geçmiş</button>}{showHistory&&<button className="rd-text-button" disabled={busy} onClick={()=>void draw()}>Yeni fikir üret <Sparkle size={15}/></button>}{idea&&!showHistory&&idea.status!=='accepted'&&<button className="rd-text-button" disabled={busy||saving} onClick={()=>void reject()}>Bana göre değil</button>}</div>
      <span className="rd-idea-footnote">{fromHistory?(idea?.status==='accepted'?'Daha önce kaydedilmiş kayıt. Planı yeniden üretmeden açılır.':'Daha önce üretilmiş fikir. Seçimin henüz kaydedilmedi.'):'Yeni istek, yeni fikir. Merakının dışına da çıkabilir.'}</span>
    </div>
  </>;
}
