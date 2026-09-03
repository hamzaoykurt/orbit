'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent as ReactFocusEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { InstallOrbit } from './install-orbit';
import { readStartupState } from './startup';
import { useNavigation, useNavigationState } from './use-navigation';
import type { PageKey } from './navigation';
import { STATE_KEY, readPending, journalState, acknowledgeState, rebaseState } from './state-sync';
import { emptyTask, emptyWorkspace, normalizeWorkspace } from './projects/project-types';
import type { ProjectTaskDetails, ProjectWorkspaceData } from './projects/project-types';
import { NotesWorkspace } from './notes/notes-workspace';
import { newNote, normalizeNotes } from './notes/note-model';
import type { Note } from './notes/note-model';
import { newCreationDraft, normalizeCreationDraft, normalizePlanning, lifecycleFromStage, stageFromLifecycle } from './projects/planning-types';
import type { CreationDraft, ProjectPlanning } from './projects/planning-types';
import { applyPlanning, addPlanningResearch, planningResearchId } from './projects/planning-actions';
import { parseProgramDateRange } from './program-date';
import type { ActivityEntry } from './rebuild/activity-model';
import { emptyJourney, normalizeJourney } from './rebuild/journey-model';
import type { Journey } from './rebuild/journey-model';
import { emptyDeck, normalizeDeck } from './rebuild/weekly-deck-model';
import type { WeeklyDeck } from './rebuild/weekly-deck-model';
import { emptyPractice, normalizePractice, acceptIntoPractice } from './rebuild/practice-model';
import type { Practice } from './rebuild/practice-model';
import {
  Archive, ArrowRight, ArrowUpRight, Bell, BriefcaseBusiness,
  Building2, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight,
  Circle, CircleDot, Clock3, Command, Compass, Download, Dumbbell, Eye, Globe2,
  ExternalLink, Flag, Home as HomeIcon, Languages, LayoutGrid, Link2, ListTodo, Map, MapPin,
  LogOut, Menu, Mic, Monitor, Moon, MoreHorizontal, NotebookPen, PanelsTopLeft, Palette,
  Plane, Play, Plus, Rocket, RotateCcw, Route, Search, Settings, ShoppingBag,
  Smartphone, Sparkles, Square, StickyNote, Sun, Trash2, Undo2, UserRound, Users,
  Volume1, Volume2, X, Zap, GripVertical, RefreshCw,
} from 'lucide-react';

const ProjectWorkspace = lazy(() => import('./projects/project-workspace').then(module => ({ default: module.ProjectWorkspace })));
const ProjectsHub = lazy(() => import('./projects/projects-hub').then(module => ({ default: module.ProjectsHub })));
const ProjectCreator = lazy(() => import('./projects/project-creator').then(module => ({ default: module.ProjectCreator })));
const RebuildJourney = lazy(() => import('./rebuild/rebuild-journey').then(module => ({ default: module.RebuildJourney })));
type PersonalListKey = 'todo' | 'buy' | 'visit';
type PersonalItemDetails = { title?: string; note?: string; price?: string; link?: string; locationUrl?: string; priority?: 'normal' | 'important' };
type PersonalSubtask = { id: string; title: string };
type PersonalDragState = { kind: 'item' | 'subtask'; list: PersonalListKey; itemId: string; subtaskId?: string; overId: string; title: string; x: number; y: number; pointerId: number };
type ProjectCover = 'orbit' | 'aurora' | 'grid' | 'minimal';
type Project = { id: string; title: string; stage: number; progress: number; color: string; due: string; tags: string[]; tasks: string[]; cover?: ProjectCover };
type Program = { id: string; title: string; range: string; people: number; status: string; progress: number; accent: string };
type CalendarEvent = { id: string; title: string; tone: string; time: string; duration: string; description?: string; source?: string; googleEventId?: string; htmlLink?: string };
type GoogleCalendarIntegration = { clientId: string; calendarId: string };
type ArchiveItem = { id: string; title: string; type: 'project' | 'program' | 'note'; label: string; date: string; source?: Project | Program | Note };
type ThemePreference = 'light' | 'dark' | 'system';
type CapturePage = 'personal' | 'rebuild' | 'projects' | 'kibleteyn' | 'programs' | 'calendar' | 'notes';
type CaptureMethod = 'text' | 'voice' | 'ai';
type CaptureStage = 'compose' | 'listening' | 'destination' | 'processing';
type CaptureExtras = { price: string; link: string; locationUrl: string; priority: 'normal' | 'important'; date: string; time: string; duration: string };
type AiCaptureItem = {
  kind: 'todo' | 'buy' | 'visit' | 'project' | 'project_task' | 'rebuild_task' | 'department_task' | 'program_task' | 'calendar_event' | 'note';
  title: string; details: string; targetId: string; category: string; price: string; link: string; locationUrl: string;
  date: string; time: string; duration: string; tags: string[]; subtasks: string[];
};
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
type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string };
type GoogleOAuthWindow = Window & { google?: { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void; error_callback?: (error: { type?: string }) => void }) => { requestAccessToken: (options: { prompt: string }) => void }; revoke: (token: string, callback: () => void) => void } } } };
type StoredGoogleSession = { accessToken: string; expiresAt: number; reconnect: boolean };
type RebuildActivity = { id: string; areaId: string; title: string; date: string; duration: number; note: string; rating: number; createdAt: string; details?: ActivityEntry['details'] };
type RebuildReview = { weekKey: string; win: string; friction: string; nextFocus: string; energy: number; createdAt: string };
type RebuildBodyPlan = { name: string; workouts: string[]; nutrition: string[] };
type ResearchIdea = { id: string; title: string; kind: 'curiosity' | 'creative' | 'solo'; status: 'spark' | 'exploring' | 'making'; createdAt: string };
type OrbitNotification = { id: string; title: string; description: string; date: string; eventTime: string; tone: string };
type PersistedState = {
  completed: Record<string, boolean>;
  customPersonal: Record<string, string[]>;
  personalItemDetails: Record<string, PersonalItemDetails>;
  personalRemovedItems: string[];
  personalOrder: Record<PersonalListKey, string[]>;
  personalSubtasks: Record<string, PersonalSubtask[]>;
  projectCreationDraft: CreationDraft | null;
  projectStages: Record<string, number>;
  customProjects: Project[];
  projectEdits: Record<string, Partial<Project>>;
  projectExtraTasks: Record<string, string[]>;
  projectRemovedTasks: Record<string, string[]>;
  projectSubtasks: Record<string, PersonalSubtask[]>;
  projectWorkspaces: Record<string, ProjectWorkspaceData>;
  projectTaskDetails: Record<string, ProjectTaskDetails>;
  customPrograms: Program[];
  removedProgramIds: string[];
  programEdits: Record<string, Partial<Program>>;
  programExtraTasks: Record<string, Record<string, string[]>>;
  programRemovedTasks: Record<string, string[]>;
  customDepartmentTasks: Record<string, string[]>;
  customRebuildTasks: Record<string, string[]>;
  rebuildJourney: Journey;
  rebuildDeck: WeeklyDeck;
  rebuildPractice: Practice;
  rebuildActivities: RebuildActivity[];
  rebuildReviews: Record<string, RebuildReview>;
  rebuildSelections: Record<string, string>;
  researchIdeas: ResearchIdea[];
  rebuildBodyPlan: RebuildBodyPlan;
  rebuildDailyChecks: Record<string, string[]>;
  calendarEvents: Record<string, CalendarEvent[]>;
  calendarIntegration: GoogleCalendarIntegration;
  notificationReadIds: string[];
  notificationDismissedIds: string[];
  archive: ArchiveItem[];
  restoredArchiveIds: string[];
  notes: Note[];
  mobileNav: PageKey[];
  profile: { name: string; workspace: string };
  settings: { notifications: boolean; motion: boolean; sound: boolean; soundVolume: number; haptics: boolean; feedbackVersion: number; autoArchive: boolean; accent: string; theme: ThemePreference; density: 'comfortable' | 'compact'; showCompleted: boolean };
};
const nav: { id: PageKey; label: string; icon: LucideIcon; parent?: PageKey }[] = [
  { id: 'home', label: 'Ana Sayfa', icon: HomeIcon },
  { id: 'personal', label: 'Personal', icon: UserRound },
  { id: 'rebuild', label: '6 Aylık Rebuild', icon: Route },
  { id: 'projects', label: 'Projeler', icon: PanelsTopLeft },
  { id: 'kibleteyn', label: 'Kıbleteyn', icon: Building2 },
  { id: 'programs', label: 'Turlar', icon: Map, parent: 'kibleteyn' },
  { id: 'calendar', label: 'Takvim', icon: CalendarDays },
  { id: 'notes', label: 'Notlar', icon: StickyNote },
  { id: 'archive', label: 'Arşiv', icon: Archive },
  { id: 'settings', label: 'Ayarlar', icon: Settings },
];
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? '';
const GOOGLE_CALENDAR_ID = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ID?.trim() ?? '';
const GOOGLE_SESSION_KEY = 'orbit-google-calendar-session';

const defaultState: PersistedState = {
  completed: { 'routine-1': true, 'personal-1': true, 'program-14': true, 'project-pos-1': true, 'rebuild-2': true },
  customPersonal: { todo: [], buy: [], visit: [] },
  personalItemDetails: {
    'personal-buy-1': { price: '1250' },
    'personal-buy-3': { price: '6000' },
    'personal-visit-0': { locationUrl: 'https://www.google.com/maps/search/?api=1&query=Dunluce+Castle' },
  },
  personalRemovedItems: [],
  personalOrder: { todo: [], buy: [], visit: [] },
  personalSubtasks: {},
  projectCreationDraft: null,
  projectStages: {},
  customProjects: [],
  projectEdits: {},
  projectExtraTasks: {},
  projectRemovedTasks: {},
  projectSubtasks: {},
  projectWorkspaces: {},
  projectTaskDetails: {},
  customPrograms: [],
  removedProgramIds: [],
  programEdits: {},
  programExtraTasks: {},
  programRemovedTasks: {},
  customDepartmentTasks: {},
  customRebuildTasks: {},
  rebuildJourney: emptyJourney(),
  rebuildDeck: emptyDeck(),
  rebuildPractice: emptyPractice(),
  rebuildActivities: [],
  rebuildReviews: {},
  rebuildSelections: {},
  researchIdeas: [],
  rebuildBodyPlan: { name: 'Glow Up · Temel Program', workouts: ['Program A · Üst vücut', 'Program B · Alt vücut', 'Program C · Full body / kondisyon'], nutrition: ['Protein hedefini tamamla', 'Sebze ve lif ekle', '2–2,5 litre su iç', 'Uyku saatini koru'] },
  rebuildDailyChecks: {},
  calendarEvents: {},
  calendarIntegration: { clientId: '', calendarId: 'primary' },
  notificationReadIds: [],
  notificationDismissedIds: [],
  archive: [],
  restoredArchiveIds: [],
  notes: normalizeNotes([
    { id: 'n1', title: 'Yol haritası notları', body: 'Sistemi büyütmeden önce her ekranın tek bir net işi olmalı. Sadelik, özellik eksikliği değil; doğru sıradır.', date: 'Bugün · 10:42', tone: 'violet' },
    { id: 'n2', title: 'Orbit Explorer fikri', body: 'Gezegenleri ölçekli yörüngelerde, dokunarak keşfedilen sakin bir deneyime dönüştür.', date: 'Dün · 22:18', tone: 'blue' },
    { id: 'n3', title: 'Eylül turu', body: 'Seminer içeriğinde ilk 15 dakikayı daha görsel ve daha kısa tut. Transfer detaylarını tekrar kontrol et.', date: '21 Ağu · 16:05', tone: 'sand' },
  ]),
  mobileNav: ['personal', 'projects', 'kibleteyn', 'calendar'],
  profile: { name: 'Emir Güney', workspace: 'Kişisel çalışma alanı' },
  settings: { notifications: true, motion: true, sound: true, soundVolume: 110, haptics: true, feedbackVersion: 4, autoArchive: true, accent: 'violet', theme: 'system', density: 'comfortable', showCompleted: true },
};

function mergePersistedState(value: unknown): PersistedState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultState;
  const saved = value as Partial<PersistedState>;
  const savedSettings: Partial<PersistedState['settings']> = saved.settings ?? {};
  const needsFeedbackMigration = savedSettings.feedbackVersion !== 4;
  const savedMobileNav = Array.isArray(saved.mobileNav) && saved.mobileNav.length === 4 && saved.mobileNav.every((page): page is PageKey => typeof page === 'string' && nav.some((item) => item.id === page)) && new Set(saved.mobileNav).size === 4 ? saved.mobileNav : defaultState.mobileNav;
  const migratedMobileNav = savedMobileNav.includes('home') ? defaultState.mobileNav : savedMobileNav;

  return {
    completed: { ...defaultState.completed, ...(saved.completed ?? {}) },
    customPersonal: {
      ...defaultState.customPersonal,
      ...(saved.customPersonal ?? {}),
    },
    personalItemDetails: { ...defaultState.personalItemDetails, ...(saved.personalItemDetails ?? {}) },
    personalRemovedItems: Array.isArray(saved.personalRemovedItems) ? saved.personalRemovedItems : defaultState.personalRemovedItems,
    personalOrder: { ...defaultState.personalOrder, ...(saved.personalOrder ?? {}) },
    personalSubtasks: saved.personalSubtasks && typeof saved.personalSubtasks === 'object' && !Array.isArray(saved.personalSubtasks) ? saved.personalSubtasks : defaultState.personalSubtasks,
    projectCreationDraft: normalizeCreationDraft(saved.projectCreationDraft),
    projectStages: { ...defaultState.projectStages, ...(saved.projectStages ?? {}) },
    customProjects: Array.isArray(saved.customProjects) ? saved.customProjects : defaultState.customProjects,
    projectEdits: saved.projectEdits && typeof saved.projectEdits === 'object' && !Array.isArray(saved.projectEdits) ? saved.projectEdits : defaultState.projectEdits,
    projectExtraTasks: saved.projectExtraTasks && typeof saved.projectExtraTasks === 'object' && !Array.isArray(saved.projectExtraTasks) ? saved.projectExtraTasks : defaultState.projectExtraTasks,
    projectRemovedTasks: saved.projectRemovedTasks && typeof saved.projectRemovedTasks === 'object' && !Array.isArray(saved.projectRemovedTasks) ? saved.projectRemovedTasks : defaultState.projectRemovedTasks,
    projectSubtasks: saved.projectSubtasks && typeof saved.projectSubtasks === 'object' && !Array.isArray(saved.projectSubtasks) ? saved.projectSubtasks : defaultState.projectSubtasks,
    projectWorkspaces: saved.projectWorkspaces && typeof saved.projectWorkspaces === 'object' && !Array.isArray(saved.projectWorkspaces) ? Object.fromEntries(Object.entries(saved.projectWorkspaces).map(([id, workspace]) => { const normalized=normalizeWorkspace(workspace); return [id, { ...normalized, planning: normalizePlanning(workspace?.planning) }]; })) : {},
    projectTaskDetails: saved.projectTaskDetails && typeof saved.projectTaskDetails === 'object' && !Array.isArray(saved.projectTaskDetails) ? saved.projectTaskDetails : {},
    customPrograms: Array.isArray(saved.customPrograms) ? saved.customPrograms : defaultState.customPrograms,
    removedProgramIds: Array.isArray(saved.removedProgramIds) ? saved.removedProgramIds : defaultState.removedProgramIds,
    programEdits: saved.programEdits && typeof saved.programEdits === 'object' && !Array.isArray(saved.programEdits) ? saved.programEdits : defaultState.programEdits,
    programExtraTasks: saved.programExtraTasks && typeof saved.programExtraTasks === 'object' && !Array.isArray(saved.programExtraTasks) ? saved.programExtraTasks : defaultState.programExtraTasks,
    programRemovedTasks: saved.programRemovedTasks && typeof saved.programRemovedTasks === 'object' && !Array.isArray(saved.programRemovedTasks) ? saved.programRemovedTasks : defaultState.programRemovedTasks,
    customDepartmentTasks: saved.customDepartmentTasks && typeof saved.customDepartmentTasks === 'object' && !Array.isArray(saved.customDepartmentTasks) ? saved.customDepartmentTasks : defaultState.customDepartmentTasks,
    customRebuildTasks: saved.customRebuildTasks && typeof saved.customRebuildTasks === 'object' && !Array.isArray(saved.customRebuildTasks) ? saved.customRebuildTasks : defaultState.customRebuildTasks,
    rebuildJourney: normalizeJourney(saved.rebuildJourney),
    rebuildDeck: normalizeDeck(saved.rebuildDeck),
    rebuildPractice: normalizePractice(saved.rebuildPractice),
    rebuildActivities: Array.isArray(saved.rebuildActivities) ? saved.rebuildActivities : defaultState.rebuildActivities,
    rebuildReviews: saved.rebuildReviews && typeof saved.rebuildReviews === 'object' && !Array.isArray(saved.rebuildReviews) ? saved.rebuildReviews : defaultState.rebuildReviews,
    rebuildSelections: saved.rebuildSelections && typeof saved.rebuildSelections === 'object' && !Array.isArray(saved.rebuildSelections) ? saved.rebuildSelections : defaultState.rebuildSelections,
    researchIdeas: Array.isArray(saved.researchIdeas) ? saved.researchIdeas : defaultState.researchIdeas,
    rebuildBodyPlan: saved.rebuildBodyPlan && typeof saved.rebuildBodyPlan === 'object' && !Array.isArray(saved.rebuildBodyPlan) ? { ...defaultState.rebuildBodyPlan, ...saved.rebuildBodyPlan } : defaultState.rebuildBodyPlan,
    rebuildDailyChecks: saved.rebuildDailyChecks && typeof saved.rebuildDailyChecks === 'object' && !Array.isArray(saved.rebuildDailyChecks) ? saved.rebuildDailyChecks : defaultState.rebuildDailyChecks,
    calendarEvents: saved.calendarEvents && typeof saved.calendarEvents === 'object' && !Array.isArray(saved.calendarEvents) ? saved.calendarEvents : defaultState.calendarEvents,
    calendarIntegration: { ...defaultState.calendarIntegration, ...(saved.calendarIntegration ?? {}) },
    notificationReadIds: Array.isArray(saved.notificationReadIds) ? saved.notificationReadIds : defaultState.notificationReadIds,
    notificationDismissedIds: Array.isArray(saved.notificationDismissedIds) ? saved.notificationDismissedIds : defaultState.notificationDismissedIds,
    archive: Array.isArray(saved.archive) ? saved.archive : defaultState.archive,
    restoredArchiveIds: Array.isArray(saved.restoredArchiveIds) ? saved.restoredArchiveIds : defaultState.restoredArchiveIds,
    notes: Array.isArray(saved.notes) ? normalizeNotes(saved.notes) : defaultState.notes,
    mobileNav: migratedMobileNav,
    profile: { ...defaultState.profile, ...(saved.profile ?? {}) },
    settings: { ...defaultState.settings, ...savedSettings, ...(needsFeedbackMigration ? { sound: true, soundVolume: 110, haptics: true, feedbackVersion: 4 } : {}) },
  };
}

const personalLists = {
  todo: { title: 'Yapılacaklar', icon: ListTodo, subtitle: 'Sisteme geçirilecek kişisel işler', items: ['Tüm mevcut projelerimi tek sisteme geçir', 'Masaüstü bilgisayarın uygulamalar menüsünü düzenle', 'Masaüstü bilgisayarda yer aç', 'Masaüstü bilgisayardaki fotoğrafları düzenle', 'Masaüstü bilgisayardaki uygulama listesini düzenle', 'Spor programımı düzenle', "Instagram'da kaydettiğim GitHub projesini incele", 'Özelleştirmeyle ilgili proje fikirleri araştır', 'GPT ile sevdiğim şeylerden proje fikirleri üret'] },
  buy: { title: 'Alınacaklar', icon: ShoppingBag, subtitle: 'Önemli, çalışma alanı, giyim ve bisiklet', items: ['Güneş gözlüğü', 'Monitör kolu', 'Yeşil pamuklu gömlek', 'Casio B185D saat', 'Keten pantolon', 'Sarı / ahşap masa lambası', 'Ahşap bardak altlığı', 'Siyah mousepad', 'Sağlam ahşap monitör üstü raf', 'Siyah bardak', 'Siyah mouse', 'Yapay bitki', 'Cam bardak', 'Bisiklet kaskı', 'Bisiklet gözlüğü', 'Ön ışık', 'Arka ışık', 'Matara', 'Matara yuvası', 'Telefon tutacağı', 'Bisiklet ek çantası', 'Çanta için pompa', 'Yama seti', 'İç lastik', 'Levye', 'Temel bisiklet ekipmanları'] },
  visit: { title: 'Gezilecekler', icon: MapPin, subtitle: 'Kaydedilen yerler ve yeni keşifler', items: ['Dunluce Castle'] },
};

const safeExternalUrl = (value?: string) => {
  if (!value?.trim()) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const numericPrice = (value?: string) => Number((value ?? '').replace(',', '.')) || 0;
const formatPrice = (value: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value);
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayKey = () => localDateKey(new Date());
const weekStartKey = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return localDateKey(start);
};
const completionRate = (done: number, total: number) => total ? Math.round(done / total * 100) : 0;
const durationInMinutes = (duration: string) => Math.max(15, Number(duration.match(/\d+/)?.[0] ?? 60));
const compactGoogleDate = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, '');

