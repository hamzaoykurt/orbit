import type { ProjectPlanning } from './planning-types';
export type ProjectPhoto = { id: string; url: string; name: string; createdAt: string };
export type ProjectNoteKind = 'decision'|'meeting'|'idea'|'research';
export type ProjectNote = { id:string;title:string;body:string;kind:ProjectNoteKind;context:string;outcome:string;nextStep:string;links:{id:string;title:string;url:string}[];images:(ProjectPhoto&{caption:string})[] };
export type ProjectTaskDetails = { note: string; photos: ProjectPhoto[] };
export type DiagramNode = { id: string; label: string; x: number; y: number; color: string };
export type Diagram = { id: string; title: string; nodes: DiagramNode[]; edges: { id: string; from: string; to: string }[] };
export type ProjectWorkspaceData = {
  description: string;
  diagrams: Diagram[];
  notes: ProjectNote[];
  links: { id: string; title: string; url: string }[];
  planning?: ProjectPlanning;
  mentor?: { source: 'mentor'; importedAt: string; suggestedDesignLanguage?: string };
};
export const emptyWorkspace: ProjectWorkspaceData = { description: '', diagrams: [], notes: [], links: [] };
export const emptyTask: ProjectTaskDetails = { note: '', photos: [] };
export type WorkspaceTask = { id: string; index: number; title: string; children: { id: string; title: string; legacy?: boolean }[] };

type ProjectTaskState = {
  removedTasks: string[];
  completed: Record<string, boolean>;
  subtasks: Record<string, { id: string; title: string }[]>;
  details: Record<string, ProjectTaskDetails>;
};

const removalKey = (index: number, title: string) => `orbit-task:${index}:${title}`;

export function visibleProjectTaskTitles(tasks: string[], extraTasks: string[], removedTasks: string[]): string[] {
  return [...tasks, ...extraTasks].filter((title, index) => !removedTasks.includes(title) && !removedTasks.includes(removalKey(index, title)));
}

// Task identities are index based in the persisted model. Compact every related
// collection together so removing a task cannot attach its notes/subtasks to the
// task that moves into the vacated position.
export function removeProjectTaskState(projectId: string, tasks: string[], extraTasks: string[], taskIndex: number, state: ProjectTaskState): ProjectTaskState {
  const all = [...tasks, ...extraTasks];
  const visible = all.map((title, sourceIndex) => ({ title, sourceIndex })).filter(item => !state.removedTasks.includes(item.title) && !state.removedTasks.includes(removalKey(item.sourceIndex, item.title)));
  if (!visible[taskIndex]) return state;
  let end = taskIndex + 1;
  while (end < visible.length && visible[end].title.startsWith('>')) end += 1;
  const deletedIndexes = new Set(Array.from({ length: end - taskIndex }, (_, offset) => taskIndex + offset));
  const deletedSubtaskIds = new Set([...deletedIndexes].flatMap(index => (state.subtasks[`${projectId}:${index}`] ?? []).map(item => item.id)));
  const indexMap = new Map<number, number>();
  let nextIndex = 0;
  visible.forEach((_, index) => { if (!deletedIndexes.has(index)) indexMap.set(index, nextIndex++); });
  const taskIdPrefix = `project-${projectId}-`;
  const subtaskKeyPrefix = `${projectId}:`;
  const remapTaskRecord = <T,>(record: Record<string, T>): Record<string, T> => {
    const result: Record<string, T> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!key.startsWith(taskIdPrefix)) { if (!deletedSubtaskIds.has(key)) result[key] = value; continue; }
      const oldIndex = Number(key.slice(taskIdPrefix.length));
      if (!Number.isInteger(oldIndex)) { result[key] = value; continue; }
      const mapped = indexMap.get(oldIndex);
      if (mapped !== undefined) result[`${taskIdPrefix}${mapped}`] = value;
    }
    return result;
  };
  const subtasks: ProjectTaskState['subtasks'] = {};
  for (const [key, value] of Object.entries(state.subtasks)) {
    if (!key.startsWith(subtaskKeyPrefix)) { subtasks[key] = value; continue; }
    const oldIndex = Number(key.slice(subtaskKeyPrefix.length));
    if (!Number.isInteger(oldIndex)) { subtasks[key] = value; continue; }
    const mapped = indexMap.get(oldIndex);
    if (mapped !== undefined) subtasks[`${subtaskKeyPrefix}${mapped}`] = value;
  }
  return {
    removedTasks: [...new Set([...state.removedTasks, ...visible.slice(taskIndex, end).map(item => removalKey(item.sourceIndex, item.title))])],
    completed: remapTaskRecord(state.completed),
    subtasks,
    details: remapTaskRecord(state.details),
  };
}

