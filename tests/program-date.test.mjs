import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const { parseProgramDateRange } = await import(loadModuleUrl(new URL('../app/program-date.ts', import.meta.url)));

test('same-month tour ranges repeat the month for clarity', () => {
  assert.deepEqual(parseProgramDateRange('12–25 Kas'), {
    start: { day: '12', month: 'KAS' },
    end: { day: '25', month: 'KAS' },
    year: undefined,
    label: '12–25 Kas',
  });
});

test('title supplies the missing departure month in a cross-month range', () => {
  assert.deepEqual(parseProgramDateRange('25–14 Ara', '25 Kasım'), {
    start: { day: '25', month: 'KAS' },
    end: { day: '14', month: 'ARA' },
    year: undefined,
    label: '25–14 Ara',
  });
});

test('full dates and numeric dates keep their year', () => {
  assert.deepEqual(parseProgramDateRange('1 Ekim – 4 Ekim 2026'), {
    start: { day: '1', month: 'EKİ' },
    end: { day: '4', month: 'EKİ' },
    year: '2026',
    label: '1 Ekim – 4 Ekim 2026',
  });
  assert.deepEqual(parseProgramDateRange('25.11.2026 - 14.12.2026'), {
    start: { day: '25', month: 'KAS' },
    end: { day: '14', month: 'ARA' },
    year: '2026',
    label: '25.11.2026 - 14.12.2026',
  });
});

test('missing dates remain honest instead of inventing a range', () => {
  assert.deepEqual(parseProgramDateRange('Tarih belirtilmedi'), { label: 'Tarih belirtilmedi' });
});
