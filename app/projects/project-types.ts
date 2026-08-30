export type ProjectPhoto = { id: string; url: string; name: string; createdAt: string };
export type ProjectTaskDetails = { note: string; photos: ProjectPhoto[] };
export type DiagramNode = { id: string; label: string; x: number; y: number; color: string };
export type Diagram = { id: string; title: string; nodes: DiagramNode[]; edges: { id: string; from: string; to: string }[] };
export type ProjectWorkspaceData = {
  description: string;
  diagrams: Diagram[];
  notes: { id: string; title: string; body: string }[];
  links: { id: string; title: string; url: string }[];
};
export const emptyWorkspace: ProjectWorkspaceData = { description: '', diagrams: [], notes: [], links: [] };
export const emptyTask: ProjectTaskDetails = { note: '', photos: [] };
export type WorkspaceTask = { id: string; index: number; title: string; children: { id: string; title: string; legacy?: boolean }[] };

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
