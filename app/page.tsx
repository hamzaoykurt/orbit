'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Archive, ArrowRight, ArrowUpRight, Bell, BookOpen, BriefcaseBusiness,
  Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight,
  Circle, CircleDot, Clock3, Cloud, CloudOff, Command, Compass, Download, Dumbbell, Globe2,
  Heart, Home as HomeIcon, Languages, LayoutGrid, ListTodo, Map, MapPin,
  Menu, Mic, Moon, MoreHorizontal, NotebookPen, PanelsTopLeft, Palette,
  Plane, Play, Plus, Rocket, RotateCcw, Route, Search, Settings, ShoppingBag,
  Smartphone, Sparkles, Square, StickyNote, Trash2, Undo2, UserRound, Users,
  Volume2, X, Zap,
} from 'lucide-react';

type PageKey = 'home' | 'personal' | 'rebuild' | 'projects' | 'kibleteyn' | 'programs' | 'calendar' | 'notes' | 'archive' | 'settings';
type Note = { id: string; title: string; body: string; date: string; tone: string };
type PersistedState = {
  completed: Record<string, boolean>;
  customPersonal: Record<string, string[]>;
  projectStages: Record<string, number>;
  notes: Note[];
  settings: { notifications: boolean; motion: boolean; sound: boolean; autoArchive: boolean; accent: string };
};
type SyncStatus = 'loading' | 'saving' | 'synced' | 'offline';

const nav: { id: PageKey; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Ana Sayfa', icon: HomeIcon },
  { id: 'personal', label: 'Personal', icon: UserRound },
  { id: 'rebuild', label: '6 Aylık Rebuild', icon: Route },
  { id: 'projects', label: 'Projeler', icon: PanelsTopLeft },
  { id: 'kibleteyn', label: 'Kıbleteyn', icon: Building2 },
  { id: 'programs', label: 'Programlar', icon: Map },
  { id: 'calendar', label: 'Takvim', icon: CalendarDays },
  { id: 'notes', label: 'Notlar', icon: StickyNote },
  { id: 'archive', label: 'Arşiv', icon: Archive },
  { id: 'settings', label: 'Ayarlar', icon: Settings },
];

const defaultState: PersistedState = {
  completed: { 'routine-1': true, 'personal-1': true, 'program-14': true, 'project-pos-1': true, 'rebuild-2': true },
  customPersonal: { todo: [], buy: [], visit: [] },
  projectStages: {},
  notes: [
    { id: 'n1', title: 'Yol haritası notları', body: 'Sistemi büyütmeden önce her ekranın tek bir net işi olmalı. Sadelik, özellik eksikliği değil; doğru sıradır.', date: 'Bugün · 10:42', tone: 'violet' },
    { id: 'n2', title: 'Orbit Explorer fikri', body: 'Gezegenleri ölçekli yörüngelerde, dokunarak keşfedilen sakin bir deneyime dönüştür.', date: 'Dün · 22:18', tone: 'blue' },
    { id: 'n3', title: 'Eylül turu', body: 'Seminer içeriğinde ilk 15 dakikayı daha görsel ve daha kısa tut. Transfer detaylarını tekrar kontrol et.', date: '21 Ağu · 16:05', tone: 'sand' },
  ],
  settings: { notifications: true, motion: true, sound: false, autoArchive: true, accent: 'violet' },
};

function mergePersistedState(value: unknown): PersistedState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultState;
  const saved = value as Partial<PersistedState>;

  return {
    completed: { ...defaultState.completed, ...(saved.completed ?? {}) },
    customPersonal: {
      ...defaultState.customPersonal,
      ...(saved.customPersonal ?? {}),
    },
    projectStages: { ...defaultState.projectStages, ...(saved.projectStages ?? {}) },
    notes: Array.isArray(saved.notes) ? saved.notes : defaultState.notes,
    settings: { ...defaultState.settings, ...(saved.settings ?? {}) },
  };
}

const personalLists = {
  todo: { title: 'Yapılacaklar', icon: ListTodo, subtitle: 'Bugün ve yakında', items: ['Banka evraklarını düzenle', 'Pasaport randevusunu kontrol et', 'Haftalık değerlendirmeyi yaz', 'Çalışma masasını sadeleştir'] },
  buy: { title: 'Alınacaklar', icon: ShoppingBag, subtitle: 'İhtiyaç listesi', items: ['Yeni spor matı', 'USB-C hub', 'İngilizce çalışma kitabı', 'Kahve filtresi'] },
  visit: { title: 'Gezilecekler', icon: MapPin, subtitle: 'Kaydedilen yerler', items: ['İstanbul Modern', 'Atatürk Arboretumu', 'Pera Müzesi', 'Galata Mevlevihanesi'] },
};

const rebuildAreas: { title: string; icon: LucideIcon; progress: number; color: string; habits: string[] }[] = [
  { title: 'Beden', icon: Dumbbell, progress: 72, color: 'mint', habits: ['3 kuvvet antrenmanı', 'Günde 8.000 adım', 'Uyku saatini koru'] },
  { title: 'Merak ve Üretim', icon: Sparkles, progress: 64, color: 'violet', habits: ['Haftada 2 araştırma', 'Bir fikir prototipi', 'Öğrenme günlüğü'] },
  { title: 'Yaratıcılık', icon: Palette, progress: 58, color: 'rose', habits: ['30 dakika serbest üretim', 'Referans panosu', 'Haftalık mini çıktı'] },
  { title: 'İngilizce ve Diksiyon', icon: Languages, progress: 81, color: 'blue', habits: ['45 dakika konuşma', 'Gölgeleme egzersizi', '10 yeni kelime'] },
  { title: 'Sosyal Hayat', icon: Users, progress: 46, color: 'orange', habits: ['Bir arkadaşla buluş', 'Yeni bir etkinlik', 'Telefonsuz akşam'] },
  { title: 'Kariyer ve Para', icon: BriefcaseBusiness, progress: 69, color: 'sand', habits: ['Bütçe kontrolü', 'Portfolyo güncelle', 'Bir yeni bağlantı'] },
  { title: 'Uzay Mühendisliği Testi', icon: Rocket, progress: 35, color: 'indigo', habits: ['Temel fizik modülü', 'Orbit simülasyonu', 'Haftalık öz-değerlendirme'] },
];

const projectSeed = [
  { id: 'pos', title: 'Personal OS', stage: 1, progress: 68, color: 'violet', due: '31 Ağu', tags: ['Product', 'UI'], tasks: ['Navigasyon ve shell', 'Home etkileşimleri', 'Mobil görünüm', 'Demo veri sistemi'] },
  { id: 'orbit', title: 'Interactive Orbit Explorer', stage: 0, progress: 18, color: 'blue', due: '18 Eyl', tags: ['WebGL', 'Space'], tasks: ['Araştırma', 'Yörünge prototipi', 'Gezegen detayları'] },
  { id: 'future', title: 'Future UI Experiments', stage: 2, progress: 82, color: 'rose', due: '26 Ağu', tags: ['R&D'], tasks: ['Glass yüzeyler', 'Motion testleri', 'Dokunma geri bildirimi'] },
  { id: 'fitness', title: 'Fitness Uygulaması', stage: 0, progress: 12, color: 'mint', due: '03 Eki', tags: ['Mobile'], tasks: ['Kullanıcı akışı', 'Hareket kütüphanesi', 'İstatistik ekranı'] },
  { id: 'notes', title: 'Not Uygulaması', stage: 3, progress: 100, color: 'sand', due: 'Bitti', tags: ['Prototype'], tasks: ['Hızlı giriş', 'Etiketler', 'Arama'] },
];

