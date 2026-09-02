import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

test('expired Google access never opens an account chooser during startup', () => {
  const restoreBlock = source.slice(
    source.indexOf('const restoreConnection = async () =>'),
    source.indexOf('void restoreConnection();'),
  );

  assert.doesNotMatch(restoreBlock, /requestGoogleAccess\s*\(/);
  assert.match(restoreBlock, /localStorage\.removeItem\(GOOGLE_SESSION_KEY\)/);
  assert.match(restoreBlock, /setGoogleCalendarStatus\('disconnected'\)/);
});
