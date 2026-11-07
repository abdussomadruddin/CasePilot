"use client";

import { motion, useReducedMotion } from "motion/react";
import { ReactNode, useLayoutEffect, useRef } from "react";
import { readUiContext, writeUiContext } from "@/lib/ui-context";

export function MotionSurface({ children, screenKey }: { children: ReactNode; screenKey: string }) {
  const reduce = useReducedMotion();
  return <motion.div key={screenKey} className="grid gap-5" initial={reduce ? false : { opacity: 0.6 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.16, ease: "easeOut" }}>
    {children}
  </motion.div>;
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
