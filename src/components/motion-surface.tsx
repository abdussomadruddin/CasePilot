"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ReactNode, useLayoutEffect, useRef } from "react";
import { readUiContext, writeUiContext } from "@/lib/ui-context";

export function MotionSurface({ children, screenKey }: { children: ReactNode; screenKey: string }) {
  const reduce = useReducedMotion();
  return <div className="relative"><AnimatePresence mode="popLayout" initial={false}><motion.div key={screenKey} className="grid gap-5" initial={{ opacity: reduce ? 1 : .65, y: reduce ? 0 : 12 }}
    animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : .1 } }} transition={reduce ? { duration: 0 } : { type: "spring", visualDuration: .26, bounce: 0 }}>
    {children}
  </motion.div></AnimatePresence></div>;
}

export function useTabScroll(key: string, ready: boolean) {
  const current = useRef("");
  const position = useRef(0);
  useLayoutEffect(() => {
    if (!ready) return;
    if (current.current !== key) {
      if (current.current) writeUiContext(current.current, { top: position.current });
      current.current = key;
      const saved = readUiContext<{ top: number }>(key).top;
      position.current = typeof saved === "number" && Number.isFinite(saved) ? Math.max(0, saved) : 0;
      window.scrollTo({ top: position.current, behavior: "instant" });
    }
    const save = () => { position.current = window.scrollY; writeUiContext(key, { top: position.current }); };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => { window.removeEventListener("scroll", save); window.removeEventListener("pagehide", save); };
  }, [key, ready]);
}
