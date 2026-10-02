'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Play, RotateCcw, Sparkles, Trophy, Volume2 } from 'lucide-react';
import { useNavigationState } from '../use-navigation';
import { acceptIdea, generateIdea, GENERATION_UNAVAILABLE } from './idea-engine';
import { acceptIntoPractice, dueWords, reviewWord } from './practice-model';
import type { Practice } from './practice-model';

const subscribeToSpeech=()=>()=>{};
export function EnglishPractice({practice,onUpdate}:{practice:Practice;onUpdate:(change:(current:Practice)=>Practice)=>void}) {
  const [now,setNow]=useState(Date.now),[error,setError]=useState(''),[busy,setBusy]=useState(false),[started,setStarted]=useState<number|null>(null),[selectedWordId,setSelectedWordId]=useState<string|null>(null);
  const [mode,setMode]=useNavigationState<'words'|'speaking'>('rebuild:english:mode','words');
  const [revealedWord,setRevealedWord]=useState<string|null>(null);
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
  function review(known:boolean){
    if(!word)return;
    onUpdate(current=>reviewWord(current,word.id,known));
    setSelectedWordId(known?(learning.find(item=>item.id!==word.id)?.id||null):word.id);
    setRevealedWord(null);setNow(Date.now());
  }
  return <div className="rd-english rx-english">
    <nav className="rx-practice-tabs" aria-label="İngilizce çalışması"><button aria-pressed={mode==='words'} onClick={()=>setMode('words')}>Kelime çalış</button><button aria-pressed={mode==='speaking'} onClick={()=>setMode('speaking')}>Konuşma provası</button></nav>
    {mode==='words'?<section className="rx-word-session">
      {word?<article className="rd-word rx-word">
        <div className="rx-word-top"><span className="rd-kicker">HATIRLA VE SÖYLE</span><small>{word.successes}/3 öğrenme adımı</small></div>
        <h3 lang="en">{word.word}</h3><button className="rd-text-button" disabled={!pronunciation} onClick={()=>speak(word.word)}><Volume2 size={17}/> Telaffuzu dinle</button>
        {revealedWord===word.id?<div className="rx-word-answer"><p>{word.meaning}</p><blockquote lang="en">{word.example}</blockquote><button className="rd-text-button" disabled={!pronunciation} onClick={()=>speak(word.example)}><Volume2 size={15}/> Örnek cümleyi dinle</button><p className="rx-hint">Şimdi kelimeyi kendi cümlende sesli kullan.</p><div className="rd-detail-actions"><button className="rd-done-action" onClick={()=>review(true)}><Check size={16}/> Hatırladım</button><button className="rd-text-button" onClick={()=>review(false)}><RotateCcw size={16}/> Tekrar çalışacağım</button></div></div>:<div className="rx-word-reveal"><p>Bu kelimenin anlamını hatırlıyor musun?</p><button className="rd-done-action" onClick={()=>setRevealedWord(word.id)}>Anlamı ve örneği göster</button></div>}
      </article>:<div className="rx-content-card"><h3>{practice.words.length?'Bu kelimeleri öğrendin.':'İlk kelimenle başla.'}</h3><p>{practice.words.length?'Konuşma provası yapabilir veya yeni kelimeler ekleyebilirsin.':'Günlük hayatta kullanılan beş kelimeyle başlayacağız. Ön bilgi gerekmiyor.'}</p><button className="rd-done-action" disabled={busy} onClick={()=>void vocabulary()}><Sparkles size={16}/>{busy?'Kelimeler hazırlanıyor…':practice.words.length?'5 yeni kelime ekle':'İlk 5 kelimeyi hazırla'}</button></div>}
      {!!practice.words.length&&<details className="rx-options"><summary>Kelime listem · {practice.words.length}</summary><div className="rd-learning-queue">{learning.map(item=><button key={item.id} className={item.id===word?.id?'selected':''} onClick={()=>{setSelectedWordId(item.id);setRevealedWord(null);}}><strong lang="en">{item.word}</strong><span>{item.meaning}</span><small>{item.successes}/3 adım</small></button>)}</div>{!!mastered.length&&<p className="rx-hint">Öğrenilenler: {mastered.map(item=>item.word).join(', ')}</p>}<button className="rd-text-button" disabled={busy} onClick={()=>void vocabulary()}><Sparkles size={16}/>{busy?'Hazırlanıyor…':'5 yeni kelime ekle'}</button></details>}
    </section>:<section className="rd-speaking rx-speaking"><span className="rd-kicker">SESLİ PROVA</span><h3>İki kısa cümle yeter.</h3><p className="rx-hint">Kelimelerini sesli kullan. Bu bir ses kaydı veya otomatik değerlendirme değil; kendi kendine pratik.</p>
      {practice.speakingPrompt?<><div className="rd-speaking-prompt"><small>KONUŞMA SORUN</small><p lang="en">{practice.speakingPrompt.text}</p><button className="rd-text-button" disabled={!pronunciation} onClick={()=>speak(practice.speakingPrompt!.text)}><Volume2 size={17}/> Soruyu dinle</button></div>{started===null?<button className="rd-done-action" onClick={()=>setStarted(Date.now())}><Play size={16}/> Provaya başla</button>:<div className="rd-detail-actions"><span role="status">Prova sürüyor. Hazır olduğunda bitir.</span><button className="rd-done-action" onClick={finish}><Check size={16}/> Provayı bitir</button><button className="rd-text-button" onClick={()=>setStarted(null)}>Vazgeç</button></div>}</>:<><button className="rd-done-action" disabled={busy||!practice.words.length} onClick={()=>void speaking()}><Play size={16}/>{busy?'Soru hazırlanıyor…':'Kelimelerimle bir soru hazırla'}</button>{!practice.words.length&&<p className="rx-hint">Önce Kelime çalış bölümünden ilk kelimelerini ekle.</p>}</>}
      {!!promptWords.length&&<details className="rx-options"><summary>Yardımcı kelimeler ve örnekler</summary><div className="rd-speaking-examples">{promptWords.map(item=><div key={item.id}><span><strong lang="en">{item.word}</strong> · {item.meaning}</span><p lang="en">{item.example}</p><button className="rd-icon" aria-label={`${item.word} örneğini dinle`} disabled={!pronunciation} onClick={()=>speak(item.example)}><Volume2 size={14}/></button></div>)}</div></details>}
    </section>}
    {error&&<p className="rd-error" role="alert">{error}</p>}
    <details className="rx-options rx-progress"><summary><Trophy size={15}/> İlerlemen · Seviye {level}</summary><div className="rd-level-track" aria-label={`Seviye ${level} ilerlemesi: yüzde ${levelProgress}`}><i style={{width:`${levelProgress}%`}}/></div><p>{xp} XP · {mastered.length} kelime öğrenildi · {practice.sessions.length} konuşma tamamlandı</p><small>Bu seviye çalışma puanını gösterir; dil yeterliliği ölçümü değildir.</small></details>
  </div>;
}
