'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { InstallOrbit } from './install-orbit';
import {
  Archive, ArrowRight, ArrowUpRight, Bell, BookOpen, BriefcaseBusiness,
  Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight,
  Circle, CircleDot, Clock3, Command, Compass, Download, Dumbbell, Eye, Globe2,
  Home as HomeIcon, Languages, LayoutGrid, ListTodo, Map, MapPin,
  Menu, Mic, Monitor, Moon, MoreHorizontal, NotebookPen, PanelsTopLeft, Palette,
  Plane, Play, Plus, Rocket, RotateCcw, Route, Search, Settings, ShoppingBag,
  Smartphone, Sparkles, Square, StickyNote, Sun, Trash2, Undo2, UserRound, Users,
  Volume2, X, Zap,
} from 'lucide-react';

type PageKey = 'home' | 'personal' | 'rebuild' | 'projects' | 'kibleteyn' | 'programs' | 'calendar' | 'notes' | 'archive' | 'settings';
type Note = { id: string; title: string; body: string; date: string; tone: string };
type Project = { id: string; title: string; stage: number; progress: number; color: string; due: string; tags: string[]; tasks: string[] };
type Program = { id: string; title: string; range: string; people: number; status: string; progress: number; accent: string };
type CalendarEvent = { id: string; title: string; tone: string; time: string; duration: string };
type ArchiveItem = { id: string; title: string; type: 'project' | 'program' | 'note'; label: string; date: string; source?: Project | Program | Note };
type ThemePreference = 'light' | 'dark' | 'system';
type CapturePage = 'personal' | 'rebuild' | 'projects' | 'kibleteyn' | 'programs' | 'calendar' | 'notes';
type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  onresult: (event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void;
  onerror: () => void;
  onend: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type PersistedState = {
  completed: Record<string, boolean>;
  customPersonal: Record<string, string[]>;
  projectStages: Record<string, number>;
  customProjects: Project[];
  projectExtraTasks: Record<string, string[]>;
  projectRemovedTasks: Record<string, string[]>;
  customPrograms: Program[];
  programEdits: Record<string, Partial<Program>>;
  programExtraTasks: Record<string, Record<string, string[]>>;
  programRemovedTasks: Record<string, string[]>;
  customDepartmentTasks: Record<string, string[]>;
  customRebuildTasks: Record<string, string[]>;
  calendarEvents: Record<string, CalendarEvent[]>;
  archive: ArchiveItem[];
  restoredArchiveIds: string[];
  notes: Note[];
  profile: { name: string; workspace: string };
  settings: { notifications: boolean; motion: boolean; sound: boolean; autoArchive: boolean; accent: string; theme: ThemePreference; density: 'comfortable' | 'compact'; showCompleted: boolean };
};
const nav: { id: PageKey; label: string; icon: LucideIcon; parent?: PageKey }[] = [
  { id: 'home', label: 'Ana Sayfa', icon: HomeIcon },
  { id: 'personal', label: 'Personal', icon: UserRound },
  { id: 'rebuild', label: '6 Aylık Rebuild', icon: Route },
  { id: 'projects', label: 'Projeler', icon: PanelsTopLeft },
  { id: 'kibleteyn', label: 'Kıbleteyn', icon: Building2 },
  { id: 'programs', label: 'Programlar', icon: Map, parent: 'kibleteyn' },
  { id: 'calendar', label: 'Takvim', icon: CalendarDays },
  { id: 'notes', label: 'Notlar', icon: StickyNote },
  { id: 'archive', label: 'Arşiv', icon: Archive },
  { id: 'settings', label: 'Ayarlar', icon: Settings },
];

const defaultState: PersistedState = {
  completed: { 'routine-1': true, 'personal-1': true, 'program-14': true, 'project-pos-1': true, 'rebuild-2': true },
  customPersonal: { todo: [], buy: [], visit: [] },
  projectStages: {},
  customProjects: [],
  projectExtraTasks: {},
  projectRemovedTasks: {},
  customPrograms: [],
  programEdits: {},
  programExtraTasks: {},
  programRemovedTasks: {},
  customDepartmentTasks: {},
  customRebuildTasks: {},
  calendarEvents: {},
  archive: [],
  restoredArchiveIds: [],
  notes: [
    { id: 'n1', title: 'Yol haritası notları', body: 'Sistemi büyütmeden önce her ekranın tek bir net işi olmalı. Sadelik, özellik eksikliği değil; doğru sıradır.', date: 'Bugün · 10:42', tone: 'violet' },
    { id: 'n2', title: 'Orbit Explorer fikri', body: 'Gezegenleri ölçekli yörüngelerde, dokunarak keşfedilen sakin bir deneyime dönüştür.', date: 'Dün · 22:18', tone: 'blue' },
    { id: 'n3', title: 'Eylül turu', body: 'Seminer içeriğinde ilk 15 dakikayı daha görsel ve daha kısa tut. Transfer detaylarını tekrar kontrol et.', date: '21 Ağu · 16:05', tone: 'sand' },
  ],
  profile: { name: 'Emir Güney', workspace: 'Kişisel çalışma alanı' },
  settings: { notifications: true, motion: true, sound: false, autoArchive: true, accent: 'violet', theme: 'system', density: 'comfortable', showCompleted: true },
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
    customProjects: Array.isArray(saved.customProjects) ? saved.customProjects : defaultState.customProjects,
    projectExtraTasks: saved.projectExtraTasks && typeof saved.projectExtraTasks === 'object' && !Array.isArray(saved.projectExtraTasks) ? saved.projectExtraTasks : defaultState.projectExtraTasks,
    projectRemovedTasks: saved.projectRemovedTasks && typeof saved.projectRemovedTasks === 'object' && !Array.isArray(saved.projectRemovedTasks) ? saved.projectRemovedTasks : defaultState.projectRemovedTasks,
    customPrograms: Array.isArray(saved.customPrograms) ? saved.customPrograms : defaultState.customPrograms,
    programEdits: saved.programEdits && typeof saved.programEdits === 'object' && !Array.isArray(saved.programEdits) ? saved.programEdits : defaultState.programEdits,
    programExtraTasks: saved.programExtraTasks && typeof saved.programExtraTasks === 'object' && !Array.isArray(saved.programExtraTasks) ? saved.programExtraTasks : defaultState.programExtraTasks,
    programRemovedTasks: saved.programRemovedTasks && typeof saved.programRemovedTasks === 'object' && !Array.isArray(saved.programRemovedTasks) ? saved.programRemovedTasks : defaultState.programRemovedTasks,
    customDepartmentTasks: saved.customDepartmentTasks && typeof saved.customDepartmentTasks === 'object' && !Array.isArray(saved.customDepartmentTasks) ? saved.customDepartmentTasks : defaultState.customDepartmentTasks,
    customRebuildTasks: saved.customRebuildTasks && typeof saved.customRebuildTasks === 'object' && !Array.isArray(saved.customRebuildTasks) ? saved.customRebuildTasks : defaultState.customRebuildTasks,
    calendarEvents: saved.calendarEvents && typeof saved.calendarEvents === 'object' && !Array.isArray(saved.calendarEvents) ? saved.calendarEvents : defaultState.calendarEvents,
    archive: Array.isArray(saved.archive) ? saved.archive : defaultState.archive,
    restoredArchiveIds: Array.isArray(saved.restoredArchiveIds) ? saved.restoredArchiveIds : defaultState.restoredArchiveIds,
    notes: Array.isArray(saved.notes) ? saved.notes : defaultState.notes,
    profile: { ...defaultState.profile, ...(saved.profile ?? {}) },
    settings: { ...defaultState.settings, ...(saved.settings ?? {}) },
  };
}

const personalLists = {
  todo: { title: 'Yapılacaklar', icon: ListTodo, subtitle: 'Sisteme geçirilecek kişisel işler', items: ['Tüm mevcut projelerimi tek sisteme geçir', 'Masaüstü bilgisayarın uygulamalar menüsünü düzenle', 'Masaüstü bilgisayarda yer aç', 'Masaüstü bilgisayardaki fotoğrafları düzenle', 'Masaüstü bilgisayardaki uygulama listesini düzenle', 'Spor programımı düzenle', "Instagram'da kaydettiğim GitHub projesini incele", 'Özelleştirmeyle ilgili proje fikirleri araştır', 'GPT ile sevdiğim şeylerden proje fikirleri üret'] },
  buy: { title: 'Alınacaklar', icon: ShoppingBag, subtitle: 'Önemli, çalışma alanı, giyim ve bisiklet', items: ['Güneş gözlüğü', 'Monitör kolu · yaklaşık 1.250 TL', 'Yeşil pamuklu gömlek', 'Casio B185D saat · yaklaşık 6.000 TL', 'Keten pantolon', 'Sarı / ahşap masa lambası', 'Ahşap bardak altlığı', 'Siyah mousepad', 'Sağlam ahşap monitör üstü raf', 'Siyah bardak', 'Siyah mouse', 'Yapay bitki', 'Cam bardak', 'Bisiklet kaskı', 'Bisiklet gözlüğü', 'Ön ışık', 'Arka ışık', 'Matara', 'Matara yuvası', 'Telefon tutacağı', 'Bisiklet ek çantası', 'Çanta için pompa', 'Yama seti', 'İç lastik', 'Levye', 'Temel bisiklet ekipmanları'] },
  visit: { title: 'Gezilecekler', icon: MapPin, subtitle: 'Kaydedilen yerler ve yeni keşifler', items: ['Dunluce Castle'] },
};

const rebuildAreas: { title: string; icon: LucideIcon; progress: number; color: string; habits: string[] }[] = [
  { title: 'Beden', icon: Dumbbell, progress: 72, color: 'mint', habits: ['Haftada 3 spor yap', 'Her antrenmanı 45–60 dakika sürdür', 'İlk 6 hafta performans yerine devamlılığı koru', 'Tekrar düzenli spor yapan biri olmayı hedefle', 'Spor programını yeniden düzenle'] },
  { title: 'Zihin / Merak', icon: Sparkles, progress: 64, color: 'violet', habits: ['Her hafta seçenekler arasından bir merak konusu seç', 'Merak et → araştır → anla → üret → anlat akışını tamamla', 'Uzay, dinozor, fizik, teknoloji, tasarım veya gelecek araştır', 'Retro-futurism, yapay zekâ, bilim veya teknoloji tarihine bak', 'Araştırmadan görsel, poster, UI, simülasyon, diagram ya da video üret', 'Öğrendiğini 5 dakika kendi cümlelerinle anlat'] },
  { title: 'Yaratıcılık', icon: Palette, progress: 58, color: 'rose', habits: ['Haftada minimum 3 saat yaratıcı iş yap', 'Para kazanma şartı olmadan sevdiğin bir fikir seç', 'Futuristic UI, retro-futuristic telefon sistemi veya uzay kokpiti dene', 'Dinozor müzesi UI veya gezegen görselleştirmesi üret', 'AI görseli, fotoğraf, color grading veya bilimsel görselleştirme yap', 'Deneysel uygulama ya da interaktif web deneyimi geliştir', 'Kapsamı küçült; kaliteyi küçültme', 'Küçük ama aşırı iyi bitmiş bir çıktı hazırla'] },
  { title: 'İngilizce ve Diksiyon', icon: Languages, progress: 81, color: 'blue', habits: ['Sevdiğin içerikleri İngilizce tüket', 'Araştırmaların bir kısmını İngilizce yap', 'Haftada 2–3 kez, 15–20 dakika konuş', 'Önce konuş; hataları sonra incele', 'Haftada 2–3 adet, 5–10 dakikalık ses kaydı al', 'Kayıtta tempo, kelime yutma ve “eee / şey / yani” kullanımını kontrol et', 'Cümle netliği ve özgüveni değerlendir', 'Öğrendiğin bir şeyi veya fikrini basitçe anlat', 'Film, oyun veya teknoloji yorumu kaydet', 'Karmaşık bir konuyu ve kendi görüşünü net biçimde açıkla'] },
  { title: 'Solo Özgüven', icon: Compass, progress: 43, color: 'indigo', habits: ['Haftada en az 1 kez tek başına dışarı çık', 'Fotoğraf yürüyüşü, sahil, yeni semt, kafe veya müze seç', 'Sergi, kitapçı, etkinlik ya da günübirlik gezi dene', 'Her çıkışta en az bir küçük sosyal etkileşim kur', 'Özgüven gelmesini bekleme; yaşadıkça özgüven kazan'] },
  { title: 'Sosyal Hayat', icon: Users, progress: 46, color: 'orange', habits: ['En az 2 düzenli sosyal ortam oluştur', 'Spor, speaking club, fotoğraf, trekking veya koşu ortamı dene', 'Workshop, teknoloji topluluğu, masa oyunu veya gönüllülüğe bak', 'Ay 1: küçük etkileşimler kur', 'Ay 2: isim öğren ve soru sor', 'Ay 3: sohbeti sürdür ve uygun kişileri sosyal medyada ekle', 'Ay 4+: kahve veya aktivite teklif et'] },
  { title: 'Kariyer ve Para', icon: BriefcaseBusiness, progress: 69, color: 'sand', habits: ["Şimdilik Kıbleteyn'den ayrılma; gelir tabanını koru", 'Mobil uygulama prototipi, UI/UX veya uygulama tasarımı hizmeti dene', 'Landing page, interaktif web veya AI destekli görsel çalışma üret', 'Küçük bir uygulama geliştirmeyi dışarıya hizmet olarak dene', 'İlk hedef olarak kendi becerinle dışarıdan ilk parayı kazan', 'Sevdiğin konularda kendi ürünlerini geliştir', "Gelir üreten proje oluşursa Kıbleteyn'e bağımlılığı azalt"] },
  { title: 'Uzay Mühendisliği Testi', icon: Rocket, progress: 35, color: 'indigo', habits: ["KPSS'yi şimdilik öncelik yapma; DGS'yi çocukluk hayalin için test et", 'Uzayı sevmekle uzay mühendisliği yapmayı ayır', 'İlk 3 ay yörünge mekaniği ve itki sistemlerini araştır', 'Aerodinamik, kontrol ve termal sistemleri incele', 'Malzeme ve haberleşme alanlarını test et', 'Interactive Orbit Explorer ile bir simülasyon üret', 'Fiziği ve mühendislik problemlerini sevip sevmediğini gözle', 'UI/simülasyon mu yoksa mühendislik eğitimi mi istediğine karar ver', '3. ay sonunda ciddi eğitime değip değmediğini değerlendir'] },
];

