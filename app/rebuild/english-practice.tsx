'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Play, RotateCcw, Sparkles, Trophy, Volume2 } from 'lucide-react';
import { acceptIdea, generateIdea, GENERATION_UNAVAILABLE } from './idea-engine';
import { acceptIntoPractice, dueWords, reviewWord } from './practice-model';
import type { Practice } from './practice-model';

const subscribeToSpeech=()=>()=>{};
export function EnglishPractice({practice,onUpdate}:{practice:Practice;onUpdate:(change:(current:Practice)=>Practice)=>void}) {
  const [now,setNow]=useState(Date.now),[error,setError]=useState(''),[busy,setBusy]=useState(false),[started,setStarted]=useState<number|null>(null),[selectedWordId,setSelectedWordId]=useState<string|null>(null);
  const pronunciation=useSyncExternalStore(subscribeToSpeech,()=> 'speechSynthesis' in window,()=>false);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30000);return()=>{window.clearInterval(timer);controller.current?.abort();};},[]);
  const due=dueWords(practice,now),learning=[...practice.words].filter(item=>item.successes<3).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)),mastered=practice.words.filter(item=>item.successes>=3);
  const activeWordId=learning.some(item=>item.id===selectedWordId)?selectedWordId:null;
  const word=learning.find(item=>item.id===activeWordId)||due.find(item=>item.successes<3)||learning[0];
  const xp=practice.words.reduce((sum,item)=>sum+Math.min(item.successes,3)*10,0)+practice.sessions.length*30,level=Math.floor(xp/100)+1,levelProgress=xp%100;
  const promptWords=(practice.speakingPrompt?.words||learning.slice(0,5).map(item=>item.word)).map(value=>practice.words.find(item=>item.word===value)).filter((item):item is Practice['words'][number]=>Boolean(item));
  const speak=(text:string)=>{if(!pronunciation)return;const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.82;speechSynthesis.cancel();speechSynthesis.speak(utterance);};
  async function vocabulary(){
    controller.current?.abort();const active=new AbortController();controller.current=active;setBusy(true);setError('');
    try{const idea=await generateIdea({type:'vocabulary',goal:'english',signal:active.signal});const accepted=await acceptIdea(idea.id,active.signal);if(!active.signal.aborted){onUpdate(current=>acceptIntoPractice(current,accepted));setNow(Date.now());}}
    catch(cause){if(!active.signal.aborted)setError(cause instanceof Error?cause.message:GENERATION_UNAVAILABLE);}finally{if(!active.signal.aborted)setBusy(false);}
  }
  async function speaking(){
    const words=(learning.length?learning:[...practice.words].reverse()).slice(0,5).map(word=>word.word);
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
    <header className="rd-english-dashboard"><div><span className="rd-kicker">BAŞLANGIÇ · A0 → A1</span><h3>Kelimeyi gör, söyle, cümlede kullan.</h3><p>Mentorunla konuşmadan önce burada kısa ve güvenli provalar yap.</p></div><div className="rd-level"><Trophy size={18}/><strong>Seviye {level}</strong><span>{xp} XP</span></div></header>
    <div className="rd-level-track" aria-label={`Seviye ${level} ilerlemesi: yüzde ${levelProgress}`}><i style={{width:`${levelProgress}%`}}/></div>
    <div className="rd-english-stats"><span><strong>{learning.length}</strong> öğreniliyor</span><span><strong>{mastered.length}</strong> öğrenildi</span><span><strong>{due.filter(item=>item.successes<3).length}</strong> bugün</span><span><strong>{practice.sessions.length}</strong> konuşma</span></div>
    {!!learning.length&&<div className="rd-learning-queue" aria-label="Öğrenme kuyruğu">{learning.map(item=><button key={item.id} className={item.id===word?.id?'selected':''} onClick={()=>setSelectedWordId(item.id)}><strong lang="en">{item.word}</strong><span>{item.meaning}</span><i aria-label={`${item.successes}/3 öğrenme adımı`}>{Array.from({length:3},(_,index)=><b className={index<item.successes?'filled':''} key={index}/>)}</i></button>)}</div>}
    {word?<article className="rd-word"><div><strong lang="en">{word.word}</strong><button className="rd-icon" aria-label={`${word.word} telaffuzunu dinle`} disabled={!pronunciation} onClick={()=>speak(word.word)}><Volume2 size={18}/></button></div><p>{word.meaning}</p><blockquote lang="en">{word.example}<button className="rd-icon" aria-label="Örnek cümleyi dinle" disabled={!pronunciation} onClick={()=>speak(word.example)}><Volume2 size={15}/></button></blockquote><div className="rd-detail-actions"><button className="rd-done-action" onClick={()=>{onUpdate(current=>reviewWord(current,word.id,true));if(word.successes>=2)setSelectedWordId(null);setNow(Date.now());}}><Check size={16}/> Hatırladım · +10 XP</button><button className="rd-text-button" onClick={()=>{onUpdate(current=>reviewWord(current,word.id,false));setSelectedWordId(word.id);setNow(Date.now());}}><RotateCcw size={16}/> Öğrenmeye devam</button></div><small>{word.successes}/3 adım · Ustalaşana kadar bu listede kalır.</small></article>:<p className="rd-inline-copy">{practice.words.length?'Tüm kelimelerde ustalaştın. Yeni bir beşli ekleyebilir veya konuşma provası yapabilirsin.':'İngilizcen sıfırdan başlayabilir. İlk beşli günlük, sık kullanılan kelimelerden oluşur.'}</p>}
    <button className="rd-add-words" disabled={busy} onClick={()=>void vocabulary()}><Sparkles size={16}/>{busy?'Başlangıç kelimeleri hazırlanıyor…':'5 yeni başlangıç kelimesi ekle'}</button>
    <div className="rd-speaking"><span className="rd-kicker">MENTORLA KONUŞMA PROVASI</span><h3>Önce örnekleri dinle, sonra kendi cümleni kur.</h3>{!!promptWords.length&&<div className="rd-speaking-examples">{promptWords.map(item=><div key={item.id}><span><strong lang="en">{item.word}</strong> · {item.meaning}</span><p lang="en">{item.example}</p><button className="rd-icon" aria-label={`${item.word} örneğini dinle`} disabled={!pronunciation} onClick={()=>speak(item.example)}><Volume2 size={14}/></button></div>)}</div>}{practice.speakingPrompt?<><div className="rd-speaking-prompt"><small>SORU</small><p lang="en">{practice.speakingPrompt.text}</p><button className="rd-icon" aria-label="Konuşma sorusunu dinle" disabled={!pronunciation} onClick={()=>speak(practice.speakingPrompt!.text)}><Volume2 size={17}/></button></div><p className="rd-practice-hint">2–3 kısa cümle yeterli. Hata yapmak serbest; amaç kelimeleri sesli kullanmak.</p>{started===null?<button className="rd-done-action" onClick={()=>setStarted(Date.now())}><Play size={16}/> Konuşma provasını başlat</button>:<div className="rd-detail-actions"><span role="status">Prova başladı.</span><button className="rd-done-action" onClick={finish}><Check size={16}/> Bitirdim · +30 XP</button><button className="rd-text-button" onClick={()=>setStarted(null)}>Vazgeç</button></div>}</>:<button className="rd-done-action" disabled={busy||!practice.words.length} onClick={()=>void speaking()}><Play size={16}/> Kelimelerimle kolay bir soru hazırla</button>}</div>
    {error&&<p className="rd-error" role="alert">{error}</p>}
    {!!practice.words.length&&<details className="rd-word-history"><summary>Tüm kelimeler · {practice.words.length}</summary>{practice.words.map(item=><div key={item.id}><strong lang="en">{item.word}</strong><span>{item.meaning}</span><small>{item.successes>=3?'Öğrenildi':`${item.successes}/3 adım · ${item.reviews} tekrar`}</small></div>)}</details>}
  </div>;
}
