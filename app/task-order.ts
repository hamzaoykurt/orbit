export function newestCustomFirst<T>(defaults: readonly T[], customs: readonly T[]): T[] {
  return [...customs].reverse().concat(defaults);
}
