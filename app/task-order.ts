export function newestCustomFirst<T>(defaults: readonly T[], customs: readonly T[]): T[] {
  return [...customs].reverse().concat(defaults);
}

export function insertIndexedRecord<T>(record: Record<string, T>, prefix: string, count = 1): Record<string, T> {
  if (count < 1) return { ...record };
  return Object.fromEntries(Object.entries(record).map(([id, value]) => {
    if (!id.startsWith(prefix)) return [id, value];
    const index = Number(id.slice(prefix.length));
    return Number.isInteger(index) ? [`${prefix}${index + count}`, value] : [id, value];
  }));
}

export function withoutRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));
}
