'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, History, LoaderCircle, Plus, RotateCcw, Sparkle } from 'lucide-react';
import { acceptIdea, generateIdea, generationHistory, recordIdeaDecision, GENERATION_UNAVAILABLE } from './idea-engine';
import type { GeneratedIdea, IdeaRequest } from './idea-engine';

export function IdeaStudio({request,onSave,onClose,historyOnly=false}:{request:Omit<IdeaRequest,'signal'>;onSave:(idea:GeneratedIdea)=>void|Promise<void>;onClose:()=>void;historyOnly?:boolean}) {
  const [idea,setIdea]=useState<GeneratedIdea|null>(null);
  const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [history,setHistory]=useState<GeneratedIdea[]>([]),[showHistory,setShowHistory]=useState(historyOnly),[next,setNext]=useState<string|null>(null);
  const [fromHistory,setFromHistory]=useState(false);
  const [copied,setCopied]=useState(false);
  const [activeRequest,setActiveRequest]=useState(request),[generationFailed,setGenerationFailed]=useState(false);
  const promptField=useRef<HTMLTextAreaElement>(null);
  const controller=useRef<AbortController|null>(null);
  const requestRef=useRef(request);
  const lastRequest=useRef(request);
  const mounted=useRef(true);
  const start=()=>{controller.current?.abort();const next=new AbortController();controller.current=next;setError('');setGenerationFailed(false);return next;};
  async function draw(previous:GeneratedIdea|null=null, visualMode?:IdeaRequest['visualMode'], retry=false) {
    const nextRequest=retry?lastRequest.current:{...requestRef.current,...(visualMode?{type:'image_prompt' as const,visualMode,sourceId:previous?.id}:{})};
    const retained=nextRequest.sourceId?previous:null;
    const active=start();setBusy(true);setSaving(false);setIdea(retained);setShowHistory(false);setCopied(false);setGenerationFailed(false);setActiveRequest(nextRequest);
    if(!retained)setFromHistory(false);
    try {
      if(previous&&!nextRequest.sourceId&&!retry&&previous.status!=='accepted')await recordIdeaDecision(previous.id,'skipped',active.signal);
      lastRequest.current=nextRequest;
      const value=await generateIdea({...nextRequest,signal:active.signal});
      if(!active.signal.aborted){setIdea(value);setFromHistory(false);}
    }catch(cause){if(!active.signal.aborted){setError(cause instanceof Error?cause.message:GENERATION_UNAVAILABLE);setGenerationFailed(true);}}
    finally{if(!active.signal.aborted)setBusy(false);}
  }
  async function loadHistory(append=false) {
    const active=start();setBusy(true);setShowHistory(true);setGenerationFailed(false);
    try {const result=await generationHistory(append?next||'':'',active.signal,request.type==='surprise'?undefined:request.type);if(!active.signal.aborted){setHistory(items=>append?[...items,...result.items]:result.items);setNext(result.next);}}
    catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:'Geçmiş yüklenemedi.');}
    finally{if(!active.signal.aborted)setBusy(false);}
  }
  async function save() {
    if(!idea||busy||saving)return;
    const active=start();setSaving(true);
    try {const result=await acceptIdea(idea.id,active.signal);if(!active.signal.aborted&&mounted.current){await onSave(result);onClose();}}
    catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:GENERATION_UNAVAILABLE);}
    finally{if(!active.signal.aborted)setSaving(false);}
  }
  async function copyPrompt() {
    if(!idea)return;
    setGenerationFailed(false);
    try { await navigator.clipboard.writeText(idea.text); setCopied(true); setError(''); }
    catch { promptField.current?.focus(); promptField.current?.select(); setError('Panoya erişilemedi. Seçili promptu elle kopyalayabilirsin.'); }
  }
  async function reject() {
    if(!idea)return;const active=start();setBusy(true);
    try{await recordIdeaDecision(idea.id,'rejected',active.signal);if(!active.signal.aborted)onClose();}
    catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:'Kararın kaydedilemedi.');}
    finally{if(!active.signal.aborted)setBusy(false);}
  }
  const initialize=useEffectEvent(()=>historyOnly?loadHistory():draw());
  useEffect(()=>{mounted.current=true;const timer=window.setTimeout(()=>void initialize(),0);return()=>{window.clearTimeout(timer);mounted.current=false;controller.current?.abort();};},[]);
  const type=idea?.type||activeRequest.type;
  const project=type==='project'||type==='digital_project';
  const visual=type==='image_prompt',concept=visual&&(idea?.visualMode||activeRequest.visualMode)==='concept';
  const section=visual?'Visual Lab':type==='digital_project'?'Digital':type==='project'?'Create':type==='research'?'Research':type==='meal'?'Yemek fikri':type==='speaking'||type==='vocabulary'?'English':'Yeni bir ihtimal';
  const preparing=visual?(activeRequest.visualMode==='concept'?'Yeni bir görsel konsept hazırlanıyor.':activeRequest.visualMode==='variation'?'Aynı konunun yeni bir yorumu hazırlanıyor.':'Görsel promptun hazırlanıyor.'):project?'Yeni bir proje fikri hazırlanıyor.':'Yeni bir fikir hazırlanıyor.';
  const platforms={mobile_app:'Mobil uygulama',web_app:'Web uygulaması',desktop_app:'Masaüstü',game:'Oyun',browser_extension:'Tarayıcı eklentisi',plugin:'Eklenti',automation:'Otomasyon',interactive_experience:'İnteraktif deneyim'};
  const label=project?'Projelere ekle':idea?.type==='research'?'Bu konuyu seç':idea?.type==='meal'?'Bu yemeği seç':'Bu haftaya al';
  return <>
    <div className="rd-draw-brand"><Sparkle size={18}/><span>REBUILD <i>/</i> <strong>{section}</strong>{fromHistory&&<small>Geçmişten</small>}</span></div>
    {showHistory?<div className="rd-generation-history"><h2>{request.type==='surprise'?'Üretim':section} geçmişi.</h2><p>Bir kaydı açarak kaldığın yerden devam et.</p>
      {history.map(item=><button key={item.id} disabled={busy} onClick={()=>{setIdea(item);setFromHistory(true);setShowHistory(false);setError('');setGenerationFailed(false);setCopied(false);}}><span><strong>{item.title}</strong><small>{new Date(item.generatedAt).toLocaleDateString('tr-TR')} · {item.type==='image_prompt'?(item.visualMode==='concept'?'Konsept':item.visualMode==='variation'?'Varyasyon':'Görsel promptu'):item.status==='accepted'?'Kaydedildi':item.status==='skipped'?'Geçildi':item.status==='rejected'?'Reddedildi':'Üretildi'}</small></span><ArrowRight size={17}/></button>)}
      {!history.length&&!busy&&<p>Henüz üretilmiş bir fikir yok.</p>}{busy&&<p role="status">Geçmiş yükleniyor…</p>}{next&&<button disabled={busy} onClick={()=>void loadHistory(true)}>Daha eski kayıtlar</button>}
    </div>:<div className={`rd-idea-stage ${visual&&!concept?'rd-prompt-stage':''}`} aria-live="polite" aria-busy={busy||saving}>
      {idea&&<div className="rd-drawn-idea" key={idea.id}><span className="rd-kicker">{visual?concept?'Konsept':idea.visualMode==='variation'?'Varyasyon':'Görsel promptu':idea.platform?platforms[idea.platform]:idea.type==='meal'?'Ne yesem?':idea.kind} · {idea.domain}</span><h2>{idea.title}</h2>{visual&&!concept?<><textarea ref={promptField} readOnly aria-label="Görsel oluşturma promptu" value={idea.text}/><p className="rd-prompt-hint">İstediğin görsel üretim aracına kopyala. Bu alan görsel değil, prompt üretir.</p></>:<p className="rd-idea-description">{idea.text}</p>}{(busy||saving)&&<p className="rd-processing" role="status"><LoaderCircle size={17}/>{saving?(project?'Proje planın ve başlangıç adımların hazırlanıyor…':idea.type==='research'?'Bu konuya özel sorular hazırlanıyor…':'Kaydediliyor…'):preparing}</p>}</div>}
      {!idea&&<div className="rd-generation-message">{busy?<LoaderCircle className="rd-loading-icon" size={32}/>:<Sparkle size={32}/>}<h2>{busy?preparing:'Bu deneme tamamlanamadı.'}</h2><p>{busy?(visual?'Konu, atmosfer ve görsel ayrıntılar üzerinde çalışılıyor.':'Öneri hazırlanıyor ve önceki fikirlerle karşılaştırılıyor.'):'Aynı isteği tekrar deneyebilir veya geçmişteki kayıtlarını açabilirsin.'}</p></div>}
    </div>}
    {error&&<div className="rd-generation-error" role="alert"><p className="rd-error">{error}</p>{generationFailed&&idea&&<><p>Mevcut {concept?'konseptin':'fikrin'} korundu.</p><button className="rd-text-button" disabled={busy||saving} onClick={()=>void draw(idea,undefined,true)}><RotateCcw size={16}/> Aynı işlemi tekrar dene</button></>}{showHistory&&<button className="rd-text-button" disabled={busy} onClick={()=>void loadHistory()}>Geçmişi tekrar yükle</button>}</div>}
    <div className="rd-idea-bottom">
      {!showHistory&&idea&&<div className="rd-idea-actions">{visual?<button className="primary-button" disabled={busy||saving} onClick={()=>void(concept?draw(idea,'prompt'):copyPrompt())}>{concept?<Sparkle size={18}/>:copied?<Check size={18}/>:<Copy size={18}/>} {concept?'Prompta dönüştür':copied?'Kopyalandı':'Promptu kopyala'}</button>:<button className="primary-button" disabled={busy||saving} onClick={()=>void save()}>{saving?<LoaderCircle className="rd-loading-icon" size={18}/>:<Plus size={18}/>} {saving?'Hazırlanıyor…':idea.status==='accepted'?'Kaydı aç / geri yükle':label}</button>}<button className="rd-another" disabled={busy||saving} onClick={()=>void draw(idea)}><RotateCcw size={18}/>{visual?'Yeni konu':'Başka fikir'}</button></div>}
      {!showHistory&&!idea&&!busy&&<div className="rd-idea-actions"><button className="primary-button" onClick={()=>void draw(null,undefined,true)}><RotateCcw size={18}/> Tekrar dene</button></div>}
      <div className="rd-idea-secondary">{visual&&idea&&!showHistory&&<button className="rd-text-button" disabled={busy||saving} onClick={()=>void draw(idea,'variation')}>Varyasyon üret <Sparkle size={15}/></button>}{!showHistory&&<button className="rd-text-button" disabled={busy||saving} onClick={()=>void loadHistory()}><History size={15}/> Geçmiş</button>}{showHistory&&<button className="rd-text-button" disabled={busy} onClick={()=>void draw()}>Yeni {visual?'görsel fikri':'fikir'} üret <Sparkle size={15}/></button>}{idea&&!showHistory&&!visual&&idea.status!=='accepted'&&<button className="rd-text-button" disabled={busy||saving} onClick={()=>void reject()}>Bana göre değil</button>}</div>
      {!showHistory&&idea&&<span className="rd-idea-footnote">{visual?'Geçmişe otomatik kaydedildi.':idea.status==='accepted'?'Kaydedilmiş planın yeniden üretilmeden açılır.':project?'Seçtiğinde projeye özel plan, görevler ve akış diyagramı hazırlanır.':'Seçtiğinde kendi alanına kaydedilir.'}</span>}
    </div>
  </>;
}