// Preserve the original indices used by existing completion and subtask records.
export function buildProjectTasks(projectId: string, titles: string[], subtasks: Record<string, { id: string; title: string }[]>): WorkspaceTask[] {
  const result: WorkspaceTask[] = [];
  titles.forEach((title, index) => {
    const id = `project-${projectId}-${index}`;
    if (title.startsWith('>') && result.length) result[result.length - 1].children.push({ id, title: title.slice(1).trim(), legacy: true });
    else result.push({ id, index, title: title.replace(/^>\s*/, ''), children: [...(subtasks[`${projectId}:${index}`] ?? [])] });
  });
  return result;
}
export function safeResourceUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function normalizeWorkspace(value:unknown):ProjectWorkspaceData{
  const raw=value&&typeof value==='object'&&!Array.isArray(value)?value as Partial<ProjectWorkspaceData>:{};
  const notes:ProjectNote[]=(Array.isArray(raw.notes)?raw.notes:[]).flatMap(value=>{
    if(!value||typeof value!=='object')return[];const note=value as Partial<ProjectNote>;
    if(typeof note.id!=='string')return[];const kind=['decision','meeting','idea','research'].includes(String(note.kind))?note.kind as ProjectNoteKind:'idea';
    const links=(Array.isArray(note.links)?note.links:[]).filter(link=>link&&typeof link.id==='string'&&typeof link.title==='string'&&typeof link.url==='string'&&safeResourceUrl(link.url));
    const images=(Array.isArray(note.images)?note.images:[]).filter(image=>image&&typeof image.id==='string'&&typeof image.url==='string').map(image=>({...image,name:typeof image.name==='string'?image.name:'Görsel',createdAt:typeof image.createdAt==='string'?image.createdAt:'',caption:typeof image.caption==='string'?image.caption:''}));
    return[{id:note.id,title:typeof note.title==='string'?note.title:'Yeni not',body:typeof note.body==='string'?note.body:'',kind,context:typeof note.context==='string'?note.context:'',outcome:typeof note.outcome==='string'?note.outcome:'',nextStep:typeof note.nextStep==='string'?note.nextStep:'',links,images}];
  });
  const mentor=raw.mentor&&raw.mentor.source==='mentor'&&typeof raw.mentor.importedAt==='string'?{source:'mentor' as const,importedAt:raw.mentor.importedAt,...(typeof raw.mentor.suggestedDesignLanguage==='string'?{suggestedDesignLanguage:raw.mentor.suggestedDesignLanguage}:{})}:undefined;
  return {...emptyWorkspace,...raw,description:typeof raw.description==='string'?raw.description:'',diagrams:Array.isArray(raw.diagrams)?raw.diagrams:[],notes,links:Array.isArray(raw.links)?raw.links:[],...(mentor?{mentor}:{})};
}
export function moveDiagramNode(diagram: Diagram, id: string, x: number, y: number): Diagram {
  return { ...diagram, nodes: diagram.nodes.map(node => node.id === id ? { ...node, x: Math.max(0, Math.min(820, x)), y: Math.max(0, Math.min(520, y)) } : node) };
}
export function removeDiagramNode(diagram: Diagram, id: string): Diagram {
  return { ...diagram, nodes: diagram.nodes.filter(node => node.id !== id), edges: diagram.edges.filter(edge => edge.from !== id && edge.to !== id) };
}
export function connectDiagramNodes(diagram: Diagram, from: string, to: string, id: string): Diagram {
  if (from === to || !diagram.nodes.some(node => node.id === from) || !diagram.nodes.some(node => node.id === to) || diagram.edges.some(edge => edge.from === from && edge.to === to)) return diagram;
  return { ...diagram, edges: [...diagram.edges, { id, from, to }] };
}
