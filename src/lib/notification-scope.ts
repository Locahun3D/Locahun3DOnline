/** Existing types also classify historical rows; no storage migration is needed. */
export type NotificationScope = "user" | "admin";
const ADMIN_TYPES = new Set(["inquiry_new", "publish_request", "scan_submission", "contact_request", "production_request"]);

export function notificationScope(n: { type: string; link: string }): NotificationScope {
  // Defensive fallback for legacy/new admin-linked types: never expose admin
  // message bodies in the ordinary personal notification feed.
  return ADMIN_TYPES.has(n.type) || /^\/(?:en\/)?admin(?:[/?#]|$)/.test(n.link)
    ? "admin" : "user";
}