const departments = [
  { id: 'general', title: 'Genel Operasyon', icon: Compass, progress: 74, summary: 'Süreçler, ekip akışı ve günlük koordinasyon', tasks: ['Haftalık operasyon planı', 'Tedarikçi görüşmeleri', 'Ekip görev dağılımı', 'Aylık maliyet kontrolü'] },
  { id: 'assistant', title: 'Turasistan', icon: Smartphone, progress: 61, summary: 'Tur operasyonlarını tek akışta yöneten ürün', tasks: ['Tur kartı revizyonu', 'Yolcu bildirimleri', 'Belge yükleme akışı', 'Pilot kullanıcı testi'] },
  { id: 'web', title: 'Web Sitesi', icon: Globe2, progress: 83, summary: 'Markanın dijital vitrini ve program sayfaları', tasks: ['Program filtreleri', 'Mobil hız kontrolü', 'Yeni görsel seçimi', 'Form dönüşüm takibi'] },
  { id: 'design', title: 'Tasarım', icon: Palette, progress: 56, summary: 'Kampanyalar, program görselleri ve marka sistemi', tasks: ['Eylül tur afişi', 'Sosyal medya seti', 'Sunum şablonu', 'Görsel arşiv düzeni'] },
];

const programCategories = [
  { name: 'Vize', count: 7, icon: NotebookPen }, { name: 'Diyanet', count: 16, icon: Building2 },
  { name: 'Seminer', count: 9, icon: Users }, { name: 'WhatsApp', count: 3, icon: Volume2 },
  { name: 'Diğer Hazırlıklar', count: 9, icon: ListTodo }, { name: '1 Gün Kala', count: 2, icon: Clock3 },
];

const programs = [
  { id: 'p1', title: '1–4 Eylül İstanbul', range: '1–4 EYL', people: 38, status: 'Hazırlanıyor', progress: 41, accent: 'violet' },
  { id: 'p2', title: '12–15 Eylül Bursa', range: '12–15 EYL', people: 24, status: 'Planlandı', progress: 22, accent: 'blue' },
  { id: 'p3', title: '3–7 Ekim Kudüs', range: '3–7 EKİ', people: 42, status: 'Taslak', progress: 12, accent: 'sand' },
];

const calendarEvents: Record<number, { title: string; tone: string }[]> = {
  3: [{ title: 'İngilizce pratik', tone: 'blue' }], 6: [{ title: 'Web yayını', tone: 'violet' }],
  10: [{ title: 'Spor', tone: 'mint' }], 14: [{ title: 'Tur toplantısı', tone: 'orange' }],
  18: [{ title: 'Orbit prototip', tone: 'blue' }], 23: [{ title: 'Haftalık kayıt', tone: 'violet' }, { title: 'Aile yemeği', tone: 'sand' }],
  26: [{ title: 'UI teslimi', tone: 'rose' }], 29: [{ title: 'Tur semineri', tone: 'orange' }],
};

function IconButton({ label, children, onClick, className = '' }: { label: string; children: React.ReactNode; onClick?: () => void; className?: string }) {
  return <button aria-label={label} title={label} onClick={onClick} className={`icon-button ${className}`}>{children}</button>;
}

