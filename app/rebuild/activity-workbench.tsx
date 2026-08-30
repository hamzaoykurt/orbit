'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Plus, Trash2, MapPin, Play, Pause, RotateCcw, Link2, FlaskConical } from 'lucide-react';
import { activityLabels, buildActivityEntry, createActivityDraft } from './activity-model';
import type { ActivityArea, ActivityDraft, ActivityEntry } from './activity-model';
import './activity-workbench.css';

type Props = { areaId: ActivityArea; title: string; date: string; onSave: (entry: ActivityEntry) => void };
export function ActivityWorkbench({ areaId, title, date, onSave }: Props) {
  const [draft, setDraft] = useState(() => createActivityDraft(areaId, title, date));
  const [error, setError] = useState('');
  const root = useRef<HTMLFormElement>(null);
  const saved = useRef(false);
  const [timer, setTimer] = useState({ started: 0, elapsed: 0 });
  const [now, setNow] = useState(0);
  const seconds = Math.floor((timer.elapsed + (timer.started ? Math.max(0, now - timer.started) : 0)) / 1000);
  useEffect(() => {
    if (!timer.started) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timer.started]);
  const labels = activityLabels[areaId];
  const update = <K extends keyof ActivityDraft>(key: K, value: ActivityDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = root.current?.closest('[role="dialog"]');
    const trapFocus = (event: Event) => {
      const key = event as KeyboardEvent;
      if (key.key !== 'Tab') return;
      const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,summary,[tabindex="0"]') ?? []).filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (key.shiftKey && document.activeElement === first) { key.preventDefault(); last?.focus(); }
      else if (!key.shiftKey && document.activeElement === last) { key.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener('keydown', trapFocus);
    root.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { dialog?.removeEventListener('keydown', trapFocus); previous?.focus(); };
  }, []);
  const field = (key: 'title' | 'note' | 'source' | 'next' | 'person' | 'prediction', label: string, placeholder: string, multiline = false) => <label className={`aw-field aw-${key}`}><span>{label}</span>{multiline ? <textarea value={draft[key]} onChange={event => update(key, event.target.value)} placeholder={placeholder}/> : <input value={draft[key]} onChange={event => update(key, event.target.value)} placeholder={placeholder} type={key === 'source' ? 'url' : 'text'}/>}</label>;
  const duration = <div className="aw-duration"><label><span>Gerçek süre</span><div><input aria-label="Harcanan dakika" type="number" min="0" max="1440" value={draft.duration || ''} placeholder="0" onChange={event => update('duration', Number(event.target.value))}/><span>dakika</span></div></label><div className="aw-time-presets">{[15,30,45,60].map(minutes => <button type="button" key={minutes} aria-pressed={draft.duration === minutes} onClick={() => update('duration', minutes)}>{minutes}</button>)}</div></div>;
  return <form ref={root} className={`activity-workbench aw-${areaId}`} noValidate onSubmit={event => {
    event.preventDefault(); if (saved.current) return;
    try {
      if (timer.started) throw new Error('Önce pratiği durdur; süreyi kaydına aktarabilirsin.');
      const entry = buildActivityEntry(draft); saved.current = true; onSave(entry);
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Kayıt tamamlanamadı.'); saved.current = false; }
  }}>
    <header className="aw-header"><span>{labels.name}</span><h2>{labels.title}</h2></header>
    {areaId === 'body' && <div className="aw-training"><section>{field('title', 'SEANS', 'Örn. Üst vücut · A')}<div className="aw-exercise-head"><span>Hareket</span><span>Set</span><span>Tekrar</span><span>Kg</span><span/></div><div className="aw-exercises">{draft.exercises.map((exercise,index) => <div className="aw-exercise" key={index}>{(['name','sets','reps','weight'] as const).map(key => <input key={key} aria-label={`${index + 1}. hareket ${key === 'name' ? 'adı' : key === 'sets' ? 'set' : key === 'reps' ? 'tekrar' : 'ağırlık'}`} placeholder={key === 'name' ? 'Hareket adı' : '—'} value={exercise[key]} inputMode={key === 'name' ? 'text' : 'decimal'} onChange={event => update('exercises', draft.exercises.map((row,i) => i === index ? { ...row, [key]: event.target.value } : row))}/>)}<button type="button" aria-label={`${index + 1}. hareketi kaldır`} onClick={() => update('exercises', draft.exercises.filter((_,i) => i !== index))}><Trash2 size={16}/></button></div>)}</div><button type="button" className="aw-text-button" onClick={() => update('exercises', [...draft.exercises, {name:'',sets:'',reps:'',weight:''}])}><Plus size={16}/> Hareket ekle</button><p className="aw-hint">Kardiyo veya yürüyüş yaptıysan hareketleri boş bırakabilirsin.</p></section><aside>{duration}{field('note', 'Vücudundan bir not', 'Nerede zorlandın, ne iyi geldi?', true)}<span className="aw-caption">Her seans bir puan değil, bir kayıt.</span></aside></div>}
    {areaId === 'curiosity' && <div className="aw-research">
      <section className="aw-question"><span className="aw-page-number">01 / SORU</span>{field('title', 'Merak ettiğin şey', 'Bir roket boşlukta nasıl ilerler?')}<p>Burada doğru cevap şart değil. Fikrini değiştiren şey de bir bulgu.</p>{field('source', 'Dayandığın kaynak · isteğe bağlı', 'https://…')}</section>
      <section className="aw-findings"><span className="aw-page-number">02 / ANLADIĞIM</span>{field('note', 'Kendi cümlelerinle', 'Şunu düşünüyordum… ama öğrendim ki…', true)}{field('next', '03 / Hâlâ merak ediyorum', 'Buradan hangi yeni soru çıktı?')}</section>
    </div>}
    {areaId === 'creativity' && <div className="aw-studio">
      <section className="aw-artifact"><span className="aw-page-number">ÇIKTI / 001</span>{field('title', 'Çalışmanın adı', 'Örn. Ay üssü kontrol ekranı')}<div className="aw-output-link"><Link2 size={26}/>{field('source', 'Çalışmana açılan bağlantı · isteğe bağlı', 'Figma, demo, video veya görsel bağlantısı')}</div>{field('note', 'Bu versiyonda ne değişti?', 'Denediğin fikri, verdiğin kararı veya takıldığın yeri bırak.', true)}</section>
      <aside><span className="aw-page-number">VERSİYONUN DURUMU</span><div className="aw-stages">{['Taslak','Deneme','Tamamlandı'].map((stage,index) => <button type="button" key={stage} aria-pressed={draft.stage === stage} onClick={() => update('stage', stage)}><span>0{index+1}</span>{stage}{draft.stage === stage && <Check size={16}/>}</button>)}</div>{duration}{field('next', 'Bir sonraki dokunuş', 'Neyi geliştireceksin?')}</aside>
    </div>}
    {(areaId === 'language' || areaId === 'expression') && <div className="aw-practice">
      <section className="aw-speaking">{field('title', 'KONU / EGZERSİZ', 'Bugün bir fikri İngilizce anlat')}<p className="aw-speaking-prompt">Kendi cümlelerinle anlat.<br/><span>Duraksamak serbest.</span></p><output className="aw-stopwatch" aria-label="Geçen pratik süresi">{String(Math.floor(seconds/60)).padStart(2,'0')}<span>:</span>{String(seconds%60).padStart(2,'0')}</output><div className="aw-timer-actions"><button type="button" className="aw-timer-toggle" onClick={() => { const time = Date.now(); setNow(time); setTimer(current => current.started ? { started:0, elapsed:current.elapsed+time-current.started } : { ...current, started:time }); }}>{timer.started ? <><Pause size={17}/> Duraklat</> : <><Play size={17}/> {timer.elapsed ? 'Devam et' : 'Pratiğe başla'}</>}</button><button type="button" aria-label="Sayacı sıfırla" onClick={() => { setTimer({started:0,elapsed:0}); setNow(0); }}><RotateCcw size={17}/></button></div><p className="aw-hint">Bu bir pratik sayacı; mikrofon açılmaz, ses kaydedilmez.</p>{!timer.started && seconds > 0 && <button type="button" className="aw-text-button" onClick={() => update('duration', Math.max(1, Math.ceil(seconds/60)))}>Bu süreyi kullan ({Math.max(1, Math.ceil(seconds/60))} dk) <ArrowRight size={15}/></button>}</section>
      <aside>{duration}{field('note', 'Tekrar söylemek istediğin cümle', 'Takıldığın ifadeyi veya yeni öğrendiğin bir kalıbı yaz.', true)}{field('next', 'Bir sonraki prova', 'Daha yavaş, daha net, başka bir konu…')}</aside>
    </div>}
    {areaId === 'solo' && <div className="aw-exploration">
      <section>{field('title', 'KEŞFİN ADI', 'Pazar günü başka bir semtte')}<div className="aw-route">{draft.stops.map((stop,index) => <div className="aw-stop" key={index}><span>{String(index+1).padStart(2,'0')}</span><input aria-label={`${index+1}. durak`} placeholder={index === 0 ? 'Nereden başladın?' : 'Sonraki durak'} value={stop} onChange={event => update('stops', draft.stops.map((value,i) => i === index ? event.target.value : value))}/><button type="button" aria-label={`${index+1}. durağı kaldır`} onClick={() => update('stops', draft.stops.filter((_,i) => i !== index))}><Trash2 size={16}/></button></div>)}</div><button type="button" className="aw-text-button" onClick={() => update('stops', [...draft.stops,''])}><MapPin size={17}/> Rotaya durak ekle</button></section>
      <aside className="aw-postcard"><span className="aw-page-number">KENDİME BİR KARTPOSTAL</span>{field('note', 'Aklında kalan bir an', 'Bir sokak, bir konuşma, daha önce fark etmediğin bir detay…', true)}{field('next', 'Bir dahaki sefere', 'Tekrar gelmek veya denemek istediğin şey')}</aside>
    </div>}
    {areaId === 'social' && <div className="aw-connection"><div className="aw-contact-line"><span className="aw-initial" aria-hidden="true">{draft.person.trim().slice(0,1).toLocaleUpperCase('tr') || '…'}</span>{field('person', 'KİMİNLE / HANGİ TOPLULUKLA?', 'Bir isim veya topluluk')}</div>{field('title', 'Nerede, nasıl bir araya geldiniz?', 'Fotoğraf kulübünde ilk buluşma')}{field('note', 'Hatırlamaya değer', 'Konuştuklarınızdan aklında kalan…', true)}<div className="aw-followup"><ArrowRight size={21}/>{field('next', 'Bağı devam ettirecek küçük adım', 'Örn. Konuştuğumuz kitabın adını gönder')}</div><p className="aw-hint">İnsanları puanlama. Bir sonraki sohbet için bir iz bırak.</p></div>}
    {areaId === 'career' && <div className="aw-career"><div className="aw-pipeline">{['Örnek iş','Paylaşıldı','Geri dönüş','Gelir'].map((stage,index) => <button type="button" key={stage} aria-pressed={draft.stage === stage} onClick={() => update('stage',stage)}><span>0{index+1}</span><strong>{stage}</strong>{draft.stage === stage ? <Check size={17}/> : <ArrowRight size={17}/>}</button>)}</div><div className="aw-career-detail"><section>{field('title', 'ŞU ANKİ DENEY', 'Bir işletme için tek sayfalık site')}{field('note', 'Dış dünyada ne oldu?', 'Kime ulaştın, ne sundun, nasıl bir yanıt geldi?', true)}{field('next', 'Bir sonraki somut hamle', 'Kime, ne zaman, ne göndereceksin?')}</section><aside>{duration}{field('source', 'İş / teklif bağlantısı · isteğe bağlı', 'https://…')}<p className="aw-hint">Sonuç gelmemesi de veri. Sadece gerçekleşen adımı kaydet.</p></aside></div></div>}
    {areaId === 'space' && <div className="aw-lab"><div className="aw-lab-title"><FlaskConical size={26}/>{field('title', 'DENEY / PROBLEM', 'Yörünge hızını değiştirince ne olur?')}</div><div className="aw-comparison"><section><span className="aw-page-number">A / BEKLENTİ</span>{field('prediction', 'Denemeden önceki tahminin', 'Şunu değiştirirsem…', true)}</section><section><span className="aw-page-number">B / GÖZLEM</span>{field('note', 'Gerçekte ne oldu?', 'Sonuç, ölçüm veya seni şaşırtan şey…', true)}</section></div><div className="aw-lab-bottom">{field('next', 'Bu işin hangi kısmını tekrar yapmak istersin?', 'Hesaplamak mı, simüle etmek mi, tasarlamak mı?')}{duration}</div></div>}
    <footer className="aw-footer"><label className="aw-date">Kayıt tarihi<input aria-label="Kayıt tarihi" type="date" value={draft.date} onChange={event => update('date', event.target.value)}/></label><button type="submit" className="aw-save">{labels.action}<Check size={18}/></button>{error && <p role="alert" className="aw-error">{error}</p>}</footer>
  </form>;
}
