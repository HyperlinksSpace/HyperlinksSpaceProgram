/** Client-executable actions returned from `/api/ai` when intent is navigational. */
export type HspAiAction =
  | { type: "navigate"; path: string }
  | { type: "feature"; id: string };

/** Map TinyModel / rule route hints to structured actions for the app shell. */
export function actionsFromRouteHint(routeHint?: string): HspAiAction[] {
  if (!routeHint) return [];
  if (routeHint.startsWith("navigate:")) {
    const path = routeHint.slice("navigate:".length).trim();
    if (path.startsWith("/")) {
      return [{ type: "navigate", path }];
    }
  }
  if (routeHint.startsWith("feature:")) {
    const id = routeHint.slice("feature:".length).trim();
    if (id) {
      return [{ type: "feature", id }];
    }
  }
  return [];
}
