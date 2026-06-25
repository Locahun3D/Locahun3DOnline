"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Ripple {
  x: number;
  y: number;
  color: string;
  size: number;
  href: string;
  external: boolean;
}

export default function GatewayOverlay() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [ripple, setRipple] = useState<Ripple | null>(null);

  useEffect(() => {
    const section = anchorRef.current?.closest(".split-gateway");
    if (!section) return;

    const handler = (e: Event) => {
      const me = e as MouseEvent;
      const panel = (me.target as HTMLElement).closest(
        ".split-panel",
      ) as HTMLAnchorElement | null;
      if (!panel) return;

      e.preventDefault();

      const x = me.clientX;
      const y = me.clientY;

      const panels = section.querySelectorAll(".split-panel");
      const isLeft = panel === panels[0];
      const color = isLeft ? "#ffb454" : "#5ec8e8";

      const href = panel.getAttribute("href") || "/properties";
      const external = href.startsWith("http");

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxDx = Math.max(x, vw - x);
      const maxDy = Math.max(y, vh - y);
      const size = Math.hypot(maxDx, maxDy) * 2.2;

      setRipple({ x, y, color, size, href, external });

      setTimeout(() => {
        if (external) {
          window.location.href = href;
        } else {
          router.push(href);
        }
      }, 800);
    };

    section.addEventListener("click", handler);
    return () => section.removeEventListener("click", handler);
  }, [router]);

  return (
    <>
      <div ref={anchorRef} className="hidden" />
      {ripple && (
        <div className="fixed inset-0 z-[9998] pointer-events-none overflow-hidden">
          <div
            className="gateway-ripple-circle"
            style={{
              left: ripple.x,
              top: ripple.y,
              width: ripple.size,
              height: ripple.size,
              marginLeft: -ripple.size / 2,
              marginTop: -ripple.size / 2,
              backgroundColor: ripple.color,
              color: ripple.color,
            }}
          />
        </div>
      )}
    </>
  );
}