const roadmapMonths = [
  { month: 'Eylül', phase: 'Reactivate', focus: 'Temel ritimleri yeniden etkinleştir', detail: '3 spor, 1 solo çıkış, 1 sosyal ortam, merak konusu, İngilizce, diksiyon ve yaratıcı üretim; para baskısı yok.', progress: 68 },
  { month: 'Ekim', phase: 'Expand', focus: 'Alanı ve üretimi genişlet', detail: 'İkinci sosyal ortamı kur, araştırma ve üretimi artır, en az bir küçük yaratıcı işi bitir.', progress: 54 },
  { month: 'Kasım', phase: 'Build', focus: 'Interactive Orbit Explorer', detail: 'Ana proje olarak yörünge deneyimini araştır, prototiple ve çalışan bir ürüne dönüştür.', progress: 31 },
  { month: 'Aralık', phase: 'Publish', focus: 'Ürettiklerini görünür kıl', detail: 'UI, görsel, simülasyon, fotoğraf ve öğrendiklerinden ay içinde yaklaşık 5–10 paylaşım yap.', progress: 12 },
  { month: 'Ocak', phase: 'Money Experiment', focus: 'İlk dış gelir deneyi', detail: 'Tek hizmet seç, 3 örnek hazırla, mini portföy oluştur, gerçek insanlara ulaş ve ilk dış geliri hedefle.', progress: 0 },
  { month: 'Şubat', phase: 'Review', focus: 'Altı ayı dürüstçe değerlendir', detail: 'Üretim, sosyal hayat, İngilizce, spor, uzay mühendisliği, dış gelir ve sonraki 6 ay için karar ver.', progress: 0 },
];

const projectSeed: Project[] = [
  { id: 'pos', title: 'Personal OS', stage: 1, progress: 68, color: 'violet', due: '31 Ağu', tags: ['Product', 'UI'], tasks: ['Navigasyon ve shell', 'Home etkileşimleri', 'Mobil görünüm', 'Demo veri sistemi'] },
  { id: 'orbit', title: 'Interactive Orbit Explorer', stage: 0, progress: 18, color: 'blue', due: '18 Eyl', tags: ['WebGL', 'Space'], tasks: ['Araştırma', 'Yörünge prototipi', 'Gezegen detayları'] },
  { id: 'future', title: 'Future UI Experiments', stage: 2, progress: 82, color: 'rose', due: '26 Ağu', tags: ['R&D'], tasks: ['Glass yüzeyler', 'Motion testleri', 'Dokunma geri bildirimi'] },
  { id: 'fitness', title: 'Fitness Uygulaması', stage: 0, progress: 12, color: 'mint', due: '03 Eki', tags: ['Mobile'], tasks: ['Kullanıcı akışı', 'Hareket kütüphanesi', 'İstatistik ekranı'] },
  { id: 'notes', title: 'Not Uygulaması', stage: 3, progress: 100, color: 'sand', due: 'Bitti', tags: ['Prototype'], tasks: ['Hızlı giriş', 'Etiketler', 'Arama'] },
  { id: 'story', title: 'Story / Sosyal Medya Uygulaması', stage: 0, progress: 8, color: 'violet', due: 'Fikir', tags: ['Social', 'Mobile'], tasks: ['Temel problem', 'Akış eskizleri', 'Etkileşim prototipi'] },
  { id: 'agri', title: 'Tarım Uygulaması', stage: 0, progress: 6, color: 'mint', due: 'Fikir', tags: ['Field', 'Product'], tasks: ['Kullanıcı senaryosu', 'Veri görünümü', 'Mobil panel'] },
  { id: 'football', title: 'Futbol Simülatörü', stage: 0, progress: 5, color: 'blue', due: 'Fikir', tags: ['Simulation', 'Game'], tasks: ['Oyun döngüsü', 'Maç motoru', 'İstatistik UI'] },
  { id: 'space-sim', title: 'Uzay Simülasyonları', stage: 0, progress: 10, color: 'blue', due: 'Havuz', tags: ['Space', 'Physics'], tasks: ['Konu havuzu', 'Fizik modeli', 'Görsel deney'] },
  { id: 'dino', title: 'Dinozor İnteraktif Deneyimi', stage: 0, progress: 4, color: 'rose', due: 'Havuz', tags: ['Dinosaur', 'Interactive'], tasks: ['Deneyim fikri', 'Müze UI', 'Mini oyun prototipi'] },
  { id: 'custom-ui', title: 'PC ve Telefon UI Özelleştirmeleri', stage: 0, progress: 14, color: 'sand', due: 'Havuz', tags: ['Content', 'UI'], tasks: ['Konu araştırması', 'Örnek sistem', 'İçerik formatı'] },
  { id: 'retro-system', title: 'Retro-Futuristic Tasarım Serisi', stage: 0, progress: 9, color: 'rose', due: 'Havuz', tags: ['Retro', 'Future'], tasks: ['Telefon sistemi', 'Uzay aracı kokpiti', 'Görsel dil seti'] },
];

const departments = [
  { id: 'general', title: 'Genel Operasyon', icon: Compass, progress: 34, summary: 'Güncel operasyon, stok ve iletişim hazırlıkları', tasks: ["14 Aralık ve Ocak programındaki eksik T.C.'leri iste", 'Ravza sistemi yap', 'Çanta stokla', 'Uygulama için taslak hazırla', 'WhatsApp mesaj taslağı hazırla'] },
  { id: 'assistant', title: 'Turasistan', icon: Smartphone, progress: 28, summary: 'Hesap, bayi, fatura ve şirket yönetimi', tasks: ["Yenişehir İsmail'in hesap kısıtlamalarını ayarla", 'Hesap bilgilerini kendisiyle paylaş', 'Gruplara bayi atamalarını kontrol et', 'Fatura oluşturma sistemini düzenle', 'Yeni şirket ekle'] },
  { id: 'web', title: 'Web Sitesi', icon: Globe2, progress: 22, summary: 'Senkronizasyon, içerik, kayıt ve mesajlaşma sorunları', tasks: ['Turasistan ve web sitesini senkron hale getir', 'Tarihleri güncelle', 'Ulaşım güzergâhlarını düzenle', 'Dolar kuru bölümünü kaldır veya güncelle', 'Ekim sonrası yürüme mesafeli ve 5 yıldız programlarını ekle', 'Çağrı talebinin hangi programdan geldiğini göster', 'Mesajlarda telefon numarasının görünmemesi problemini çöz', 'İletişim formunun otomatik maili iki kere göndermesini düzelt', 'Mesajlara cevap verememe problemini çöz', 'Görsel maksimum 256 boyut problemini düzelt', 'Kayıttan sonra banka bilgileri / mesaj / destek / bildirim problemlerini kontrol et', 'Aylık kategorilerin İngilizce karşılıklarını ekle', 'İngilizcesi olmayan alanları tamamla', 'Program önizleme yazılarını düzenle', 'Referanslar sayfasını güncelle', "Footer'daki Keşfet ve Bilgiler kısmını düzenle", 'Politikaların içeriklerini güncelle', 'Banner ve kampanya eşleşmesini düzenle', "Broşür PDF'ini yükle", 'Ramazan uzak servisli programı ekle', 'Senkronizasyon, giriş ve kayıt problemlerini genel olarak kontrol et'] },
  { id: 'design', title: 'Tasarım', icon: Palette, progress: 12, summary: 'Dua içerikleri ve görsel sunum çalışmaları', tasks: ["Mehmet Bey'in gönderdiği duaları güzel bir görünüme kavuştur"] },
];

const programCategories = [
  { name: 'Vize', icon: NotebookPen, tasks: ["Nusuk'ta grup oluştur", "Grup numaralarını Turasistan'a yaz", "Vize için Mofa'ya gönderim yap", 'Vize grubu bilgi mesajını Fatih abiye gönder', "Mofa'da send group üzerinden vize gönderimini kontrol et", 'Vizeleri pasaportlara yerleştir', 'Vize ödemesini yap'] },
  { name: 'Diyanet Kartı', icon: Building2, tasks: ["Grup numaralarına göre Diyanet'e gönder", 'Diyanet üzerinden grup oluştur', 'Yabancı uyruklu pasaportlar için sistemden kimlik numarası oluştur', 'Sigorta isim listesini doldurup ilgili adrese mail gönder', 'Diyanet üst yazısını doldur', 'Çıktı al', 'Kaşe / imza tamamla', 'Tekrar taratıp sisteme yükle', 'Tur Umre dilekçesini doldurup Fatih Bey’e gönder', 'Diyanet kartlarını aile aile ayırıp çantala', 'Oteller belgesini doldurup Fatih abiye gönder', 'Gelen sigortaları sisteme yükle'] },
  { name: 'Seminer', icon: Users, tasks: ['Seminer hatırlatma mesajı hazırla', 'WhatsApp seminer hatırlatma mesajı gönder', 'Sözleşmelerin çıktısını al', 'Masa örtüsü / masa bayrağı / kapı giriş bayrağı hazırla', 'Otobüs veya kişi isim listesinin çıktısını al', 'Slayt için PC hazırla'] },
  { name: 'WhatsApp', icon: Volume2, tasks: ['WhatsApp grubu oluştur', 'Telefona numaraları kaydet', 'WhatsApp mesajlarını hazırla / gönder'] },
  { name: 'Diğer Hazırlıklar', icon: ListTodo, tasks: ['Pasaportlara sticker yapıştır', 'Kulaklıkları çantala', 'Pasaport için sonraki gruba mesaj at', 'İngilizce programı hazırla', 'Türkçe programı hazırla', 'Odalamaları yap', 'Otobüs yerleşimini yap', 'Uçak bileti işlemlerini tamamla', 'Dosyaları hazırla'] },
  { name: '1 Gün Kala', icon: Clock3, tasks: ['Otobüs listesini WhatsApp grubunda paylaş', 'Buluşma hatırlatma mesajı gönder'] },
];

const programs: Program[] = [
  { id: 'p1', title: '1–4 Eylül Programı', range: '1–4 EYL', people: 38, status: 'Hazırlanıyor', progress: 41, accent: 'violet' },
  { id: 'p2', title: '1–4 Ekim Programı', range: '1–4 EKİ', people: 24, status: 'Planlandı', progress: 22, accent: 'blue' },
  { id: 'p3', title: '14–18 Aralık Umre', range: '14–18 ARA', people: 42, status: 'Taslak', progress: 12, accent: 'sand' },
];

