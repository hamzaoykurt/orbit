export function putPersonalItemFirst(visibleIds: string[], newId: string) {
  return [newId, ...visibleIds.filter((id) => id !== newId)];
}
