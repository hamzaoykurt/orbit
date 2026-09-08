import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const { taskCopyText } = await import(loadModuleUrl(new URL('../app/task-copy.ts', import.meta.url)));

test('task copy text carries Codex-ready context, notes and subtask state', () => {
  assert.equal(taskCopyText({
    title: '  Ana ekranı uygula  ',
    context: 'Proje · Orbit',
    status: 'Açık',
    note: 'Mobil kırılımı unutma.',
    link: 'https://example.com/design',
    subtasks: [
      { title: 'Wireframe', completed: true },
      { title: 'Boş durum', completed: false },
    ],
  }), [
    'Görev: Ana ekranı uygula',
    'Bağlam: Proje · Orbit',
    'Durum: Açık',
    'Not: Mobil kırılımı unutma.',
    'Bağlantı: https://example.com/design',
    '',
    'Alt görevler:',
    '- [x] Wireframe',
    '- [ ] Boş durum',
  ].join('\n'));
});

test('task copy text stays concise when only a title exists', () => {
  assert.equal(taskCopyText({ title: 'Kaynakları tara' }), 'Görev: Kaynakları tara');
});