function ProgressRing({ value, size = 'large' }: { value: number; size?: 'small' | 'large' }) {
  return <div className={`progress-ring ${size}`} style={{ '--progress': `${value * 3.6}deg` } as React.CSSProperties}><div><strong>{value}</strong><span>%</span></div></div>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

export default function PersonalOS() {
  const [active, setActive] = useState<PageKey>('home');
  const [state, setState] = useState<PersistedState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const lastSyncedState = useRef('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<'quick' | 'voice' | 'search' | 'note' | null>(null);
  const [toast, setToast] = useState('');
  const [expandedProject, setExpandedProject] = useState<string | null>('pos');
  const [expandedProgram, setExpandedProgram] = useState<string | null>('p1');
  const [expandedDepartment, setExpandedDepartment] = useState('general');
  const [personalTab, setPersonalTab] = useState<keyof typeof personalLists>('todo');
  const [rebuildArea, setRebuildArea] = useState('Beden');
  const [month, setMonth] = useState(2);
  const [selectedDay, setSelectedDay] = useState(23);
  const [calendarCursor, setCalendarCursor] = useState(new Date(2026, 7, 1));
  const [quickText, setQuickText] = useState('');
  const [noteDraft, setNoteDraft] = useState({ title: '', body: '' });
  const [noteSearch, setNoteSearch] = useState('');
  const [noteFilter, setNoteFilter] = useState<'all' | 'ideas' | 'logs'>('all');
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'project' | 'program' | 'note'>('all');
  const [settingsTab, setSettingsTab] = useState<'general' | 'appearance' | 'notifications' | 'data'>('general');
  const [searchText, setSearchText] = useState('');
  const [voiceStep, setVoiceStep] = useState<'idle' | 'listening' | 'done'>('idle');
  const [focusActive, setFocusActive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      let resolvedState = defaultState;

      try {
        const saved = localStorage.getItem('orbit-personal-os');
        if (saved) resolvedState = mergePersistedState(JSON.parse(saved));
        const savedPage = localStorage.getItem('orbit-active-page') as PageKey | null;
        if (savedPage && nav.some((item) => item.id === savedPage)) setActive(savedPage);
      } catch { /* corrupted local data falls back safely */ }

      try {
        const response = await fetch('/api/state', { cache: 'no-store' });
        if (!response.ok) throw new Error('D1 state request failed');
        const payload = await response.json() as { state?: unknown };
        if (payload.state) {
          resolvedState = mergePersistedState(payload.state);
          lastSyncedState.current = JSON.stringify(resolvedState);
        }
        if (!cancelled) setSyncStatus('synced');
      } catch {
        if (!cancelled) setSyncStatus('offline');
      }

      if (!cancelled) {
        setState(resolvedState);
        setHydrated(true);
      }
    }

    void hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const serializedState = JSON.stringify(state);
    localStorage.setItem('orbit-personal-os', serializedState);
    document.documentElement.dataset.accent = state.settings.accent;
    document.documentElement.classList.toggle('reduce-motion', !state.settings.motion);

    if (serializedState === lastSyncedState.current) return;
    const saveTimer = window.setTimeout(async () => {
      setSyncStatus('saving');
      try {
        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state }),
        });
        if (!response.ok) throw new Error('D1 state save failed');
        lastSyncedState.current = serializedState;
        setSyncStatus('synced');
      } catch {
        setSyncStatus('offline');
      }
    }, 650);

    return () => window.clearTimeout(saveTimer);
  }, [state, hydrated]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); setModal('search'); }
      if (event.key === 'Escape') { setModal(null); setMobileMenu(false); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  const go = (page: PageKey) => {
    setActive(page); setMobileMenu(false); localStorage.setItem('orbit-active-page', page); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggle = (id: string) => setState((current) => ({ ...current, completed: { ...current.completed, [id]: !current.completed[id] } }));

  const addQuick = () => {
    if (!quickText.trim()) return;
    setState((current) => ({ ...current, customPersonal: { ...current.customPersonal, todo: [...current.customPersonal.todo, quickText.trim()] } }));
    setQuickText(''); setModal(null); notify('Görev Personal listene eklendi.');
  };

  const addNote = () => {
    if (!noteDraft.title.trim()) return;
    const note = { id: `n-${Date.now()}`, title: noteDraft.title.trim(), body: noteDraft.body.trim() || 'Yeni not', date: 'Şimdi', tone: ['violet', 'blue', 'sand'][state.notes.length % 3] };
    setState((current) => ({ ...current, notes: [note, ...current.notes] }));
    setNoteDraft({ title: '', body: '' }); setModal(null); notify('Not kaydedildi.');
  };

  const startVoice = () => {
    setVoiceStep('listening');
    window.setTimeout(() => setVoiceStep('done'), 1800);
  };

  const acceptVoice = () => {
    setState((current) => ({ ...current, customPersonal: { ...current.customPersonal, todo: [...current.customPersonal.todo, 'Yarın 14:00 için tasarım değerlendirmesi'] } }));
    setVoiceStep('idle'); setModal(null); notify('Sesli komut demo görevi oluşturdu.');
  };

  const exportDemoData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'orbit-personal-os-verisi.json'; link.click();
    URL.revokeObjectURL(url);
    notify('Orbit verisi indirildi.');
  };

  const completedCount = Object.values(state.completed).filter(Boolean).length;
  const displayDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(2026, 7, 23));
  const syncLabel = syncStatus === 'synced' ? 'D1 senkronize' : syncStatus === 'saving' ? 'Kaydediliyor' : syncStatus === 'offline' ? 'Yerel mod' : 'Bağlanıyor';

  const renderHome = () => (
    <>
      <div className="home-heading"><span className="eyebrow">GÜNAYDIN, EMİR</span><h1>Bugünü hafif tut.<br/><span>Önemli olana odaklan.</span></h1></div>
      <div className="dashboard-grid">
        <article className={`surface focus-card ${focusActive ? 'is-focusing' : ''}`}>
          <div className="card-heading"><div><span className="eyebrow">BUGÜNÜN ODAĞI</span><h2>Personal OS<br/>ana akışını bitir</h2></div><span className="focus-number">01</span></div>
          <p>Günün geri kalanını sadeleştirecek tek önemli adım.</p>
          <div className="focus-actions"><button className="primary-button" onClick={() => { setFocusActive(!focusActive); notify(focusActive ? 'Odak oturumu duraklatıldı.' : '90 dakikalık odak oturumu başladı.'); }}>{focusActive ? <Square size={14}/> : <Play size={14} fill="currentColor"/>}<span>{focusActive ? 'Oturumu duraklat' : 'Odaklanmaya başla'}</span><ArrowUpRight size={16}/></button><span className="time-chip">{focusActive ? '89:42' : '90 dk'}</span></div>
          <div className="ambient-orb"><span/></div>
        </article>
        <article className="surface week-card">
          <div className="card-title-row"><div><span className="eyebrow">BU HAFTA</span><h3>İlerleme</h3></div><IconButton label="Rebuild sayfasına git" onClick={() => go('rebuild')}><ArrowUpRight size={16}/></IconButton></div>
          <div className="progress-wrap"><ProgressRing value={68}/><div className="progress-meta"><p><i className="dot violet"/> {Math.max(12, completedCount)} tamamlandı</p><p><i className="dot soft"/> 6 devam ediyor</p><button onClick={() => go('rebuild')}>Detayları gör <ChevronRight size={12}/></button></div></div>
        </article>
        <article className="surface today-card">
          <div className="card-title-row"><div><span className="eyebrow">AKIŞ</span><h3>Bugün</h3></div><button className="text-button" onClick={() => go('calendar')}>Tümünü gör</button></div>
          <div className="timeline">
            {[['09:00','Sabah rutini','Beden · 35 dk','routine-1'],['11:00','Personal OS arayüzü','Proje · 90 dk','routine-2'],['15:30','İngilizce pratik','Rebuild · 45 dk','routine-3']].map((row, index) => (
              <button key={row[3]} className={`time-row ${state.completed[row[3]] ? 'done' : ''} ${index === 1 ? 'current' : ''}`} onClick={() => toggle(row[3])}><time>{row[0]}</time><span className="line-dot"/><span><strong>{row[1]}</strong><small>{row[2]}</small></span>{state.completed[row[3]] ? <Check size={14}/> : index === 1 ? <b>Şimdi</b> : <MoreHorizontal size={14}/>}</button>
            ))}
          </div>
        </article>
        <article className="surface quick-card">
          <span className="eyebrow">HIZLI EKLE</span><h3>Aklındakini bırak.</h3>
          <div className="quick-actions"><button onClick={() => setModal('quick')}><ListTodo size={15}/> Görev</button><button onClick={() => setModal('note')}><StickyNote size={15}/> Not</button><button onClick={() => { setModal('note'); setNoteDraft({title:'Yeni fikir',body:''}); }}><Sparkles size={15}/> Fikir</button></div>
          <button className="voice-button" onClick={() => { setVoiceStep('idle'); setModal('voice'); }}><span><Mic size={16}/></span><span><strong>Sesli komut</strong><small>“Yarın için görev ekle...”</small></span><Volume2 size={17}/></button>
        </article>
      </div>
    </>
  );

  const renderPersonal = () => {
    const current = personalLists[personalTab];
    const items = [...current.items, ...state.customPersonal[personalTab]];
    const CurrentIcon = current.icon;
    return <>
      <PageTitle eyebrow="PERSONAL" title="Kendine ait alan." description="Günlük hayatın küçük yüklerini tek, sakin bir yerde tut." action={<button className="primary-button compact" onClick={() => setModal('quick')}><Plus size={15}/> Yeni ekle</button>}/>
      <div className="segmented-control">{(Object.keys(personalLists) as (keyof typeof personalLists)[]).map((key) => { const item = personalLists[key]; const TabIcon = item.icon; return <button key={key} onClick={() => setPersonalTab(key)} className={personalTab === key ? 'active' : ''}><TabIcon size={16}/>{item.title}<span>{item.items.length + state.customPersonal[key].length}</span></button>})}</div>
      <div className="personal-layout">
        <section className="surface personal-main">
          <div className="section-lead"><span className={`feature-icon ${personalTab}`}><CurrentIcon size={22}/></span><div><h2>{current.title}</h2><p>{current.subtitle}</p></div><span className="count-pill">{items.filter((_, index) => !state.completed[`personal-${personalTab}-${index}`]).length} açık</span></div>
          <div className="task-list">{items.map((item, index) => { const id = `personal-${personalTab}-${index}`; return <button key={`${item}-${index}`} className={`task-item ${state.completed[id] ? 'completed' : ''}`} onClick={() => toggle(id)}><span className="check-circle">{state.completed[id] && <Check size={13}/>}</span><span><strong>{item}</strong><small>{personalTab === 'visit' ? 'Kaydedilen yer' : index < 2 ? 'Bu hafta' : 'Daha sonra'}</small></span><MoreHorizontal size={16}/></button>})}</div>
          <button className="inline-add" onClick={() => setModal('quick')}><Plus size={15}/> Yeni öğe ekle</button>
        </section>
        <aside className="surface personal-insight"><span className="eyebrow">HAFTALIK DENGE</span><div className="balance-orbit"><span/><i/><b>74%</b></div><h3>İyi gidiyorsun.</h3><p>Açık öğelerin çoğu bu hafta için gerçekçi. Bugün sadece iki tanesini seçmen yeterli.</p><button onClick={() => go('calendar')}>Takvime yerleştir <ArrowRight size={14}/></button></aside>
      </div>
    </>;
  };

  const renderRebuild = () => (
    <>
      <PageTitle eyebrow="6 AYLIK REBUILD" title="Değişimi görünür kıl." description="Eylül'den Şubat'a; küçük ritimler, net kilometre taşları." action={<button className="ghost-button"><Download size={15}/> Haftalık kayıt</button>}/>
      <section className="surface roadmap-hero">
        <div className="roadmap-top"><div><span className="eyebrow">GENEL YOLCULUK</span><h2>6 ayda yeni bir düzen</h2></div><div className="roadmap-score"><strong>42</strong><span>% tamamlandı</span></div></div>
        <div className="roadmap-track"><span className="track-fill" style={{width:'42%'}}/>{['Eylül','Ekim','Kasım','Aralık','Ocak','Şubat'].map((label,index) => <button key={label} className={`${index <= 2 ? 'passed' : ''} ${month === index ? 'active' : ''}`} onClick={() => setMonth(index)}><i>{index < 2 ? <Check size={12}/> : index + 1}</i><strong>{label}</strong><small>{['Temel','Ritim','Derinleşme','Üretim','Açılım','Yeni düzen'][index]}</small></button>)}</div>
        <div className="month-focus"><span>{String(month+1).padStart(2,'0')}</span><div><small>{['EYLÜL','EKİM','KASIM','ARALIK','OCAK','ŞUBAT'][month]} ODAĞI</small><strong>{['Temel ritimleri kur','Sürekliliği güçlendir','Derin çalışmayı öğren','Görünür çıktılar üret','Sosyal alanı genişlet','Yeni düzeni kalıcılaştır'][month]}</strong></div><ProgressRing value={[68,54,31,12,0,0][month]} size="small"/></div>
      </section>
      <div className="rebuild-layout">
        <section><div className="section-header"><div><span className="eyebrow">BU HAFTA</span><h2>Odak alanları</h2></div><span>23–29 Ağustos</span></div><div className="area-grid">{rebuildAreas.map((area) => { const AreaIcon = area.icon; const open = rebuildArea === area.title; return <article key={area.title} className={`surface area-card ${open ? 'open' : ''}`}><button className="area-card-head" onClick={() => setRebuildArea(open ? '' : area.title)}><span className={`area-icon ${area.color}`}><AreaIcon size={19}/></span><span><strong>{area.title}</strong><small>{area.progress}% tamamlandı</small></span><b>{area.progress}%</b><ChevronDown size={16}/></button><div className="area-progress"><i style={{width:`${area.progress}%`}}/></div><div className="area-details">{area.habits.map((habit,index) => { const id = `rebuild-${area.title}-${index}`; return <button onClick={() => toggle(id)} key={habit} className={state.completed[id] ? 'completed' : ''}><span>{state.completed[id] && <Check size={11}/>}</span>{habit}</button>})}</div></article>})}</div></section>
        <aside className="surface weekly-log"><div className="card-title-row"><div><span className="eyebrow">HAFTALIK KAYITLAR</span><h3>Son üç hafta</h3></div><BookOpen size={18}/></div>{[['17–23 Ağu','Sakin ama üretken','82'],['10–16 Ağu','Ritim kuruluyor','71'],['3–9 Ağu','Başlangıç','63']].map((log,index)=><button key={log[0]}><span className={`log-dot n${index}`}/><span><strong>{log[0]}</strong><small>{log[1]}</small></span><b>{log[2]}</b><ChevronRight size={14}/></button>)}<button className="weekly-new" onClick={() => notify('Yeni haftalık kayıt şablonu açıldı.')}><Plus size={14}/> Bu haftayı kaydet</button></aside>
      </div>
    </>
  );

  const renderProjects = () => {
    const stages = ['Fikirler','Devam ediyor','İnceleme','Tamamlandı'];
    const allProjects = projectSeed.map((project) => ({ ...project, stage: state.projectStages[project.id] ?? project.stage }));
    return <>
      <PageTitle eyebrow="PROJELER" title="Fikirden gerçeğe." description="Tüm üretim yolculuğun; sade, görsel ve hareketli." action={<button className="primary-button compact" onClick={() => notify('Yeni proje taslağı oluşturuldu.')}><Plus size={15}/> Yeni proje</button>}/>
      <div className="project-summary"><div><span className="project-stat-icon violet"><LayoutGrid size={18}/></span><span><strong>5</strong><small>Aktif proje</small></span></div><div><span className="project-stat-icon mint"><Zap size={18}/></span><span><strong>68%</strong><small>Ortalama ilerleme</small></span></div><div><span className="project-stat-icon blue"><Clock3 size={18}/></span><span><strong>2</strong><small>Yaklaşan teslim</small></span></div></div>
      <div className="kanban-board">{stages.map((stage, stageIndex) => <section className="kanban-column" key={stage}><header><span><i className={`stage-dot s${stageIndex}`}/>{stage}</span><b>{allProjects.filter((p) => p.stage === stageIndex).length}</b><IconButton label="Sütun menüsü"><MoreHorizontal size={15}/></IconButton></header><div className="kanban-stack">{allProjects.filter((p) => p.stage === stageIndex).map((project) => <article key={project.id} className={`project-card tone-${project.color} ${expandedProject === project.id ? 'expanded' : ''}`}><button className="project-card-main" onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}><div className="project-cover"><span className="mini-orbit"/><i>{project.progress}%</i></div><div className="project-info"><span className="tag-row">{project.tags.map((tag) => <em key={tag}>{tag}</em>)}</span><h3>{project.title}</h3><div className="project-progress"><i style={{width:`${project.progress}%`}}/></div><span className="project-meta"><small><Clock3 size={11}/>{project.due}</small><small>{project.tasks.filter((_,i)=>state.completed[`project-${project.id}-${i}`]).length}/{project.tasks.length} görev</small></span></div></button><div className="project-subtasks">{project.tasks.map((task,index) => { const id=`project-${project.id}-${index}`; return <button key={task} onClick={() => toggle(id)} className={state.completed[id]?'completed':''}><span>{state.completed[id]&&<Check size={10}/>}</span>{task}</button>})}<button className="move-project" disabled={stageIndex === 3} onClick={() => { setState((current)=>({...current,projectStages:{...current.projectStages,[project.id]:Math.min(3,stageIndex+1)}})); notify(stageIndex === 2 ? 'Proje tamamlandı ve arşive hazır.' : 'Proje bir sonraki aşamaya taşındı.'); }}>{stageIndex === 3 ? 'Tamamlandı' : `${stages[stageIndex+1]} aşamasına taşı`}<ArrowRight size={13}/></button></div></article>)}</div><button className="add-card" onClick={() => notify(`${stage} sütununa yeni kart eklenebilir.`)}><Plus size={14}/> Kart ekle</button></section>)}</div>
    </>;
  };

  const renderKibleteyn = () => {
    const current = departments.find((item) => item.id === expandedDepartment)!;
    const CurrentIcon = current.icon;
    return <>
      <PageTitle eyebrow="KIBLETEYN" title="Operasyonun nabzı." description="Ekip, ürün ve tasarım akışları tek bir sakin görünümde." action={<button className="ghost-button"><Users size={15}/> Ekip görünümü</button>}/>
      <section className="surface operation-hero"><div><span className="status-chip"><i/> Operasyon aktif</span><h2>Bu hafta netlik yüksek.</h2><p>4 çalışma alanında 28 görev ilerliyor. Kritik blokaj görünmüyor.</p><div className="operation-stats"><span><strong>28</strong><small>Açık görev</small></span><span><strong>11</strong><small>Tamamlanan</small></span><span><strong>4</strong><small>Ekip alanı</small></span></div></div><div className="operation-visual"><span className="orbit o1"/><span className="orbit o2"/><span className="core"><Building2 size={28}/></span><i className="node n1"/><i className="node n2"/><i className="node n3"/></div></section>
      <div className="department-tabs">{departments.map((department)=>{const DepartmentIcon=department.icon;return <button key={department.id} onClick={()=>setExpandedDepartment(department.id)} className={expandedDepartment===department.id?'active':''}><span><DepartmentIcon size={18}/></span><strong>{department.title}</strong><small>{department.progress}%</small></button>})}</div>
      <section className="surface department-detail"><div className="department-lead"><span className="department-big-icon"><CurrentIcon size={24}/></span><div><span className="eyebrow">AKTİF ÇALIŞMA ALANI</span><h2>{current.title}</h2><p>{current.summary}</p></div><ProgressRing value={current.progress} size="small"/></div><div className="department-task-grid">{current.tasks.map((task,index)=>{const id=`dept-${current.id}-${index}`;return <button key={task} onClick={()=>toggle(id)} className={state.completed[id]?'completed':''}><span>{state.completed[id]?<Check size={13}/>:<Circle size={13}/>}</span><span><strong>{task}</strong><small>{index < 2 ? 'Bu hafta' : 'Sırada'}</small></span><ChevronRight size={14}/></button>})}</div></section>
    </>;
  };

  const renderPrograms = () => (
    <>
      <PageTitle eyebrow="PROGRAMLAR" title="Her turun kendi ritmi." description="Kalabalık listeler yerine, aşama aşama açılan net hazırlık kartları." action={<button className="primary-button compact" onClick={()=>notify('Yeni tur programı taslağı hazır.')}><Plus size={15}/> Yeni tur</button>}/>
      <div className="program-overview"><div><Plane size={20}/><span><strong>3</strong><small>Yaklaşan tur</small></span></div><div><Users size={20}/><span><strong>104</strong><small>Toplam yolcu</small></span></div><div><CheckCircle2 size={20}/><span><strong>62</strong><small>Tamamlanan hazırlık</small></span></div></div>
      <div className="program-stack">{programs.map((program)=>{const open=expandedProgram===program.id;const done=programCategories.reduce((sum,cat,catIndex)=>sum+Array.from({length:cat.count}).filter((_,taskIndex)=>state.completed[`program-${program.id}-${catIndex}-${taskIndex}`]).length,0);const total=programCategories.reduce((sum,cat)=>sum+cat.count,0);return <article key={program.id} className={`surface program-card ${open?'open':''}`}><button className="program-head" onClick={()=>setExpandedProgram(open?null:program.id)}><span className={`program-date ${program.accent}`}><strong>{program.range.split(' ')[0]}</strong><small>{program.range.split(' ').slice(1).join(' ')}</small></span><span className="program-name"><em>{program.status}</em><h2>{program.title}</h2><small><Users size={12}/>{program.people} yolcu</small></span><span className="program-progress"><strong>{Math.max(program.progress,Math.round(done/total*100))}%</strong><i><b style={{width:`${Math.max(program.progress,Math.round(done/total*100))}%`}}/></i><small>{done}/{total} kontrol</small></span><span className="program-chevron"><ChevronDown size={19}/></span></button><div className="program-content"><div className="category-grid">{programCategories.map((category,catIndex)=>{const CategoryIcon=category.icon;const catDone=Array.from({length:category.count}).filter((_,taskIndex)=>state.completed[`program-${program.id}-${catIndex}-${taskIndex}`]).length;return <details key={category.name} open={catIndex===0&&open}><summary><span className={`category-icon c${catIndex}`}><CategoryIcon size={17}/></span><span><strong>{category.name}</strong><small>{catDone}/{category.count} tamamlandı</small></span><b>{Math.round(catDone/category.count*100)}%</b><ChevronDown size={14}/></summary><div className="category-tasks">{Array.from({length:Math.min(category.count,4)}).map((_,taskIndex)=>{const id=`program-${program.id}-${catIndex}-${taskIndex}`;const taskNames=['Belge kontrolü','Yolcu teyidi','Son tarih kontrolü','Sorumlu onayı'];return <button key={id} onClick={()=>toggle(id)} className={state.completed[id]?'completed':''}><span>{state.completed[id]&&<Check size={10}/>}</span>{taskNames[taskIndex]}<small>{taskIndex===0?'Bugün':'Bu hafta'}</small></button>})}<button className="show-all">Tüm {category.count} öğeyi gör <ArrowRight size={12}/></button></div></details>})}</div></div></article>})}</div>
    </>
  );

  const renderCalendar = () => {
    const year = calendarCursor.getFullYear();
    const monthIndex = calendarCursor.getMonth();
    const monthName = new Intl.DateTimeFormat('tr-TR', { month: 'long' }).format(calendarCursor);
    const titleMonth = monthName.charAt(0).toLocaleUpperCase('tr') + monthName.slice(1);
    const days = Array.from({length:new Date(year, monthIndex + 1, 0).getDate()},(_,i)=>i+1);
    const leadingDays = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    const isDemoMonth = year === 2026 && monthIndex === 7;
    const selectedEvents = isDemoMonth ? (calendarEvents[selectedDay] || []) : [];
    const changeMonth = (delta: number) => { setCalendarCursor(new Date(year, monthIndex + delta, 1)); setSelectedDay(1); };
    const goToday = () => { setCalendarCursor(new Date(2026, 7, 1)); setSelectedDay(23); };
    const selectedWeekday = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(new Date(year, monthIndex, selectedDay));
    return <>
      <PageTitle eyebrow="TAKVİM" title="Zamana biraz boşluk bırak." description={`${titleMonth} ${year} · Planların ve ritimlerin tek görünümü.`} action={<button className="primary-button compact" onClick={()=>setModal('quick')}><Plus size={15}/> Etkinlik ekle</button>}/>
      <div className="calendar-layout"><section className="surface calendar-card"><header><div><IconButton label="Önceki ay" onClick={()=>changeMonth(-1)}><ChevronRight className="flip" size={16}/></IconButton><h2>{titleMonth} <span>{year}</span></h2><IconButton label="Sonraki ay" onClick={()=>changeMonth(1)}><ChevronRight size={16}/></IconButton></div><button className="today-button" onClick={goToday}>Bugün</button></header><div className="calendar-weekdays">{['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map((day)=><span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({length:leadingDays},(_,i)=><span className="empty-day" key={`empty-${i}`}/>)}{days.map((day)=>{const events=isDemoMonth?(calendarEvents[day]||[]):[];return <button key={day} onClick={()=>setSelectedDay(day)} className={`${isDemoMonth&&day===23?'today':''} ${selectedDay===day?'selected':''}`}><span>{day}</span><div>{events.slice(0,2).map((event)=><i key={event.title} className={event.tone}>{event.title}</i>)}</div></button>})}</div></section><aside className="surface day-panel"><span className="eyebrow">SEÇİLİ GÜN</span><div className="day-number"><strong>{selectedDay}</strong><span>{titleMonth}<br/>{year}</span></div><h3>{selectedWeekday.charAt(0).toLocaleUpperCase('tr')+selectedWeekday.slice(1)}</h3><div className="day-events">{selectedEvents.length?selectedEvents.map((event,index)=><button key={event.title}><i className={event.tone}/><span><strong>{event.title}</strong><small>{index===0?'10:30 · 45 dk':'19:00 · 90 dk'}</small></span><MoreHorizontal size={14}/></button>):<div className="empty-state"><CalendarDays size={24}/><p>Bu gün henüz boş.<br/>Biraz nefes iyi gelebilir.</p></div>}</div><button className="inline-add" onClick={()=>setModal('quick')}><Plus size={14}/> Bu güne ekle</button></aside></div>
    </>;
  };

  const renderNotes = () => {
    const filteredNotes = state.notes.filter((note) => {
      const matchesSearch = `${note.title} ${note.body}`.toLocaleLowerCase('tr').includes(noteSearch.toLocaleLowerCase('tr'));
      const matchesFilter = noteFilter === 'all' || (noteFilter === 'ideas' && note.tone === 'blue') || (noteFilter === 'logs' && note.tone === 'violet');
      return matchesSearch && matchesFilter;
    });
    return <>
      <PageTitle eyebrow="NOTLAR" title="Düşüncelerin için sessiz alan." description="Fikirler, kayıtlar ve küçük keşifler; sade ve aranabilir." action={<button className="primary-button compact" onClick={()=>setModal('note')}><Plus size={15}/> Yeni not</button>}/>
      <div className="notes-toolbar"><div className="search-field"><Search size={15}/><input aria-label="Notlarda ara" placeholder="Notlarda ara..." value={noteSearch} onChange={(event)=>setNoteSearch(event.target.value)}/>{noteSearch&&<button aria-label="Not aramasını temizle" onClick={()=>setNoteSearch('')}><X size={13}/></button>}</div><div className="note-filters"><button className={noteFilter==='all'?'active':''} onClick={()=>setNoteFilter('all')}>Tümü</button><button className={noteFilter==='ideas'?'active':''} onClick={()=>setNoteFilter('ideas')}>Fikirler</button><button className={noteFilter==='logs'?'active':''} onClick={()=>setNoteFilter('logs')}>Kayıtlar</button></div></div>
      <div className="notes-grid"><button className="new-note-card" onClick={()=>setModal('note')}><span><Plus size={23}/></span><strong>Yeni düşünce</strong><small>Yazmaya başla</small></button>{filteredNotes.map((note)=><article key={note.id} className={`note-card surface ${note.tone}`}><div className="note-card-top"><span>{note.tone==='violet'?'KAYIT':note.tone==='blue'?'FİKİR':'NOT'}</span><IconButton label="Not menüsü"><MoreHorizontal size={15}/></IconButton></div><h2>{note.title}</h2><p>{note.body}</p><footer><span>{note.date}</span><button aria-label="Notu sil" onClick={()=>{setState((current)=>({...current,notes:current.notes.filter((item)=>item.id!==note.id)}));notify('Not arşive taşındı.')}}><Trash2 size={14}/></button></footer></article>)}</div>
      {!filteredNotes.length&&<div className="notes-empty"><Search size={21}/><strong>Eşleşen not yok.</strong><span>Aramayı veya filtreyi değiştirebilirsin.</span></div>}
    </>;
  };

  const renderArchive = () => {
    const archiveItems = [
      { title:'Not Uygulaması', type:'project', label:'Proje', date:'12 Ağustos 2026' },
      { title:'Temmuz İstanbul Programı', type:'program', label:'Program', date:'28 Temmuz 2026' },
      { title:'Eski portfolyo fikirleri', type:'note', label:'Not koleksiyonu', date:'16 Temmuz 2026' },
      { title:'Motion Study 01', type:'project', label:'Proje', date:'03 Temmuz 2026' },
      { title:'Fitness Flow v1', type:'project', label:'Proje', date:'22 Haziran 2026' },
      { title:'Haziran Bursa Programı', type:'program', label:'Program', date:'18 Haziran 2026' },
      { title:'Rebuild başlangıç kayıtları', type:'note', label:'Haftalık kayıt', date:'10 Haziran 2026' },
      { title:'İçerik fikirleri — Bahar', type:'note', label:'Not koleksiyonu', date:'02 Haziran 2026' },
    ];
    const visibleItems = archiveFilter === 'all' ? archiveItems : archiveItems.filter((item)=>item.type===archiveFilter);
    return <>
      <PageTitle eyebrow="ARŞİV" title="Tamamlananlar burada dinlenir." description="Geçmiş projeler, turlar ve kayıtlar; ihtiyaç olduğunda bir tık uzağında."/>
      <div className="archive-tabs"><button className={archiveFilter==='all'?'active':''} onClick={()=>setArchiveFilter('all')}>Tümü <span>8</span></button><button className={archiveFilter==='project'?'active':''} onClick={()=>setArchiveFilter('project')}>Projeler <span>3</span></button><button className={archiveFilter==='program'?'active':''} onClick={()=>setArchiveFilter('program')}>Programlar <span>2</span></button><button className={archiveFilter==='note'?'active':''} onClick={()=>setArchiveFilter('note')}>Notlar <span>3</span></button></div>
      <div className="archive-list">{visibleItems.map((item,index)=><article className="surface archive-item" key={item.title}><span className={`archive-icon a${index%4}`}>{item.type==='program'?<Plane size={18}/>:item.type==='note'?<StickyNote size={18}/>:<LayoutGrid size={18}/>}</span><span><strong>{item.title}</strong><small>{item.label} · {item.date}</small></span><em>Tamamlandı</em><button onClick={()=>notify(`${item.title} geri yüklendi.`)}><Undo2 size={14}/> Geri yükle</button><IconButton label="Arşiv öğesi menüsü"><MoreHorizontal size={15}/></IconButton></article>)}</div>
      <div className="archive-quote"><Archive size={22}/><p>Bitirdiğin her şey, kurduğun sistemin bir parçası.</p><span>{visibleItems.length} öğe · Son güncelleme bugün</span></div>
    </>;
  };

  const updateSetting = (key: keyof PersistedState['settings'], value: boolean | string) => setState((current)=>({...current,settings:{...current.settings,[key]:value}}));

  const renderSettings = () => (
    <>
      <PageTitle eyebrow="AYARLAR" title="Orbit sana uyum sağlasın." description="Görünümü, bildirimleri ve çalışma biçimini kişiselleştir."/>
      <div className="settings-layout"><nav className="surface settings-nav"><button className={settingsTab==='general'?'active':''} onClick={()=>setSettingsTab('general')}><UserRound size={16}/> Genel</button><button className={settingsTab==='appearance'?'active':''} onClick={()=>setSettingsTab('appearance')}><Palette size={16}/> Görünüm</button><button className={settingsTab==='notifications'?'active':''} onClick={()=>setSettingsTab('notifications')}><Bell size={16}/> Bildirimler</button><button className={settingsTab==='data'?'active':''} onClick={()=>setSettingsTab('data')}><Download size={16}/> Veri</button></nav><div className="settings-content">
        {settingsTab==='general'&&<><section className="surface settings-section"><div className="settings-profile"><div className="large-avatar">EG</div><div><h2>Emir Güney</h2><p>Kişisel çalışma alanı</p></div><button onClick={()=>notify('Profil bilgileri düzenlemeye hazır.')}>Düzenle</button></div></section><section className="surface settings-section"><header><h3>Çalışma alanı</h3><p>Orbit’in temel bilgileri ve yerel kayıt durumu.</p></header><div className="setting-row"><span className="setting-icon"><Smartphone size={17}/></span><span><strong>Bu cihaz</strong><small>Değişiklikler bu tarayıcıda otomatik saklanıyor</small></span><CheckCircle2 size={18} className="setting-ok"/></div><div className="setting-row"><span className="setting-icon"><Globe2 size={17}/></span><span><strong>Dil ve bölge</strong><small>Türkçe · Europe/Istanbul</small></span><button className="setting-link" onClick={()=>notify('Türkçe ve İstanbul saat dilimi aktif.')}>Kontrol et</button></div></section></>}
        {settingsTab==='appearance'&&<section className="surface settings-section"><header><h3>Görünüm ve deneyim</h3><p>Orbit’in nasıl hissettirdiğini seç.</p></header><div className="setting-row"><span className="setting-icon"><Palette size={17}/></span><span><strong>Vurgu rengi</strong><small>Arayüzdeki odak rengi</small></span><div className="color-options">{['violet','blue','mint','sand'].map((color)=><button aria-label={`${color} vurgu rengi`} key={color} className={`${color} ${state.settings.accent===color?'selected':''}`} onClick={()=>updateSetting('accent',color)}/>)}</div></div><SettingToggle icon={Sparkles} title="Hareket ve animasyon" description="Yumuşak geçişleri ve mikro animasyonları kullan" value={state.settings.motion} onChange={(value)=>updateSetting('motion',value)}/><SettingToggle icon={Volume2} title="Arayüz sesleri" description="Tamamlama anlarında hafif ses geri bildirimi" value={state.settings.sound} onChange={(value)=>updateSetting('sound',value)}/></section>}
        {settingsTab==='notifications'&&<section className="surface settings-section"><header><h3>Akış ve bildirimler</h3><p>Sistem senin adına ne kadar takip etsin?</p></header><SettingToggle icon={Bell} title="Akıllı hatırlatmalar" description="Yaklaşan görev ve programlar için sakin bildirimler" value={state.settings.notifications} onChange={(value)=>updateSetting('notifications',value)}/><SettingToggle icon={Archive} title="Otomatik arşiv" description="Tamamlanan öğeleri 7 gün sonra arşivle" value={state.settings.autoArchive} onChange={(value)=>updateSetting('autoArchive',value)}/></section>}
        {settingsTab==='data'&&<><section className="surface settings-section"><header><h3>Verini dışa aktar</h3><p>Orbit’teki yerel demo verisinin taşınabilir bir kopyasını al.</p></header><button className="data-export" onClick={exportDemoData}><Download size={16}/><span><strong>JSON yedeğini indir</strong><small>Görevler, notlar, proje aşamaları ve tercihler</small></span><ArrowRight size={15}/></button></section><section className="surface settings-section danger-section"><header><h3>Demo verisi</h3><p>Yerel değişiklikleri silip başlangıç verisine dön.</p></header><button onClick={()=>{if(window.confirm('Tüm yerel demo değişiklikleri sıfırlansın mı?')){setState(defaultState);notify('Demo verisi sıfırlandı.')}}}><RotateCcw size={15}/> Demo verisini sıfırla</button></section></>}
      </div></div>
    </>
  );

  const renderPage = () => {
    switch (active) {
      case 'personal': return renderPersonal(); case 'rebuild': return renderRebuild(); case 'projects': return renderProjects();
      case 'kibleteyn': return renderKibleteyn(); case 'programs': return renderPrograms(); case 'calendar': return renderCalendar();
      case 'notes': return renderNotes(); case 'archive': return renderArchive(); case 'settings': return renderSettings(); default: return renderHome();
    }
  };

  const searchResults = useMemo(() => nav.filter((item)=>item.label.toLocaleLowerCase('tr').includes(searchText.toLocaleLowerCase('tr'))),[searchText]);

  return <main className="app-shell">
    <div className="ambient-background" aria-hidden="true"><i/><i/><i/></div>
    <aside className={`sidebar ${mobileMenu?'open':''}`}><div className="brand-row"><button className="brand" onClick={()=>go('home')}><span className="brand-mark"><CircleDot size={18}/></span><span>Orbit<small>PERSONAL OS</small></span></button><IconButton label="Menüyü kapat" className="mobile-close" onClick={()=>setMobileMenu(false)}><X size={18}/></IconButton></div><nav className="side-nav" aria-label="Ana navigasyon">{nav.map((item,index)=>{const NavIcon=item.icon;return <button key={item.id} className={active===item.id?'active':''} onClick={()=>go(item.id)}><span><NavIcon size={17}/></span>{item.label}{index===5&&<em>3</em>}</button>})}</nav><button className="sidebar-upgrade" onClick={()=>setModal('voice')}><span><Sparkles size={17}/></span><span><strong>Orbit Assistant</strong><small>Sesli komutu dene</small></span><ArrowUpRight size={14}/></button><div className="sidebar-profile"><div className="avatar">EG</div><span><strong>Emir Güney</strong><small>Kişisel çalışma alanı</small></span><MoreHorizontal size={16}/></div></aside>
    {mobileMenu&&<button aria-label="Menüyü kapat" className="menu-backdrop" onClick={()=>setMobileMenu(false)}/>} 
    <section className="workspace"><header className="topbar"><IconButton label="Menüyü aç" className="menu-trigger" onClick={()=>setMobileMenu(true)}><Menu size={19}/></IconButton><div className="date-pill"><i/>{displayDate}</div><div className="top-actions"><div className="sync-pill" data-status={syncStatus} title={`Cloudflare D1 · ${syncLabel}`}>{syncStatus === 'offline' ? <CloudOff size={13}/> : <Cloud size={13}/>}<span>{syncLabel}</span></div><button className="search-trigger" onClick={()=>setModal('search')}><Search size={15}/><span>Ara...</span><kbd>/</kbd></button><IconButton label="Sesli komut" onClick={()=>setModal('voice')}><Mic size={16}/></IconButton><IconButton label="Bildirimler" onClick={()=>notify('Yeni bildirimin yok.')}><Bell size={16}/><i className="notification-dot"/></IconButton></div></header><div key={active} className={`content page-${active}`}>{renderPage()}</div></section>
    <nav className="bottom-nav" aria-label="Mobil navigasyon">{nav.slice(0,4).map((item)=>{const NavIcon=item.icon;return <button key={item.id} onClick={()=>go(item.id)} className={active===item.id?'active':''}><NavIcon size={19}/><small>{item.label==='Ana Sayfa'?'Ana':item.label==='6 Aylık Rebuild'?'Rebuild':item.label}</small></button>})}<button onClick={()=>setMobileMenu(true)} className={['kibleteyn','programs','calendar','notes','archive','settings'].includes(active)?'active':''}><Menu size={19}/><small>Daha</small></button></nav>
    {modal&&<div className="modal-layer" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setModal(null)}}><section className={`modal-card ${modal}`} role="dialog" aria-modal="true" aria-label="Orbit penceresi"><IconButton label="Kapat" className="modal-close" onClick={()=>{setModal(null);setVoiceStep('idle')}}><X size={17}/></IconButton>{modal==='quick'&&<><span className="modal-icon"><ListTodo size={20}/></span><span className="eyebrow">HIZLI EKLE</span><h2>Yeni bir görev</h2><p>Aklındaki işi bırak, zamanı gelince Orbit sana göstersin.</p><label>Görev adı<input autoFocus value={quickText} onChange={(event)=>setQuickText(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&addQuick()} placeholder="Örn. Tur sunumunu kontrol et"/></label><div className="modal-options"><button><CalendarDays size={14}/> Bugün</button><button><CircleDot size={14}/> Personal</button></div><button className="primary-button full" onClick={addQuick}>Görevi ekle <ArrowRight size={15}/></button></>}{modal==='note'&&<><span className="modal-icon"><StickyNote size={20}/></span><span className="eyebrow">YENİ NOT</span><h2>Bir düşünce yakala.</h2><label>Başlık<input autoFocus value={noteDraft.title} onChange={(event)=>setNoteDraft({...noteDraft,title:event.target.value})} placeholder="Not başlığı"/></label><label>Not<textarea value={noteDraft.body} onChange={(event)=>setNoteDraft({...noteDraft,body:event.target.value})} placeholder="Buraya yaz..."/></label><button className="primary-button full" onClick={addNote}>Notu kaydet <Check size={15}/></button></>}{modal==='voice'&&<VoiceModal step={voiceStep} onStart={startVoice} onAccept={acceptVoice}/>} {modal==='search'&&<><div className="command-input"><Search size={18}/><input autoFocus value={searchText} onChange={(event)=>setSearchText(event.target.value)} placeholder="Sayfa veya özellik ara..."/><kbd>ESC</kbd></div><div className="command-results"><span>Hızlı geçiş</span>{searchResults.map((item)=>{const ItemIcon=item.icon;return <button key={item.id} onClick={()=>{go(item.id);setModal(null);setSearchText('')}}><i><ItemIcon size={17}/></i><strong>{item.label}</strong><small>Sayfaya git</small><ChevronRight size={14}/></button>})}</div><div className="command-footer"><span><Command size={12}/> Orbit hızlı arama</span><span>↵ seç · esc kapat</span></div></>}</section></div>}
    <div className={`toast ${toast?'show':''}`} role="status"><CheckCircle2 size={16}/>{toast}</div>
  </main>;
}

