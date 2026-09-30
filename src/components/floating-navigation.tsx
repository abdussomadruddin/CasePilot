"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type NavigationItem = { id: string; label: string; icon: LucideIcon; count: number };

export function FloatingNavigation({ items, activeId, onNavigate, disabled }: { items: NavigationItem[]; activeId: string; onNavigate: (id: string) => void; disabled: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const bar = useRef<HTMLElement>(null);
  const drag = useRef(false);
  const suppressClick = useRef(false);

  useEffect(() => {
    let previous = window.scrollY;
    let distance = 0;
    const scroll = () => {
      const current = window.scrollY;
      const delta = current - previous;
      distance = Math.sign(delta) === Math.sign(distance) ? distance + delta : delta;
      if (current < 32 || distance < -8) setHidden(false);
      else if (distance > 18 && !drag.current) setHidden(true);
      previous = current;
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => { window.removeEventListener("scroll", scroll); };
  }, []);

  const itemAt = (x: number, y: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || x < rect.left || x > rect.right || y < rect.top - 20 || y > rect.bottom + 20) return null;
    const index = Math.max(0, Math.min(items.length - 1, Math.floor((x - rect.left - 6) / ((rect.width - 12) / items.length))));
    return items[index]?.id ?? null;
  };
  const highlightIndex = items.findIndex((item) => item.id === (previewId ?? activeId));
  return <nav ref={bar} className={`floating-navigation ${drag.current ? "floating-navigation-held" : ""} ${hidden || disabled ? "floating-navigation-hidden" : ""}`} aria-label="Quick navigation" inert={hidden || disabled} style={{ left: "50%", bottom: "max(12px, env(safe-area-inset-bottom))" }}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      suppressClick.current = false;
      drag.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setPreviewId(itemAt(event.clientX, event.clientY));
    }}
    onPointerMove={(event) => {
      if (drag.current) setPreviewId(itemAt(event.clientX, event.clientY));
    }}
    onPointerUp={(event) => { if (!drag.current) return; const id = itemAt(event.clientX, event.clientY); suppressClick.current = true; drag.current = false; setPreviewId(null); if (id) onNavigate(id); }}
    onPointerCancel={() => { suppressClick.current = true; drag.current = false; setPreviewId(null); }}
    onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    {highlightIndex >= 0 ? <span aria-hidden="true" className="floating-navigation-glass" style={{ width: `calc((100% - 12px) / ${items.length})`, transform: `translateX(${highlightIndex * 100}%)` }} /> : null}
    {items.map(({ id, label, icon: Icon, count }) => <button key={id} type="button" aria-label={`${label}, ${count}`} aria-current={activeId === id ? "page" : undefined} data-preview={previewId === id} onClick={() => onNavigate(id)}>
      <span className="floating-navigation-icon"><Icon size={21} strokeWidth={activeId === id ? 2.5 : 1.8} /><span className="navigation-badge">{count > 99 ? "99+" : count}</span></span>
      <span className="floating-navigation-label">{label}</span>
    </button>)}
  </nav>;
}
