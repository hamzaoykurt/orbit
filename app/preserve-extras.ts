// Another client (the native app, a newer web build) may add fields this build does not know. Normalizers rebuild
// objects from the fields they know, so without this helper a web save would erase the newer client's data.
// carryExtras copies the JSON fields of `source` that the normalizer neither knows (`known`) nor produced.
// `known` lists every key the normalizer reads, so a field it dropped on purpose (invalid, over the limit) stays dropped.
const BLOCKED = new Set(['__proto__', 'constructor', 'prototype']);

export function carryExtras<T extends object>(source: unknown, normalized: T, known: readonly string[]): T {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return normalized;
  const result = { ...normalized } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const value = (source as Record<string, unknown>)[key];
    if (BLOCKED.has(key) || known.includes(key) || Object.hasOwn(result, key) || value === undefined || typeof value === 'function') continue;
    Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
  }
  return result as T;
}
