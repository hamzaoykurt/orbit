import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(path, imports = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require','exports',source)(id => id.endsWith('.css') ? {} : imports[id] ?? require(id), exports);
  return exports;
}
const model = load('../app/rebuild/activity-model.ts');
const { ActivityWorkbench } = load('../app/rebuild/activity-workbench.tsx', { './activity-model': model });
const create = area => model.createActivityDraft(area, 'Yeni çalışma', '2026-08-30');

test('new sessions never invent duration, exercises or outcomes', () => {
  for (const area of Object.keys(model.activityLabels)) {
    const draft = create(area);
    assert.equal(draft.duration, 0);
    assert.equal(draft.note, '');
    assert.deepEqual(draft.exercises, [{name:'',sets:'',reps:'',weight:''}]);
  }
});
test('exercise details round-trip without mutating the draft', () => {
  const draft = create('body'); draft.duration = 45;
  draft.exercises = [{name:' Squat ',sets:'3',reps:'8',weight:'40'}, {name:'',sets:'',reps:'',weight:''}];
  const snapshot = JSON.stringify(draft);
  const entry = model.buildActivityEntry(draft);
  assert.equal(entry.details.exercises.length, 1);
  assert.match(entry.note, /Squat · 3 set · 8 tekrar · 40 kg/);
  assert.equal(JSON.stringify(draft), snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(entry)), entry);
});
test('each area requires its own evidence, not a universal rating', () => {
  const research = create('curiosity'); assert.match(model.activityError(research), /cevabı/);
  research.note = 'Henüz cevap yok; şu iki görüş çelişiyor.';
  assert.equal(model.activityError(research), '');
  const social = create('social'); assert.match(model.activityError(social), /Kiminle/);
  social.person = 'Fotoğraf topluluğu'; assert.equal(model.activityError(social), '');
  const solo = create('solo'); assert.match(model.activityError(solo), /durak/);
  solo.stops = ['Moda', 'Kitapçı']; assert.match(model.buildActivityEntry(solo).note, /Moda → Kitapçı/);
  const space = create('space'); space.duration = 90; space.prediction = 'Hız artar';
  assert.match(model.activityError(space), /sonucu/);
  space.note = 'Yörünge değişti'; assert.match(model.buildActivityEntry(space).note, /Tahmin: Hız artar/);
});
test('durations, real calendar dates and source URLs are validated', () => {
  const draft = create('creativity');
  for (const duration of [-1, Infinity, NaN, 1441]) { draft.duration=duration; assert.notEqual(model.activityError(draft), ''); }
  draft.duration=30;
  for (const source of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.com', 'invalid']) { draft.source=source; assert.notEqual(model.activityError(draft), ''); }
  draft.source='https://example.com/demo'; assert.equal(model.activityError(draft), '');
  draft.date='2026-02-31'; assert.notEqual(model.activityError(draft), '');
});
test('all eight working surfaces render domain-specific controls', () => {
  const expected = { body:'Hareket ekle', curiosity:'Kendi cümlelerinle', creativity:'VERSİYONUN DURUMU', language:'Pratiğe başla', solo:'Rotaya durak ekle', social:'KİMİNLE', career:'Geri dönüş', space:'Denemeden önceki tahminin' };
  for (const [area, text] of Object.entries(expected)) {
    const markup = renderToStaticMarkup(React.createElement(ActivityWorkbench, {areaId:area,title:'Yeni çalışma',date:'2026-08-30',onSave:()=>{}}));
    assert.ok(markup.includes(text), `${area} is missing its interaction`);
    assert.ok(markup.includes(model.activityLabels[area].action));
    assert.ok(!markup.includes('Nasıl geçti?'));
    assert.ok(!markup.includes('Bu haftaya işle'));
    if (area !== 'body') assert.ok(!markup.includes('Hareket ekle'));
    if (area !== 'language') assert.ok(!markup.includes('Pratiğe başla'));
  }
});