const lifePrinciples = ['Mükemmel proje bekleyip başlamamazlık yapma', 'Hata yapmaktan korktuğunda projeyi küçült', 'Kalite standardını koru; kapsamı küçült', 'İlk versiyonun kusurlu olması normal', 'Düşünmek yerine küçük deneyler yap', 'İngilizcem düzelsin sonra yaşarım deme', 'Vücudum düzelsin sonra sosyalleşirim deme', 'Para kazanayım sonra gezerim deme', 'Özgüven gelince dışarı çıkmayı bekleme', 'Yaşadıkça özgüven kazan', 'Üretirken öğren', 'Öğrenirken paylaş', 'Başkasının yolunu kopyalamak yerine kendi merakını takip et'];

const calendarEvents: Record<string, CalendarEvent[]> = {
  '2026-08-03': [{ id: 'seed-3', title: 'İngilizce konuşma', tone: 'blue', time: '19:00', duration: '45 dk' }],
  '2026-08-06': [{ id: 'seed-6', title: 'Merak araştırması', tone: 'violet', time: '18:00', duration: '60 dk' }],
  '2026-08-10': [{ id: 'seed-10', title: 'Spor · 45–60 dk', tone: 'mint', time: '09:00', duration: '60 dk' }],
  '2026-08-14': [{ id: 'seed-14', title: 'Sosyal ortam', tone: 'orange', time: '19:00', duration: '90 dk' }],
  '2026-08-18': [{ id: 'seed-18', title: 'Orbit prototipi', tone: 'blue', time: '10:30', duration: '90 dk' }],
  '2026-08-20': [{ id: 'seed-20', title: 'Diksiyon kaydı', tone: 'rose', time: '18:30', duration: '30 dk' }],
  '2026-08-23': [{ id: 'seed-23a', title: 'Haftalık kayıt', tone: 'violet', time: '10:30', duration: '45 dk' }, { id: 'seed-23b', title: 'Solo çıkış', tone: 'sand', time: '19:00', duration: '90 dk' }],
  '2026-08-26': [{ id: 'seed-26', title: 'Yaratıcı üretim', tone: 'rose', time: '18:00', duration: '90 dk' }],
  '2026-08-29': [{ id: 'seed-29', title: 'Tur semineri', tone: 'orange', time: '14:00', duration: '120 dk' }],
};

const archiveSeed: ArchiveItem[] = [
  { id: 'archive-project-notes', title: 'Not Uygulaması', type: 'project', label: 'Proje', date: '12 Ağustos 2026' },
  { id: 'archive-program-istanbul', title: 'Temmuz İstanbul Programı', type: 'program', label: 'Program', date: '28 Temmuz 2026' },
  { id: 'archive-note-portfolio', title: 'Eski portfolyo fikirleri', type: 'note', label: 'Not koleksiyonu', date: '16 Temmuz 2026' },
  { id: 'archive-project-motion', title: 'Motion Study 01', type: 'project', label: 'Proje', date: '03 Temmuz 2026' },
  { id: 'archive-project-fitness', title: 'Fitness Flow v1', type: 'project', label: 'Proje', date: '22 Haziran 2026' },
  { id: 'archive-program-bursa', title: 'Haziran Bursa Programı', type: 'program', label: 'Program', date: '18 Haziran 2026' },
  { id: 'archive-note-rebuild', title: 'Rebuild başlangıç kayıtları', type: 'note', label: 'Haftalık kayıt', date: '10 Haziran 2026' },
  { id: 'archive-note-content', title: 'İçerik fikirleri — Bahar', type: 'note', label: 'Not koleksiyonu', date: '02 Haziran 2026' },
];

function IconButton({ label, children, onClick, className = '' }: { label: string; children: React.ReactNode; onClick?: () => void; className?: string }) {
  return <button aria-label={label} title={label} onClick={onClick} className={`icon-button ${className}`}>{children}</button>;
}

function ProgressRing({ value, size = 'large' }: { value: number; size?: 'small' | 'large' }) {
  return <div className={`progress-ring ${size}`} style={{ '--progress': `${value * 3.6}deg` } as React.CSSProperties}><div><strong>{value}</strong><span>%</span></div></div>;
}

