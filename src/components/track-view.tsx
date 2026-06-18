"use client";

import { useEffect } from "react";

/**
 * Fires a single "view" beacon for a property detail page (once per browser
 * session per property, to avoid double counting reloads/prefetch).
 */
export default function TrackView({ propertyId }: { propertyId: string }) {
  useEffect(() => {
    const key = `tv_${propertyId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode — still beacon once */
    }
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        propertyId,
        type: "view",
        referrer: document.referrer,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [propertyId]);

  return null;
}