const googleCalendarTemplateUrl = (event: CalendarEvent, date: string) => {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, details: [event.description, event.source ? `Orbit · ${event.source}` : ''].filter(Boolean).join('\n') });
  if (/^\d{2}:\d{2}$/.test(event.time)) {
    const start = new Date(`${date}T${event.time}:00`);
    const end = new Date(start.getTime() + durationInMinutes(event.duration) * 60_000);
    params.set('dates', `${compactGoogleDate(start)}/${compactGoogleDate(end)}`);
  } else {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    params.set('dates', `${localDateKey(start).replaceAll('-', '')}/${localDateKey(end).replaceAll('-', '')}`);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const rebuildAreas: { id: string; title: string; icon: LucideIcon; progress: number; color: string; target: number; measure: 'sessions' | 'minutes'; targetLabel: string; quickActions: string[]; habits: string[] }[] = [
  { id: 'body', title: 'Beden', icon: Dumbbell, progress: 72, color: 'mint', target: 3, measure: 'sessions', targetLabel: '3 antrenman', quickActions: ['Kuvvet antrenmanı', 'Kardiyo / bisiklet', 'Mobilite / yürüyüş'], habits: ['Haftada 3 spor yap', 'Her antrenmanı 45–60 dakika sürdür', 'İlk 6 hafta performans yerine devamlılığı koru', 'Tekrar düzenli spor yapan biri olmayı hedefle', 'Spor programını yeniden düzenle'] },
  { id: 'curiosity', title: 'Zihin / Merak', icon: Sparkles, progress: 64, color: 'violet', target: 1, measure: 'sessions', targetLabel: '1 merak döngüsü', quickActions: ['Araştırma', 'Anlatım', 'Görsel çıktı'], habits: ['Her hafta seçenekler arasından bir merak konusu seç', 'Merak et → araştır → anla → üret → anlat akışını tamamla', 'Uzay, dinozor, fizik, teknoloji, tasarım veya gelecek araştır', 'Retro-futurism, yapay zekâ, bilim veya teknoloji tarihine bak', 'Araştırmadan görsel, poster, UI, simülasyon, diagram ya da video üret', 'Öğrendiğini 5 dakika kendi cümlelerinle anlat'] },
  { id: 'creativity', title: 'Yaratıcılık', icon: Palette, progress: 58, color: 'rose', target: 180, measure: 'minutes', targetLabel: '3 saat üretim', quickActions: ['UI deneyi', 'Görsel / poster', 'İnteraktif prototip'], habits: ['Haftada minimum 3 saat yaratıcı iş yap', 'Para kazanma şartı olmadan sevdiğin bir fikir seç', 'Futuristic UI, retro-futuristic telefon sistemi veya uzay kokpiti dene', 'Dinozor müzesi UI veya gezegen görselleştirmesi üret', 'AI görseli, fotoğraf, color grading veya bilimsel görselleştirme yap', 'Deneysel uygulama ya da interaktif web deneyimi geliştir', 'Kapsamı küçült; kaliteyi küçültme', 'Küçük ama aşırı iyi bitmiş bir çıktı hazırla'] },
  { id: 'language', title: 'İngilizce ve Diksiyon', icon: Languages, progress: 81, color: 'blue', target: 5, measure: 'sessions', targetLabel: '5 kısa pratik', quickActions: ['İngilizce konuşma', 'İngilizce içerik', 'Diksiyon kaydı'], habits: ['Sevdiğin içerikleri İngilizce tüket', 'Araştırmaların bir kısmını İngilizce yap', 'Haftada 2–3 kez, 15–20 dakika konuş', 'Önce konuş; hataları sonra incele', 'Haftada 2–3 adet, 5–10 dakikalık ses kaydı al', 'Kayıtta tempo, kelime yutma ve “eee / şey / yani” kullanımını kontrol et', 'Cümle netliği ve özgüveni değerlendir', 'Öğrendiğin bir şeyi veya fikrini basitçe anlat', 'Film, oyun veya teknoloji yorumu kaydet', 'Karmaşık bir konuyu ve kendi görüşünü net biçimde açıkla'] },
  { id: 'solo', title: 'Solo Özgüven', icon: Compass, progress: 43, color: 'indigo', target: 1, measure: 'sessions', targetLabel: '1 solo keşif', quickActions: ['Fotoğraf yürüyüşü', 'Yeni bir kafe / semt', 'Müze / sergi'], habits: ['Haftada en az 1 kez tek başına dışarı çık', 'Fotoğraf yürüyüşü, sahil, yeni semt, kafe veya müze seç', 'Sergi, kitapçı, etkinlik ya da günübirlik gezi dene', 'Her çıkışta en az bir küçük sosyal etkileşim kur', 'Özgüven gelmesini bekleme; yaşadıkça özgüven kazan'] },
  { id: 'social', title: 'Sosyal Hayat', icon: Users, progress: 46, color: 'orange', target: 2, measure: 'sessions', targetLabel: '2 sosyal temas', quickActions: ['Düzenli ortam', 'Kısa sohbet', 'Birlikte aktivite'], habits: ['En az 2 düzenli sosyal ortam oluştur', 'Spor, speaking club, fotoğraf, trekking veya koşu ortamı dene', 'Workshop, teknoloji topluluğu, masa oyunu veya gönüllülüğe bak', 'Ay 1: küçük etkileşimler kur', 'Ay 2: isim öğren ve soru sor', 'Ay 3: sohbeti sürdür ve uygun kişileri sosyal medyada ekle', 'Ay 4+: kahve veya aktivite teklif et'] },
  { id: 'career', title: 'Kariyer ve Para', icon: BriefcaseBusiness, progress: 69, color: 'sand', target: 150, measure: 'minutes', targetLabel: '2,5 saat deney', quickActions: ['Portföy örneği', 'Hizmet deneyi', 'Gerçek kişiye ulaş'], habits: ["Şimdilik Kıbleteyn'den ayrılma; gelir tabanını koru", 'Mobil uygulama prototipi, UI/UX veya uygulama tasarımı hizmeti dene', 'Landing page, interaktif web veya AI destekli görsel çalışma üret', 'Küçük bir uygulama geliştirmeyi dışarıya hizmet olarak dene', 'İlk hedef olarak kendi becerinle dışarıdan ilk parayı kazan', 'Sevdiğin konularda kendi ürünlerini geliştir', "Gelir üreten proje oluşursa Kıbleteyn'e bağımlılığı azalt"] },
  { id: 'space', title: 'Uzay Mühendisliği Testi', icon: Rocket, progress: 35, color: 'indigo', target: 90, measure: 'minutes', targetLabel: '90 dk gerçek test', quickActions: ['Konuyu öğren', 'Mini deney yap', 'Deneyimi değerlendir'], habits: ["KPSS'yi şimdilik öncelik yapma; DGS'yi çocukluk hayalin için test et", 'Uzayı sevmekle uzay mühendisliği yapmayı ayır', 'İlk 3 ay yörünge mekaniği ve itki sistemlerini araştır', 'Aerodinamik, kontrol ve termal sistemleri incele', 'Malzeme ve haberleşme alanlarını test et', 'Interactive Orbit Explorer ile bir simülasyon üret', 'Fiziği ve mühendislik problemlerini sevip sevmediğini gözle', 'UI/simülasyon mu yoksa mühendislik eğitimi mi istediğine karar ver', '3. ay sonunda ciddi eğitime değip değmediğini değerlendir'] },
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
  const { page: active, project: activeProjectId, navigate, backTo } = useNavigation();
  const pageContentRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<PersistedState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const lastSyncedState = useRef('');
  const serverRevision = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastFeedbackAtRef = useRef(0);
  const [mobileMenu, setMobileMenu] = useNavigationState<boolean>('overlay:mobile-menu', false, true);
  const [modal, setModal] = useNavigationState<'quick' | 'personalItem' | 'search' | 'notifications' | 'note' | 'project' | 'program' | 'programTask' | 'departmentTask' | 'event' | 'profile' | 'navCustomize' | 'capture' | null>('overlay:modal', null, true);
  const [toast, setToast] = useState('');
  const [projectCreatorOpen, setProjectCreatorOpen] = useNavigationState<boolean>('overlay:creator', false, true);
  const [syncStatus, setSyncStatus] = useState('loading');
  const [loggingOut, setLoggingOut] = useState(false);
  const [syncRetry, setSyncRetry] = useState(0);
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  const syncVersion = useRef(0);
  const pendingSaves = useRef(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => pageContentRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [active, activeProjectId]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [expandedProgram, setExpandedProgram] = useNavigationState<string | null>('programs:expanded', 'p1');
  const [expandedDepartment, setExpandedDepartment] = useNavigationState<string>('kibleteyn:department', 'general');
  const [personalTab, setPersonalTab] = useNavigationState<keyof typeof personalLists>('personal:tab', 'todo');
  const [editingPersonalItemId, setEditingPersonalItemId] = useState<string | null>(null);
  const [personalItemDraft, setPersonalItemDraft] = useState({ list: 'todo' as PersonalListKey, title: '', note: '', price: '', link: '', locationUrl: '', priority: 'normal' as 'normal' | 'important' });
  const [personalSubtaskParent, setPersonalSubtaskParent] = useState<string | null>(null);
  const [personalSubtaskDraft, setPersonalSubtaskDraft] = useState('');
  const [personalDrag, setPersonalDrag] = useState<PersonalDragState | null>(null);
  const personalDragRef = useRef<PersonalDragState | null>(null);
  const personalDragCleanupRef = useRef<(() => void) | null>(null);
  const [selectedDay, setSelectedDay] = useNavigationState<number>('calendar:day', () => new Date().getDate());
  const [calendarMonth, setCalendarMonth] = useNavigationState<string>('calendar:month', () => todayKey().slice(0, 7));
  const calendarCursor = useMemo(() => new Date(`${calendarMonth}-01T12:00:00`), [calendarMonth]);
  const setCalendarCursor = (date: Date) => setCalendarMonth(localDateKey(date).slice(0, 7));
  const [quickText, setQuickText] = useState('');
  const [quickTarget, setQuickTarget] = useState<keyof typeof personalLists>('todo');
  const [noteDraft, setNoteDraft] = useState({ title: '', body: '' });
  const [projectDraft, setProjectDraft] = useState({ title: '', due: '', tags: '', tasks: '', stage: 0, progress: 0, color: 'violet', cover: 'orbit' as ProjectCover });
  const [programDraft, setProgramDraft] = useState({ title: '', range: '', status: 'Taslak', accent: 'violet' });
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [programTaskDraft, setProgramTaskDraft] = useState({ programId: '', category: 'Vize', title: '' });
  const [departmentTaskDraft, setDepartmentTaskDraft] = useState('');
  const [eventDraft, setEventDraft] = useState({ title: '', date: todayKey(), time: '10:00', duration: '60 dk', tone: 'violet', description: '', source: '' });
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error'>('disconnected');
  const [googleConfig, setGoogleConfig] = useState({ clientId: GOOGLE_CLIENT_ID, calendarId: GOOGLE_CALENDAR_ID || 'primary', loaded: Boolean(GOOGLE_CLIENT_ID) });
  const googleCalendarClientId = googleConfig.clientId || state.calendarIntegration.clientId.trim();
  const googleCalendarId = googleConfig.calendarId || state.calendarIntegration.calendarId.trim() || 'primary';
  const googleAccessTokenRef = useRef('');
  const googleRestoreStartedRef = useRef(false);
  const googleConfigRequestedRef = useRef(false);
  const [profileDraft, setProfileDraft] = useState(defaultState.profile);
  const [archiveFilter, setArchiveFilter] = useNavigationState<'all' | 'project' | 'program' | 'note'>('archive:filter', 'all');
  const [settingsTab, setSettingsTab] = useNavigationState<'general' | 'appearance' | 'notifications' | 'data'>('settings:tab', 'general');
  const [searchText, setSearchText] = useState('');
  const [focusActive, setFocusActive] = useState(false);
  const [focusMode, setFocusMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [focusMinutes, setFocusMinutes] = useState(50);
  const [focusSeconds, setFocusSeconds] = useState(50 * 60);
  const [teamView, setTeamView] = useNavigationState<boolean>('kibleteyn:team', false);
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>('text');
  const [captureStage, setCaptureStage] = useState<CaptureStage>('compose');
  const [captureListening, setCaptureListening] = useState(false);
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureDetails, setCaptureDetails] = useState('');
  const [captureExtras, setCaptureExtras] = useState<CaptureExtras>({ price: '', link: '', locationUrl: '', priority: 'normal', date: todayKey(), time: '10:00', duration: '60 dk' });
  const [capturePage, setCapturePage] = useState<CapturePage>('personal');
  const [captureArea, setCaptureArea] = useState('todo');
  const [captureMenuOpen, setCaptureMenuOpen] = useNavigationState<boolean>('overlay:capture-menu', false, true);
  const notifications = useMemo<OrbitNotification[]>(() => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return [[todayKey(), 'Bugün'], [localDateKey(tomorrow), 'Yarın']].flatMap(([date, label]) => {
      const local = state.calendarEvents[date] ?? [];
      const syncedIds = new Set(local.map((event) => event.googleEventId).filter(Boolean));
      const events = [...local, ...(googleCalendarEvents[date] ?? []).filter((event) => !syncedIds.has(event.googleEventId))];
      return events.map((event) => ({
        id: `calendar:${date}:${event.googleEventId ?? event.id}`,
        title: event.title,
        description: `${label} · ${event.time || 'Tüm gün'}${event.source ? ` · ${event.source}` : ''}`,
        date,
        eventTime: event.time,
        tone: event.tone,
      }));
    }).filter((item) => !state.notificationDismissedIds.includes(item.id)).sort((a, b) => `${a.date}${a.eventTime}`.localeCompare(`${b.date}${b.eventTime}`));
  }, [googleCalendarEvents, state.calendarEvents, state.notificationDismissedIds]);
  const unreadNotificationCount = notifications.filter((item) => !state.notificationReadIds.includes(item.id)).length;

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      let resolvedState = defaultState;
      // If a first visit starts offline, defaults are a baseline, not user edits.
      lastSyncedState.current = JSON.stringify(defaultState);

      try {
        const pending = readPending(localStorage);
        const saved = pending?.state || localStorage.getItem(STATE_KEY);
        if (pending) lastSyncedState.current = pending.base;
        if (saved) {
          resolvedState = mergePersistedState(JSON.parse(saved));
          if (!pending) lastSyncedState.current = JSON.stringify(resolvedState);
        }
        localStorage.removeItem('orbit-active-page');
      } catch { /* corrupted local data falls back safely */ }

      try {
        const payload = await readStartupState();
        if (payload && Number.isSafeInteger(payload.revision)) {
          const serverState = mergePersistedState(payload.state || defaultState);
          let pending = null;
          try { pending = readPending(localStorage); } catch { /* Device storage unavailable. */ }
          resolvedState = pending ? mergePersistedState(rebaseState(pending.base ? JSON.parse(pending.base) : undefined, JSON.parse(pending.state), serverState)) : serverState;
          lastSyncedState.current = JSON.stringify(serverState);
          serverRevision.current = payload.revision!;
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
    if (!hydrated || googleConfigRequestedRef.current) return;
    let hasConnection = false;
    try { hasConnection = Boolean(localStorage.getItem(GOOGLE_SESSION_KEY)); } catch { /* Device storage may be unavailable. */ }
    if (active !== 'calendar' && active !== 'settings' && !hasConnection) return;
    let cancelled = false;
    let finished = false;
    googleConfigRequestedRef.current = true;
    void fetch('/api/google-config', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ clientId?: string; calendarId?: string }> : Promise.reject(new Error('Google yapılandırması alınamadı')))
      .then((config: { clientId?: string; calendarId?: string }) => {
        if (cancelled) return;
        finished = true;
        setGoogleConfig({
          clientId: config.clientId?.trim() || GOOGLE_CLIENT_ID,
          calendarId: config.calendarId?.trim() || GOOGLE_CALENDAR_ID || 'primary',
          loaded: true,
        });
      })
      .catch(() => {
        if (!cancelled) setGoogleConfig((current) => ({ ...current, loaded: true }));
      });
    return () => { cancelled = true; if (!finished) googleConfigRequestedRef.current = false; };
  }, [active, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const serializedState = JSON.stringify(state);
    try { journalState(localStorage, serializedState, lastSyncedState.current); } catch { /* Server persistence still runs if browser storage is full. */ }
    document.documentElement.dataset.accent = state.settings.accent;
    document.documentElement.dataset.density = state.settings.density;
    document.documentElement.classList.toggle('reduce-motion', !state.settings.motion);

    const version = ++syncVersion.current;
    if (serverRevision.current !== null && serializedState === lastSyncedState.current && pendingSaves.current === 0) {
      try { acknowledgeState(localStorage, serializedState); } catch { /* Retry on next save. */ }
      setSyncStatus('saved'); return;
    }
    setSyncStatus('saving');
    const saveTimer = window.setTimeout(() => {
      pendingSaves.current += 1;
      syncQueue.current = syncQueue.current.then(async () => {
        try {
          if (version !== syncVersion.current) return;
          if (serverRevision.current === null) {
            const read = await fetch('/api/state', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
            if (!read.ok) throw new Error('State read failed');
            const payload = await read.json() as { state: unknown; revision: number };
            if (!Number.isSafeInteger(payload.revision)) throw new Error('Invalid revision');
            const remote = mergePersistedState(payload.state || defaultState);
            const base = lastSyncedState.current ? JSON.parse(lastSyncedState.current) : undefined;
            lastSyncedState.current = JSON.stringify(remote); serverRevision.current = payload.revision;
            setState(current => mergePersistedState(rebaseState(base, current, remote)));
            setSyncRetry(value => value + 1); return;
          }
          const response = await fetch('/api/state', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state, revision: serverRevision.current }), signal: AbortSignal.timeout(20000),
          });
          if (response.status === 409) {
            const payload = await response.json() as { state: unknown; revision: number };
            if (!Number.isSafeInteger(payload.revision)) throw new Error('Invalid revision');
            const remote = mergePersistedState(payload.state || defaultState);
            const base = JSON.parse(lastSyncedState.current);
            lastSyncedState.current = JSON.stringify(remote); serverRevision.current = payload.revision;
            setState(current => mergePersistedState(rebaseState(base, current, remote)));
            setSyncRetry(value => value + 1); return;
          }
          if (!response.ok) throw new Error('D1 state save failed');
          const metadata = await response.json() as { revision: number };
          if (!Number.isSafeInteger(metadata.revision)) throw new Error('Invalid save receipt');
          serverRevision.current = metadata.revision;
          lastSyncedState.current = serializedState;
          try { acknowledgeState(localStorage, serializedState); } catch { /* Journal is safe to replay. */ }
          if (version === syncVersion.current) setSyncStatus('saved');
        } catch { if (version === syncVersion.current) setSyncStatus('error'); }
        finally { pendingSaves.current -= 1; }
      });
    }, 650);

    return () => window.clearTimeout(saveTimer);
  }, [state, hydrated, syncRetry]);

  useEffect(() => {
    const retry = () => setSyncRetry(value => value + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const nextTheme = state.settings.theme === 'system'
        ? (systemTheme.matches ? 'dark' : 'light')
        : state.settings.theme;
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nextTheme === 'dark' ? '#15131a' : '#f4f3f7');
      document.documentElement.classList.add('theme-ready');
      setResolvedTheme(nextTheme);
    };

    applyTheme();
    if (state.settings.theme !== 'system') return;
    systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [hydrated, state.settings.theme]);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.motion = state.settings.motion ? 'full' : 'reduced';
  }, [hydrated, state.settings.motion]);

  useEffect(() => {
    if (!modal) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    const fields = Array.from(document.querySelectorAll<HTMLElement>('.modal-card input:not([disabled]),.modal-card select:not([disabled]),.modal-card textarea:not([disabled])'));
    fields.forEach((field, index) => {
      if (field instanceof HTMLInputElement) field.setAttribute('enterkeyhint', index < fields.length - 1 ? 'next' : 'done');
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [modal]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); setModal('search'); }
      if (event.key === 'Escape') { setModal(null); setMobileMenu(false); setCaptureMenuOpen(false); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setModal, setMobileMenu, setCaptureMenuOpen]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  const markAllNotificationsRead = () => {
    setState((current) => ({ ...current, notificationReadIds: Array.from(new Set([...current.notificationReadIds, ...notifications.map((item) => item.id)])) }));
  };

  const dismissNotification = (id: string) => {
    setState((current) => ({ ...current, notificationDismissedIds: Array.from(new Set([...current.notificationDismissedIds, id])) }));
  };

  const advanceModalField = useCallback((current: HTMLElement, activateFinalButton: boolean) => {
    const card = current.closest('.modal-card');
    if (!card) return false;
    const controls = Array.from(card.querySelectorAll<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button.primary-button:not([disabled])'))
      .filter((control) => control.offsetParent !== null);
    const next = controls[controls.indexOf(current) + 1];
    if (!next) return false;
    if (next instanceof HTMLButtonElement && activateFinalButton) next.click();
    else {
      next.focus({ preventScroll: true });
      window.setTimeout(() => next.scrollIntoView({ behavior: state.settings.motion ? 'smooth' : 'auto', block: 'center' }), 80);
    }
    return true;
  }, [state.settings.motion]);

  const handleModalKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || !(event.target instanceof HTMLElement)) return;
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if (advanceModalField(event.target, true)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, [advanceModalField]);

  const handleModalChange = useCallback((event: FormEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const target = event.target;
    window.setTimeout(() => advanceModalField(target as unknown as HTMLElement, false), 90);
  }, [advanceModalField]);

  const handleModalFocus = useCallback((event: ReactFocusEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('input,select,textarea')) return;
    const target = event.target;
    window.setTimeout(() => target.scrollIntoView({ behavior: state.settings.motion ? 'smooth' : 'auto', block: 'center' }), 180);
  }, [state.settings.motion]);

  const playFeedback = useCallback((tone: 'tap' | 'select' | 'navigation' | 'confirm', shouldVibrate = true, forceSound = false, forceHaptics = false) => {
    const nowMs = Date.now();
    if (!forceSound && nowMs - lastFeedbackAtRef.current < 90) return;
    lastFeedbackAtRef.current = nowMs;
    if ((state.settings.sound || forceSound) && typeof window !== 'undefined' && window.AudioContext) {
      try {
        let context = audioContextRef.current;
        if (!context || context.state === 'closed') {
          context = new window.AudioContext();
          audioContextRef.current = context;
        }

        const emitTone = () => {
          if (context?.state !== 'running') return;
          const body = context.createOscillator();
          const bloom = context.createOscillator();
          const bodyGain = context.createGain();
          const bloomGain = context.createGain();
          const clickGain = context.createGain();
          const clickFilter = context.createBiquadFilter();
          const master = context.createGain();
          const masterFilter = context.createBiquadFilter();
          const now = context.currentTime;
          const isConfirm = tone === 'confirm';
          const isSelect = tone === 'select';
          const isNavigation = tone === 'navigation';
          const duration = isConfirm ? 0.145 : isNavigation ? 0.115 : isSelect ? 0.105 : 0.078;
          const volume = Math.max(0.1, Math.min(1.5, state.settings.soundVolume / 100));
          const peak = Math.min(0.52, (isConfirm ? 0.36 : isNavigation ? 0.31 : isSelect ? 0.28 : 0.25) * volume);
          const startFrequency = isConfirm ? 390 : isNavigation ? 320 : isSelect ? 350 : 285;
          const endFrequency = isConfirm ? 250 : isNavigation ? 205 : isSelect ? 235 : 175;

          body.type = 'sine';
          bloom.type = 'sine';
          body.frequency.setValueAtTime(startFrequency, now);
          body.frequency.exponentialRampToValueAtTime(endFrequency, now + duration * 0.8);
          bloom.frequency.setValueAtTime(startFrequency * 1.38, now);
          bloom.frequency.exponentialRampToValueAtTime(endFrequency * 1.2, now + duration * 0.72);

          bodyGain.gain.setValueAtTime(0.0001, now);
          bodyGain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
          bodyGain.gain.exponentialRampToValueAtTime(peak * 0.28, now + duration * 0.45);
          bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
          bloomGain.gain.setValueAtTime(0.0001, now);
          bloomGain.gain.exponentialRampToValueAtTime(peak * (isConfirm ? 0.17 : 0.1), now + 0.012);
          bloomGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.72);

          const clickDuration = 0.032;
          const clickBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * clickDuration), context.sampleRate);
          const clickData = clickBuffer.getChannelData(0);
          for (let index = 0; index < clickData.length; index += 1) {
            const decay = Math.exp(-index / (context.sampleRate * 0.0045));
            clickData[index] = (Math.random() * 2 - 1) * decay;
          }
          const click = context.createBufferSource();
          click.buffer = clickBuffer;
          clickFilter.type = 'bandpass';
          clickFilter.frequency.value = isConfirm ? 1050 : isNavigation ? 880 : 760;
          clickFilter.Q.value = 0.75;
          clickGain.gain.setValueAtTime(peak * 0.11, now);
          clickGain.gain.exponentialRampToValueAtTime(0.0001, now + clickDuration);

          master.gain.value = 0.92;
          masterFilter.type = 'lowpass';
          masterFilter.frequency.value = isConfirm ? 1800 : 1450;
          masterFilter.Q.value = 0.32;
          body.connect(bodyGain).connect(master);
          bloom.connect(bloomGain).connect(master);
          click.connect(clickFilter).connect(clickGain).connect(master);
          master.connect(masterFilter).connect(context.destination);
          body.start(now); bloom.start(now); click.start(now);
          body.stop(now + duration + 0.012); bloom.stop(now + duration + 0.012); click.stop(now + clickDuration + 0.005);
        };

        audioContextRef.current = context;
        if (context.state === 'running') emitTone();
        else void context.resume().then(emitTone).catch(() => undefined);
      } catch { /* audio feedback is optional */ }
    }
    if (shouldVibrate && (state.settings.haptics || forceHaptics) && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(tone === 'confirm' ? [18, 30, 18] : tone === 'navigation' ? [16, 18, 12] : tone === 'select' ? [12, 18, 10] : 12);
    }
  }, [state.settings.haptics, state.settings.sound, state.settings.soundVolume]);

  useEffect(() => {
    const feedbackFor = (element: Element) => {
      const control = element.closest('button,[role="button"],a[href],select,input,textarea,label[for],[tabindex]:not([tabindex="-1"]),[contenteditable="true"]');
      if (!control || control.matches(':disabled,[aria-disabled="true"]')) return;
      const isSelection = control.matches('select,input[type="checkbox"],input[type="radio"],input[type="range"],input[type="date"],input[type="time"]');
      const isImportant = control.matches('.primary-button,.quick-capture-trigger,.capture-action,.task-item,.switch,.move-project,.add-department-task,.add-program-task,.add-card,.focus-main-button,.focus-reset-button,.project-subtasks button,.program-task button,.data-export');
      const isNavigation = Boolean(control.closest('.bottom-nav'));
      playFeedback(isImportant ? 'confirm' : isNavigation ? 'navigation' : isSelection ? 'select' : 'tap', true);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[data-feedback-test]')) return;
      feedbackFor(event.target);
    };
    const handleKeyFeedback = (event: KeyboardEvent) => {
      if (event.repeat || !['Enter', ' '].includes(event.key)) return;
      if (!(event.target instanceof Element) || event.target.closest('input,textarea,select')) return;
      feedbackFor(event.target);
    };
    const handleControlChange = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.matches('select,input[type="checkbox"],input[type="radio"],input[type="range"]')) return;
      playFeedback('select', true);
    };
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    document.addEventListener('keydown', handleKeyFeedback, { capture: true });
    document.addEventListener('change', handleControlChange, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      document.removeEventListener('keydown', handleKeyFeedback, { capture: true });
      document.removeEventListener('change', handleControlChange, { capture: true });
    };
  }, [playFeedback]);

  useEffect(() => {
    if (!focusActive) return;
    const timer = window.setInterval(() => {
      setFocusSeconds((current) => focusMode === 'countdown' ? Math.max(0, current - 1) : current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusActive, focusMode]);

  useEffect(() => {
    if (focusMode === 'countdown' && focusActive && focusSeconds === 0) {
      setFocusActive(false); playFeedback('confirm', true); notify('Odak seansı tamamlandı.');
    }
  }, [focusActive, focusMode, focusSeconds, notify, playFeedback]);

  const go = (page: PageKey) => {
    navigate(page);
    if (page === active && !activeProjectId) {
      window.scrollTo({ top: 0, behavior: state.settings.motion ? 'smooth' : 'auto' });
    }
  };

  const openNotification = (item: OrbitNotification) => {
    const date = new Date(`${item.date}T12:00:00`);
    setState((current) => ({ ...current, notificationReadIds: Array.from(new Set([...current.notificationReadIds, item.id])) }));
    setCalendarCursor(new Date(date.getFullYear(), date.getMonth(), 1));
    setSelectedDay(date.getDate());
    setModal(null);
    go('calendar');
  };

  const isNavActive = (page: PageKey) => active === page || (page === 'kibleteyn' && active === 'programs');

  const setFocusLength = (minutes: number) => {
    setFocusActive(false); setFocusMode('countdown'); setFocusMinutes(minutes); setFocusSeconds(minutes * 60);
  };

  const changeFocusMode = (mode: 'countdown' | 'stopwatch') => {
    setFocusActive(false); setFocusMode(mode); setFocusSeconds(mode === 'countdown' ? focusMinutes * 60 : 0);
  };

  const toggleFocusSession = () => {
    if (focusMode === 'countdown' && focusSeconds === 0) setFocusSeconds(focusMinutes * 60);
    setFocusActive((active) => {
      notify(active ? 'Odak seansı duraklatıldı.' : 'Odak seansı başladı.');
      return !active;
    });
  };

  const resetFocusSession = () => {
    setFocusActive(false); setFocusSeconds(focusMode === 'countdown' ? focusMinutes * 60 : 0); notify('Odak sayacı sıfırlandı.');
  };

  const toggle = (id: string) => setState((current) => ({ ...current, completed: { ...current.completed, [id]: !current.completed[id] } }));

  const personalItemsFrom = (list: PersonalListKey, sourceState: PersistedState) => {
    const source = [...personalLists[list].items, ...(sourceState.customPersonal[list] ?? [])];
    const order = sourceState.personalOrder[list] ?? [];
    const positions = new globalThis.Map(order.map((id, index) => [id, index]));
    return source.map((originalTitle, index) => {
      const id = `personal-${list}-${index}`;
      const details = sourceState.personalItemDetails[id] ?? {};
      return { id, index, title: details.title?.trim() || originalTitle, details };
    }).filter((item) => !sourceState.personalRemovedItems.includes(item.id)).sort((a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index);
  };

  const personalItemsFor = (list: PersonalListKey) => personalItemsFrom(list, state);

  const reorder = <T,>(items: T[], fromIndex: number, toIndex: number) => {
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  };

  const movePersonalItem = (list: PersonalListKey, itemId: string, direction: -1 | 1) => {
    setState((current) => {
      const ids = personalItemsFrom(list, current).map((item) => item.id);
      const fromIndex = ids.indexOf(itemId);
      const toIndex = Math.max(0, Math.min(ids.length - 1, fromIndex + direction));
      if (fromIndex < 0 || fromIndex === toIndex) return current;
      return { ...current, personalOrder: { ...current.personalOrder, [list]: reorder(ids, fromIndex, toIndex) } };
    });
  };

  const movePersonalSubtask = (itemId: string, subtaskId: string, direction: -1 | 1) => {
    setState((current) => {
      const subtasks = current.personalSubtasks[itemId] ?? [];
      const fromIndex = subtasks.findIndex((subtask) => subtask.id === subtaskId);
      const toIndex = Math.max(0, Math.min(subtasks.length - 1, fromIndex + direction));
      if (fromIndex < 0 || fromIndex === toIndex) return current;
      return { ...current, personalSubtasks: { ...current.personalSubtasks, [itemId]: reorder(subtasks, fromIndex, toIndex) } };
    });
  };

  const addPersonalSubtask = (itemId: string) => {
    const title = personalSubtaskDraft.trim();
    if (!title) return;
    const subtask: PersonalSubtask = { id: `personal-subtask-${Date.now()}`, title };
    setState((current) => ({ ...current, personalSubtasks: { ...current.personalSubtasks, [itemId]: [...(current.personalSubtasks[itemId] ?? []), subtask] } }));
    setPersonalSubtaskDraft('');
    setPersonalSubtaskParent(null);
    notify('Alt görev eklendi.');
  };

  const removePersonalSubtask = (itemId: string, subtask: PersonalSubtask) => {
    if (!window.confirm(`“${subtask.title}” alt görevi kaldırılsın mı?`)) return;
    setState((current) => ({
      ...current,
      personalSubtasks: { ...current.personalSubtasks, [itemId]: (current.personalSubtasks[itemId] ?? []).filter((entry) => entry.id !== subtask.id) },
      completed: Object.fromEntries(Object.entries(current.completed).filter(([id]) => id !== subtask.id)),
    }));
    notify('Alt görev kaldırıldı.');
  };

  const updatePersonalDrag = (clientX: number, clientY: number) => {
    const current = personalDragRef.current;
    if (!current) return;
    const target = document.elementFromPoint(clientX, clientY);
    let overId = current.overId;
    if (current.kind === 'item') {
      const itemTarget = target?.closest<HTMLElement>('[data-personal-item]');
      if (itemTarget?.dataset.personalItem) overId = itemTarget.dataset.personalItem;
    } else {
      const subtaskTarget = target?.closest<HTMLElement>('[data-personal-subtask]');
      if (subtaskTarget?.dataset.personalParent === current.itemId && subtaskTarget.dataset.personalSubtask) overId = subtaskTarget.dataset.personalSubtask;
    }
    const next = { ...current, x: clientX, y: clientY, overId };
    personalDragRef.current = next;
    setPersonalDrag(next);
    if (clientY < 92) window.scrollBy({ top: -18, behavior: 'auto' });
    else if (clientY > window.innerHeight - 92) window.scrollBy({ top: 18, behavior: 'auto' });
  };

  const finishPersonalDrag = () => {
    const drag = personalDragRef.current;
    if (drag && drag.overId !== (drag.kind === 'item' ? drag.itemId : drag.subtaskId)) {
      setState((current) => {
        if (drag.kind === 'item') {
          const ids = personalItemsFrom(drag.list, current).map((item) => item.id);
          const fromIndex = ids.indexOf(drag.itemId);
          const toIndex = ids.indexOf(drag.overId);
          if (fromIndex < 0 || toIndex < 0) return current;
          return { ...current, personalOrder: { ...current.personalOrder, [drag.list]: reorder(ids, fromIndex, toIndex) } };
        }
        const subtasks = current.personalSubtasks[drag.itemId] ?? [];
        const fromIndex = subtasks.findIndex((subtask) => subtask.id === drag.subtaskId);
        const toIndex = subtasks.findIndex((subtask) => subtask.id === drag.overId);
        if (fromIndex < 0 || toIndex < 0) return current;
        return { ...current, personalSubtasks: { ...current.personalSubtasks, [drag.itemId]: reorder(subtasks, fromIndex, toIndex) } };
      });
      notify(drag.kind === 'item' ? 'Liste sırası güncellendi.' : 'Alt görev sırası güncellendi.');
    }
    personalDragRef.current = null;
    setPersonalDrag(null);
    personalDragCleanupRef.current?.();
  };

  const cancelPersonalDrag = () => {
    personalDragRef.current = null;
    setPersonalDrag(null);
    personalDragCleanupRef.current?.();
  };

  const beginPersonalDrag = (event: ReactPointerEvent<HTMLButtonElement>, drag: Omit<PersonalDragState, 'x' | 'y' | 'pointerId' | 'overId'> & { overId?: string }) => {
    event.preventDefault();
    event.stopPropagation();
    personalDragCleanupRef.current?.();
    const pointerId = event.pointerId;
    const activeDrag: PersonalDragState = { ...drag, overId: drag.overId ?? (drag.kind === 'item' ? drag.itemId : drag.subtaskId ?? ''), x: event.clientX, y: event.clientY, pointerId };
    personalDragRef.current = activeDrag;
    setPersonalDrag(activeDrag);
    playFeedback('tap', true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      updatePersonalDrag(moveEvent.clientX, moveEvent.clientY);
    };
    const handlePointerUp = (upEvent: PointerEvent) => { if (upEvent.pointerId === pointerId) finishPersonalDrag(); };
    const handlePointerCancel = (cancelEvent: PointerEvent) => { if (cancelEvent.pointerId === pointerId) cancelPersonalDrag(); };
    const detach = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', cancelPersonalDrag);
      if (personalDragCleanupRef.current === detach) personalDragCleanupRef.current = null;
    };
    personalDragCleanupRef.current = detach;
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', cancelPersonalDrag);
  };

  const openPersonalItem = (list: PersonalListKey, id?: string) => {
    const item = id ? personalItemsFor(list).find((entry) => entry.id === id) : null;
    setEditingPersonalItemId(item?.id ?? null);
    setPersonalItemDraft({
      list,
      title: item?.title ?? '',
      note: item?.details.note ?? '',
      price: item?.details.price ?? '',
      link: item?.details.link ?? '',
      locationUrl: item?.details.locationUrl ?? '',
      priority: item?.details.priority ?? 'normal',
    });
    setModal('personalItem');
  };

  const savePersonalItem = () => {
    if (!personalItemDraft.title.trim()) return;
    const details: PersonalItemDetails = {
      title: personalItemDraft.title.trim(),
      note: personalItemDraft.note.trim(),
      priority: personalItemDraft.priority,
      ...(personalItemDraft.list === 'buy' ? { price: personalItemDraft.price.trim(), link: personalItemDraft.link.trim() } : {}),
      ...(personalItemDraft.list === 'visit' ? { locationUrl: personalItemDraft.locationUrl.trim() } : {}),
    };
    if (editingPersonalItemId) {
      setState((current) => ({ ...current, personalItemDetails: { ...current.personalItemDetails, [editingPersonalItemId]: details } }));
      setModal(null); setEditingPersonalItemId(null); notify('Kayıt güncellendi.');
      return;
    }
    setState((current) => {
      const index = personalLists[personalItemDraft.list].items.length + (current.customPersonal[personalItemDraft.list]?.length ?? 0);
      const id = `personal-${personalItemDraft.list}-${index}`;
      return {
        ...current,
        customPersonal: { ...current.customPersonal, [personalItemDraft.list]: [...(current.customPersonal[personalItemDraft.list] ?? []), personalItemDraft.title.trim()] },
        personalItemDetails: { ...current.personalItemDetails, [id]: details },
      };
    });
    setPersonalTab(personalItemDraft.list); setModal(null); notify('Yeni kayıt eklendi.');
  };

  const removePersonalItem = () => {
    if (!editingPersonalItemId || !window.confirm('Bu kayıt listeden kaldırılsın mı?')) return;
    const removedId = editingPersonalItemId;
    setState((current) => ({
      ...current,
      personalRemovedItems: [...new Set([...current.personalRemovedItems, removedId])],
      personalOrder: { ...current.personalOrder, [personalItemDraft.list]: (current.personalOrder[personalItemDraft.list] ?? []).filter((id) => id !== removedId) },
      personalSubtasks: Object.fromEntries(Object.entries(current.personalSubtasks).filter(([id]) => id !== removedId)),
      completed: Object.fromEntries(Object.entries(current.completed).filter(([id]) => id !== removedId && !(current.personalSubtasks[removedId] ?? []).some((subtask) => subtask.id === id))),
    }));
    setModal(null); setEditingPersonalItemId(null); notify('Kayıt kaldırıldı.');
  };

  const addQuick = () => {
    if (!quickText.trim()) return;
    setState((current) => ({ ...current, customPersonal: { ...current.customPersonal, [quickTarget]: [...current.customPersonal[quickTarget], quickText.trim()] } }));
    setQuickText(''); setModal(null); notify('Görev Personal listene eklendi.');
  };

  const addNote = () => {
    if (!noteDraft.title.trim()) return;
    const note: Note = { ...newNote(noteDraft.title.toLocaleLowerCase('tr-TR').includes('fikir') ? 'idea' : 'quick', noteDraft.title.trim()), body: noteDraft.body.trim() || 'Yeni not' };
    setState((current) => ({ ...current, notes: [note, ...current.notes] }));
    setNoteDraft({ title: '', body: '' }); setModal(null); notify('Not kaydedildi.');
  };

  const openProject = () => {
    setModal(null);
    setState(current => ({ ...current, projectCreationDraft: current.projectCreationDraft ?? newCreationDraft('project-' + crypto.randomUUID()) }));
    setProjectCreatorOpen(true);
  };

  const developProject = (project: Project) => {
    const existing = state.projectWorkspaces[project.id];
    const draft = state.projectCreationDraft;
    if (draft && draft.editingProjectId !== project.id && draft.idea.trim()) {
      notify('Önce açık taslağını tamamla veya sil. Taslağın açıldı.'); setProjectCreatorOpen(true); return;
    }
    setState(current => ({ ...current, projectCreationDraft: { ...(existing?.planning?.input ?? newCreationDraft(project.id)),
      id: project.id, editingProjectId: project.id, title: project.title, idea: existing?.planning?.input.idea || existing?.description || project.title,
      selectedStyle: existing?.planning?.selectedStyle || null, lifecycle: existing?.planning?.lifecycle || lifecycleFromStage(project.stage), step: 'idea', question: 0 } }));
    setProjectCreatorOpen(true);
  };

  const saveProjectPlan = (plan: ProjectPlanning) => {
    const id = plan.input.editingProjectId || plan.input.id;
    setState(current => {
      const exists = [...projectSeed, ...current.customProjects].some(project => project.id === id);
      const project: Project = { id, title: plan.input.title.trim(), stage: stageFromLifecycle(plan.lifecycle), progress: 0, color: 'violet', cover: 'minimal', due: 'Tarihsiz', tags: [plan.analysis.type], tasks: plan.analysis.firstSteps };
      const workspace = applyPlanning(current.projectWorkspaces[id] ?? emptyWorkspace, plan);
      const research = plan.lifecycle === 'research';
      if (research) workspace.planning = { ...workspace.planning!, researchId: planningResearchId(id) };
      return { ...current, projectCreationDraft: null, customProjects: exists ? current.customProjects : [...current.customProjects, project],
        projectEdits: exists ? { ...current.projectEdits, [id]: { ...current.projectEdits[id], title: project.title } } : current.projectEdits,
        projectStages: { ...current.projectStages, [id]: project.stage }, projectWorkspaces: { ...current.projectWorkspaces, [id]: workspace },
        rebuildPractice: research ? addPlanningResearch(current.rebuildPractice, id, project.title, plan) : current.rebuildPractice };
    });
    setProjectCreatorOpen(false); openProjectDetail(id); notify(plan.input.editingProjectId ? 'Değerlendirme kaydedildi. Mevcut görevler ve ekler korundu.' : 'Projen ve ilk adımların hazır.');
  };

  const openProjectResearch = (project: Project) => {
    setState(current => {
      const workspace = current.projectWorkspaces[project.id]; if (!workspace?.planning) return current;
      const plan = { ...workspace.planning, researchId: planningResearchId(project.id) };
      return { ...current, projectWorkspaces: { ...current.projectWorkspaces, [project.id]: { ...workspace, planning: plan } },
        rebuildPractice: addPlanningResearch(current.rebuildPractice, project.id, project.title, plan) };
    });
    go('rebuild'); notify('Araştırma, Rebuild → Merak bölümüne eklendi.');
  };

  const openProjectDetail = (id: string) => {
    navigate('projects', id);
  };

  const addProject = () => {
    if (!projectDraft.title.trim()) return;
    const details = {
      title: projectDraft.title.trim(),
      stage: Number(projectDraft.stage),
      progress: Math.max(0, Math.min(100, Number(projectDraft.progress) || 0)),
      color: projectDraft.color,
      cover: projectDraft.cover,
      due: projectDraft.due.trim() || 'Tarihsiz',
      tags: projectDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
      tasks: projectDraft.tasks.split('\n').map((task) => task.trim()).filter(Boolean).slice(0, 40),
    };
    if (editingProjectId) {
      const { tasks: initialTasks, ...metadata } = details;
      void initialTasks;
      setState((current) => ({
        ...current,
        projectEdits: { ...current.projectEdits, [editingProjectId]: { ...current.projectEdits[editingProjectId], ...metadata } },
        projectStages: { ...current.projectStages, [editingProjectId]: details.stage },
        projectWorkspaces: current.projectWorkspaces[editingProjectId]?.planning && stageFromLifecycle(current.projectWorkspaces[editingProjectId].planning!.lifecycle) !== details.stage
          ? { ...current.projectWorkspaces, [editingProjectId]: { ...current.projectWorkspaces[editingProjectId], planning: { ...current.projectWorkspaces[editingProjectId].planning!, lifecycle: lifecycleFromStage(details.stage) } } } : current.projectWorkspaces,
      }));
      setEditingProjectId(null);
      setModal(null);
      notify('Proje bilgileri güncellendi. Görevler ve ekler korundu.');
      return;
    }
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

  const removeProjectSubtask = (key: string, subtask: PersonalSubtask) => {
    setState((current)=>({...current,projectSubtasks:{...current.projectSubtasks,[key]:(current.projectSubtasks[key]??[]).filter((item)=>item.id!==subtask.id)},completed:Object.fromEntries(Object.entries(current.completed).filter(([id])=>id!==subtask.id))}));
    notify('Alt görev kaldırıldı.');
  };

  const openProjectEdit = (project: Project) => {
    setEditingProjectId(project.id);
    setProjectDraft({
      title: project.title,
      due: project.due,
      tags: project.tags.join(', '),
      tasks: visibleProjectTasks(project).join('\n'),
      stage: project.stage,
      progress: project.progress,
      color: project.color,
      cover: project.cover ?? 'orbit',
    });
    setModal('project');
  };

  const projectWithEdits = (project: Project): Project => {
    const edit = state.projectEdits[project.id] ?? {};
    return { ...project, ...edit, stage: state.projectStages[project.id] ?? edit.stage ?? project.stage };
  };


  const allCaptureProjects = [...projectSeed, ...state.customProjects].map(projectWithEdits);
  const allCapturePrograms = [...programs.map((program) => ({ ...program, ...(state.programEdits[program.id] ?? {}) })), ...state.customPrograms].filter((program) => !state.removedProgramIds.includes(program.id));
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
    setCaptureMenuOpen((open) => !open);
  };

  const beginCapture = (method: CaptureMethod) => {
    setCaptureMethod(method);
    setCaptureListening(false);
    setCaptureMenuOpen(false);
    setCaptureTitle('');
    setCaptureDetails('');
    setCaptureExtras({ price: '', link: '', locationUrl: '', priority: 'normal', date: todayKey(), time: '10:00', duration: '60 dk' });
    setCapturePage('personal');
    setCaptureArea('todo');
    setCaptureStage(method === 'voice' ? 'listening' : 'compose');
    setModal('capture');
    if (method === 'voice') startCaptureVoice();
  };

  const updateMobileNavItem = (index: number, page: PageKey) => {
    setState((current) => {
      const next = [...current.mobileNav];
      const existingIndex = next.indexOf(page);
      if (existingIndex >= 0) next[existingIndex] = next[index];
      next[index] = page;
      return { ...current, mobileNav: next };
    });
  };

  function startCaptureVoice() {
    const recognitionWindow = window as Window & { SpeechRecognition?: BrowserSpeechRecognitionConstructor; webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor };
    const Recognition = recognitionWindow.SpeechRecognition ?? recognitionWindow.webkitSpeechRecognition;
    if (!Recognition) { setCaptureMethod('text'); setCaptureStage('compose'); notify('Bu tarayıcı sesli yazmayı desteklemiyor; kaydı yazılı olarak girebilirsin.'); return; }
    const recognition = new Recognition();
    recognition.lang = 'tr-TR'; recognition.interimResults = false; recognition.continuous = false;
    let heardSpeech = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? '';
      if (transcript) {
        heardSpeech = true;
        setCaptureTitle(transcript.slice(0, 140));
        setCaptureDetails(transcript);
        setCaptureStage('destination');
      }
      setCaptureListening(false);
    };
    recognition.onerror = () => { setCaptureListening(false); setCaptureStage('listening'); notify('Ses kaydı alınamadı; tekrar dokunarak deneyebilirsin.'); };
    recognition.onend = () => { setCaptureListening(false); if (!heardSpeech) setCaptureStage('listening'); };
    setCaptureStage('listening');
    setCaptureListening(true); recognition.start();
  }

  const pageForAiKind = (kind: AiCaptureItem['kind']): CapturePage => {
    if (['todo', 'buy', 'visit'].includes(kind)) return 'personal';
    if (['project', 'project_task'].includes(kind)) return 'projects';
    if (kind === 'rebuild_task') return 'rebuild';
    if (kind === 'department_task') return 'kibleteyn';
    if (kind === 'program_task') return 'programs';
    if (kind === 'calendar_event') return 'calendar';
    return 'notes';
  };

  const applyAiCaptureItems = (items: AiCaptureItem[]) => {
    const now = Date.now();
    setState((current) => {
      const next: PersistedState = {
        ...current,
        customPersonal: { ...current.customPersonal, todo: [...current.customPersonal.todo], buy: [...current.customPersonal.buy], visit: [...current.customPersonal.visit] },
        personalItemDetails: { ...current.personalItemDetails },
        customProjects: [...current.customProjects], projectExtraTasks: { ...current.projectExtraTasks },
        customRebuildTasks: { ...current.customRebuildTasks }, customDepartmentTasks: { ...current.customDepartmentTasks },
        programExtraTasks: { ...current.programExtraTasks }, calendarEvents: { ...current.calendarEvents }, notes: [...current.notes],
      };

      items.forEach((item, index) => {
        if (item.kind === 'todo' || item.kind === 'buy' || item.kind === 'visit') {
          const list: PersonalListKey = item.kind === 'buy' ? 'buy' : item.kind === 'visit' ? 'visit' : 'todo';
          const itemIndex = personalLists[list].items.length + next.customPersonal[list].length;
          const id = `personal-${list}-${itemIndex}`;
          next.customPersonal[list].push(item.title);
          next.personalItemDetails[id] = { title: item.title, note: item.details, priority: 'normal', ...(list === 'buy' ? { price: item.price, link: item.link } : {}), ...(list === 'visit' ? { locationUrl: item.locationUrl } : {}) };
        } else if (item.kind === 'project') {
          next.customProjects.push({ id: `ai-project-${now}-${index}`, title: item.title, stage: 0, progress: 0, color: 'violet', due: item.date || 'Planlanacak', tags: item.tags, tasks: item.subtasks.length ? item.subtasks : item.details ? [item.details] : [], cover: 'aurora' });
        } else if (item.kind === 'project_task') {
          const targetId = allCaptureProjects.some((project) => project.id === item.targetId) ? item.targetId : allCaptureProjects[0]?.id;
          if (targetId) next.projectExtraTasks[targetId] = [...(next.projectExtraTasks[targetId] ?? []), item.title, ...item.subtasks.map((task) => `> ${task}`)];
        } else if (item.kind === 'rebuild_task') {
          const target = rebuildAreas.some((area) => area.title === item.targetId) ? item.targetId : rebuildAreas[0].title;
          next.customRebuildTasks[target] = [...(next.customRebuildTasks[target] ?? []), item.title];
        } else if (item.kind === 'department_task') {
          const target = departments.some((department) => department.id === item.targetId) ? item.targetId : departments[0].id;
          next.customDepartmentTasks[target] = [...(next.customDepartmentTasks[target] ?? []), item.title];
        } else if (item.kind === 'program_task') {
          const programId = allCapturePrograms.some((program) => program.id === item.targetId) ? item.targetId : allCapturePrograms[0]?.id;
          const category = programCategories.some((entry) => entry.name === item.category) ? item.category : programCategories[0].name;
          if (programId) next.programExtraTasks[programId] = { ...(next.programExtraTasks[programId] ?? {}), [category]: [...(next.programExtraTasks[programId]?.[category] ?? []), item.title] };
        } else if (item.kind === 'calendar_event') {
          const date = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : todayKey();
          const event: CalendarEvent = { id: `ai-event-${now}-${index}`, title: item.title, tone: 'blue', time: item.time || 'Tüm gün', duration: item.duration || '60 dk', description: item.details, source: 'Orbit AI' };
          next.calendarEvents[date] = [...(next.calendarEvents[date] ?? []), event];
        } else {
          next.notes.unshift({ ...newNote('quick', item.title), id: `ai-note-${now}-${index}`, body: item.details || item.title, date: 'Şimdi · Orbit AI' });
        }
      });
      return next;
    });
    const destination = pageForAiKind(items[0]?.kind ?? 'note');
    setModal(null); go(destination); notify(`${items.length} kayıt AI ile düzenlenip yerleştirildi.`);
  };

  const organizeCapture = async () => {
    const text = (captureDetails.trim() || captureTitle.trim());
    if (!text) { notify('AI’nin düzenlemesi için bir metin yaz veya konuş.'); return; }
    setCaptureStage('processing');
    try {
      const response = await fetch('/api/organize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context: { projects: allCaptureProjects.map(({ id, title }) => ({ id, title })), rebuildAreas: rebuildAreas.map(({ title }) => title), departments: departments.map(({ id, title }) => ({ id, title })), programs: allCapturePrograms.map(({ id, title }) => ({ id, title })), programCategories: programCategories.map(({ name }) => name) } }),
      });
      const payload = await response.json() as { items?: AiCaptureItem[]; error?: string };
      if (!response.ok || !payload.items?.length) throw new Error(payload.error || 'AI kayıt planı oluşturamadı.');
      applyAiCaptureItems(payload.items);
    } catch (error) {
      setCaptureStage(captureMethod === 'voice' ? 'destination' : 'compose');
      notify(error instanceof Error ? error.message : 'AI şu anda kullanılamıyor.');
    }
  };

  const saveCapture = () => {
    const title = captureTitle.trim() || captureDetails.trim().split(/\n|[.!?]/)[0]?.trim();
    if (!title) { notify('Kaydetmeden önce bir başlık gir.'); return; }
    if (capturePage === 'personal') {
      const list = captureArea as PersonalListKey;
      setState((current) => {
        const index = personalLists[list].items.length + (current.customPersonal[list]?.length ?? 0);
        const id = `personal-${list}-${index}`;
        return { ...current, customPersonal: { ...current.customPersonal, [list]: [...(current.customPersonal[list] ?? []), title] }, personalItemDetails: { ...current.personalItemDetails, [id]: { title, note: captureDetails.trim(), priority: captureExtras.priority, ...(list === 'buy' ? { price: captureExtras.price.trim(), link: captureExtras.link.trim() } : {}), ...(list === 'visit' ? { locationUrl: captureExtras.locationUrl.trim() } : {}) } } };
      });
      setPersonalTab(list);
    }
    if (capturePage === 'rebuild') {
      setState((current) => ({ ...current, customRebuildTasks: { ...current.customRebuildTasks, [captureArea]: [...(current.customRebuildTasks[captureArea] ?? []), title] } }));
    }
    if (capturePage === 'projects') {
      const extraLines = captureDetails.split('\n').map((line) => line.trim()).filter((line) => line && line !== title);
      setState((current) => ({ ...current, projectExtraTasks: { ...current.projectExtraTasks, [captureArea]: [...(current.projectExtraTasks[captureArea] ?? []), title, ...extraLines.map((line) => line.startsWith('>') ? line : `> ${line}`)] } }));
    }
    if (capturePage === 'kibleteyn') {
      setState((current) => ({ ...current, customDepartmentTasks: { ...current.customDepartmentTasks, [captureArea]: [...(current.customDepartmentTasks[captureArea] ?? []), title] } })); setExpandedDepartment(captureArea);
    }
    if (capturePage === 'programs') {
      const [programId, category] = captureArea.split('::');
      setState((current) => ({ ...current, programExtraTasks: { ...current.programExtraTasks, [programId]: { ...(current.programExtraTasks[programId] ?? {}), [category]: [...(current.programExtraTasks[programId]?.[category] ?? []), title] } } })); setExpandedProgram(programId);
    }
    if (capturePage === 'calendar') {
      const event: CalendarEvent = { id: `event-${Date.now()}`, title, tone: captureMethod === 'voice' ? 'blue' : 'violet', time: captureExtras.time || 'Tüm gün', duration: captureExtras.duration || '60 dk', description: captureDetails.trim(), source: captureMethod === 'voice' ? 'Sesli hızlı kayıt' : 'Yazılı hızlı kayıt' };
      const date = captureExtras.date || captureArea;
      setState((current) => ({ ...current, calendarEvents: { ...current.calendarEvents, [date]: [...(current.calendarEvents[date] ?? []), event] } }));
      if (googleAccessTokenRef.current) void createGoogleCalendarEvent(event, date).then((googleEvent) => { if (googleEvent) setState((current) => ({ ...current, calendarEvents: { ...current.calendarEvents, [date]: (current.calendarEvents[date] ?? []).map((item) => item.id === event.id ? { ...item, googleEventId: googleEvent.id, htmlLink: googleEvent.htmlLink } : item) } })); }).catch(() => notify('Kayıt Orbit’e eklendi; Google aktarımı başarısız oldu.'));
    }
    if (capturePage === 'notes') setState((current) => ({ ...current, notes: [{ ...newNote('quick', title), body: captureDetails.trim() || 'Hızlı kayıt', tone: captureMethod === 'voice' ? 'blue' : 'violet' }, ...current.notes] }));
    setModal(null); if (capturePage === 'projects') openProjectDetail(captureArea); else go(capturePage); notify('Kayıt seçtiğin alana eklendi.');
  };

  const removeProgramTask = (programId: string, task: string) => {
    setState((current) => ({
      ...current,
      programExtraTasks: Object.fromEntries(Object.entries(current.programExtraTasks).map(([id, categories]) => [id, Object.fromEntries(Object.entries(categories).map(([category, tasks]) => [category, id === programId ? tasks.filter((item) => item !== task) : tasks]))])),
      programRemovedTasks: { ...current.programRemovedTasks, [programId]: [...new Set([...(current.programRemovedTasks[programId] ?? []), task])] },
    }));
    notify('Hazırlık görevi kaldırıldı.');
  };

  const removeProgram = (program: Program) => {
    if (!window.confirm(`“${program.title}” programı ve bu programa bağlı görev verileri silinsin mi?`)) return;
    setState((current) => ({
      ...current,
      customPrograms: current.customPrograms.filter((item) => item.id !== program.id),
      removedProgramIds: [...new Set([...current.removedProgramIds, program.id])],
      programEdits: Object.fromEntries(Object.entries(current.programEdits).filter(([id]) => id !== program.id)),
      programExtraTasks: Object.fromEntries(Object.entries(current.programExtraTasks).filter(([id]) => id !== program.id)),
      programRemovedTasks: Object.fromEntries(Object.entries(current.programRemovedTasks).filter(([id]) => id !== program.id)),
      completed: Object.fromEntries(Object.entries(current.completed).filter(([id]) => !id.startsWith(`program-${program.id}-`))),
    }));
    if (expandedProgram === program.id) setExpandedProgram(null);
    notify('Program silindi.');
  };

  const loadGoogleIdentity = () => new Promise<GoogleOAuthWindow>((resolve, reject) => {
    const googleWindow = window as GoogleOAuthWindow;
    if (googleWindow.google?.accounts.oauth2) { resolve(googleWindow); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[data-orbit-google-identity]');
    const script = existing ?? document.createElement('script');
    const finish = () => googleWindow.google?.accounts.oauth2 ? resolve(googleWindow) : reject(new Error('Google Identity yüklenemedi'));
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Google Identity yüklenemedi')), { once: true });
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true; script.defer = true; script.dataset.orbitGoogleIdentity = 'true';
      document.head.appendChild(script);
    }
  });

  const rememberGoogleAccess = (token: string, expiresIn = 3600) => {
    googleAccessTokenRef.current = token;
    localStorage.setItem(GOOGLE_SESSION_KEY, JSON.stringify({ accessToken: token, expiresAt: Date.now() + Math.max(60, expiresIn) * 1000, reconnect: true } satisfies StoredGoogleSession));
  };

  const requestGoogleAccess = async (prompt = 'select_account', silent = false) => {
    let clientId = googleCalendarClientId;
    if (!clientId) {
      const response = await fetch('/api/google-config', { cache: 'no-store' }).catch(() => null);
      const config = response?.ok ? await response.json() as { clientId?: string } : null;
      clientId = config?.clientId?.trim() ?? '';
    }
    if (!clientId) {
      setGoogleCalendarStatus('error');
      notify('Google bağlantısı henüz uygulama ayarlarında yapılandırılmamış.');
      return null;
    }
    setGoogleCalendarStatus('connecting');
    try {
      const googleWindow = await loadGoogleIdentity();
      return await new Promise<string>((resolve, reject) => {
        const client = googleWindow.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/calendar.events',
          callback: (response) => {
            if (!response.access_token) { reject(new Error(response.error ?? 'Google bağlantısı reddedildi')); return; }
            rememberGoogleAccess(response.access_token, response.expires_in);
            resolve(response.access_token);
          },
          error_callback: (error) => reject(new Error(error.type ?? 'Google penceresi kapatıldı')),
        });
        client.requestAccessToken({ prompt });
      });
    } catch {
      setGoogleCalendarStatus(silent ? 'disconnected' : 'error');
      if (!silent) notify('Google Takvim bağlantısı tamamlanamadı. Yeniden deneyebilirsin.');
      return null;
    }
  };

  const syncGoogleCalendar = async (token = googleAccessTokenRef.current, cursor = calendarCursor, calendarIdOverride?: string) => {
    if (!token) return;
    setGoogleCalendarStatus('syncing');
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const calendarId = calendarIdOverride?.trim() || googleCalendarId;
    const query = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    try {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Google Calendar API error');
      const payload = await response.json() as { items?: Array<{ id: string; summary?: string; description?: string; htmlLink?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }> };
      const grouped: Record<string, CalendarEvent[]> = {};
      for (const item of payload.items ?? []) {
        const startValue = item.start?.dateTime ?? item.start?.date;
        if (!startValue) continue;
        const startDate = new Date(item.start?.dateTime ?? `${startValue}T00:00:00`);
        const endDate = item.end?.dateTime ? new Date(item.end.dateTime) : null;
        const date = item.start?.date ?? localDateKey(startDate);
        const duration = endDate ? `${Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60_000))} dk` : 'Tüm gün';
        (grouped[date] ??= []).push({ id: `google-${item.id}`, googleEventId: item.id, title: item.summary ?? 'Adsız etkinlik', tone: 'blue', time: item.start?.dateTime ? startDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Tüm gün', duration, description: item.description, source: 'Google Takvim', htmlLink: item.htmlLink });
      }
      setGoogleCalendarEvents((current) => ({ ...current, ...grouped }));
      googleAccessTokenRef.current = token;
      setGoogleCalendarStatus('connected');
    } catch {
      setGoogleCalendarStatus('error'); notify('Google Takvim verileri alınamadı. Yeniden bağlanmayı dene.');
    }
  };

  const connectGoogleCalendar = async () => {
    if (googleCalendarStatus === 'connecting') return;
    const token = await requestGoogleAccess();
    if (!token) return;
    await syncGoogleCalendar(token, calendarCursor, googleCalendarId);
    notify('Google Takvim bağlandı ve güncellendi.');
  };

  const disconnectGoogleCalendar = () => {
    const token = googleAccessTokenRef.current;
    const googleWindow = window as GoogleOAuthWindow;
    if (token && googleWindow.google?.accounts.oauth2) googleWindow.google.accounts.oauth2.revoke(token, () => undefined);
    localStorage.removeItem(GOOGLE_SESSION_KEY);
    googleRestoreStartedRef.current = false;
    googleAccessTokenRef.current = ''; setGoogleCalendarEvents({}); setGoogleCalendarStatus('disconnected');
    notify('Google Takvim bağlantısı kapatıldı.');
  };

  useEffect(() => {
    if (!googleConfig.loaded || !googleCalendarClientId || googleRestoreStartedRef.current) return;
    googleRestoreStartedRef.current = true;

    let stored: StoredGoogleSession | null = null;
    try { stored = JSON.parse(localStorage.getItem(GOOGLE_SESSION_KEY) ?? 'null') as StoredGoogleSession | null; } catch { localStorage.removeItem(GOOGLE_SESSION_KEY); }
    if (!stored?.reconnect) return;
    const session = stored;

    const restoreConnection = async () => {
      if (session.accessToken && session.expiresAt > Date.now() + 60_000) {
        googleAccessTokenRef.current = session.accessToken;
        await syncGoogleCalendar(session.accessToken, calendarCursor, googleCalendarId);
        return;
      }

      // Google Identity Services cannot refresh this browser token without a
      // user gesture. Trying here opens an account chooser on every later
      // visit after the one-hour token expires. Keep startup passive and let
      // the user reconnect from the calendar when they actually need sync.
      localStorage.removeItem(GOOGLE_SESSION_KEY);
      googleAccessTokenRef.current = '';
      setGoogleCalendarStatus('disconnected');
    };

    void restoreConnection();
  }, [googleConfig.loaded, googleCalendarClientId]);

  const createGoogleCalendarEvent = async (event: CalendarEvent, date: string) => {
    const token = googleAccessTokenRef.current;
    if (!token) return null;
    const calendarId = googleCalendarId;
    const timed = /^\d{2}:\d{2}$/.test(event.time);
    const start = timed ? new Date(`${date}T${event.time}:00`) : new Date(`${date}T00:00:00`);
    const end = new Date(start.getTime() + (timed ? durationInMinutes(event.duration) : 24 * 60) * 60_000);
    const body = timed
      ? { summary: event.title, description: [event.description, event.source ? `Orbit · ${event.source}` : ''].filter(Boolean).join('\n'), start: { dateTime: start.toISOString(), timeZone: 'Europe/Istanbul' }, end: { dateTime: end.toISOString(), timeZone: 'Europe/Istanbul' } }
      : { summary: event.title, description: event.description, start: { date }, end: { date: localDateKey(end) } };
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('Google event insert failed');
    return await response.json() as { id: string; htmlLink?: string };
  };

  const openEvent = (date = todayKey(), preset?: { title: string; description?: string; source?: string }) => {
    setEventDraft({ title: preset?.title ?? '', date, time: '10:00', duration: '60 dk', tone: 'violet', description: preset?.description ?? '', source: preset?.source ?? '' });
    setModal('event');
  };

  const scheduleItem = (title: string, source: string, description = '') => openEvent(todayKey(), { title, source, description });

  const addEvent = async () => {
    if (!eventDraft.title.trim() || !eventDraft.date) return;
    const event: CalendarEvent = { id: `event-${Date.now()}`, title: eventDraft.title.trim(), tone: eventDraft.tone, time: eventDraft.time || 'Saat yok', duration: eventDraft.duration.trim() || 'Süre yok', description: eventDraft.description.trim(), source: eventDraft.source.trim() || 'Orbit' };
    setState((current) => ({ ...current, calendarEvents: { ...current.calendarEvents, [eventDraft.date]: [...(current.calendarEvents[eventDraft.date] ?? []), event] } }));
    setModal(null);
    if (googleAccessTokenRef.current) {
      try {
        const googleEvent = await createGoogleCalendarEvent(event, eventDraft.date);
        if (googleEvent) setState((current) => ({ ...current, calendarEvents: { ...current.calendarEvents, [eventDraft.date]: (current.calendarEvents[eventDraft.date] ?? []).map((item) => item.id === event.id ? { ...item, googleEventId: googleEvent.id, htmlLink: googleEvent.htmlLink } : item) } }));
        notify('Etkinlik Orbit ve Google Takvim’e eklendi.');
      } catch { notify('Etkinlik Orbit’e eklendi; Google aktarımı için yeniden bağlan.'); }
    } else notify('Etkinlik takvime eklendi. Google’a tek dokunuşla aktarabilirsin.');
  };

  const deleteEvent = async (date: string, id: string) => {
    const removed = (state.calendarEvents[date] ?? []).find((event) => event.id === id);
    setState((current) => ({ ...current, calendarEvents: { ...current.calendarEvents, [date]: (current.calendarEvents[date] ?? []).filter((event) => event.id !== id) } }));
    if (removed?.googleEventId && googleAccessTokenRef.current) {
      const calendarId = googleCalendarId;
      try {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(removed.googleEventId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${googleAccessTokenRef.current}` } });
        notify('Etkinlik Orbit ve Google Takvim’den kaldırıldı.');
      } catch { notify('Etkinlik Orbit’ten kaldırıldı; Google kaydı kaldı.'); }
    } else notify('Etkinlik takvimden kaldırıldı.');
  };

  const archiveNote = (note: Note) => {
    setState((current) => ({
      ...current,
      notes: current.notes.filter((item) => item.id !== note.id),
      archive: [{ id: `archive-${note.id}-${Date.now()}`, title: note.title, type: 'note', label: 'Not', date: 'Bugün', source: note }, ...current.archive],
    }));
    notify('Not arşive taşındı.');
  };

  const restoreArchiveItem = (item: ArchiveItem) => {
    setState((current) => {
      const next = { ...current, archive: current.archive.filter((entry) => entry.id !== item.id), restoredArchiveIds: [...new Set([...current.restoredArchiveIds, item.id])] };
      if (item.type === 'note') {
        const source = item.source as Note | undefined;
        next.notes = [{ ...(source ?? newNote('quick', item.title)), id: `restored-note-${Date.now()}`, date: 'Şimdi' }, ...next.notes];
      }
      if (item.type === 'project') {
        const source = item.source as Project | undefined;
        // Reuse the project identity so its tasks, photos and diagrams stay attached.
        if (source) {
          if (!next.customProjects.some(project => project.id === source.id)) next.customProjects = [...next.customProjects, { ...source, stage: 1 }];
          next.projectStages = { ...next.projectStages, [source.id]: 1 };
        } else next.customProjects = [...next.customProjects, { id: `restored-project-${Date.now()}`, title: item.title, stage: 1, progress: 0, color: 'violet', due: 'Tarihsiz', tags: ['Arşiv'], tasks: [] }];
      }
      if (item.type === 'program') {
        const source = item.source as Program | undefined;
        next.customPrograms = [...next.customPrograms, source ? { ...source, id: `restored-program-${Date.now()}` } : { id: `restored-program-${Date.now()}`, title: item.title, range: 'Tarih belirtilmedi', people: 0, status: 'Taslak', progress: 0, accent: 'violet' }];
      }
      return next;
    });
    notify(`${item.title} geri yüklendi.`);
  };

  const exportDemoData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'orbit-personal-os-verisi.json'; link.click();
    URL.revokeObjectURL(url);
    notify('Orbit verisi indirildi.');
  };

  const eventsForDate = (date: string) => {
    const local = state.calendarEvents[date] ?? [];
    const syncedIds = new Set(local.map((event) => event.googleEventId).filter(Boolean));
    return [...local, ...(googleCalendarEvents[date] ?? []).filter((event) => !syncedIds.has(event.googleEventId))].sort((a, b) => a.time.localeCompare(b.time));
  };
  const personalMetricItems = (Object.keys(personalLists) as PersonalListKey[]).flatMap(personalItemsFor);
  const personalDone = personalMetricItems.filter((item) => state.completed[item.id]).length;
  const personalProgress = completionRate(personalDone, personalMetricItems.length);
  const currentWeekKey = weekStartKey();
  const rebuildMetrics = rebuildAreas.map((area) => {
    const habits = [...area.habits, ...(state.customRebuildTasks[area.title] ?? [])];
    const activities = state.rebuildActivities.filter((activity) => activity.areaId === area.id && weekStartKey(new Date(`${activity.date}T12:00:00`)) === currentWeekKey);
    const value = area.measure === 'minutes' ? activities.reduce((sum, activity) => sum + activity.duration, 0) : activities.length;
    return { ...area, habits, activities, value, done: Math.min(value, area.target), progress: Math.min(100, completionRate(value, area.target)) };
  });
  const rebuildDone = rebuildMetrics.reduce((sum, area) => sum + area.done, 0);
  const rebuildTotal = rebuildMetrics.reduce((sum, area) => sum + area.target, 0);
  const departmentMetrics = departments.map((department) => {
    const tasks = [...department.tasks, ...(state.customDepartmentTasks[department.id] ?? [])];
    const done = tasks.filter((_, index) => state.completed[`dept-${department.id}-${index}`]).length;
    return { ...department, tasks, done, progress: completionRate(done, tasks.length) };
  });
  const departmentDone = departmentMetrics.reduce((sum, department) => sum + department.done, 0);
  const departmentTotal = departmentMetrics.reduce((sum, department) => sum + department.tasks.length, 0);
  const metricProjects = [...projectSeed, ...state.customProjects].map(projectWithEdits);
  const projectMetrics = metricProjects.map((project) => {
    const tasks = visibleProjectTasks(project);
    const subtasks = tasks.flatMap((_, index) => state.projectSubtasks[`${project.id}:${index}`] ?? []);
    const done = tasks.filter((_, index) => state.completed[`project-${project.id}-${index}`]).length + subtasks.filter(task => state.completed[task.id]).length;
    const total = tasks.length + subtasks.length;
    return { project, tasks, total, done, progress: completionRate(done, total) };
  });
  const projectDone = projectMetrics.reduce((sum, item) => sum + item.done, 0);
  const projectTotal = projectMetrics.reduce((sum, item) => sum + item.total, 0);
  const metricPrograms = [...programs.map((program) => ({ ...program, ...(state.programEdits[program.id] ?? {}) })), ...state.customPrograms].filter((program) => !state.removedProgramIds.includes(program.id));
  const programTaskMetrics = metricPrograms.flatMap((program) => programCategories.flatMap((category, categoryIndex) => visibleProgramTasks(program.id, category.name).map((task, taskIndex) => ({ task, done: Boolean(state.completed[`program-${program.id}-${categoryIndex}-${taskIndex}`]) }))));
  const programDone = programTaskMetrics.filter((item) => item.done).length;
  const overallDone = personalDone + rebuildDone + departmentDone + projectDone + programDone;
  const overallTotal = personalMetricItems.length + rebuildTotal + departmentTotal + projectTotal + programTaskMetrics.length;
  const overallProgress = completionRate(overallDone, overallTotal);
  const now = new Date();
  const displayDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(now);
  const todayEvents = eventsForDate(todayKey());
  const profileInitials = state.profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('tr') || 'O';
  const focusDisplay = `${String(Math.floor(focusSeconds / 60)).padStart(2, '0')}:${String(focusSeconds % 60).padStart(2, '0')}`;
  const focusProgress = focusMode === 'countdown' ? Math.max(0, Math.min(100, (1 - focusSeconds / (focusMinutes * 60)) * 100)) : Math.min(100, focusSeconds / (focusMinutes * 60) * 100);
  const renderHome = () => (
    <>
      <div className="dashboard-grid">
        <article className={`surface focus-card ${focusActive ? 'is-focusing' : ''}`}>
          <div className="focus-session-head"><div><span className="eyebrow">ODAK SEANSI</span><strong>{focusActive ? 'Derin çalışma sürüyor' : 'Tek işe yer aç.'}</strong></div><div className="focus-mode-toggle" role="group" aria-label="Odak sayacı türü"><button className={focusMode==='countdown'?'active':''} onClick={()=>changeFocusMode('countdown')}>Sayaç</button><button className={focusMode==='stopwatch'?'active':''} onClick={()=>changeFocusMode('stopwatch')}>Kronometre</button></div></div>
          <div className="focus-timer" style={{ '--focus-progress': `${focusProgress * 3.6}deg` } as React.CSSProperties}><div><small>{focusMode==='countdown' ? 'KALAN SÜRE' : 'GEÇEN SÜRE'}</small><strong>{focusDisplay}</strong><p>Personal OS ana akışını bitir</p></div></div>
          <div className="focus-session-footer"><div className="focus-presets" aria-label="Odak süresi">{[25,50,90].map((minutes)=><button key={minutes} onClick={()=>setFocusLength(minutes)} className={focusMode==='countdown'&&focusMinutes===minutes?'active':''}>{minutes} dk</button>)}</div><div className="focus-session-actions"><button className="focus-main-button" onClick={toggleFocusSession}>{focusActive?<Square size={17}/>:<Play size={17} fill="currentColor"/>}{focusActive?'Duraklat':'Başlat'}</button><button className="focus-reset-button" onClick={resetFocusSession} aria-label="Odak sayacını sıfırla"><RotateCcw size={16}/></button></div></div>
          <div className="ambient-orb"><span/></div>
        </article>
        <article className="surface today-card">
          <div className="card-title-row"><div><span className="eyebrow">AKIŞ</span><h3>Bugün</h3></div><button className="text-button" onClick={() => go('calendar')}>Tümünü gör</button></div>
          <div className="timeline">
            {todayEvents.length ? todayEvents.slice(0, 6).map((event) => (
              <button key={event.id} className="time-row" onClick={() => go('calendar')}><time>{event.time}</time><span className="line-dot"/><span><strong>{event.title}</strong><small>{event.source ?? 'Orbit'} · {event.duration}</small></span><ChevronRight size={14}/></button>
            )) : <button className="empty-timeline" onClick={() => openEvent(todayKey())}><CalendarDays size={18}/><span><strong>Bugün için kayıt yok</strong><small>İlk etkinliğini planla</small></span><Plus size={14}/></button>}
          </div>
        </article>
        <article className="surface quick-card">
          <span className="eyebrow">HIZLI EKLE</span><h3>Aklındakini bırak.</h3>
          <div className="quick-actions"><button onClick={() => setModal('quick')}><ListTodo size={15}/> Görev</button><button onClick={() => setModal('note')}><StickyNote size={15}/> Not</button><button onClick={() => { setModal('note'); setNoteDraft({title:'Yeni fikir',body:''}); }}><Sparkles size={15}/> Fikir</button></div>
          <button className="voice-button" onClick={() => beginCapture('voice')}><span><Mic size={16}/></span><span><strong>Sesli kayıt</strong><small>Konuş, ardından kaydın yerini seç.</small></span><Volume2 size={17}/></button>
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
        <div className="progress-wrap"><ProgressRing value={overallProgress}/><div className="progress-meta"><p><i className="dot violet"/> {overallDone} tamamlandı</p><p><i className="dot soft"/> {Math.max(0, overallTotal - overallDone)} açık</p><button onClick={() => go('rebuild')}>Detayları gör <ChevronRight size={12}/></button></div></div>
      </section>
    </>
  );

  const renderPersonal = () => {
    const current = personalLists[personalTab];
    const items = personalItemsFor(personalTab);
    const openItems = items.filter((item) => !state.completed[item.id]);
    const openBudget = personalTab === 'buy' ? openItems.reduce((total, item) => total + numericPrice(item.details.price), 0) : 0;
    const CurrentIcon = current.icon;
    return <>
      <PageTitle eyebrow="PERSONAL" title="Kendine ait alan." description="Günlük hayatın küçük yüklerini tek, sakin bir yerde tut." action={<button className="primary-button compact" onClick={() => openPersonalItem(personalTab)}><Plus size={15}/> Yeni ekle</button>}/>
      <div className="segmented-control">{(Object.keys(personalLists) as PersonalListKey[]).map((key) => { const item = personalLists[key]; const TabIcon = item.icon; return <button key={key} onClick={() => setPersonalTab(key)} className={personalTab === key ? 'active' : ''}><TabIcon size={16}/>{item.title}<span>{personalItemsFor(key).length}</span></button>})}</div>
      <div className="personal-layout action-first">
        <section className="surface personal-main">
          <div className="section-lead"><span className={`feature-icon ${personalTab}`}><CurrentIcon size={22}/></span><div><h2>{current.title}</h2><p>{current.subtitle}</p></div><span className="personal-list-stats"><span className="count-pill">{openItems.length} açık</span>{openBudget > 0 && <span className="budget-pill">{formatPrice(openBudget)}</span>}</span></div>
          <div className={`task-list personal-sortable-list ${personalDrag ? 'is-reordering' : ''}`}>{items.map((item) => {
            if (!state.settings.showCompleted && state.completed[item.id]) return null;
            const externalUrl = personalTab === 'visit' ? safeExternalUrl(item.details.locationUrl) : safeExternalUrl(item.details.link);
            const fallback = personalTab === 'visit' ? 'Kaydedilen yer' : item.index < 2 ? 'Bu hafta' : 'Daha sonra';
            const subtasks = state.personalSubtasks[item.id] ?? [];
            const isDragging = personalDrag?.kind === 'item' && personalDrag.itemId === item.id;
            const isDragOver = personalDrag?.kind === 'item' && personalDrag.overId === item.id && !isDragging;
            return <article data-personal-item={item.id} key={item.id} className={`task-item personal-task-card ${state.completed[item.id] ? 'completed' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}>
              <div className="personal-task-main">
                <button className="personal-drag-handle" aria-label={`${item.title} kaydını sürükleyerek sırala`} title="Sürükle veya ok tuşlarıyla sırala" onPointerDown={(event)=>beginPersonalDrag(event,{kind:'item',list:personalTab,itemId:item.id,title:item.title})} onKeyDown={(event)=>{if(event.key==='ArrowUp'){event.preventDefault();movePersonalItem(personalTab,item.id,-1)}if(event.key==='ArrowDown'){event.preventDefault();movePersonalItem(personalTab,item.id,1)}}}><GripVertical size={16}/></button>
                <button className="task-item-toggle" onClick={() => toggle(item.id)}>
                  <span className="check-circle">{state.completed[item.id] && <Check size={13}/>}</span>
                  <span className="task-item-copy"><strong>{item.title}</strong><span className="personal-item-meta">{item.details.priority === 'important' && <em><Flag size={10}/> Önemli</em>}{personalTab === 'buy' && numericPrice(item.details.price) > 0 && <em>{formatPrice(numericPrice(item.details.price))}</em>}<small>{item.details.note || fallback}</small>{subtasks.length>0&&<small className="subtask-count">{subtasks.filter((subtask)=>state.completed[subtask.id]).length}/{subtasks.length} alt görev</small>}</span></span>
                </button>
                <span className="personal-item-actions">{externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer" aria-label={personalTab === 'visit' ? `${item.title} konumunu Google Haritalar'da aç` : `${item.title} ürün bağlantısını aç`}>{personalTab === 'visit' ? <MapPin size={15}/> : <ExternalLink size={15}/>}</a>}<button aria-label={`${item.title} kaydını takvime ekle`} onClick={() => scheduleItem(item.title, current.title, item.details.note)}><CalendarDays size={15}/></button><button aria-label={`${item.title} kaydını düzenle`} onClick={() => openPersonalItem(personalTab, item.id)}><MoreHorizontal size={17}/></button></span>
              </div>
              {(subtasks.length>0||personalSubtaskParent===item.id)&&<div className="personal-subtask-list">{subtasks.map((subtask)=>{const subtaskDragging=personalDrag?.kind==='subtask'&&personalDrag.subtaskId===subtask.id;const subtaskOver=personalDrag?.kind==='subtask'&&personalDrag.itemId===item.id&&personalDrag.overId===subtask.id&&!subtaskDragging;return <div data-personal-subtask={subtask.id} data-personal-parent={item.id} key={subtask.id} className={`personal-subtask ${state.completed[subtask.id]?'completed':''} ${subtaskDragging?'dragging':''} ${subtaskOver?'drag-over':''}`}><button className="personal-subtask-drag" aria-label={`${subtask.title} alt görevini sürükleyerek sırala`} title="Sürükle veya ok tuşlarıyla sırala" onPointerDown={(event)=>beginPersonalDrag(event,{kind:'subtask',list:personalTab,itemId:item.id,subtaskId:subtask.id,title:subtask.title})} onKeyDown={(event)=>{if(event.key==='ArrowUp'){event.preventDefault();movePersonalSubtask(item.id,subtask.id,-1)}if(event.key==='ArrowDown'){event.preventDefault();movePersonalSubtask(item.id,subtask.id,1)}}}><GripVertical size={14}/></button><button className="personal-subtask-toggle" onClick={()=>toggle(subtask.id)}><span>{state.completed[subtask.id]?<Check size={11}/>:<Circle size={11}/>}</span><strong>{subtask.title}</strong></button><button className="personal-subtask-remove" aria-label={`${subtask.title} alt görevini kaldır`} onClick={()=>removePersonalSubtask(item.id,subtask)}><Trash2 size={13}/></button></div>})}{personalSubtaskParent===item.id&&<div className="personal-subtask-composer"><input autoFocus aria-label={`${item.title} için yeni alt görev`} value={personalSubtaskDraft} onChange={(event)=>setPersonalSubtaskDraft(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter')addPersonalSubtask(item.id);if(event.key==='Escape'){setPersonalSubtaskParent(null);setPersonalSubtaskDraft('')}}} placeholder="Alt görevi yaz..."/><button disabled={!personalSubtaskDraft.trim()} onClick={()=>addPersonalSubtask(item.id)}><Check size={14}/> Ekle</button><button aria-label="Alt görev eklemeyi kapat" onClick={()=>{setPersonalSubtaskParent(null);setPersonalSubtaskDraft('')}}><X size={14}/></button></div>}</div>}
              {personalSubtaskParent!==item.id&&<button className="personal-subtask-add" onClick={()=>{setPersonalSubtaskParent(item.id);setPersonalSubtaskDraft('')}}><Plus size={13}/> Alt görev ekle</button>}
            </article>;
          })}</div>
          {personalDrag&&<div className="personal-drag-ghost" style={{left:personalDrag.x,top:personalDrag.y}}><GripVertical size={16}/><span><strong>{personalDrag.title}</strong><small>{personalDrag.kind==='item'?'Ana kayıt':'Alt görev'}</small></span></div>}
          <button className="inline-add" onClick={() => openPersonalItem(personalTab)}><Plus size={15}/> Yeni öğe ekle</button>
        </section>
      </div>
      <aside className="surface personal-insight analytics-bottom"><span className="eyebrow">GERÇEK İLERLEME</span><div className="balance-orbit"><span/><i/><b>{personalProgress}%</b></div><h3>{personalProgress >= 70 ? 'İyi gidiyorsun.' : personalProgress > 0 ? 'Ritim kuruluyor.' : 'İlk adımı seç.'}</h3><p>{personalDone}/{personalMetricItems.length} kişisel kayıt tamamlandı. Açık kayıtları satırdaki takvim düğmesiyle doğrudan planlayabilirsin.</p><button onClick={() => openEvent(todayKey())}>Takvime yeni plan ekle <ArrowRight size={14}/></button></aside>
    </>;
  };

  const renderRebuild = () => <Suspense fallback={<p role="status">Rebuild açılıyor…</p>}><RebuildJourney
    journey={state.rebuildJourney} deck={state.rebuildDeck} activities={state.rebuildActivities}
    selections={state.rebuildSelections} syncStatus={syncStatus}
    practice={state.rebuildPractice}
    linkedProject={projectMetrics.filter(item => item.project.id === state.rebuildPractice.activeProjectId).map(({ project, progress }) => ({ id: project.id, title: project.title, progress }))[0] ?? null}
    onUpdatePractice={update => setState(current => ({ ...current, rebuildPractice: update(current.rebuildPractice) }))}
    onOpenProject={openProjectDetail}
    onCreateProject={async idea => {
      const { projectFromIdea } = await import('./rebuild/project-import');
      const { project, workspace } = projectFromIdea(idea);
      setState(current => ({
        ...current,
        customProjects: current.customProjects.some(item => item.id === project.id) ? current.customProjects : [...current.customProjects, project],
        projectWorkspaces: current.projectWorkspaces[project.id]?.planning ? current.projectWorkspaces : { ...current.projectWorkspaces,
          [project.id]: current.projectWorkspaces[project.id] ? applyPlanning(current.projectWorkspaces[project.id],workspace.planning!) : workspace },
        rebuildPractice: acceptIntoPractice(current.rebuildPractice, idea),
      }));
      openProjectDetail(project.id);
    }}
    onUpdateDeck={update => setState(current => { const next = update(current.rebuildDeck); return next === current.rebuildDeck ? current : { ...current, rebuildDeck: next }; })}
    onStartChange={date => setState(current => ({ ...current, rebuildJourney: { ...current.rebuildJourney, startDate: date } }))}
  /></Suspense>;

  const renderProjects = () => {
    const allProjects = metricProjects;
    if (activeProjectId) {
      const project = allProjects.find(item => item.id === activeProjectId);
      if (!hydrated) return <p role="status">Proje yükleniyor…</p>;
      if (!project) return <section className="surface"><h2>Bu proje bulunamadı.</h2><button onClick={() => go('projects')}>Proje panosuna dön</button></section>;
      return <Suspense fallback={<p role="status">Proje araçları yükleniyor…</p>}><ProjectWorkspace key={project.id} project={project} tasks={visibleProjectTasks(project)} subtasks={state.projectSubtasks} completed={state.completed} details={state.projectTaskDetails} workspace={state.projectWorkspaces[project.id] ?? emptyWorkspace} syncStatus={syncStatus} onRetry={() => setSyncRetry(value => value + 1)} onBack={() => backTo('projects')} onEdit={() => openProjectEdit(project)} onPlan={() => developProject(project)} onResearch={() => openProjectResearch(project)} onToggle={toggle} onSchedule={title => scheduleItem(title, `Proje · ${project.title}`)}
        onStage={stage => setState(current => ({ ...current, projectStages: { ...current.projectStages, [project.id]: stage } }))}
        onAddTask={title => setState(current => ({ ...current, projectExtraTasks: { ...current.projectExtraTasks, [project.id]: [...(current.projectExtraTasks[project.id] ?? []), title.replace(/^>\s*/, '')] } }))}
        onAddSubtask={(index, title) => setState(current => { const key = `${project.id}:${index}`; return { ...current, projectSubtasks: { ...current.projectSubtasks, [key]: [...(current.projectSubtasks[key] ?? []), { id: `project-subtask-${crypto.randomUUID()}`, title }] } }; })}
        onRemoveSubtask={(index, task) => removeProjectSubtask(`${project.id}:${index}`, task)}
        onDetails={(id, update) => setState(current => ({ ...current, projectTaskDetails: { ...current.projectTaskDetails, [id]: update(current.projectTaskDetails[id] ?? emptyTask) } }))}
        onWorkspace={update => setState(current => { const workspace = update(current.projectWorkspaces[project.id] ?? emptyWorkspace); return { ...current,
          projectWorkspaces: { ...current.projectWorkspaces, [project.id]: workspace },
          projectStages: workspace.planning ? { ...current.projectStages, [project.id]: stageFromLifecycle(workspace.planning.lifecycle) } : current.projectStages }; })}
      /></Suspense>;
    }
    return <Suspense fallback={<p role="status">Projeler açılıyor…</p>}><ProjectsHub projects={projectMetrics} workspaces={state.projectWorkspaces} hasDraft={!!state.projectCreationDraft} onNew={openProject} onOpen={openProjectDetail}/></Suspense>;
  };

  const renderKibleteynNav = (current: 'operations' | 'tours', action?: React.ReactNode) => (
    <header className="kibleteyn-nav">
      <div><span className="eyebrow">KIBLETEYN</span><nav aria-label="Kıbleteyn bölümleri"><button className={current==='operations'?'active':''} aria-current={current==='operations'?'page':undefined} onClick={()=>go('kibleteyn')}><Building2 size={15}/> Operasyon</button><button className={current==='tours'?'active':''} aria-current={current==='tours'?'page':undefined} onClick={()=>go('programs')}><Plane size={15}/> Turlar <em>{metricPrograms.length}</em></button></nav></div>
      {action&&<div className="kibleteyn-nav-action">{action}</div>}
    </header>
  );

  const renderKibleteyn = () => {
    const current = departmentMetrics.find((item) => item.id === expandedDepartment)!;
    const currentTasks = current.tasks;
    const CurrentIcon = current.icon;
    return <>
      {renderKibleteynNav('operations',<button className="ghost-button" onClick={()=>setTeamView(!teamView)}><Users size={15}/>{teamView?'Odak görünümü':'Ekip görünümü'}</button>)}
      {teamView?<section className="team-overview">{departmentMetrics.map((department)=>{const DepartmentIcon=department.icon;return <button className="surface" key={department.id} onClick={()=>{setExpandedDepartment(department.id);setTeamView(false);}}><span><DepartmentIcon size={19}/></span><div><strong>{department.title}</strong><small>{department.done}/{department.tasks.length} görev tamamlandı</small></div><b>{department.progress}%</b><ChevronRight size={16}/></button>})}</section>:<><div className="department-tabs">{departmentMetrics.map((department)=>{const DepartmentIcon=department.icon;return <button key={department.id} onClick={()=>setExpandedDepartment(department.id)} className={expandedDepartment===department.id?'active':''}><span><DepartmentIcon size={18}/></span><strong>{department.title}</strong><small>{department.progress}%</small></button>})}</div><section className="surface department-detail"><div className="department-lead"><span className="department-big-icon"><CurrentIcon size={24}/></span><div><span className="eyebrow">AKTİF ÇALIŞMA ALANI</span><h2>{current.title}</h2><p>{current.summary}</p></div><ProgressRing value={current.progress} size="small"/></div><div className="department-task-grid">{currentTasks.map((task,index)=>{const id=`dept-${current.id}-${index}`;return <div className={`department-task-row ${state.completed[id]?'completed':''}`} key={`${task}-${index}`}><button onClick={()=>toggle(id)}><span>{state.completed[id]?<Check size={13}/>:<Circle size={13}/>}</span><span><strong>{task}</strong><small>{index < 2 ? 'Bu hafta' : 'Sırada'}</small></span><ChevronRight size={14}/></button><button className="schedule-action" aria-label={`${task} görevini takvime ekle`} onClick={()=>scheduleItem(task, `Kıbleteyn · ${current.title}`)}><CalendarDays size={14}/></button></div>})}</div><button className="add-department-task" onClick={openDepartmentTask}><Plus size={15}/> {current.title} alanına görev ekle</button></section></>}
      <section className="surface operation-hero analytics-bottom"><div><span className="status-chip"><i/> Gerçek zamanlı veri</span><h2>{departmentDone ? 'Operasyon ilerliyor.' : 'İlk görevi tamamla.'}</h2><p>{departmentMetrics.length} çalışma alanında {departmentTotal - departmentDone} açık görev bulunuyor.</p><div className="operation-stats"><span><strong>{departmentTotal - departmentDone}</strong><small>Açık görev</small></span><span><strong>{departmentDone}</strong><small>Tamamlanan</small></span><span><strong>{departmentMetrics.length}</strong><small>Çalışma alanı</small></span></div></div><div className="operation-visual"><span className="orbit o1"/><span className="orbit o2"/><span className="core"><Building2 size={28}/></span><i className="node n1"/><i className="node n2"/><i className="node n3"/></div></section>
    </>;
  };

  const renderPrograms = () => {
    const allPrograms = metricPrograms;
    const completedPreparations = allPrograms.reduce((total, program) => total + programCategories.reduce((sum, category, categoryIndex) => sum + visibleProgramTasks(program.id, category.name).filter((_, taskIndex) => state.completed[`program-${program.id}-${categoryIndex}-${taskIndex}`]).length, 0), 0);
    const totalPreparations = allPrograms.reduce((total, program) => total + programCategories.reduce((sum, category) => sum + visibleProgramTasks(program.id, category.name).length, 0), 0);
    const openPreparations = totalPreparations - completedPreparations;
    return <>
      {renderKibleteynNav('tours',<button className="primary-button compact" onClick={openProgram}><Plus size={15}/> Yeni tur</button>)}
      <div className="program-list-intro"><div><span className="eyebrow">TUR TAKVİMİ</span><h1>Yaklaşan turlar</h1></div><p>{openPreparations ? `${openPreparations} hazırlık adımı tamamlanmayı bekliyor.` : 'Tüm hazırlıklar tamamlandı.'}</p></div>
      <div className="program-stack">{allPrograms.map((program)=>{const open=expandedProgram===program.id;const done=programCategories.reduce((sum,cat,catIndex)=>sum+visibleProgramTasks(program.id,cat.name).filter((_,taskIndex)=>state.completed[`program-${program.id}-${catIndex}-${taskIndex}`]).length,0);const total=programCategories.reduce((sum,cat)=>sum+visibleProgramTasks(program.id,cat.name).length,0);const progress=completionRate(done,total);const dates=parseProgramDateRange(program.range,program.title);const statusClass=program.status==='Planlandı'?'planned':program.status==='Hazırlanıyor'?'preparing':'draft';const contentId=`program-content-${program.id}`;return <article key={program.id} className={`surface program-card ${program.accent} ${open?'open':''}`}><button className="program-head" aria-expanded={open} aria-controls={contentId} onClick={()=>setExpandedProgram(open?null:program.id)}><span className={`program-date ${program.accent}`} aria-label={dates.label}>{dates.start?<><span className="program-date-point"><i>GİDİŞ</i><strong>{dates.start.day}</strong><small>{dates.start.month}</small></span>{dates.end&&<><span className="program-date-divider"><ArrowRight size={14}/></span><span className="program-date-point"><i>DÖNÜŞ</i><strong>{dates.end.day}</strong><small>{dates.end.month}</small></span></>}{dates.year&&<b>{dates.year}</b>}</>:<span className="program-date-fallback"><CalendarDays size={17}/><small>{dates.label}</small></span>}</span><span className="program-name"><span className="program-status-row"><em className={statusClass}>{program.status}</em>{program.people>0&&<small><Users size={12}/>{program.people} kişi</small>}</span><h2>{program.title}</h2></span><span className="program-progress"><strong>{progress}%</strong><i><b style={{width:`${progress}%`}}/></i><small>{done}/{total} hazır</small></span><span className="program-chevron"><ChevronDown size={19}/></span></button><div className="program-content" id={contentId}><div className="category-grid"><div className="program-actions"><button onClick={()=>openProgramEdit(program)}><Settings size={13}/> Turu düzenle</button><button onClick={()=>openProgramTask(program.id)}><Plus size={13}/> Görev ekle</button><button className="program-delete-action" onClick={()=>removeProgram(program)}><Trash2 size={13}/> Turu sil</button></div>{programCategories.map((category,catIndex)=>{const CategoryIcon=category.icon;const tasks=visibleProgramTasks(program.id,category.name);const catDone=tasks.filter((_,taskIndex)=>state.completed[`program-${program.id}-${catIndex}-${taskIndex}`]).length;return <details key={category.name} open={catIndex===0&&open}><summary><span className={`category-icon c${catIndex}`}><CategoryIcon size={17}/></span><span><strong>{category.name}</strong><small>{catDone}/{tasks.length} tamamlandı</small></span><b>{completionRate(catDone,tasks.length)}%</b><ChevronDown size={14}/></summary><div className="category-tasks">{tasks.map((task,taskIndex)=>{const id=`program-${program.id}-${catIndex}-${taskIndex}`;return <div className={`program-task-row ${state.completed[id]?'completed':''}`} key={`${task}-${taskIndex}`}><button onClick={()=>toggle(id)}><span>{state.completed[id]&&<Check size={10}/>}</span>{task}<small>{taskIndex<2?'Bugün':'Bu hafta'}</small></button><button className="schedule-action" aria-label={`${task} görevini takvime ekle`} onClick={()=>scheduleItem(task, `Program · ${program.title} · ${category.name}`)}><CalendarDays size={13}/></button><button className="task-remove-button" aria-label={`${task} görevini kaldır`} onClick={()=>removeProgramTask(program.id,task)}><Trash2 size={13}/></button></div>})}<button className="add-program-task" onClick={()=>openProgramTask(program.id,category.name)}><Plus size={12}/> Bu kategoriye görev ekle</button></div></details>})}</div></div></article>})}</div>
      <div className="program-overview analytics-bottom"><div><Plane size={20}/><span><strong>{allPrograms.length}</strong><small>Yaklaşan tur</small></span></div><div><ListTodo size={20}/><span><strong>{openPreparations}</strong><small>Açık hazırlık</small></span></div><div><CheckCircle2 size={20}/><span><strong>{completedPreparations}</strong><small>Tamamlanan hazırlık</small></span></div></div>
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
    const eventsFor = (day: number) => eventsForDate(dateKey(day));
    const selectedEvents = eventsFor(selectedDay);
    const changeMonth = (delta: number) => { const next = new Date(year, monthIndex + delta, 1); setCalendarCursor(next); setSelectedDay(1); if (googleAccessTokenRef.current) void syncGoogleCalendar(googleAccessTokenRef.current, next); };
    const goToday = () => { const currentDate = new Date(); const next = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); setCalendarCursor(next); setSelectedDay(currentDate.getDate()); if (googleAccessTokenRef.current) void syncGoogleCalendar(googleAccessTokenRef.current, next); };
    const selectedWeekday = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(new Date(year, monthIndex, selectedDay));
    return <>
      <PageTitle eyebrow="TAKVİM" title="Zamana biraz boşluk bırak." description={`${titleMonth} ${year} · Yalnızca kendi planların ve bağlı Google Takvimin.`} action={<div className="calendar-title-actions"><button className={`google-calendar-button ${googleCalendarStatus === 'connected' ? 'connected' : ''}`} disabled={googleCalendarStatus === 'connecting'} onClick={() => googleCalendarStatus === 'connected' ? void syncGoogleCalendar() : void connectGoogleCalendar()}><RefreshCw size={14}/>{googleCalendarStatus === 'connected' ? 'Google’ı güncelle' : googleCalendarStatus === 'connecting' ? 'Google bekleniyor…' : 'Google hesabını bağla'}</button><button className="primary-button compact" onClick={()=>openEvent(selectedDateKey)}><Plus size={15}/> Etkinlik ekle</button></div>}/>
      <div className="calendar-layout"><section className="surface calendar-card"><header><div><IconButton label="Önceki ay" onClick={()=>changeMonth(-1)}><ChevronRight className="flip" size={16}/></IconButton><h2>{titleMonth} <span>{year}</span></h2><IconButton label="Sonraki ay" onClick={()=>changeMonth(1)}><ChevronRight size={16}/></IconButton></div><button className="today-button" onClick={goToday}>Bugün</button></header>{googleCalendarStatus === 'syncing' && <div className="calendar-sync-note"><RefreshCw size={13}/> Google Takvim güncelleniyor…</div>}<div className="calendar-weekdays">{['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map((day)=><span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({length:leadingDays},(_,i)=><span className="empty-day" key={`empty-${i}`}/>)}{days.map((day)=>{const events=eventsFor(day);return <button key={day} onClick={()=>setSelectedDay(day)} className={`${dateKey(day) === todayKey() ? 'today' : ''} ${selectedDay===day?'selected':''}`}><span>{day}</span><div>{events.slice(0,3).map((event)=><i key={event.id} className={event.tone}>{event.title}</i>)}{events.length>3&&<small>+{events.length-3} daha</small>}</div></button>})}</div></section><aside className="surface day-panel"><span className="eyebrow">SEÇİLİ GÜN</span><div className="day-number"><strong>{selectedDay}</strong><span>{titleMonth}<br/>{year}</span></div><h3>{selectedWeekday.charAt(0).toLocaleUpperCase('tr')+selectedWeekday.slice(1)}</h3><div className="day-events">{selectedEvents.length?selectedEvents.map((event)=><div className="day-event" key={event.id}><i className={event.tone}/><span><strong>{event.title}</strong><small>{event.time} · {event.duration}{event.source ? ` · ${event.source}` : ''}</small></span><span className="day-event-actions"><a href={event.htmlLink ?? googleCalendarTemplateUrl(event, selectedDateKey)} target="_blank" rel="noreferrer" aria-label={`${event.title} etkinliğini Google Takvim'de aç`}><ExternalLink size={13}/></a>{event.id.startsWith('event-') && <IconButton label="Etkinliği sil" onClick={() => deleteEvent(selectedDateKey, event.id)}><Trash2 size={13}/></IconButton>}</span></div>):<div className="empty-state"><CalendarDays size={24}/><p>Bu gün henüz boş.<br/>Biraz nefes iyi gelebilir.</p></div>}</div><button className="inline-add" onClick={()=>openEvent(selectedDateKey)}><Plus size={14}/> Bu güne ekle</button>{googleCalendarStatus === 'connected' && <button className="calendar-disconnect" onClick={disconnectGoogleCalendar}>Google bağlantısını kapat</button>}</aside></div>
    </>;
  };

  const renderNotes = () => {
    return <>
      <PageTitle eyebrow="NOTLAR" title="Düşünceyi doğru biçimde yakala." description="Hızlı not, fikir, günlük ve referanslar için birbirinden farklı başlangıçlar."/>
      <NotesWorkspace notes={state.notes} onChange={notes=>setState(current=>({...current,notes}))} onArchive={archiveNote}/>
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

  const updateSetting = (key: Exclude<keyof PersistedState['settings'], 'feedbackVersion'>, value: boolean | string | number) => {
    setState((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
    if (key === 'sound' && value === true) playFeedback('confirm', state.settings.haptics, true);
    if (key === 'haptics' && value === true && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([18, 30, 18]);
  };

  const updateNotifications = async (enabled: boolean) => {
    if (enabled && !('Notification' in window)) { updateSetting('notifications', false); notify('Bu tarayıcı sistem bildirimlerini desteklemiyor.'); return; }
    if (enabled && Notification.permission === 'denied') { updateSetting('notifications', false); notify('Bildirim izni tarayıcı ayarlarından kapalı.'); return; }
    if (enabled && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { updateSetting('notifications', false); notify('Bildirim izni verilmedi.'); return; }
    }
    updateSetting('notifications', enabled); notify(enabled ? 'Bildirimler açıldı.' : 'Bildirimler kapatıldı.');
  };

  const logout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loggingOut) return;
    const form = event.currentTarget;
    setLoggingOut(true);
    try {
      await syncQueue.current;
      // Flush the last edit before revoking this device's session.
      if (hydrated && JSON.stringify(state) !== lastSyncedState.current) {
        const response = await fetch('/api/state', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, revision: serverRevision.current }), signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error('save failed');
        try { acknowledgeState(localStorage, JSON.stringify(state)); } catch { /* Cleared on logout. */ }
      }
      form.submit();
    } catch {
      setLoggingOut(false);
      notify('Son değişiklikler kaydedilemedi. Bağlantını kontrol edip tekrar çıkış yap.');
    }
  };

  const saveProfile = () => {
    if (!profileDraft.name.trim() || !profileDraft.workspace.trim()) { notify('İsim ve çalışma alanını doldur.'); return; }
    setState((current) => ({ ...current, profile: { name: profileDraft.name.trim(), workspace: profileDraft.workspace.trim() } }));
    setModal(null); notify('Profil bilgileri kaydedildi.');
  };

  const renderSettings = () => (
    <>
      <PageTitle eyebrow="AYARLAR" title="Orbit sana uyum sağlasın." description="Görünümü, bildirimleri ve çalışma biçimini kişiselleştir."/>
      <div className="settings-layout"><nav className="surface settings-nav"><button className={settingsTab==='general'?'active':''} onClick={()=>setSettingsTab('general')}><UserRound size={16}/> Genel</button><button className={settingsTab==='appearance'?'active':''} onClick={()=>setSettingsTab('appearance')}><Palette size={16}/> Görünüm</button><button className={settingsTab==='notifications'?'active':''} onClick={()=>setSettingsTab('notifications')}><Bell size={16}/> Bildirimler</button><button className={settingsTab==='data'?'active':''} onClick={()=>setSettingsTab('data')}><Download size={16}/> Veri</button></nav><div className="settings-content">
        {settingsTab==='general'&&<><section className="surface settings-section"><div className="settings-profile"><div className="large-avatar">{profileInitials}</div><div><h2>{state.profile.name}</h2><p>{state.profile.workspace}</p></div><button onClick={()=>{setProfileDraft(state.profile);setModal('profile');}}>Düzenle</button></div></section><section className="surface settings-section"><header><h3>Çalışma alanı</h3><p>Orbit’in temel bilgileri ve yerel kayıt durumu.</p></header><div className="setting-row"><span className="setting-icon"><Smartphone size={17}/></span><span><strong>Bu cihaz</strong><small>Değişiklikler bu tarayıcıda otomatik saklanıyor</small></span><CheckCircle2 size={18} className="setting-ok"/></div><div className="setting-row"><span className="setting-icon"><Globe2 size={17}/></span><span><strong>Dil ve bölge</strong><small>Türkçe · Europe/Istanbul</small></span><CheckCircle2 size={18} className="setting-ok"/></div></section><section className="surface settings-section"><header><h3>Takvim bağlantısı</h3><p>Orbit etkinliklerini kendi Google Takviminle birleştir.</p></header><div className="setting-row"><span className="setting-icon"><CalendarDays size={17}/></span><span><strong>Google Takvim</strong><small>{googleCalendarStatus==='connected'?'Bağlı · Etkinlikler okunuyor ve yeni planlar eşitleniyor':googleCalendarStatus==='connecting'?'Google hesap penceresi bekleniyor':googleCalendarClientId?'Hazır · Google hesabınla tek dokunuşla bağlan':'Uygulama yapılandırması gerekiyor'}</small></span><button className="settings-edit-button" disabled={googleCalendarStatus==='connecting'} onClick={()=>googleCalendarStatus==='connected'?disconnectGoogleCalendar():void connectGoogleCalendar()}>{googleCalendarStatus==='connected'?'Bağlantıyı kes':googleCalendarStatus==='connecting'?'Bekleniyor…':'Google ile bağla'}</button></div></section></>}
        {settingsTab==='appearance'&&<section className="surface settings-section"><header><h3>Görünüm ve deneyim</h3><p>Orbit’in nasıl hissettirdiğini seç.</p></header><div className="setting-row theme-setting"><span className="setting-icon">{resolvedTheme==='dark'?<Moon size={17}/>:<Sun size={17}/>}</span><span><strong>Arayüz teması</strong><small>Açık, koyu veya cihazın görünümü</small></span><div className="theme-options" role="group" aria-label="Arayüz teması">{([{id:'light',label:'Açık',icon:Sun},{id:'system',label:'Sistem',icon:Monitor},{id:'dark',label:'Koyu',icon:Moon}] as const).map(({id,label,icon:ThemeIcon})=><button key={id} className={state.settings.theme===id?'selected':''} aria-pressed={state.settings.theme===id} onClick={()=>updateSetting('theme',id)}><ThemeIcon size={13}/><span>{label}</span></button>)}</div></div><div className="setting-row"><span className="setting-icon"><Palette size={17}/></span><span><strong>Vurgu rengi</strong><small>Altı renk seçeneğinden birini kullan</small></span><div className="color-options">{['violet','blue','mint','sand','rose','slate'].map((color)=><button aria-label={`${color} vurgu rengi`} key={color} className={`${color} ${state.settings.accent===color?'selected':''}`} onClick={()=>updateSetting('accent',color)}/>)}</div></div><div className="setting-row density-setting"><span className="setting-icon"><PanelsTopLeft size={17}/></span><span><strong>Bilgi yoğunluğu</strong><small>Ekranda daha ferah veya daha sıkı bir düzen seç</small></span><div className="theme-options" role="group" aria-label="Bilgi yoğunluğu">{([{id:'comfortable',label:'Ferah'},{id:'compact',label:'Kompakt'}] as const).map(({id,label})=><button key={id} className={state.settings.density===id?'selected':''} aria-pressed={state.settings.density===id} onClick={()=>updateSetting('density',id)}><span>{label}</span></button>)}</div></div><div className="setting-row nav-setting"><span className="setting-icon"><Menu size={17}/></span><span><strong>Alt menü</strong><small>Mobil çubuktaki dört sayfayı değiştir</small></span><button className="settings-edit-button" onClick={()=>setModal('navCustomize')}>Düzenle</button></div><SettingToggle icon={Sparkles} title="Hareket ve animasyon" description="Yumuşak geçişleri ve mikro animasyonları kullan" value={state.settings.motion} onChange={(value)=>updateSetting('motion',value)}/><SettingToggle icon={Volume2} title="Arayüz sesleri" description="Buton ve işlem anlarında yumuşak geri bildirim" value={state.settings.sound} onChange={(value)=>updateSetting('sound',value)}/><SettingToggle icon={Smartphone} title="Dokunsal geri bildirim" description="Mobil işlemlerde hafif titreşim kullan" value={state.settings.haptics} onChange={(value)=>updateSetting('haptics',value)}/><button data-feedback-test className="feedback-test-button" onClick={()=>{playFeedback('confirm',true,true,true);notify('Ses ve titreşim denemesi çalıştırıldı.');}}><Volume2 size={16}/><span><strong>Geri bildirimi dene</strong><small>Ses ve titreşim bu cihazda birlikte çalışır</small></span><Zap size={15}/></button></section>}
        {settingsTab==='appearance'&&<section className="surface settings-section sound-settings-section"><header><h3>Ses seviyesi</h3><p>Arayüz efektlerini cihazına göre ayarla.</p></header><div className="sound-level-control"><div className="sound-level-copy"><span className="setting-icon"><Volume1 size={17}/></span><span><strong>Efekt yüksekliği</strong><small>Düşükten ekstra güçlü seviyeye</small></span><em>%{state.settings.soundVolume}</em></div><div className="sound-volume-control"><Volume1 size={14}/><input aria-label="Arayüz ses seviyesi" type="range" min="10" max="150" step="5" value={state.settings.soundVolume} style={{'--sound-fill':`${Math.round(state.settings.soundVolume/1.5)}%`} as CSSProperties} onChange={(event)=>updateSetting('soundVolume',Number(event.target.value))} onPointerUp={()=>playFeedback('confirm',false,true)} onKeyUp={()=>playFeedback('confirm',false,true)}/><Volume2 size={16}/></div></div></section>}
        {settingsTab==='notifications'&&<section className="surface settings-section"><header><h3>Akış ve bildirimler</h3><p>Yalnızca gerçekten yaklaşan kayıtlar için haber al.</p></header><div className="setting-row"><span className="setting-icon"><CalendarDays size={17}/></span><span><strong>Orbit bildirim merkezi</strong><small>Bugün ve yarının takvim kayıtlarını gösterir · {unreadNotificationCount ? `${unreadNotificationCount} okunmamış` : 'şu an yeni bildirim yok'}</small></span><button className="settings-edit-button" onClick={()=>setModal('notifications')}>Merkezi aç</button></div><SettingToggle icon={Bell} title="Sistem hatırlatmaları" description="İzin açıksa cihaz bildirimlerine de izin ver" value={state.settings.notifications} onChange={(value)=>void updateNotifications(value)}/><SettingToggle icon={Eye} title="Tamamlananları göster" description="Personal listelerinde biten işleri görünür tut" value={state.settings.showCompleted} onChange={(value)=>updateSetting('showCompleted',value)}/></section>}
        {settingsTab==='data'&&<><section className="surface settings-section"><header><h3>Uygulama olarak kullan</h3><p>Orbit’i ana ekranına ekleyip tarayıcı çubuğu olmadan aç.</p></header><InstallOrbit/></section><section className="surface settings-section"><header><h3>Verini dışa aktar</h3><p>Orbit’teki yerel demo verisinin taşınabilir bir kopyasını al.</p></header><button className="data-export" onClick={exportDemoData}><Download size={16}/><span><strong>JSON yedeğini indir</strong><small>Görevler, notlar, proje aşamaları ve tercihler</small></span><ArrowRight size={15}/></button></section><section className="surface settings-section danger-section"><header><h3>Demo verisi</h3><p>Yerel değişiklikleri silip başlangıç verisine dön.</p></header><button onClick={()=>{if(window.confirm('Tüm yerel demo değişiklikleri sıfırlansın mı?')){setState(defaultState);notify('Demo verisi sıfırlandı.')}}}><RotateCcw size={15}/> Demo verisini sıfırla</button></section></>}
      </div></div>
    </>
  );

  const renderCaptureDestination = () => {
    const areas = captureAreasFor(capturePage);
    const isBuy = capturePage === 'personal' && captureArea === 'buy';
    const isVisit = capturePage === 'personal' && captureArea === 'visit';
    const acceptsDetails = capturePage === 'personal' || capturePage === 'projects' || capturePage === 'calendar' || capturePage === 'notes';
    const changeCapturePage = (page: CapturePage) => {
      const firstArea = captureAreasFor(page)[0]?.value ?? '';
      setCapturePage(page); setCaptureArea(firstArea);
      if (page === 'calendar') setCaptureExtras((current) => ({ ...current, date: selectedCalendarDate }));
    };

    return <>
      <div className="capture-destination compact"><strong>Nereye kaydedilsin?</strong><div className="capture-route-grid"><label>Sayfa<select value={capturePage} onChange={(event)=>changeCapturePage(event.target.value as CapturePage)}>{[{value:'personal',label:'Personal'},{value:'rebuild',label:'6 Aylık Rebuild'},{value:'projects',label:'Projeler'},{value:'kibleteyn',label:'Kıbleteyn'},{value:'programs',label:'Programlar'},{value:'calendar',label:'Takvim'},{value:'notes',label:'Notlar'}].map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{capturePage!=='calendar'&&capturePage!=='notes'&&<label>Alan<select value={captureArea} onChange={(event)=>setCaptureArea(event.target.value)}>{areas.map((area)=><option key={area.value} value={area.value}>{area.label}</option>)}</select></label>}</div></div>
      <label>{capturePage==='projects'?'Görev başlığı':capturePage==='calendar'?'Etkinlik adı':capturePage==='notes'?'Not başlığı':'Başlık'}<input required autoFocus={captureMethod==='text'} value={captureTitle} onChange={(event)=>setCaptureTitle(event.target.value)} placeholder={isBuy?'Örn. Monitör kolu':isVisit?'Örn. Efes Antik Kenti':capturePage==='projects'?'Projeye eklenecek görev':'Kaydetmek istediğin şey'}/></label>
      {isBuy&&<div className="form-row"><label>Fiyat <small>TL</small><input type="number" inputMode="decimal" min="0" value={captureExtras.price} onChange={(event)=>setCaptureExtras({...captureExtras,price:event.target.value})} placeholder="1250"/></label><label>Ürün bağlantısı<input type="url" value={captureExtras.link} onChange={(event)=>setCaptureExtras({...captureExtras,link:event.target.value})} placeholder="https://..."/></label></div>}
      {isVisit&&<label>Google Haritalar konumu<input type="url" value={captureExtras.locationUrl} onChange={(event)=>setCaptureExtras({...captureExtras,locationUrl:event.target.value})} placeholder="https://maps.google.com/..."/></label>}
      {capturePage==='personal'&&<label>Öncelik<select value={captureExtras.priority} onChange={(event)=>setCaptureExtras({...captureExtras,priority:event.target.value as 'normal'|'important'})}><option value="normal">Normal</option><option value="important">Önemli</option></select></label>}
      {capturePage==='calendar'&&<><div className="form-row"><label>Tarih<input required type="date" value={captureExtras.date} onChange={(event)=>setCaptureExtras({...captureExtras,date:event.target.value})}/></label><label>Saat <small>İsteğe bağlı</small><input type="time" value={captureExtras.time} onChange={(event)=>setCaptureExtras({...captureExtras,time:event.target.value})}/></label></div><label>Süre<select value={captureExtras.duration} onChange={(event)=>setCaptureExtras({...captureExtras,duration:event.target.value})}>{['15 dk','30 dk','45 dk','60 dk','90 dk','2 saat'].map((duration)=><option key={duration}>{duration}</option>)}</select></label></>}
      {acceptsDetails&&<label>{capturePage==='projects'?'Alt görevler':capturePage==='notes'?'Not':'Açıklama'} <small>İsteğe bağlı</small><textarea value={captureDetails} onChange={(event)=>setCaptureDetails(event.target.value)} placeholder={capturePage==='projects'?'Her satıra bir alt görev':capturePage==='notes'?'Düşünceni ayrıntılı yaz...':'Kısa bir ayrıntı ekle...'}/></label>}
      <button className="primary-button full" disabled={!captureTitle.trim()&&!captureDetails.trim()} onClick={saveCapture}>Bu alana kaydet <ArrowRight size={15}/></button>
    </>;
  };

  const renderCaptureModal = () => {
    if (captureStage === 'processing') return <div className="capture-processing"><span className="ai-orbit"><Sparkles size={24}/></span><span className="eyebrow">ORBIT AI</span><h2>Metni düzenliyorum.</h2><p>Kayıtları ayırıyor ve doğru alanlarla eşleştiriyorum…</p></div>;
    if (captureMethod === 'ai') return <><span className="modal-icon ai"><Sparkles size={20}/></span><span className="eyebrow">ORBIT AI</span><h2>Aklındakileri olduğu gibi bırak.</h2><p>Uzun metni görev, proje, not, alışveriş, konum veya takvim kaydına dönüştürüp doğru yerlere yerleştiririm.</p><label>Metnin<textarea required className="ai-capture-input" autoFocus value={captureDetails} onChange={(event)=>setCaptureDetails(event.target.value)} placeholder={'Örn. Yarın 14:00’te Fatih ile toplantı yap. Monitör kolu al, fiyatı 1.250 TL. İzmir gezisi için Efes’i kaydet. Yeni portfolyo uygulamasının araştırma ve tasarım görevlerini oluştur.'}/></label><button className="primary-button full ai-submit" disabled={!captureDetails.trim()} onClick={()=>void organizeCapture()}><Sparkles size={16}/> AI ile düzenle ve yerleştir</button></>;
    if (captureMethod === 'voice' && captureStage === 'listening') return <div className="voice-command"><span className="eyebrow">SESLİ KOMUT</span><h2>{captureListening?'Dinliyorum…':'Seni duyamadım.'}</h2><p>{captureListening?'Ne eklemek istediğini doğal biçimde anlat. Konuşman bitince hedef ekranı açılacak.':'Mikrofona dokunup tekrar konuş.'}</p><button className={`voice-command-orb ${captureListening?'listening':''}`} onClick={startCaptureVoice} aria-label="Sesli komutu yeniden başlat"><Mic size={28}/><i/><i/><i/></button><small>{captureListening?'Konuşman bittiğinde otomatik durur':'Tekrar dinle'}</small></div>;
    if (captureMethod === 'voice') return <><span className="modal-icon voice"><Mic size={20}/></span><span className="eyebrow">SESLİ KOMUT ALINDI</span><h2>Nereye kaydedelim?</h2><div className="voice-transcript"><Mic size={15}/><p>{captureDetails}</p><button onClick={startCaptureVoice} aria-label="Yeniden konuş"><RefreshCw size={14}/></button></div><button className="capture-ai-auto" onClick={()=>void organizeCapture()}><Sparkles size={17}/><span><strong>AI otomatik yerleştirsin</strong><small>Metni anlayıp uygun alanlara kendisi kaydeder</small></span><ArrowRight size={15}/></button><div className="capture-choice-separator"><span>veya kendin seç</span></div>{renderCaptureDestination()}</>;
    return <><span className="modal-icon"><StickyNote size={20}/></span><span className="eyebrow">YAZILI KAYIT</span><h2>Doğru biçimde kaydet.</h2><p>Önce hedefi seç; form o alanın ihtiyaçlarına göre değişsin.</p>{renderCaptureDestination()}</>;
  };

  const renderPage = () => {
    switch (active) {
      case 'personal': return renderPersonal(); case 'rebuild': return renderRebuild(); case 'projects': return renderProjects();
      case 'kibleteyn': return renderKibleteyn(); case 'programs': return renderPrograms(); case 'calendar': return renderCalendar();
      case 'notes': return renderNotes(); case 'archive': return renderArchive(); case 'settings': return renderSettings(); default: return renderHome();
    }
  };

  const searchResults = useMemo(() => nav.filter((item)=>item.label.toLocaleLowerCase('tr').includes(searchText.toLocaleLowerCase('tr'))),[searchText]);
  const personalSearchResults = searchText.trim().length < 2 ? [] : (Object.keys(personalLists) as PersonalListKey[]).flatMap((list) => personalItemsFor(list).filter((item) => `${item.title} ${item.details.note ?? ''}`.toLocaleLowerCase('tr').includes(searchText.toLocaleLowerCase('tr'))).map((item) => ({ ...item, list }))).slice(0, 6);

  if (!hydrated) return <div className="app-shell"><main className="content" aria-busy="true"><p role="status">Kayıtların yükleniyor…</p></main></div>;
  return <div className="app-shell">
    <div className="ambient-background" aria-hidden="true"><i/><i/><i/></div>
    <aside className={`sidebar ${mobileMenu?'open':''}`}><div className="brand-row"><button className="brand" onClick={()=>go('home')}><span className="brand-mark"><CircleDot size={18}/></span><span>Orbit<small>PERSONAL OS</small></span></button><IconButton label="Menüyü kapat" className="mobile-close" onClick={()=>setMobileMenu(false)}><X size={18}/></IconButton></div><nav className="side-nav" aria-label="Ana navigasyon">{nav.map((item)=>{const NavIcon=item.icon;const isNested=Boolean(item.parent);const isSectionActive=item.id==='kibleteyn'&&active==='programs';return <button key={item.id} className={`${active===item.id?'active ':''}${isNested?'nav-child ':''}${isSectionActive?'section-active':''}`.trim()} onClick={()=>go(item.id)} aria-current={active===item.id?'page':undefined}><span><NavIcon size={isNested?15:17}/></span>{item.label}{item.id==='programs'&&<em>{metricPrograms.length}</em>}</button>})}</nav><button className="sidebar-upgrade" onClick={()=>beginCapture('voice')}><span><Sparkles size={17}/></span><span><strong>Orbit Assistant</strong><small>Sesli kayıt ekle</small></span><ArrowUpRight size={14}/></button><button className="sidebar-profile" onClick={()=>{setProfileDraft(state.profile);setModal('profile');}}><div className="avatar">{profileInitials}</div><span><strong>{state.profile.name}</strong><small>{state.profile.workspace}</small></span><MoreHorizontal size={16}/></button></aside>
    {mobileMenu&&<button aria-label="Menüyü kapat" className="menu-backdrop" onClick={()=>setMobileMenu(false)}/>} 
    <section className="workspace"><header className="topbar"><IconButton label="Menüyü aç" className="menu-trigger" onClick={()=>setMobileMenu(true)}><Menu size={19}/></IconButton><div className="date-pill"><i/>{displayDate}</div><div className="top-actions"><form action="/auth/logout" method="post" onSubmit={logout}><button type="submit" className="icon-button" aria-label={loggingOut?"Çıkış yapılıyor":"Çıkış yap"} title="Çıkış yap" disabled={loggingOut}><LogOut size={16}/></button></form><IconButton label={resolvedTheme==='dark'?'Açık moda geç':'Koyu moda geç'} className="theme-toggle" onClick={()=>updateSetting('theme',resolvedTheme==='dark'?'light':'dark')}>{resolvedTheme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</IconButton><button className="search-trigger" onClick={()=>setModal('search')}><Search size={15}/><span>Ara...</span><kbd>/</kbd></button><IconButton label="Sesli kayıt" onClick={()=>beginCapture('voice')}><Mic size={16}/></IconButton><IconButton label={unreadNotificationCount?`${unreadNotificationCount} okunmamış bildirim`:'Bildirimler'} className={unreadNotificationCount?'has-notifications':''} onClick={()=>setModal('notifications')}><Bell size={16}/>{unreadNotificationCount>0&&<span className="notification-badge" aria-hidden="true">{unreadNotificationCount>9?'9+':unreadNotificationCount}</span>}</IconButton></div></header><main ref={pageContentRef} tabIndex={-1} key={active} className={`content page-${active}`}>{renderPage()}</main></section>
    <nav className="bottom-nav" aria-label="Mobil navigasyon">{state.mobileNav.slice(0,2).map((page)=>{const item=nav.find((entry)=>entry.id===page)!;const NavIcon=item.icon;return <button key={item.id} onClick={()=>go(item.id)} className={isNavActive(item.id)?'active':''} aria-current={isNavActive(item.id)?'page':undefined}><NavIcon size={19}/><small>{item.label==='6 Aylık Rebuild'?'Rebuild':item.label}</small></button>})}<div className={`quick-capture-cluster ${captureMenuOpen?'open':''}`}><div className="quick-capture-menu" aria-hidden={!captureMenuOpen}><button className="capture-action text" aria-label="Yazılı kayıt ekle" onClick={()=>beginCapture('text')}><StickyNote size={19}/></button><button className="capture-action ai" aria-label="AI ile akıllı kayıt ekle" onClick={()=>beginCapture('ai')}><Sparkles size={19}/></button><button className="capture-action voice" aria-label="Sesli kayıt ekle" onClick={()=>beginCapture('voice')}><Mic size={19}/></button></div><button className="quick-capture-trigger" onClick={openCaptureChoice} aria-label="Yeni kayıt ekle" aria-expanded={captureMenuOpen}><Plus size={21}/></button></div>{state.mobileNav.slice(2).map((page)=>{const item=nav.find((entry)=>entry.id===page)!;const NavIcon=item.icon;return <button key={item.id} onClick={()=>go(item.id)} className={isNavActive(item.id)?'active':''} aria-current={isNavActive(item.id)?'page':undefined}><NavIcon size={19}/><small>{item.label==='6 Aylık Rebuild'?'Rebuild':item.label}</small></button>})}</nav>
    {projectCreatorOpen && state.projectCreationDraft && <Suspense fallback={<p role="status">Proje atölyesi açılıyor…</p>}><ProjectCreator draft={state.projectCreationDraft} onChange={draft => setState(current => ({ ...current, projectCreationDraft: draft }))} onClose={() => setProjectCreatorOpen(false)} onDiscard={() => { setState(current => ({ ...current, projectCreationDraft: null })); setProjectCreatorOpen(false); }} onSave={saveProjectPlan}/></Suspense>}
    {modal&&<div className="modal-layer" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget){playFeedback('tap',true);setModal(null);}}}><section className={`modal-card ${modal}`} role="dialog" aria-modal="true" aria-label="Orbit penceresi" onKeyDownCapture={handleModalKeyDown} onChangeCapture={handleModalChange} onFocusCapture={handleModalFocus}><IconButton label="Kapat" className="modal-close" onClick={()=>setModal(null)}><X size={17}/></IconButton>
      {modal==='quick'&&<><span className="modal-icon"><ListTodo size={20}/></span><span className="eyebrow">HIZLI EKLE</span><h2>Yeni bir görev</h2><p>Aklındaki işi seçtiğin Personal listesine ekle.</p><label>Görev adı<input required autoFocus value={quickText} onChange={(event)=>setQuickText(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&addQuick()} placeholder="Örn. Tur sunumunu kontrol et"/></label><div className="modal-options" role="group" aria-label="Görev listesi">{(Object.keys(personalLists) as (keyof typeof personalLists)[]).map((key)=>{const ItemIcon=personalLists[key].icon;return <button type="button" key={key} aria-pressed={quickTarget===key} className={quickTarget===key?'selected':''} onClick={()=>setQuickTarget(key)}><ItemIcon size={14}/>{personalLists[key].title}</button>})}</div><button className="primary-button full" disabled={!quickText.trim()} onClick={addQuick}>Görevi ekle <ArrowRight size={15}/></button></>}
      {modal==='notifications'&&<><div className="notification-center-head"><span className="modal-icon"><Bell size={20}/></span><div><span className="eyebrow">BİLDİRİM MERKEZİ</span><h2>Yaklaşan akışın.</h2></div>{unreadNotificationCount>0&&<button onClick={markAllNotificationsRead}><CheckCheck size={15}/> Tümünü okundu say</button>}</div><p className="notification-center-copy">Yalnızca bugün ve yarın için takviminde gerçekten bulunan kayıtlar burada görünür.</p><div className="notification-list">{notifications.length?notifications.map((item)=>{const isUnread=!state.notificationReadIds.includes(item.id);return <article key={item.id} className={isUnread?'unread':''}><button className="notification-main" onClick={()=>openNotification(item)}><span className={`notification-tone ${item.tone}`}><CalendarDays size={16}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><ChevronRight size={15}/></button><button className="notification-dismiss" aria-label={`${item.title} bildirimini kaldır`} onClick={()=>dismissNotification(item.id)}><X size={14}/></button></article>}):<div className="notification-empty"><span><Bell size={22}/><Check size={12}/></span><strong>Yeni bildirimin yok.</strong><p>Takvimine bugün veya yarın için bir kayıt eklendiğinde burada görünecek.</p></div>}</div><div className="notification-center-footer"><span><i className={state.settings.notifications?'active':''}/>{state.settings.notifications?'Sistem hatırlatmaları açık':'Sistem hatırlatmaları kapalı'}</span><button onClick={()=>{setModal(null);setSettingsTab('notifications');go('settings')}}>Bildirim ayarları <ArrowRight size={13}/></button></div></>}
      {modal==='personalItem'&&<><span className="modal-icon">{personalItemDraft.list==='visit'?<MapPin size={20}/>:personalItemDraft.list==='buy'?<ShoppingBag size={20}/>:<ListTodo size={20}/>}</span><span className="eyebrow">{editingPersonalItemId?'KAYDI DÜZENLE':'YENİ KAYIT'}</span><h2>{personalLists[personalItemDraft.list].title}</h2><p>{editingPersonalItemId?'Kaydın ayrıntılarını güncelle.':'Yeni kayıt bu Personal listesine eklenecek.'}</p><label>Başlık<input required autoFocus value={personalItemDraft.title} onChange={(event)=>setPersonalItemDraft({...personalItemDraft,title:event.target.value})} placeholder={personalItemDraft.list==='visit'?'Örn. Efes Antik Kenti':personalItemDraft.list==='buy'?'Örn. Monitör kolu':'Yapılacak iş'}/></label>{personalItemDraft.list==='buy'&&<><label>Fiyat <small>TL</small><input type="number" inputMode="decimal" min="0" value={personalItemDraft.price} onChange={(event)=>setPersonalItemDraft({...personalItemDraft,price:event.target.value})} placeholder="1250"/></label><label>Ürün bağlantısı <small>İsteğe bağlı</small><input type="url" value={personalItemDraft.link} onChange={(event)=>setPersonalItemDraft({...personalItemDraft,link:event.target.value})} placeholder="https://..."/></label></>}{personalItemDraft.list==='visit'&&<label>Google Haritalar konum bağlantısı <small>İsteğe bağlı</small><input type="url" value={personalItemDraft.locationUrl} onChange={(event)=>setPersonalItemDraft({...personalItemDraft,locationUrl:event.target.value})} placeholder="https://maps.google.com/..."/></label>}<label>Kısa not <small>İsteğe bağlı</small><textarea value={personalItemDraft.note} onChange={(event)=>setPersonalItemDraft({...personalItemDraft,note:event.target.value})} placeholder="Kısa bir ayrıntı ekle..."/></label><label>Öncelik<select value={personalItemDraft.priority} onChange={(event)=>setPersonalItemDraft({...personalItemDraft,priority:event.target.value as 'normal'|'important'})}><option value="normal">Normal</option><option value="important">Önemli</option></select></label>{editingPersonalItemId&&<button className="personal-delete-button" onClick={removePersonalItem}><Trash2 size={15}/> Kaydı kaldır</button>}<button className="primary-button full" disabled={!personalItemDraft.title.trim()} onClick={savePersonalItem}>{editingPersonalItemId?'Değişiklikleri kaydet':'Listeye ekle'} <ArrowRight size={15}/></button></>}
      {modal==='note'&&<><span className="modal-icon"><StickyNote size={20}/></span><span className="eyebrow">YENİ NOT</span><h2>Bir düşünce yakala.</h2><p>Başlığıyla kolayca bulabileceğin temiz bir not oluştur.</p><label>Başlık<input required autoFocus value={noteDraft.title} onChange={(event)=>setNoteDraft({...noteDraft,title:event.target.value})} placeholder="Not başlığı"/></label><label>Not <small>İsteğe bağlı</small><textarea value={noteDraft.body} onChange={(event)=>setNoteDraft({...noteDraft,body:event.target.value})} placeholder="Düşünceni, bağlantıları veya sonraki adımları yaz..."/></label><button className="primary-button full" disabled={!noteDraft.title.trim()} onClick={addNote}>Notu kaydet <Check size={15}/></button></>}
      {modal==='project'&&<><span className="modal-icon"><PanelsTopLeft size={20}/></span><span className="eyebrow">{editingProjectId?'PROJEYİ DÜZENLE':'YENİ PROJE'}</span><h2>{editingProjectId?'Kartı ve içeriğini güncelle.':'Fikre net bir başlangıç ver.'}</h2><p>Önce temel bilgileri gir; görevleri ve görsel kimliği istediğin zaman değiştirebilirsin.</p><label>Proje adı<input required autoFocus value={projectDraft.title} onChange={(event)=>setProjectDraft({...projectDraft,title:event.target.value})} placeholder="Örn. Seyahat planlama uygulaması"/></label><div className="form-row"><label>Aşama<select value={projectDraft.stage} onChange={(event)=>setProjectDraft({...projectDraft,stage:Number(event.target.value)})}>{['Fikirler','Devam ediyor','İnceleme','Tamamlandı'].map((label,index)=><option value={index} key={label}>{label}</option>)}</select></label><p>İlerleme, görevler ve alt görevlerden otomatik hesaplanır.</p></div><div className="form-row"><label>Renk<select value={projectDraft.color} onChange={(event)=>setProjectDraft({...projectDraft,color:event.target.value})}>{[{value:'violet',label:'Mor'},{value:'blue',label:'Mavi'},{value:'mint',label:'Yeşil'},{value:'sand',label:'Kum'},{value:'rose',label:'Gül'}].map((color)=><option key={color.value} value={color.value}>{color.label}</option>)}</select></label><label>Kapak<select value={projectDraft.cover} onChange={(event)=>setProjectDraft({...projectDraft,cover:event.target.value as ProjectCover})}>{[{value:'orbit',label:'Yörünge'},{value:'aurora',label:'Aurora'},{value:'grid',label:'Teknolojik ızgara'},{value:'minimal',label:'Minimal'}].map((cover)=><option key={cover.value} value={cover.value}>{cover.label}</option>)}</select></label></div><label>Hedef tarih <small>İsteğe bağlı</small><input value={projectDraft.due} onChange={(event)=>setProjectDraft({...projectDraft,due:event.target.value})} placeholder="Örn. 18 Eyl"/></label><label>Etiketler <small>Virgülle ayır</small><input value={projectDraft.tags} onChange={(event)=>setProjectDraft({...projectDraft,tags:event.target.value})} placeholder="UI, Mobil, Araştırma"/></label>{editingProjectId?<p>Görevleri, alt görevleri ve fotoğrafları projenin detay sayfasından yönetebilirsin.</p>:<label>İlk görevler <small>Her satıra bir görev</small><textarea value={projectDraft.tasks} onChange={(event)=>setProjectDraft({...projectDraft,tasks:event.target.value})} placeholder={'Kullanıcı akışını çıkar\nİlk ekranı tasarla\nMobil akışı test et'}/></label>}<button className="primary-button full" disabled={!projectDraft.title.trim()} onClick={addProject}>{editingProjectId?'Değişiklikleri kaydet':'Projeyi oluştur'} <ArrowRight size={15}/></button></>}
      {modal==='program'&&<><span className="modal-icon"><Plane size={20}/></span><span className="eyebrow">{editingProgramId?'TURU DÜZENLE':'YENİ TUR'}</span><h2>{editingProgramId?'Tur bilgilerini güncelle.':'Turun hazırlık alanını aç.'}</h2><p>Tur, hazırlık kategorileri ve takip edilebilir görevleriyle birlikte oluşturulacak.</p><label>Tur adı<input required autoFocus value={programDraft.title} onChange={(event)=>setProgramDraft({...programDraft,title:event.target.value})} placeholder="Örn. 12–16 Ekim Umre"/></label><label>Tarih aralığı <small>İsteğe bağlı</small><input value={programDraft.range} onChange={(event)=>setProgramDraft({...programDraft,range:event.target.value})} placeholder="Örn. 12–16 Ekim 2026"/></label><div className="form-row"><label>Durum<select value={programDraft.status} onChange={(event)=>setProgramDraft({...programDraft,status:event.target.value})}>{['Taslak','Planlandı','Hazırlanıyor'].map((status)=><option key={status}>{status}</option>)}</select></label><label>Vurgu rengi<select value={programDraft.accent} onChange={(event)=>setProgramDraft({...programDraft,accent:event.target.value})}>{[{value:'violet',label:'Mor'},{value:'blue',label:'Mavi'},{value:'mint',label:'Yeşil'},{value:'sand',label:'Kum'},{value:'rose',label:'Gül'}].map((color)=><option key={color.value} value={color.value}>{color.label}</option>)}</select></label></div><button className="primary-button full" disabled={!programDraft.title.trim()} onClick={addProgram}>{editingProgramId?'Değişiklikleri kaydet':'Turu oluştur'} <ArrowRight size={15}/></button></>}
      {modal==='programTask'&&<><span className="modal-icon"><ListTodo size={20}/></span><span className="eyebrow">PROGRAM GÖREVİ</span><h2>Hazırlık adımı ekle.</h2><p>Görev, seçtiğin turun ilgili hazırlık kategorisinde görünecek.</p><label>Kategori<select value={programTaskDraft.category} onChange={(event)=>setProgramTaskDraft({...programTaskDraft,category:event.target.value})}>{programCategories.map((category)=><option key={category.name}>{category.name}</option>)}</select></label><label>Görev adı<input required autoFocus value={programTaskDraft.title} onChange={(event)=>setProgramTaskDraft({...programTaskDraft,title:event.target.value})} onKeyDown={(event)=>event.key==='Enter'&&addProgramTask()} placeholder="Örn. Otel teyidini al"/></label><button className="primary-button full" disabled={!programTaskDraft.title.trim()} onClick={addProgramTask}>Görevi ekle <ArrowRight size={15}/></button></>}
      {modal==='departmentTask'&&<><span className="modal-icon"><ListTodo size={20}/></span><span className="eyebrow">OPERASYON GÖREVİ</span><h2>{departments.find((department)=>department.id===expandedDepartment)?.title} için görev ekle.</h2><p>Yeni görev doğrudan açık departmanın operasyon listesine kaydedilecek.</p><label>Görev adı<input required autoFocus value={departmentTaskDraft} onChange={(event)=>setDepartmentTaskDraft(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&addDepartmentTask()} placeholder="Örn. Tedarikçiden teyit al"/></label><button className="primary-button full" disabled={!departmentTaskDraft.trim()} onClick={addDepartmentTask}>Görevi ekle <ArrowRight size={15}/></button></>}
      {modal==='navCustomize'&&<><span className="modal-icon"><Menu size={20}/></span><span className="eyebrow">ALT MENÜ</span><h2>Hızlı erişimlerini seç.</h2><p>Ana Sayfa her açılışta başlangıç ekranıdır ve üç çizgili menüde kalır. Burada gün içinde en çok kullandığın dört bölümü seç.</p><div className="nav-customizer">{state.mobileNav.map((selectedPage,index)=><label key={index}>{index < 2?'Sol':'Sağ'} alan {index % 2 + 1}<select value={selectedPage} onChange={(event)=>updateMobileNavItem(index,event.target.value as PageKey)}>{nav.filter((item)=>item.id!=='home').map((item)=><option key={item.id} value={item.id} disabled={item.id!==selectedPage&&state.mobileNav.includes(item.id)}>{item.label}</option>)}</select></label>)}</div><button className="primary-button full" onClick={()=>{setModal(null);notify('Alt menü güncellendi.')}}>Kaydet <Check size={15}/></button></>}
      {modal==='capture'&&renderCaptureModal()}
      {modal==='event'&&<><span className="modal-icon"><CalendarDays size={20}/></span><span className="eyebrow">YENİ ETKİNLİK</span><h2>Takvimde yer aç.</h2><p>Önce zamanını belirle; bağlantı açıksa Google Takvim’e de otomatik eklenecek.</p>{eventDraft.source&&<div className="calendar-source-chip"><Link2 size={13}/>{eventDraft.source}</div>}<label>Etkinlik adı<input required autoFocus value={eventDraft.title} onChange={(event)=>setEventDraft({...eventDraft,title:event.target.value})} placeholder="Örn. Tur semineri"/></label><div className="form-row"><label>Tarih<input required type="date" value={eventDraft.date} onChange={(event)=>setEventDraft({...eventDraft,date:event.target.value})}/></label><label>Saat <small>İsteğe bağlı</small><input type="time" value={eventDraft.time} onChange={(event)=>setEventDraft({...eventDraft,time:event.target.value})}/></label></div><div className="form-row"><label>Süre <small>İsteğe bağlı</small><input value={eventDraft.duration} onChange={(event)=>setEventDraft({...eventDraft,duration:event.target.value})} placeholder="60 dk"/></label><label>Renk<select value={eventDraft.tone} onChange={(event)=>setEventDraft({...eventDraft,tone:event.target.value})}>{[{value:'violet',label:'Mor'},{value:'blue',label:'Mavi'},{value:'mint',label:'Yeşil'},{value:'sand',label:'Kum'},{value:'rose',label:'Gül'},{value:'orange',label:'Turuncu'}].map((tone)=><option key={tone.value} value={tone.value}>{tone.label}</option>)}</select></label></div><label>Açıklama <small>İsteğe bağlı</small><textarea value={eventDraft.description} onChange={(event)=>setEventDraft({...eventDraft,description:event.target.value})} placeholder="Etkinlik ayrıntıları..."/></label><div className={`calendar-save-status ${googleCalendarStatus==='connected'?'connected':''}`}><CalendarDays size={14}/><span><strong>{googleCalendarStatus==='connected'?'Orbit + Google Takvim':'Orbit Takvimi'}</strong><small>{googleCalendarStatus==='connected'?'İki takvime birlikte kaydedilecek':'Kaydettikten sonra Google’a tek dokunuşla aktarabilirsin'}</small></span></div><button className="primary-button full" disabled={!eventDraft.title.trim()||!eventDraft.date} onClick={()=>void addEvent()}>Takvime ekle <ArrowRight size={15}/></button></>}
      {modal==='profile'&&<><span className="modal-icon"><UserRound size={20}/></span><span className="eyebrow">ÇALIŞMA ALANI</span><h2>Profilini kişiselleştir.</h2><p>Bu bilgiler yalnızca Orbit içindeki çalışma alanını tanımlar.</p><label>İsim<input required autoFocus value={profileDraft.name} onChange={(event)=>setProfileDraft({...profileDraft,name:event.target.value})} placeholder="İsmin"/></label><label>Çalışma alanı<input required value={profileDraft.workspace} onChange={(event)=>setProfileDraft({...profileDraft,workspace:event.target.value})} placeholder="Örn. Tasarım ve operasyon"/></label><button className="primary-button full" disabled={!profileDraft.name.trim()||!profileDraft.workspace.trim()} onClick={saveProfile}>Değişiklikleri kaydet <Check size={15}/></button></>}
      {modal==='search'&&<><div className="command-input"><Search size={18}/><input autoFocus value={searchText} onChange={(event)=>setSearchText(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter'&&searchResults[0]){go(searchResults[0].id);setModal(null);setSearchText('');}}} placeholder="Sayfa veya kayıt ara..."/></div><div className="command-results"><span>Hızlı geçiş</span>{searchResults.map((item)=>{const ItemIcon=item.icon;return <button key={item.id} onClick={()=>{go(item.id);setModal(null);setSearchText('')}}><i><ItemIcon size={17}/></i><strong>{item.label}</strong><small>Sayfaya git</small><ChevronRight size={14}/></button>})}{personalSearchResults.length>0&&<><span>Personal kayıtları</span>{personalSearchResults.map((item)=>{const ItemIcon=personalLists[item.list].icon;return <button key={item.id} onClick={()=>{setPersonalTab(item.list);go('personal');setModal(null);setSearchText('')}}><i><ItemIcon size={17}/></i><strong>{item.title}</strong><small>{personalLists[item.list].title}</small><ChevronRight size={14}/></button>})}</>}{!searchResults.length&&!personalSearchResults.length&&<p className="empty-inline">Eşleşen sonuç bulunamadı.</p>}</div><div className="command-footer"><span><Command size={12}/> Orbit hızlı arama</span><span>↵ ilk sayfayı aç · esc kapat</span></div></>}
    </section></div>}
    <div className={`toast ${toast?'show':''}`} role="status"><CheckCircle2 size={16}/>{toast}</div>
  </div>;
}

function SettingToggle({icon:Icon,title,description,value,onChange}:{icon:LucideIcon;title:string;description:string;value:boolean;onChange:(value:boolean)=>void}) {
  return <div className="setting-row"><span className="setting-icon"><Icon size={17}/></span><span><strong>{title}</strong><small>{description}</small></span><button aria-label={`${title} ${value?'kapat':'aç'}`} className={`switch ${value?'on':''}`} onClick={()=>onChange(!value)}><i/></button></div>;
}