function PageTitle({ action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  if (!action) return null;
  return <div className="page-title minimal">{action}</div>;
}

export default function PersonalOS() {
  const [active, setActive] = useState<PageKey>('home');
  const [state, setState] = useState<PersistedState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const lastSyncedState = useRef('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<'quick' | 'voice' | 'search' | 'note' | 'project' | 'program' | 'programTask' | 'departmentTask' | 'event' | 'profile' | 'captureChoice' | 'capture' | null>(null);
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
  const [quickTarget, setQuickTarget] = useState<keyof typeof personalLists>('todo');
  const [noteDraft, setNoteDraft] = useState({ title: '', body: '' });
  const [projectDraft, setProjectDraft] = useState({ title: '', due: '', tags: '', tasks: '', stage: 0, color: 'violet' });
  const [programDraft, setProgramDraft] = useState({ title: '', range: '', status: 'Taslak', accent: 'violet' });
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [programTaskDraft, setProgramTaskDraft] = useState({ programId: '', category: 'Vize', title: '' });
  const [departmentTaskDraft, setDepartmentTaskDraft] = useState('');
  const [eventDraft, setEventDraft] = useState({ title: '', date: '2026-08-23', time: '10:00', duration: '60 dk', tone: 'violet' });
  const [profileDraft, setProfileDraft] = useState(defaultState.profile);
  const [noteSearch, setNoteSearch] = useState('');
  const [noteFilter, setNoteFilter] = useState<'all' | 'ideas' | 'logs'>('all');
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'project' | 'program' | 'note'>('all');
  const [settingsTab, setSettingsTab] = useState<'general' | 'appearance' | 'notifications' | 'data'>('general');
  const [searchText, setSearchText] = useState('');
  const [voiceStep, setVoiceStep] = useState<'idle' | 'listening' | 'done'>('idle');
  const [focusActive, setFocusActive] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [teamView, setTeamView] = useState(false);
  const [captureMethod, setCaptureMethod] = useState<'text' | 'voice'>('text');
  const [captureListening, setCaptureListening] = useState(false);
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureDetails, setCaptureDetails] = useState('');
  const [capturePage, setCapturePage] = useState<CapturePage>('personal');
  const [captureArea, setCaptureArea] = useState('todo');

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
      } catch { /* D1 unavailable: local state remains active */ }

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
    document.documentElement.dataset.density = state.settings.density;
    document.documentElement.classList.toggle('reduce-motion', !state.settings.motion);

    if (serializedState === lastSyncedState.current) return;
    const saveTimer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state }),
        });
        if (!response.ok) throw new Error('D1 state save failed');
        lastSyncedState.current = serializedState;
      } catch { /* local persistence remains active */ }
    }, 650);

    return () => window.clearTimeout(saveTimer);
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const nextTheme = state.settings.theme === 'system'
        ? (systemTheme.matches ? 'dark' : 'light')
        : state.settings.theme;
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
      document.documentElement.classList.add('theme-ready');
      setResolvedTheme(nextTheme);
    };

    applyTheme();
    if (state.settings.theme !== 'system') return;
    systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [hydrated, state.settings.theme]);

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
    setState((current) => ({ ...current, customPersonal: { ...current.customPersonal, [quickTarget]: [...current.customPersonal[quickTarget], quickText.trim()] } }));
    setQuickText(''); setModal(null); notify('Görev Personal listene eklendi.');
  };

  const addNote = () => {
    if (!noteDraft.title.trim()) return;
    const note = { id: `n-${Date.now()}`, title: noteDraft.title.trim(), body: noteDraft.body.trim() || 'Yeni not', date: 'Şimdi', tone: ['violet', 'blue', 'sand'][state.notes.length % 3] };
    setState((current) => ({ ...current, notes: [note, ...current.notes] }));
    setNoteDraft({ title: '', body: '' }); setModal(null); notify('Not kaydedildi.');
  };

  const openProject = (stage = 0) => {
    setProjectDraft({ title: '', due: '', tags: '', tasks: '', stage, color: 'violet' });
    setModal('project');
  };

  const addProject = () => {
    if (!projectDraft.title.trim()) return;
    const project: Project = {
      id: `project-${Date.now()}`,
      title: projectDraft.title.trim(),
      stage: Number(projectDraft.stage),
      progress: 0,
      color: projectDraft.color,
      due: projectDraft.due.trim() || 'Tarihsiz',
      tags: projectDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 4),
      tasks: projectDraft.tasks.split('\n').map((task) => task.trim()).filter(Boolean).slice(0, 12),
    };
    setState((current) => ({ ...current, customProjects: [...current.customProjects, project] }));
    setExpandedProject(project.id); setModal(null); notify('Yeni proje eklendi.');
  };

  const openProgram = () => {
    setEditingProgramId(null);
    setProgramDraft({ title: '', range: '', status: 'Taslak', accent: 'violet' });
    setModal('program');
  };

  const openProgramEdit = (program: Program) => {
    setEditingProgramId(program.id);
    setProgramDraft({ title: program.title, range: program.range, status: program.status, accent: program.accent });
    setModal('program');
  };

  const addProgram = () => {
    if (!programDraft.title.trim()) return;
    const details = {
      title: programDraft.title.trim(),
      range: programDraft.range.trim() || 'Tarih belirtilmedi',
      status: programDraft.status,
      accent: programDraft.accent,
    };
    if (editingProgramId) {
      setState((current) => {
        const isCustom = current.customPrograms.some((program) => program.id === editingProgramId);
        return isCustom
          ? { ...current, customPrograms: current.customPrograms.map((program) => program.id === editingProgramId ? { ...program, ...details } : program) }
          : { ...current, programEdits: { ...current.programEdits, [editingProgramId]: { ...current.programEdits[editingProgramId], ...details } } };
      });
      setModal(null); setEditingProgramId(null); notify('Tur bilgileri güncellendi.');
      return;
    }
    const program: Program = {
      id: `program-${Date.now()}`,
      ...details,
      people: 0,
      progress: 0,
    };
    setState((current) => ({ ...current, customPrograms: [...current.customPrograms, program] }));
    setExpandedProgram(program.id); setModal(null); notify('Yeni tur programı eklendi.');
  };

  const visibleProgramTasks = (programId: string, category: string) => [
    ...programCategories.find((item) => item.name === category)!.tasks,
    ...(state.programExtraTasks[programId]?.[category] ?? []),
  ].filter((task) => !(state.programRemovedTasks[programId] ?? []).includes(task));

  const openProgramTask = (programId: string, category = programCategories[0].name) => {
    setProgramTaskDraft({ programId, category, title: '' });
    setModal('programTask');
  };

  const addProgramTask = () => {
    if (!programTaskDraft.title.trim()) return;
    setState((current) => ({
      ...current,
      programExtraTasks: {
        ...current.programExtraTasks,
        [programTaskDraft.programId]: {
          ...(current.programExtraTasks[programTaskDraft.programId] ?? {}),
          [programTaskDraft.category]: [...(current.programExtraTasks[programTaskDraft.programId]?.[programTaskDraft.category] ?? []), programTaskDraft.title.trim()],
        },
      },
    }));
    setModal(null); notify('Hazırlık görevi eklendi.');
  };

  const openDepartmentTask = () => {
    setDepartmentTaskDraft('');
    setModal('departmentTask');
  };

  const addDepartmentTask = () => {
    if (!departmentTaskDraft.trim()) return;
    setState((current) => ({
      ...current,
      customDepartmentTasks: {
        ...current.customDepartmentTasks,
        [expandedDepartment]: [...(current.customDepartmentTasks[expandedDepartment] ?? []), departmentTaskDraft.trim()],
      },
    }));
    setModal(null); notify('Operasyon görevi eklendi.');
  };

  const visibleProjectTasks = (project: Project) => [
    ...project.tasks,
    ...(state.projectExtraTasks[project.id] ?? []),
  ].filter((task) => !(state.projectRemovedTasks[project.id] ?? []).includes(task));

  const allCaptureProjects = [...projectSeed, ...state.customProjects].map((project) => ({ ...project, stage: state.projectStages[project.id] ?? project.stage }));
  const allCapturePrograms = [...programs.map((program) => ({ ...program, ...(state.programEdits[program.id] ?? {}) })), ...state.customPrograms];
  const selectedCalendarDate = `${calendarCursor.getFullYear()}-${String(calendarCursor.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  const captureAreasFor = (page: CapturePage) => {
    if (page === 'personal') return (Object.keys(personalLists) as (keyof typeof personalLists)[]).map((key) => ({ value: key, label: personalLists[key].title }));
    if (page === 'rebuild') return rebuildAreas.map((area) => ({ value: area.title, label: area.title }));
    if (page === 'projects') return allCaptureProjects.map((project) => ({ value: project.id, label: project.title }));
    if (page === 'kibleteyn') return departments.map((department) => ({ value: department.id, label: department.title }));
    if (page === 'programs') return allCapturePrograms.flatMap((program) => programCategories.map((category) => ({ value: `${program.id}::${category.name}`, label: `${program.title} · ${category.name}` })));
    if (page === 'calendar') return [{ value: selectedCalendarDate, label: `${selectedDay} ${new Intl.DateTimeFormat('tr-TR', { month: 'long' }).format(calendarCursor)}` }];
    return [{ value: 'notes', label: 'Tüm notlar' }];
  };

  const openCaptureChoice = () => {
    setCaptureListening(false);
    setModal('captureChoice');
  };

  const beginCapture = (method: 'text' | 'voice') => {
    setCaptureMethod(method); setCaptureListening(false); setCaptureTitle(''); setCaptureDetails(''); setCapturePage('personal'); setCaptureArea('todo'); setModal('capture');
  };

  const startCaptureVoice = () => {
    const recognitionWindow = window as Window & { SpeechRecognition?: BrowserSpeechRecognitionConstructor; webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor };
    const Recognition = recognitionWindow.SpeechRecognition ?? recognitionWindow.webkitSpeechRecognition;
    if (!Recognition) { notify('Bu tarayıcı sesli yazmayı desteklemiyor; kaydı yazılı olarak girebilirsin.'); return; }
    const recognition = new Recognition();
    recognition.lang = 'tr-TR'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? '';
      if (transcript) setCaptureTitle((current) => current || transcript);
      setCaptureListening(false);
    };
    recognition.onerror = () => { setCaptureListening(false); notify('Ses kaydı alınamadı; metni yazılı girebilirsin.'); };
    recognition.onend = () => setCaptureListening(false);
    setCaptureListening(true); recognition.start();
  };

  const saveCapture = () => {
    const title = captureTitle.trim();
    if (!title) { notify('Kaydetmeden önce bir başlık gir.'); return; }
    if (capturePage === 'personal') {
      setState((current) => ({ ...current, customPersonal: { ...current.customPersonal, [captureArea]: [...(current.customPersonal[captureArea] ?? []), title] } }));
      setPersonalTab(captureArea as keyof typeof personalLists);
    }
    if (capturePage === 'rebuild') {
      setState((current) => ({ ...current, customRebuildTasks: { ...current.customRebuildTasks, [captureArea]: [...(current.customRebuildTasks[captureArea] ?? []), title] } }));
      setRebuildArea(captureArea);
    }
    if (capturePage === 'projects') {
      setState((current) => ({ ...current, projectExtraTasks: { ...current.projectExtraTasks, [captureArea]: [...(current.projectExtraTasks[captureArea] ?? []), title] } }));
      setExpandedProject(captureArea);
    }
    if (capturePage === 'kibleteyn') {
      setState((current) => ({ ...current, customDepartmentTasks: { ...current.customDepartmentTasks, [captureArea]: [...(current.customDepartmentTasks[captureArea] ?? []), title] } }));
      setExpandedDepartment(captureArea);
    }
    if (capturePage === 'programs') {
      const [programId, category] = captureArea.split('::');
      setState((current) => ({ ...current, programExtraTasks: { ...current.programExtraTasks, [programId]: { ...(current.programExtraTasks[programId] ?? {}), [category]: [...(current.programExtraTasks[programId]?.[category] ?? []), title] } } }));
      setExpandedProgram(programId);
    }
    if (capturePage === 'calendar') {
      const event: CalendarEvent = { id: `capture-${Date.now()}`, title, tone: captureMethod === 'voice' ? 'blue' : 'violet', time: 'Saat yok', duration: captureDetails.trim() || 'Kayıt' };
      setState((current) => ({ ...current, calendarEvents: { ...current.calendarEvents, [captureArea]: [...(current.calendarEvents[captureArea] ?? []), event] } }));
    }
    if (capturePage === 'notes') {
      setState((current) => ({ ...current, notes: [{ id: `note-${Date.now()}`, title, body: captureDetails.trim() || (captureMethod === 'voice' ? 'Sesli kayıt' : 'Hızlı kayıt'), date: 'Şimdi', tone: captureMethod === 'voice' ? 'blue' : 'violet' }, ...current.notes] }));
    }
    setModal(null); go(capturePage); notify('Kayıt seçtiğin alana eklendi.');
  };

  const removeProgramTask = (programId: string, task: string) => {
    setState((current) => ({
      ...current,
      programExtraTasks: Object.fromEntries(Object.entries(current.programExtraTasks).map(([id, categories]) => [id, Object.fromEntries(Object.entries(categories).map(([category, tasks]) => [category, id === programId ? tasks.filter((item) => item !== task) : tasks]))])),
      programRemovedTasks: { ...current.programRemovedTasks, [programId]: [...new Set([...(current.programRemovedTasks[programId] ?? []), task])] },
    }));
    notify('Hazırlık görevi kaldırıldı.');
  };

  const openEvent = (date = '2026-08-23') => {
    setEventDraft({ title: '', date, time: '10:00', duration: '60 dk', tone: 'violet' });
    setModal('event');
  };

  const addEvent = () => {
    if (!eventDraft.title.trim() || !eventDraft.date) return;
    const event: CalendarEvent = { id: `event-${Date.now()}`, title: eventDraft.title.trim(), tone: eventDraft.tone, time: eventDraft.time || 'Saat yok', duration: eventDraft.duration.trim() || 'Süre yok' };
    setState((current) => ({ ...current, calendarEvents: { ...current.calendarEvents, [eventDraft.date]: [...(current.calendarEvents[eventDraft.date] ?? []), event] } }));
    setModal(null); notify('Etkinlik takvime eklendi.');
  };

  const deleteEvent = (date: string, id: string) => {
    setState((current) => ({ ...current, calendarEvents: { ...current.calendarEvents, [date]: (current.calendarEvents[date] ?? []).filter((event) => event.id !== id) } }));
    notify('Etkinlik takvimden kaldırıldı.');
  };

  const archiveNote = (note: Note) => {
    setState((current) => ({
      ...current,
      notes: current.notes.filter((item) => item.id !== note.id),
      archive: [{ id: `archive-${note.id}-${Date.now()}`, title: note.title, type: 'note', label: 'Not', date: 'Bugün', source: note }, ...current.archive],
    }));
    notify('Not arşive taşındı.');
  };

  const archiveProject = (project: Project) => {
    setState((current) => ({
      ...current,
      customProjects: current.customProjects.filter((item) => item.id !== project.id),
      projectStages: { ...current.projectStages, [project.id]: 3 },
      archive: [{ id: `archive-${project.id}-${Date.now()}`, title: project.title, type: 'project', label: 'Proje', date: 'Bugün', source: project }, ...current.archive],
    }));
    setExpandedProject(null); notify('Proje arşive taşındı.');
  };

  const restoreArchiveItem = (item: ArchiveItem) => {
    setState((current) => {
      const next = { ...current, archive: current.archive.filter((entry) => entry.id !== item.id), restoredArchiveIds: [...new Set([...current.restoredArchiveIds, item.id])] };
      if (item.type === 'note') {
        const source = item.source as Note | undefined;
        next.notes = [{ id: `restored-note-${Date.now()}`, title: source?.title ?? item.title, body: source?.body ?? 'Arşivden geri yüklendi.', date: 'Şimdi', tone: source?.tone ?? 'violet' }, ...next.notes];
      }
      if (item.type === 'project') {
        const source = item.source as Project | undefined;
        next.customProjects = [...next.customProjects, source ? { ...source, id: `restored-project-${Date.now()}`, stage: 1 } : { id: `restored-project-${Date.now()}`, title: item.title, stage: 1, progress: 0, color: 'violet', due: 'Tarihsiz', tags: ['Arşiv'], tasks: [] }];
      }
      if (item.type === 'program') {
        const source = item.source as Program | undefined;
        next.customPrograms = [...next.customPrograms, source ? { ...source, id: `restored-program-${Date.now()}` } : { id: `restored-program-${Date.now()}`, title: item.title, range: 'Tarih belirtilmedi', people: 0, status: 'Taslak', progress: 0, accent: 'violet' }];
      }
      return next;
    });
    notify(`${item.title} geri yüklendi.`);
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
  const profileInitials = state.profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('tr') || 'O';
  const renderHome = () => (
    <>
      <div className="dashboard-grid">
        <article className={`surface focus-card ${focusActive ? 'is-focusing' : ''}`}>
          <div className="card-heading"><div><span className="eyebrow">BUGÜNÜN ODAĞI</span><h2>Personal OS<br/>ana akışını bitir</h2></div><span className="focus-number">01</span></div>
          <p>Günün geri kalanını sadeleştirecek tek önemli adım.</p>
          <div className="focus-actions"><button className="primary-button" onClick={() => { setFocusActive(!focusActive); notify(focusActive ? 'Odak oturumu duraklatıldı.' : '90 dakikalık odak oturumu başladı.'); }}>{focusActive ? <Square size={14}/> : <Play size={14} fill="currentColor"/>}<span>{focusActive ? 'Oturumu duraklat' : 'Odaklanmaya başla'}</span><ArrowUpRight size={16}/></button><span className="time-chip">{focusActive ? '89:42' : '90 dk'}</span></div>
          <div className="ambient-orb"><span/></div>
        </article>
        <article className="surface today-card">
          <div className="card-title-row"><div><span className="eyebrow">AKIŞ</span><h3>Bugün</h3></div><button className="text-button" onClick={() => go('calendar')}>Tümünü gör</button></div>
          <div className="timeline">
            {[['09:00','Sabah rutini','Beden · 35 dk','routine-1'],['11:00','Personal OS arayüzü','Proje · 90 dk','routine-2'],['15:30','İngilizce pratik','Rebuild · 45 dk','routine-3'],['18:30','Diksiyon kaydı','Rebuild · 30 dk','routine-4'],['20:00','Gün sonu planlama','Personal · 15 dk','routine-5']].map((row, index) => (
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
      <section className="surface north-star">
        <div className="north-star-head"><span className="north-star-icon"><Compass size={22}/></span><div><span className="eyebrow">KUZEY YILDIZI</span><h2>Özgür, güçlü ve kendime ait bir hayat.</h2></div></div>
        <div className="vision-grid"><article><strong>Hayat</strong><p>Ekonomik olarak güçlü, zamanımı kendim yönettiğim; sevdiğim eşim ve çocuklarımla butik villa tarzı bir evde yaşadığım bir düzen. Uzaktan çalışan veya büyük ölçüde otomatik ilerleyen işler; aileye, gezmeye ve gelişmeye gerçek zaman.</p></article><article><strong>Para</strong><p>Daha fazla şey satın almaktan önce seçenek, güvenlik ve özgürlük. Çocuklarımın maddi kaygı yüzünden seçeneklerinin kısıtlanmadığı bir gelecek.</p></article><article><strong>Kariyer</strong><p>Tek bir mesleğe sıkışmadan tasarım, teknoloji, UI/UX, uygulama geliştirme, görsel üretim, uzay, dinozorlar, retro-futurism ve yaratıcı teknolojileri birleştiren bana ait işler.</p></article></div>
        <div className="principles-head"><div><span className="eyebrow">ÇALIŞMA PRENSİPLERİ</span><h3>Kapsamı küçült, kaliteyi değil.</h3></div><p>Daha çok yaşayan, merak eden, düşünen, üreten, hareket eden ve kendi başına da rahat olabilen biri ol.</p></div>
        <div className="life-principles">{lifePrinciples.map((principle,index)=><span key={principle}><i>{String(index+1).padStart(2,'0')}</i>{principle}</span>)}</div>
      </section>
      <section className="surface week-card analytics-bottom">
        <div className="card-title-row"><div><span className="eyebrow">BU HAFTA</span><h3>İlerleme</h3></div><IconButton label="Rebuild sayfasına git" onClick={() => go('rebuild')}><ArrowUpRight size={16}/></IconButton></div>
        <div className="progress-wrap"><ProgressRing value={68}/><div className="progress-meta"><p><i className="dot violet"/> {Math.max(12, completedCount)} tamamlandı</p><p><i className="dot soft"/> 6 devam ediyor</p><button onClick={() => go('rebuild')}>Detayları gör <ChevronRight size={12}/></button></div></div>
      </section>
    </>
  );

  const renderPersonal = () => {
    const current = personalLists[personalTab];
    const items = [...current.items, ...state.customPersonal[personalTab]];
    const CurrentIcon = current.icon;
    return <>
      <PageTitle eyebrow="PERSONAL" title="Kendine ait alan." description="Günlük hayatın küçük yüklerini tek, sakin bir yerde tut." action={<button className="primary-button compact" onClick={() => setModal('quick')}><Plus size={15}/> Yeni ekle</button>}/>
      <div className="segmented-control">{(Object.keys(personalLists) as (keyof typeof personalLists)[]).map((key) => { const item = personalLists[key]; const TabIcon = item.icon; return <button key={key} onClick={() => setPersonalTab(key)} className={personalTab === key ? 'active' : ''}><TabIcon size={16}/>{item.title}<span>{item.items.length + state.customPersonal[key].length}</span></button>})}</div>
      <div className="personal-layout action-first">
        <section className="surface personal-main">
          <div className="section-lead"><span className={`feature-icon ${personalTab}`}><CurrentIcon size={22}/></span><div><h2>{current.title}</h2><p>{current.subtitle}</p></div><span className="count-pill">{items.filter((_, index) => !state.completed[`personal-${personalTab}-${index}`]).length} açık</span></div>
          <div className="task-list">{items.map((item, index) => { const id = `personal-${personalTab}-${index}`; if (!state.settings.showCompleted && state.completed[id]) return null; return <button key={`${item}-${index}`} className={`task-item ${state.completed[id] ? 'completed' : ''}`} onClick={() => toggle(id)}><span className="check-circle">{state.completed[id] && <Check size={13}/>}</span><span><strong>{item}</strong><small>{personalTab === 'visit' ? 'Kaydedilen yer' : index < 2 ? 'Bu hafta' : 'Daha sonra'}</small></span><MoreHorizontal size={16}/></button>})}</div>
          <button className="inline-add" onClick={() => setModal('quick')}><Plus size={15}/> Yeni öğe ekle</button>
        </section>
      </div>
      <aside className="surface personal-insight analytics-bottom"><span className="eyebrow">HAFTALIK DENGE</span><div className="balance-orbit"><span/><i/><b>74%</b></div><h3>İyi gidiyorsun.</h3><p>Açık öğelerin çoğu bu hafta için gerçekçi. Bugün sadece iki tanesini seçmen yeterli.</p><button onClick={() => go('calendar')}>Takvime yerleştir <ArrowRight size={14}/></button></aside>
    </>;
  };

  const renderRebuild = () => (
    <>
      <PageTitle eyebrow="6 AYLIK REBUILD" title="Değişimi görünür kıl." description="Eylül'den Şubat'a; küçük ritimler, net kilometre taşları." action={<button className="ghost-button" onClick={()=>{setNoteDraft({title:'Haftalık Rebuild kaydı',body:''});setModal('note');}}><BookOpen size={15}/> Haftalık kayıt</button>}/>
      <div className="rebuild-layout action-first">
        <section><div className="section-header"><div><span className="eyebrow">BU HAFTA</span><h2>Odak alanları</h2></div><span>23–29 Ağustos</span></div><div className="area-grid">{rebuildAreas.map((area) => { const AreaIcon = area.icon; const open = rebuildArea === area.title; const habits = [...area.habits, ...(state.customRebuildTasks[area.title] ?? [])]; return <article key={area.title} className={`surface area-card ${open ? 'open' : ''}`}><button className="area-card-head" onClick={() => setRebuildArea(open ? '' : area.title)}><span className={`area-icon ${area.color}`}><AreaIcon size={19}/></span><span><strong>{area.title}</strong><small>{area.progress}% tamamlandı</small></span><b>{area.progress}%</b><ChevronDown size={16}/></button><div className="area-progress"><i style={{width:`${area.progress}%`}}/></div><div className="area-details">{habits.map((habit,index) => { const id = `rebuild-${area.title}-${index}`; return <button onClick={() => toggle(id)} key={`${habit}-${index}`} className={state.completed[id] ? 'completed' : ''}><span>{state.completed[id] && <Check size={11}/>}</span>{habit}</button>})}</div></article>})}</div></section>
      </div>
      <section className="surface roadmap-hero analytics-bottom">
        <div className="roadmap-top"><div><span className="eyebrow">GENEL YOLCULUK</span><h2>6 ayda yeni bir düzen</h2></div><div className="roadmap-score"><strong>42</strong><span>% tamamlandı</span></div></div>
        <div className="roadmap-track"><span className="track-fill" style={{width:'42%'}}/>{roadmapMonths.map((item,index) => <button key={item.month} className={`${index <= 2 ? 'passed' : ''} ${month === index ? 'active' : ''}`} onClick={() => setMonth(index)}><i>{index < 2 ? <Check size={12}/> : index + 1}</i><strong>{item.month}</strong><small>{item.phase}</small></button>)}</div>
        <div className="month-focus"><span>{String(month+1).padStart(2,'0')}</span><div><small>{roadmapMonths[month].month.toLocaleUpperCase('tr')} · {roadmapMonths[month].phase}</small><strong>{roadmapMonths[month].focus}</strong><p>{roadmapMonths[month].detail}</p></div><ProgressRing value={roadmapMonths[month].progress} size="small"/></div>
      </section>
      <aside className="surface weekly-log analytics-bottom"><div className="card-title-row"><div><span className="eyebrow">HAFTALIK KAYITLAR</span><h3>Son üç hafta</h3></div><BookOpen size={18}/></div>{[['17–23 Ağu','Sakin ama üretken','82'],['10–16 Ağu','Ritim kuruluyor','71'],['3–9 Ağu','Başlangıç','63']].map((log,index)=><button key={log[0]} onClick={()=>{setNoteDraft({title:`Haftalık kayıt · ${log[0]}`,body:log[1]});setModal('note');}}><span className={`log-dot n${index}`}/><span><strong>{log[0]}</strong><small>{log[1]}</small></span><b>{log[2]}</b><ChevronRight size={14}/></button>)}<button className="weekly-new" onClick={() => {setNoteDraft({title:'Haftalık Rebuild kaydı',body:''});setModal('note');}}><Plus size={14}/> Bu haftayı kaydet</button></aside>
    </>
  );

  const renderProjects = () => {
    const stages = ['Fikirler','Devam ediyor','İnceleme','Tamamlandı'];
    const allProjects = [...projectSeed, ...state.customProjects].map((project) => ({ ...project, stage: state.projectStages[project.id] ?? project.stage }));
    const visibleProjects = allProjects.filter((project) => `${project.title} ${project.tags.join(' ')}`.toLocaleLowerCase('tr').includes(projectQuery.toLocaleLowerCase('tr')));
    const averageProgress = Math.round(allProjects.reduce((total, project) => total + project.progress, 0) / allProjects.length);
    return <>
      <PageTitle eyebrow="PROJELER" title="Fikirden gerçeğe." description="Tüm üretim yolculuğun; sade, görsel ve hareketli." action={<button className="primary-button compact" onClick={() => openProject()}><Plus size={15}/> Yeni proje</button>}/>
      <div className="project-thesis"><Sparkles size={15}/><span><strong>Proje filtresi</strong><small>Tasarım + teknoloji + uzay + dinozor + retro + futuristic + görsel üretim + interaktif deneyim.</small></span><label className="inline-search"><Search size={13}/><input aria-label="Projelerde ara" value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} placeholder="Ara..."/></label></div>
      <div className="kanban-board">{stages.map((stage, stageIndex) => <section className="kanban-column" key={stage}><header><span><i className={`stage-dot s${stageIndex}`}/>{stage}</span><b>{visibleProjects.filter((p) => p.stage === stageIndex).length}</b><IconButton label={`${stage} sütununa proje ekle`} onClick={() => openProject(stageIndex)}><Plus size={15}/></IconButton></header><div className="kanban-stack">{visibleProjects.filter((p) => p.stage === stageIndex).map((project) => { const tasks = visibleProjectTasks(project); const done = tasks.filter((_, index) => state.completed[`project-${project.id}-${index}`]).length; const progress = Math.max(project.progress, tasks.length ? Math.round(done / tasks.length * 100) : 0); const isCustom = state.customProjects.some((item) => item.id === project.id); return <article key={project.id} className={`project-card tone-${project.color} ${expandedProject === project.id ? 'expanded' : ''}`}><button className="project-card-main" onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}><div className="project-cover"><span className="mini-orbit"/><i>{progress}%</i></div><div className="project-info"><span className="tag-row">{project.tags.length ? project.tags.map((tag) => <em key={tag}>{tag}</em>) : <em>Yeni</em>}</span><h3>{project.title}</h3><div className="project-progress"><i style={{width:`${progress}%`}}/></div><span className="project-meta"><small><Clock3 size={11}/>{project.due}</small><small>{done}/{tasks.length} görev</small></span></div></button><div className="project-subtasks">{tasks.length ? tasks.map((task,index) => { const id=`project-${project.id}-${index}`; return <button key={`${task}-${index}`} onClick={() => toggle(id)} className={state.completed[id]?'completed':''}><span>{state.completed[id]&&<Check size={10}/>}</span>{task}</button> }) : <p className="empty-inline">Bu proje için henüz görev eklenmedi.</p>}{stageIndex === 3 ? <button className="move-project" disabled={!isCustom} onClick={() => isCustom && archiveProject(project)}>{isCustom ? 'Arşive taşı' : 'Tamamlandı'}<Archive size={13}/></button> : <button className="move-project" onClick={() => { setState((current)=>({...current,projectStages:{...current.projectStages,[project.id]:Math.min(3,stageIndex+1)}})); notify(stageIndex === 2 ? 'Proje tamamlandı. İstersen arşive taşıyabilirsin.' : 'Proje bir sonraki aşamaya taşındı.'); }}>{`${stages[stageIndex+1]} aşamasına taşı`}<ArrowRight size={13}/></button>}</div></article>})}</div>{!visibleProjects.filter((p) => p.stage === stageIndex).length && <p className="empty-column">Bu sütun boş.</p>}<button className="add-card" onClick={() => openProject(stageIndex)}><Plus size={14}/> Kart ekle</button></section>)}</div>
      <div className="project-summary analytics-bottom"><div><span className="project-stat-icon violet"><LayoutGrid size={18}/></span><span><strong>{allProjects.length}</strong><small>Proje havuzu</small></span></div><div><span className="project-stat-icon mint"><Zap size={18}/></span><span><strong>{averageProgress}%</strong><small>Ortalama ilerleme</small></span></div><div><span className="project-stat-icon blue"><Clock3 size={18}/></span><span><strong>{allProjects.filter((project)=>project.stage>0&&project.stage<3).length}</strong><small>Aktif üretim</small></span></div></div>
    </>;
  };

  const renderKibleteyn = () => {
    const current = departments.find((item) => item.id === expandedDepartment)!;
    const currentTasks = [...current.tasks, ...(state.customDepartmentTasks[current.id] ?? [])];
    const CurrentIcon = current.icon;
    return <>
      <PageTitle eyebrow="KIBLETEYN" title="Operasyonun nabzı." description="Ekip, ürün ve tasarım akışları tek bir sakin görünümde." action={<button className="ghost-button" onClick={()=>setTeamView(!teamView)}><Users size={15}/>{teamView?'Odak görünümü':'Ekip görünümü'}</button>}/>
      {teamView?<section className="team-overview">{departments.map((department)=>{const DepartmentIcon=department.icon;const tasks=[...department.tasks,...(state.customDepartmentTasks[department.id]??[])];const done=tasks.filter((_,index)=>state.completed[`dept-${department.id}-${index}`]).length;return <button className="surface" key={department.id} onClick={()=>{setExpandedDepartment(department.id);setTeamView(false);}}><span><DepartmentIcon size={19}/></span><div><strong>{department.title}</strong><small>{done}/{tasks.length} görev tamamlandı</small></div><b>{department.progress}%</b><ChevronRight size={16}/></button>})}</section>:<><div className="department-tabs">{departments.map((department)=>{const DepartmentIcon=department.icon;return <button key={department.id} onClick={()=>setExpandedDepartment(department.id)} className={expandedDepartment===department.id?'active':''}><span><DepartmentIcon size={18}/></span><strong>{department.title}</strong><small>{department.progress}%</small></button>})}</div><section className="surface department-detail"><div className="department-lead"><span className="department-big-icon"><CurrentIcon size={24}/></span><div><span className="eyebrow">AKTİF ÇALIŞMA ALANI</span><h2>{current.title}</h2><p>{current.summary}</p></div><ProgressRing value={current.progress} size="small"/></div><div className="department-task-grid">{currentTasks.map((task,index)=>{const id=`dept-${current.id}-${index}`;return <button key={`${task}-${index}`} onClick={()=>toggle(id)} className={state.completed[id]?'completed':''}><span>{state.completed[id]?<Check size={13}/>:<Circle size={13}/>}</span><span><strong>{task}</strong><small>{index < 2 ? 'Bu hafta' : 'Sırada'}</small></span><ChevronRight size={14}/></button>})}</div><button className="add-department-task" onClick={openDepartmentTask}><Plus size={15}/> {current.title} alanına görev ekle</button></section></>}
      <section className="surface operation-hero analytics-bottom"><div><span className="status-chip"><i/> Operasyon aktif</span><h2>Bu hafta netlik yüksek.</h2><p>4 çalışma alanında 28 görev ilerliyor. Kritik blokaj görünmüyor.</p><div className="operation-stats"><span><strong>28</strong><small>Açık görev</small></span><span><strong>11</strong><small>Tamamlanan</small></span><span><strong>4</strong><small>Ekip alanı</small></span></div></div><div className="operation-visual"><span className="orbit o1"/><span className="orbit o2"/><span className="core"><Building2 size={28}/></span><i className="node n1"/><i className="node n2"/><i className="node n3"/></div></section>
    </>;
  };

  const renderPrograms = () => {
    const allPrograms = [...programs.map((program) => ({ ...program, ...(state.programEdits[program.id] ?? {}) })), ...state.customPrograms];
    const completedPreparations = allPrograms.reduce((total, program) => total + programCategories.reduce((sum, category, categoryIndex) => sum + visibleProgramTasks(program.id, category.name).filter((_, taskIndex) => state.completed[`program-${program.id}-${categoryIndex}-${taskIndex}`]).length, 0), 0);
    const totalPreparations = allPrograms.reduce((total, program) => total + programCategories.reduce((sum, category) => sum + visibleProgramTasks(program.id, category.name).length, 0), 0);
    return <>
      <PageTitle eyebrow="PROGRAMLAR" title="Her turun kendi ritmi." description="Kalabalık listeler yerine, aşama aşama açılan net hazırlık kartları." action={<button className="primary-button compact" onClick={openProgram}><Plus size={15}/> Yeni tur</button>}/>
      <div className="program-stack">{allPrograms.map((program)=>{const open=expandedProgram===program.id;const done=programCategories.reduce((sum,cat,catIndex)=>sum+visibleProgramTasks(program.id,cat.name).filter((_,taskIndex)=>state.completed[`program-${program.id}-${catIndex}-${taskIndex}`]).length,0);const total=programCategories.reduce((sum,cat)=>sum+visibleProgramTasks(program.id,cat.name).length,0);const progress=Math.max(program.progress, total ? Math.round(done/total*100) : 0);return <article key={program.id} className={`surface program-card ${open?'open':''}`}><button className="program-head" onClick={()=>setExpandedProgram(open?null:program.id)}><span className={`program-date ${program.accent}`}><strong>{program.range.split(' ')[0]}</strong><small>{program.range.split(' ').slice(1).join(' ')}</small></span><span className="program-name"><em>{program.status}</em><h2>{program.title}</h2></span><span className="program-progress"><strong>{progress}%</strong><i><b style={{width:`${progress}%`}}/></i><small>{done}/{total} kontrol</small></span><span className="program-chevron"><ChevronDown size={19}/></span></button><div className="program-content"><div className="category-grid"><div className="program-actions"><button onClick={()=>openProgramEdit(program)}><Settings size={13}/> Turu düzenle</button><button onClick={()=>openProgramTask(program.id)}><Plus size={13}/> Görev ekle</button></div>{programCategories.map((category,catIndex)=>{const CategoryIcon=category.icon;const tasks=visibleProgramTasks(program.id,category.name);const catDone=tasks.filter((_,taskIndex)=>state.completed[`program-${program.id}-${catIndex}-${taskIndex}`]).length;return <details key={category.name} open={catIndex===0&&open}><summary><span className={`category-icon c${catIndex}`}><CategoryIcon size={17}/></span><span><strong>{category.name}</strong><small>{catDone}/{tasks.length} tamamlandı</small></span><b>{tasks.length ? Math.round(catDone/tasks.length*100) : 0}%</b><ChevronDown size={14}/></summary><div className="category-tasks">{tasks.map((task,taskIndex)=>{const id=`program-${program.id}-${catIndex}-${taskIndex}`;return <div className={`program-task-row ${state.completed[id]?'completed':''}`} key={`${task}-${taskIndex}`}><button onClick={()=>toggle(id)}><span>{state.completed[id]&&<Check size={10}/>}</span>{task}<small>{taskIndex<2?'Bugün':'Bu hafta'}</small></button><IconButton label={`${task} görevini kaldır`} onClick={()=>removeProgramTask(program.id,task)}><X size={12}/></IconButton></div>})}<button className="add-program-task" onClick={()=>openProgramTask(program.id,category.name)}><Plus size={12}/> Bu kategoriye görev ekle</button></div></details>})}</div></div></article>})}</div>
      <div className="program-overview analytics-bottom"><div><Plane size={20}/><span><strong>{allPrograms.length}</strong><small>Yaklaşan tur</small></span></div><div><ListTodo size={20}/><span><strong>{totalPreparations - completedPreparations}</strong><small>Açık hazırlık</small></span></div><div><CheckCircle2 size={20}/><span><strong>{completedPreparations}</strong><small>Tamamlanan hazırlık</small></span></div></div>
    </>;
  };

  const renderCalendar = () => {
    const year = calendarCursor.getFullYear();
    const monthIndex = calendarCursor.getMonth();
    const monthName = new Intl.DateTimeFormat('tr-TR', { month: 'long' }).format(calendarCursor);
    const titleMonth = monthName.charAt(0).toLocaleUpperCase('tr') + monthName.slice(1);
    const days = Array.from({length:new Date(year, monthIndex + 1, 0).getDate()},(_,i)=>i+1);
    const leadingDays = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    const dateKey = (day: number) => `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const selectedDateKey = dateKey(selectedDay);
    const eventsFor = (day: number) => [...(calendarEvents[dateKey(day)] ?? []), ...(state.calendarEvents[dateKey(day)] ?? [])].sort((a, b) => a.time.localeCompare(b.time));
    const selectedEvents = eventsFor(selectedDay);
    const changeMonth = (delta: number) => { setCalendarCursor(new Date(year, monthIndex + delta, 1)); setSelectedDay(1); };
    const goToday = () => { const now = new Date(); setCalendarCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDay(now.getDate()); };
    const selectedWeekday = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(new Date(year, monthIndex, selectedDay));
    return <>
      <PageTitle eyebrow="TAKVİM" title="Zamana biraz boşluk bırak." description={`${titleMonth} ${year} · Planların ve ritimlerin tek görünümü.`} action={<button className="primary-button compact" onClick={()=>openEvent(selectedDateKey)}><Plus size={15}/> Etkinlik ekle</button>}/>
      <div className="calendar-layout"><section className="surface calendar-card"><header><div><IconButton label="Önceki ay" onClick={()=>changeMonth(-1)}><ChevronRight className="flip" size={16}/></IconButton><h2>{titleMonth} <span>{year}</span></h2><IconButton label="Sonraki ay" onClick={()=>changeMonth(1)}><ChevronRight size={16}/></IconButton></div><button className="today-button" onClick={goToday}>Bugün</button></header><div className="calendar-weekdays">{['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map((day)=><span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({length:leadingDays},(_,i)=><span className="empty-day" key={`empty-${i}`}/>)}{days.map((day)=>{const events=eventsFor(day);return <button key={day} onClick={()=>setSelectedDay(day)} className={`${dateKey(day) === new Date().toISOString().slice(0, 10) ? 'today' : ''} ${selectedDay===day?'selected':''}`}><span>{day}</span><div>{events.slice(0,2).map((event)=><i key={event.id} className={event.tone}>{event.title}</i>)}</div></button>})}</div></section><aside className="surface day-panel"><span className="eyebrow">SEÇİLİ GÜN</span><div className="day-number"><strong>{selectedDay}</strong><span>{titleMonth}<br/>{year}</span></div><h3>{selectedWeekday.charAt(0).toLocaleUpperCase('tr')+selectedWeekday.slice(1)}</h3><div className="day-events">{selectedEvents.length?selectedEvents.map((event)=><div className="day-event" key={event.id}><i className={event.tone}/><span><strong>{event.title}</strong><small>{event.time} · {event.duration}</small></span>{event.id.startsWith('event-') && <IconButton label="Etkinliği sil" onClick={() => deleteEvent(selectedDateKey, event.id)}><Trash2 size={13}/></IconButton>}</div>):<div className="empty-state"><CalendarDays size={24}/><p>Bu gün henüz boş.<br/>Biraz nefes iyi gelebilir.</p></div>}</div><button className="inline-add" onClick={()=>openEvent(selectedDateKey)}><Plus size={14}/> Bu güne ekle</button></aside></div>
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
      <div className="notes-grid"><button className="new-note-card" onClick={()=>setModal('note')}><span><Plus size={23}/></span><strong>Yeni düşünce</strong><small>Yazmaya başla</small></button>{filteredNotes.map((note)=><article key={note.id} className={`note-card surface ${note.tone}`}><div className="note-card-top"><span>{note.tone==='violet'?'KAYIT':note.tone==='blue'?'FİKİR':'NOT'}</span><IconButton label="Notu arşivle" onClick={()=>archiveNote(note)}><Archive size={15}/></IconButton></div><h2>{note.title}</h2><p>{note.body}</p><footer><span>{note.date}</span><button aria-label="Notu arşivle" onClick={()=>archiveNote(note)}><Trash2 size={14}/></button></footer></article>)}</div>
      {!filteredNotes.length&&<div className="notes-empty"><Search size={21}/><strong>Eşleşen not yok.</strong><span>Aramayı veya filtreyi değiştirebilirsin.</span></div>}
    </>;
  };

  const renderArchive = () => {
    const archiveItems = [...state.archive, ...archiveSeed.filter((item) => !state.restoredArchiveIds.includes(item.id))];
    const visibleItems = archiveFilter === 'all' ? archiveItems : archiveItems.filter((item)=>item.type===archiveFilter);
    return <>
      <PageTitle eyebrow="ARŞİV" title="Tamamlananlar burada dinlenir." description="Geçmiş projeler, turlar ve kayıtlar; ihtiyaç olduğunda bir tık uzağında."/>
      <div className="archive-tabs"><button className={archiveFilter==='all'?'active':''} onClick={()=>setArchiveFilter('all')}>Tümü <span>{archiveItems.length}</span></button><button className={archiveFilter==='project'?'active':''} onClick={()=>setArchiveFilter('project')}>Projeler <span>{archiveItems.filter((item) => item.type === 'project').length}</span></button><button className={archiveFilter==='program'?'active':''} onClick={()=>setArchiveFilter('program')}>Programlar <span>{archiveItems.filter((item) => item.type === 'program').length}</span></button><button className={archiveFilter==='note'?'active':''} onClick={()=>setArchiveFilter('note')}>Notlar <span>{archiveItems.filter((item) => item.type === 'note').length}</span></button></div>
      <div className="archive-list">{visibleItems.map((item,index)=><article className="surface archive-item" key={item.id}><span className={`archive-icon a${index%4}`}>{item.type==='program'?<Plane size={18}/>:item.type==='note'?<StickyNote size={18}/>:<LayoutGrid size={18}/>}</span><span><strong>{item.title}</strong><small>{item.label} · {item.date}</small></span><em>Tamamlandı</em><button onClick={()=>restoreArchiveItem(item)}><Undo2 size={14}/> Geri yükle</button><IconButton label="Arşivden geri yükle" onClick={()=>restoreArchiveItem(item)}><Undo2 size={15}/></IconButton></article>)}</div>
      <div className="archive-quote"><Archive size={22}/><p>Bitirdiğin her şey, kurduğun sistemin bir parçası.</p><span>{visibleItems.length} öğe · Son güncelleme bugün</span></div>
    </>;
  };

  const updateSetting = (key: keyof PersistedState['settings'], value: boolean | string) => setState((current)=>({...current,settings:{...current.settings,[key]:value}}));

  const saveProfile = () => {
    if (!profileDraft.name.trim() || !profileDraft.workspace.trim()) return;
    setState((current) => ({ ...current, profile: { name: profileDraft.name.trim(), workspace: profileDraft.workspace.trim() } }));
    setModal(null); notify('Profil bilgileri kaydedildi.');
  };

  const renderSettings = () => (
    <>
      <PageTitle eyebrow="AYARLAR" title="Orbit sana uyum sağlasın." description="Görünümü, bildirimleri ve çalışma biçimini kişiselleştir."/>
      <div className="settings-layout"><nav className="surface settings-nav"><button className={settingsTab==='general'?'active':''} onClick={()=>setSettingsTab('general')}><UserRound size={16}/> Genel</button><button className={settingsTab==='appearance'?'active':''} onClick={()=>setSettingsTab('appearance')}><Palette size={16}/> Görünüm</button><button className={settingsTab==='notifications'?'active':''} onClick={()=>setSettingsTab('notifications')}><Bell size={16}/> Bildirimler</button><button className={settingsTab==='data'?'active':''} onClick={()=>setSettingsTab('data')}><Download size={16}/> Veri</button></nav><div className="settings-content">
        {settingsTab==='general'&&<><section className="surface settings-section"><div className="settings-profile"><div className="large-avatar">{profileInitials}</div><div><h2>{state.profile.name}</h2><p>{state.profile.workspace}</p></div><button onClick={()=>{setProfileDraft(state.profile);setModal('profile');}}>Düzenle</button></div></section><section className="surface settings-section"><header><h3>Çalışma alanı</h3><p>Orbit’in temel bilgileri ve yerel kayıt durumu.</p></header><div className="setting-row"><span className="setting-icon"><Smartphone size={17}/></span><span><strong>Bu cihaz</strong><small>Değişiklikler bu tarayıcıda otomatik saklanıyor</small></span><CheckCircle2 size={18} className="setting-ok"/></div><div className="setting-row"><span className="setting-icon"><Globe2 size={17}/></span><span><strong>Dil ve bölge</strong><small>Türkçe · Europe/Istanbul</small></span><CheckCircle2 size={18} className="setting-ok"/></div></section></>}
        {settingsTab==='appearance'&&<section className="surface settings-section"><header><h3>Görünüm ve deneyim</h3><p>Orbit’in nasıl hissettirdiğini seç.</p></header><div className="setting-row theme-setting"><span className="setting-icon">{resolvedTheme==='dark'?<Moon size={17}/>:<Sun size={17}/>}</span><span><strong>Arayüz teması</strong><small>Açık, koyu veya cihazın görünümü</small></span><div className="theme-options" role="group" aria-label="Arayüz teması">{([{id:'light',label:'Açık',icon:Sun},{id:'system',label:'Sistem',icon:Monitor},{id:'dark',label:'Koyu',icon:Moon}] as const).map(({id,label,icon:ThemeIcon})=><button key={id} className={state.settings.theme===id?'selected':''} aria-pressed={state.settings.theme===id} onClick={()=>updateSetting('theme',id)}><ThemeIcon size={13}/><span>{label}</span></button>)}</div></div><div className="setting-row"><span className="setting-icon"><Palette size={17}/></span><span><strong>Vurgu rengi</strong><small>Altı renk seçeneğinden birini kullan</small></span><div className="color-options">{['violet','blue','mint','sand','rose','slate'].map((color)=><button aria-label={`${color} vurgu rengi`} key={color} className={`${color} ${state.settings.accent===color?'selected':''}`} onClick={()=>updateSetting('accent',color)}/>)}</div></div><div className="setting-row density-setting"><span className="setting-icon"><PanelsTopLeft size={17}/></span><span><strong>Bilgi yoğunluğu</strong><small>Ekranda daha ferah veya daha sıkı bir düzen seç</small></span><div className="theme-options" role="group" aria-label="Bilgi yoğunluğu">{([{id:'comfortable',label:'Ferah'},{id:'compact',label:'Kompakt'}] as const).map(({id,label})=><button key={id} className={state.settings.density===id?'selected':''} aria-pressed={state.settings.density===id} onClick={()=>updateSetting('density',id)}><span>{label}</span></button>)}</div></div><SettingToggle icon={Sparkles} title="Hareket ve animasyon" description="Yumuşak geçişleri ve mikro animasyonları kullan" value={state.settings.motion} onChange={(value)=>updateSetting('motion',value)}/><SettingToggle icon={Volume2} title="Arayüz sesleri" description="Tamamlama anlarında hafif ses geri bildirimi" value={state.settings.sound} onChange={(value)=>updateSetting('sound',value)}/></section>}
        {settingsTab==='notifications'&&<section className="surface settings-section"><header><h3>Akış ve bildirimler</h3><p>Sistem senin adına ne kadar takip etsin?</p></header><SettingToggle icon={Bell} title="Akıllı hatırlatmalar" description="Yaklaşan görev ve programlar için sakin bildirimler" value={state.settings.notifications} onChange={(value)=>updateSetting('notifications',value)}/><SettingToggle icon={Archive} title="Otomatik arşiv" description="Tamamlanan öğeleri 7 gün sonra arşivle" value={state.settings.autoArchive} onChange={(value)=>updateSetting('autoArchive',value)}/><SettingToggle icon={Eye} title="Tamamlananları göster" description="Personal listelerinde biten işleri görünür tut" value={state.settings.showCompleted} onChange={(value)=>updateSetting('showCompleted',value)}/></section>}
        {settingsTab==='data'&&<><section className="surface settings-section"><header><h3>Uygulama olarak kullan</h3><p>Orbit’i ana ekranına ekleyip tarayıcı çubuğu olmadan aç.</p></header><InstallOrbit/></section><section className="surface settings-section"><header><h3>Verini dışa aktar</h3><p>Orbit’teki yerel demo verisinin taşınabilir bir kopyasını al.</p></header><button className="data-export" onClick={exportDemoData}><Download size={16}/><span><strong>JSON yedeğini indir</strong><small>Görevler, notlar, proje aşamaları ve tercihler</small></span><ArrowRight size={15}/></button></section><section className="surface settings-section danger-section"><header><h3>Demo verisi</h3><p>Yerel değişiklikleri silip başlangıç verisine dön.</p></header><button onClick={()=>{if(window.confirm('Tüm yerel demo değişiklikleri sıfırlansın mı?')){setState(defaultState);notify('Demo verisi sıfırlandı.')}}}><RotateCcw size={15}/> Demo verisini sıfırla</button></section></>}
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
    <aside className={`sidebar ${mobileMenu?'open':''}`}><div className="brand-row"><button className="brand" onClick={()=>go('home')}><span className="brand-mark"><CircleDot size={18}/></span><span>Orbit<small>PERSONAL OS</small></span></button><IconButton label="Menüyü kapat" className="mobile-close" onClick={()=>setMobileMenu(false)}><X size={18}/></IconButton></div><nav className="side-nav" aria-label="Ana navigasyon">{nav.map((item)=>{const NavIcon=item.icon;const isNested=Boolean(item.parent);const isSectionActive=item.id==='kibleteyn'&&active==='programs';return <button key={item.id} className={`${active===item.id?'active ':''}${isNested?'nav-child ':''}${isSectionActive?'section-active':''}`.trim()} onClick={()=>go(item.id)} aria-current={active===item.id?'page':undefined}><span><NavIcon size={isNested?15:17}/></span>{item.label}{item.id==='programs'&&<em>{programs.length + state.customPrograms.length}</em>}</button>})}</nav><button className="sidebar-upgrade" onClick={()=>setModal('voice')}><span><Sparkles size={17}/></span><span><strong>Orbit Assistant</strong><small>Sesli komutu dene</small></span><ArrowUpRight size={14}/></button><button className="sidebar-profile" onClick={()=>{setProfileDraft(state.profile);setModal('profile');}}><div className="avatar">{profileInitials}</div><span><strong>{state.profile.name}</strong><small>{state.profile.workspace}</small></span><MoreHorizontal size={16}/></button></aside>
    {mobileMenu&&<button aria-label="Menüyü kapat" className="menu-backdrop" onClick={()=>setMobileMenu(false)}/>} 
    <section className="workspace"><header className="topbar"><IconButton label="Menüyü aç" className="menu-trigger" onClick={()=>setMobileMenu(true)}><Menu size={19}/></IconButton><div className="date-pill"><i/>{displayDate}</div><div className="top-actions"><IconButton label={resolvedTheme==='dark'?'Açık moda geç':'Koyu moda geç'} className="theme-toggle" onClick={()=>updateSetting('theme',resolvedTheme==='dark'?'light':'dark')}>{resolvedTheme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</IconButton><button className="search-trigger" onClick={()=>setModal('search')}><Search size={15}/><span>Ara...</span><kbd>/</kbd></button><IconButton label="Sesli komut" onClick={()=>setModal('voice')}><Mic size={16}/></IconButton><IconButton label="Bildirimler" onClick={()=>notify('Yeni bildirimin yok.')}><Bell size={16}/><i className="notification-dot"/></IconButton></div></header><div key={active} className={`content page-${active}`}>{renderPage()}</div></section>
    <nav className="bottom-nav" aria-label="Mobil navigasyon">{nav.slice(0,2).map((item)=>{const NavIcon=item.icon;return <button key={item.id} onClick={()=>go(item.id)} className={active===item.id?'active':''}><NavIcon size={19}/><small>{item.label==='Ana Sayfa'?'Ana':item.label}</small></button>})}<button className="quick-capture-trigger" onClick={openCaptureChoice} aria-label="Yeni kayıt ekle"><Plus size={21}/><small>Ekle</small></button>{nav.slice(2,4).map((item)=>{const NavIcon=item.icon;return <button key={item.id} onClick={()=>go(item.id)} className={active===item.id?'active':''}><NavIcon size={19}/><small>{item.label==='6 Aylık Rebuild'?'Rebuild':item.label}</small></button>})}<button onClick={()=>setMobileMenu(true)} className={['kibleteyn','programs','calendar','notes','archive','settings'].includes(active)?'active':''}><Menu size={19}/><small>Daha</small></button></nav>
    {modal&&<div className="modal-layer" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setModal(null)}}><section className={`modal-card ${modal}`} role="dialog" aria-modal="true" aria-label="Orbit penceresi"><IconButton label="Kapat" className="modal-close" onClick={()=>{setModal(null);setVoiceStep('idle')}}><X size={17}/></IconButton>
      {modal==='quick'&&<><span className="modal-icon"><ListTodo size={20}/></span><span className="eyebrow">HIZLI EKLE</span><h2>Yeni bir görev</h2><p>Aklındaki işi seçtiğin Personal listesine ekle.</p><label>Görev adı<input autoFocus value={quickText} onChange={(event)=>setQuickText(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&addQuick()} placeholder="Örn. Tur sunumunu kontrol et"/></label><div className="modal-options" role="group" aria-label="Görev listesi">{(Object.keys(personalLists) as (keyof typeof personalLists)[]).map((key)=>{const ItemIcon=personalLists[key].icon;return <button key={key} className={quickTarget===key?'selected':''} onClick={()=>setQuickTarget(key)}><ItemIcon size={14}/>{personalLists[key].title}</button>})}</div><button className="primary-button full" onClick={addQuick}>Görevi ekle <ArrowRight size={15}/></button></>}
      {modal==='note'&&<><span className="modal-icon"><StickyNote size={20}/></span><span className="eyebrow">YENİ NOT</span><h2>Bir düşünce yakala.</h2><label>Başlık<input autoFocus value={noteDraft.title} onChange={(event)=>setNoteDraft({...noteDraft,title:event.target.value})} placeholder="Not başlığı"/></label><label>Not<textarea value={noteDraft.body} onChange={(event)=>setNoteDraft({...noteDraft,body:event.target.value})} placeholder="Buraya yaz..."/></label><button className="primary-button full" onClick={addNote}>Notu kaydet <Check size={15}/></button></>}
      {modal==='project'&&<><span className="modal-icon"><PanelsTopLeft size={20}/></span><span className="eyebrow">YENİ PROJE</span><h2>Fikre net bir başlangıç ver.</h2><label>Proje adı<input autoFocus value={projectDraft.title} onChange={(event)=>setProjectDraft({...projectDraft,title:event.target.value})} placeholder="Örn. Seyahat planlama uygulaması"/></label><div className="form-row"><label>Aşama<select value={projectDraft.stage} onChange={(event)=>setProjectDraft({...projectDraft,stage:Number(event.target.value)})}>{['Fikirler','Devam ediyor','İnceleme','Tamamlandı'].map((label,index)=><option value={index} key={label}>{label}</option>)}</select></label><label>Renk<select value={projectDraft.color} onChange={(event)=>setProjectDraft({...projectDraft,color:event.target.value})}>{['violet','blue','mint','sand','rose'].map((color)=><option key={color} value={color}>{color}</option>)}</select></label></div><label>Hedef tarih<input value={projectDraft.due} onChange={(event)=>setProjectDraft({...projectDraft,due:event.target.value})} placeholder="Örn. 18 Eyl"/></label><label>Etiketler <small>Virgülle ayır</small><input value={projectDraft.tags} onChange={(event)=>setProjectDraft({...projectDraft,tags:event.target.value})} placeholder="UI, Mobil, Araştırma"/></label><label>İlk görevler <small>Her satıra bir görev</small><textarea value={projectDraft.tasks} onChange={(event)=>setProjectDraft({...projectDraft,tasks:event.target.value})} placeholder={'Kullanıcı akışını çıkar\nİlk ekranı tasarla'}/></label><button className="primary-button full" onClick={addProject}>Projeyi oluştur <ArrowRight size={15}/></button></>}
      {modal==='program'&&<><span className="modal-icon"><Plane size={20}/></span><span className="eyebrow">{editingProgramId?'TURU DÜZENLE':'YENİ TUR'}</span><h2>{editingProgramId?'Tur bilgilerini güncelle.':'Turun hazırlık alanını aç.'}</h2><label>Tur adı<input autoFocus value={programDraft.title} onChange={(event)=>setProgramDraft({...programDraft,title:event.target.value})} placeholder="Örn. 12–16 Ekim Umre"/></label><label>Tarih aralığı<input value={programDraft.range} onChange={(event)=>setProgramDraft({...programDraft,range:event.target.value})} placeholder="Örn. 12–16 Ekim 2026"/></label><label>Durum<select value={programDraft.status} onChange={(event)=>setProgramDraft({...programDraft,status:event.target.value})}>{['Taslak','Planlandı','Hazırlanıyor'].map((status)=><option key={status}>{status}</option>)}</select></label><label>Vurgu rengi<select value={programDraft.accent} onChange={(event)=>setProgramDraft({...programDraft,accent:event.target.value})}>{['violet','blue','mint','sand','rose'].map((color)=><option key={color} value={color}>{color}</option>)}</select></label><button className="primary-button full" onClick={addProgram}>{editingProgramId?'Değişiklikleri kaydet':'Turu oluştur'} <ArrowRight size={15}/></button></>}
      {modal==='programTask'&&<><span className="modal-icon"><ListTodo size={20}/></span><span className="eyebrow">PROGRAM GÖREVİ</span><h2>Hazırlık adımı ekle.</h2><label>Kategori<select value={programTaskDraft.category} onChange={(event)=>setProgramTaskDraft({...programTaskDraft,category:event.target.value})}>{programCategories.map((category)=><option key={category.name}>{category.name}</option>)}</select></label><label>Görev adı<input autoFocus value={programTaskDraft.title} onChange={(event)=>setProgramTaskDraft({...programTaskDraft,title:event.target.value})} onKeyDown={(event)=>event.key==='Enter'&&addProgramTask()} placeholder="Örn. Otel teyidini al"/></label><button className="primary-button full" onClick={addProgramTask}>Görevi ekle <ArrowRight size={15}/></button></>}
      {modal==='departmentTask'&&<><span className="modal-icon"><ListTodo size={20}/></span><span className="eyebrow">OPERASYON GÖREVİ</span><h2>{departments.find((department)=>department.id===expandedDepartment)?.title} için görev ekle.</h2><label>Görev adı<input autoFocus value={departmentTaskDraft} onChange={(event)=>setDepartmentTaskDraft(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&addDepartmentTask()} placeholder="Örn. Tedarikçiden teyit al"/></label><button className="primary-button full" onClick={addDepartmentTask}>Görevi ekle <ArrowRight size={15}/></button></>}
      {modal==='captureChoice'&&<><span className="modal-icon"><Plus size={21}/></span><span className="eyebrow">HIZLI KAYIT</span><h2>Nasıl eklemek istersin?</h2><p>Kaydın nereye gideceğini bir sonraki adımda seçebilirsin.</p><div className="capture-methods"><button onClick={()=>beginCapture('text')}><StickyNote size={20}/><span><strong>Yazılı kayıt</strong><small>Başlık ve açıklamayı yaz</small></span><ChevronRight size={16}/></button><button onClick={()=>beginCapture('voice')}><Mic size={20}/><span><strong>Sesli kayıt</strong><small>Konuşarak başlık oluştur</small></span><ChevronRight size={16}/></button></div></>}
      {modal==='capture'&&<><span className="modal-icon">{captureMethod==='voice'?<Mic size={20}/>:<StickyNote size={20}/>}</span><span className="eyebrow">{captureMethod==='voice'?'SESLİ KAYIT':'YAZILI KAYIT'}</span><h2>Kaydı tamamla.</h2>{captureMethod==='voice'&&<button className={`capture-mic ${captureListening?'listening':''}`} onClick={startCaptureVoice}><span>{captureListening?<Square size={16}/>:<Mic size={16}/>}</span><span><strong>{captureListening?'Dinliyorum…':'Konuşarak başlık ekle'}</strong><small>İstersen alttan düzenleyebilirsin</small></span></button>}<label>Başlık<input autoFocus value={captureTitle} onChange={(event)=>setCaptureTitle(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&saveCapture()} placeholder="Kaydetmek istediğin şey"/></label><label>Açıklama <small>İsteğe bağlı</small><textarea value={captureDetails} onChange={(event)=>setCaptureDetails(event.target.value)} placeholder="Kısa bir ayrıntı ekle..."/></label><div className="capture-destination"><strong>Nereye kaydedilsin?</strong><label>Sayfa<select value={capturePage} onChange={(event)=>{const page=event.target.value as CapturePage;setCapturePage(page);setCaptureArea(captureAreasFor(page)[0]?.value ?? '');}}>{[{value:'personal',label:'Personal'},{value:'rebuild',label:'6 Aylık Rebuild'},{value:'projects',label:'Projeler'},{value:'kibleteyn',label:'Kıbleteyn'},{value:'programs',label:'Programlar'},{value:'calendar',label:'Takvim'},{value:'notes',label:'Notlar'}].map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Alan<select value={captureArea} onChange={(event)=>setCaptureArea(event.target.value)}>{captureAreasFor(capturePage).map((area)=><option key={area.value} value={area.value}>{area.label}</option>)}</select></label></div><button className="primary-button full" onClick={saveCapture}>Seçilen alana kaydet <ArrowRight size={15}/></button></>}
      {modal==='event'&&<><span className="modal-icon"><CalendarDays size={20}/></span><span className="eyebrow">YENİ ETKİNLİK</span><h2>Takvimde yer aç.</h2><label>Etkinlik adı<input autoFocus value={eventDraft.title} onChange={(event)=>setEventDraft({...eventDraft,title:event.target.value})} placeholder="Örn. Tur semineri"/></label><div className="form-row"><label>Tarih<input type="date" value={eventDraft.date} onChange={(event)=>setEventDraft({...eventDraft,date:event.target.value})}/></label><label>Saat<input type="time" value={eventDraft.time} onChange={(event)=>setEventDraft({...eventDraft,time:event.target.value})}/></label></div><div className="form-row"><label>Süre<input value={eventDraft.duration} onChange={(event)=>setEventDraft({...eventDraft,duration:event.target.value})} placeholder="60 dk"/></label><label>Renk<select value={eventDraft.tone} onChange={(event)=>setEventDraft({...eventDraft,tone:event.target.value})}>{['violet','blue','mint','sand','rose','orange'].map((tone)=><option key={tone} value={tone}>{tone}</option>)}</select></label></div><button className="primary-button full" onClick={addEvent}>Takvime ekle <ArrowRight size={15}/></button></>}
      {modal==='profile'&&<><span className="modal-icon"><UserRound size={20}/></span><span className="eyebrow">ÇALIŞMA ALANI</span><h2>Profilini kişiselleştir.</h2><label>İsim<input autoFocus value={profileDraft.name} onChange={(event)=>setProfileDraft({...profileDraft,name:event.target.value})} placeholder="İsmin"/></label><label>Çalışma alanı<input value={profileDraft.workspace} onChange={(event)=>setProfileDraft({...profileDraft,workspace:event.target.value})} placeholder="Örn. Tasarım ve operasyon"/></label><button className="primary-button full" onClick={saveProfile}>Değişiklikleri kaydet <Check size={15}/></button></>}
      {modal==='voice'&&<VoiceModal step={voiceStep} onStart={startVoice} onAccept={acceptVoice}/>} 
      {modal==='search'&&<><div className="command-input"><Search size={18}/><input autoFocus value={searchText} onChange={(event)=>setSearchText(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter'&&searchResults[0]){go(searchResults[0].id);setModal(null);setSearchText('');}}} placeholder="Sayfa veya özellik ara..."/><kbd>ESC</kbd></div><div className="command-results"><span>Hızlı geçiş</span>{searchResults.length?searchResults.map((item)=>{const ItemIcon=item.icon;return <button key={item.id} onClick={()=>{go(item.id);setModal(null);setSearchText('')}}><i><ItemIcon size={17}/></i><strong>{item.label}</strong><small>Sayfaya git</small><ChevronRight size={14}/></button>}):<p className="empty-inline">Eşleşen sayfa bulunamadı.</p>}</div><div className="command-footer"><span><Command size={12}/> Orbit hızlı arama</span><span>↵ ilk sonucu aç · esc kapat</span></div></>}
    </section></div>}
    <div className={`toast ${toast?'show':''}`} role="status"><CheckCircle2 size={16}/>{toast}</div>
  </main>;
}

function SettingToggle({icon:Icon,title,description,value,onChange}:{icon:LucideIcon;title:string;description:string;value:boolean;onChange:(value:boolean)=>void}) {
  return <div className="setting-row"><span className="setting-icon"><Icon size={17}/></span><span><strong>{title}</strong><small>{description}</small></span><button aria-label={`${title} ${value?'kapat':'aç'}`} className={`switch ${value?'on':''}`} onClick={()=>onChange(!value)}><i/></button></div>;
}

function VoiceModal({step,onStart,onAccept}:{step:'idle'|'listening'|'done';onStart:()=>void;onAccept:()=>void}) {
  return <div className="voice-demo"><span className="eyebrow">ORBIT ASSISTANT · DEMO</span><h2>{step==='idle'?'Seni dinlemeye hazırım.':step==='listening'?'Dinliyorum...':'Bunu mu demek istedin?'}</h2><p>{step==='done'?'“Yarın 14:00 için tasarım değerlendirmesi ekle.”':'Bir görev, not veya plan söyle. Bu sürüm deneyimi simüle eder.'}</p><div className={`voice-visual ${step}`}><i/><i/><i/><i/><button onClick={step==='done'?onAccept:onStart}>{step==='listening'?<Square size={19}/>:step==='done'?<Check size={21}/>:<Mic size={21}/>}</button><i/><i/><i/><i/></div>{step==='idle'&&<small>Mikrofona dokun ve konuş</small>}{step==='listening'&&<small>Ses algılanıyor · demo</small>}{step==='done'&&<div className="voice-confirm"><button onClick={onStart}>Tekrar dene</button><button onClick={onAccept}>Görevi oluştur <ArrowRight size={14}/></button></div>}</div>;
}
