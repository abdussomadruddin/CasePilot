"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type NavigationItem = { id: string; label: string; icon: LucideIcon; count: number };

export function FloatingNavigation({ items, activeId, onNavigate, disabled }: { items: NavigationItem[]; activeId: string; onNavigate: (id: string) => void; disabled: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const bar = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null);
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
    const resize = () => setPosition({ x: 0, y: 0 });
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("scroll", scroll); window.removeEventListener("resize", resize); };
  }, []);

  return <nav ref={bar} className={`floating-navigation ${hidden || disabled ? "floating-navigation-hidden" : ""}`} aria-label="Quick navigation" inert={hidden || disabled} style={{ left: `calc(50% + ${position.x}px)`, bottom: `calc(max(12px, env(safe-area-inset-bottom)) + ${position.y}px)` }}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      suppressClick.current = false;
      drag.current = { x: event.clientX, y: event.clientY, originX: position.x, originY: position.y, moved: false };
    }}
    onPointerMove={(event) => {
      const start = drag.current;
      if (!start || !bar.current) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < 10) return;
      start.moved = true;
      bar.current.setPointerCapture(event.pointerId);
      const width = bar.current.offsetWidth;
      const limit = Math.max(0, (window.innerWidth - width) / 2 - 8);
      setPosition({ x: Math.max(-limit, Math.min(limit, start.originX + dx)), y: Math.max(0, Math.min(window.innerHeight - 150, start.originY - dy)) });
    }}
    onPointerUp={() => { suppressClick.current = Boolean(drag.current?.moved); drag.current = null; }}
    onPointerCancel={() => { suppressClick.current = true; drag.current = null; }}
    onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    {items.map(({ id, label, icon: Icon, count }) => <button key={id} type="button" aria-label={`${label}, ${count}`} aria-current={activeId === id ? "page" : undefined} onClick={() => onNavigate(id)}>
      <span className="floating-navigation-icon"><Icon size={21} strokeWidth={activeId === id ? 2.5 : 1.8} /><span className="navigation-badge">{count > 99 ? "99+" : count}</span></span>
      <span className="floating-navigation-label">{label}</span>
    </button>)}
  </nav>;
}
