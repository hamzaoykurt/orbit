export type CopyTaskChild = { title: string; completed?: boolean };

export type CopyTaskInput = {
  title: string;
  context?: string;
  note?: string;
  status?: 'Açık' | 'Tamamlandı';
  subtasks?: CopyTaskChild[];
  link?: string;
};

export function taskCopyText({ title, context, note, status, subtasks = [], link }: CopyTaskInput) {
  const lines = [`Görev: ${title.trim()}`];
  if (context?.trim()) lines.push(`Bağlam: ${context.trim()}`);
  if (status) lines.push(`Durum: ${status}`);
  if (note?.trim()) lines.push(`Not: ${note.trim()}`);
  if (link?.trim()) lines.push(`Bağlantı: ${link.trim()}`);
  if (subtasks.length) {
    lines.push('', 'Alt görevler:');
    subtasks.forEach(task => lines.push(`- [${task.completed ? 'x' : ' '}] ${task.title.trim()}`));
  }
  return lines.join('\n');
}
