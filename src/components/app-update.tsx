"use client";

import { useEffect, useState } from "react";

export function AppUpdate() {
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    let edited = false;
    let checking = false;
    let lastCheck = 0;
    let reloading = false;
    const markEdited = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable=true]")) edited = true;
    };
    const ready = () => {
      if (disposed || reloading) return;
      // Never interrupt a form or an in-progress save/upload.
      if (edited || document.querySelector('[role="dialog"],form input:not([type="hidden"]),[aria-busy="true"]')) {
        setUpdateReady(true);
        return;
      }
      reloading = true;
      window.location.reload();
    };
    const controllerChanged = () => {
      // Initial installation does not require a reload.
      if (hadController) ready();
      hadController = true;
    };
    let hadController = Boolean(navigator.serviceWorker.controller);
    const message = (event: MessageEvent) => {
      if (event.data?.type === "CASEPILOT_UPDATE_READY" && hadController) ready();
    };
    const check = async () => {
      if (checking || disposed || !navigator.onLine || document.visibilityState !== "visible" || Date.now() - lastCheck < 60_000) return;
      checking = true;
      lastCheck = Date.now();
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        await registration.update();
      } catch { /* Retry on the next active/online check. */ }
      finally { checking = false; }
    };
    document.addEventListener("input", markEdited, true);
    document.addEventListener("change", markEdited, true);
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    navigator.serviceWorker.addEventListener("message", message);
    window.addEventListener("online", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 60_000);
    void check();
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("input", markEdited, true);
      document.removeEventListener("change", markEdited, true);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
      navigator.serviceWorker.removeEventListener("message", message);
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  if (!updateReady) return null;
  return <aside role="status" className="fixed inset-x-3 top-3 z-[100] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-lg border border-emerald-700 bg-zinc-950 p-3 text-sm text-white shadow-xl"><span>Versi baharu tersedia. Simpan borang dahulu.</span><button type="button" className="secondary-button shrink-0" onClick={() => window.location.reload()}>Kemas kini</button></aside>;
}