function SettingToggle({icon:Icon,title,description,value,onChange}:{icon:LucideIcon;title:string;description:string;value:boolean;onChange:(value:boolean)=>void}) {
  return <div className="setting-row"><span className="setting-icon"><Icon size={17}/></span><span><strong>{title}</strong><small>{description}</small></span><button aria-label={`${title} ${value?'kapat':'aç'}`} className={`switch ${value?'on':''}`} onClick={()=>onChange(!value)}><i/></button></div>;
}

function VoiceModal({step,onStart,onAccept}:{step:'idle'|'listening'|'done';onStart:()=>void;onAccept:()=>void}) {
  return <div className="voice-demo"><span className="eyebrow">ORBIT ASSISTANT · DEMO</span><h2>{step==='idle'?'Seni dinlemeye hazırım.':step==='listening'?'Dinliyorum...':'Bunu mu demek istedin?'}</h2><p>{step==='done'?'“Yarın 14:00 için tasarım değerlendirmesi ekle.”':'Bir görev, not veya plan söyle. Bu sürüm deneyimi simüle eder.'}</p><div className={`voice-visual ${step}`}><i/><i/><i/><i/><button onClick={step==='done'?onAccept:onStart}>{step==='listening'?<Square size={19}/>:step==='done'?<Check size={21}/>:<Mic size={21}/>}</button><i/><i/><i/><i/></div>{step==='idle'&&<small>Mikrofona dokun ve konuş</small>}{step==='listening'&&<small>Ses algılanıyor · demo</small>}{step==='done'&&<div className="voice-confirm"><button onClick={onStart}>Tekrar dene</button><button onClick={onAccept}>Görevi oluştur <ArrowRight size={14}/></button></div>}</div>;
}
