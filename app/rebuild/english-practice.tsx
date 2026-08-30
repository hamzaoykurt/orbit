'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Play, RotateCcw, Volume2 } from 'lucide-react';
import { acceptIdea, generateIdea, GENERATION_UNAVAILABLE } from './idea-engine';
import { acceptIntoPractice, dueWords, reviewWord } from './practice-model';
import type { Practice } from './practice-model';

const subscribeToSpeech=()=>()=>{};
export function EnglishPractice({practice,onUpdate}:{practice:Practice;onUpdate:(change:(current:Practice)=>Practice)=>void}) {
  const [now,setNow]=useState(Date.now),[error,setError]=useState(''),[busy,setBusy]=useState(false),[started,setStarted]=useState<number|null>(null);
  const pronunciation=useSyncExternalStore(subscribeToSpeech,()=> 'speechSynthesis' in window,()=>false);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30000);return()=>{window.clearInterval(timer);controller.current?.abort();};},[]);
  const due=dueWords(practice,now),word=due[0];
  async function vocabulary(){
    controller.current?.abort();const active=new AbortController();controller.current=active;setBusy(true);setError('');
    try{const idea=await generateIdea({type:'vocabulary',goal:'english',signal:active.signal});const accepted=await acceptIdea(idea.id,active.signal);if(!active.signal.aborted){onUpdate(current=>acceptIntoPractice(current,accepted));setNow(Date.now());}}
    catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:GENERATION_UNAVAILABLE);}finally{if(!active.signal.aborted)setBusy(false);}
  }
  async function speaking(){
    const words=[...practice.words].sort((a,b)=>String(b.lastReviewedAt||b.addedAt).localeCompare(String(a.lastReviewedAt||a.addedAt))).slice(0,5).map(word=>word.word);
    if(!words.length)return;controller.current?.abort();const active=new AbortController();controller.current=active;setBusy(true);setError('');
    try{const idea=await generateIdea({type:'speaking',goal:'english',words,signal:active.signal});await acceptIdea(idea.id,active.signal);if(!active.signal.aborted)onUpdate(current=>({...current,speakingPrompt:{id:idea.id,text:idea.text,words}}));}
    catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:GENERATION_UNAVAILABLE);}finally{if(!active.signal.aborted)setBusy(false);}
  }
  function finish(){
    if(started===null||!practice.speakingPrompt)return;
    const prompt=practice.speakingPrompt;
    const session={id:crypto.randomUUID(),at:new Date().toISOString(),seconds:Math.max(1,Math.round((Date.now()-started)/1000)),prompt:prompt.text,words:prompt.words};
    onUpdate(current=>({...current,sessions:[...current.sessions,session],speakingPrompt:null}));setStarted(null);
  }
  return <div className="rd-english">
    <span className="rd-kicker">KELİME → HATIRLA → KULLAN → KONUŞ</span>
    {word?<article className="rd-word"><div><strong lang="en">{word.word}</strong><button className="rd-icon" aria-label={`${word.word} telaffuzunu dinle`} disabled={!pronunciation} onClick={()=>{const utterance=new SpeechSynthesisUtterance(word.word);utterance.lang='en-US';speechSynthesis.cancel();speechSynthesis.speak(utterance);}}><Volume2 size={18}/></button></div><p>{word.meaning}</p><blockquote lang="en">{word.example}</blockquote><div className="rd-detail-actions"><button className="rd-done-action" onClick={()=>{onUpdate(current=>reviewWord(current,word.id,true));setNow(Date.now());}}><Check size={16}/> Biliyorum</button><button className="rd-text-button" onClick={()=>{onUpdate(current=>reviewWord(current,word.id,false));setNow(Date.now());}}><RotateCcw size={16}/> Tekrar göster</button></div><small>{due.length} kelime sırada · Tekrar göster: 10 dakika sonra</small></article>:<p className="rd-inline-copy">{practice.words.length?'Şimdilik tekrarın yok. Kelimelerin zamanı gelince geri dönecek.':'Henüz kelimen yok. Beş günlük kelimeyle başlayabilirsin.'}</p>}
    <button className="rd-text-button" disabled={busy} onClick={()=>void vocabulary()}>{busy?'AI hazırlıyor…':'+ 5 yeni kelime getir'}</button>
    <div className="rd-speaking"><span className="rd-kicker">KONUŞMA</span>{practice.speakingPrompt?<><p lang="en">{practice.speakingPrompt.text}</p><small>Kullanmayı dene: {practice.speakingPrompt.words.join(' · ')}</small><p className="rd-practice-hint">Kendi kendine sesli konuş. Bu bir canlı AI sohbeti veya otomatik değerlendirme değil.</p>{started===null?<button className="rd-done-action" onClick={()=>setStarted(Date.now())}><Play size={16}/> Başla</button>:<div className="rd-detail-actions"><span role="status">Konuşma başladı.</span><button className="rd-done-action" onClick={finish}><Check size={16}/> Bitirdim</button><button className="rd-text-button" onClick={()=>setStarted(null)}>Vazgeç</button></div>}</>:<button className="rd-text-button" disabled={busy||!practice.words.length} onClick={()=>void speaking()}>Kelimelerimle konuşma sorusu getir</button>}</div>
    {error&&<p className="rd-error" role="alert">{error}</p>}
    {!!practice.words.length&&<details className="rd-word-history"><summary>Kelime geçmişi · {practice.words.length}</summary>{practice.words.map(item=><div key={item.id}><strong lang="en">{item.word}</strong><span>{item.meaning}</span><small>{item.reviews?`${item.reviews} tekrar · ${new Date(item.dueAt).toLocaleDateString('tr-TR')}`:'Yeni'}</small></div>)}</details>}
  </div>;
}
