/** Resolve only among the scenes already allowed for this visitor. */
export function sceneIndexForId(visibleIds: readonly string[], requestedId?: string): number {
  return requestedId ? Math.max(0, visibleIds.indexOf(requestedId)) : 0;
}
