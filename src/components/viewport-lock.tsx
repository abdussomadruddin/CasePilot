"use client";

import { useEffect } from "react";

export function ViewportLock() {
  useEffect(() => {
    const preventDefault = (event: Event) => event.preventDefault();
    const preventPinchTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    const preventTrackpadZoom = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };

    let lastTouchEnd = 0;
    const preventDoubleTapZoom = (event: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) event.preventDefault();
      lastTouchEnd = now;
    };

    const options: AddEventListenerOptions = { passive: false };

    document.addEventListener("touchmove", preventPinchTouch, options);
    document.addEventListener("touchend", preventDoubleTapZoom, options);
    document.addEventListener("wheel", preventTrackpadZoom, options);
    document.addEventListener("gesturestart", preventDefault, options);
    document.addEventListener("gesturechange", preventDefault, options);
    document.addEventListener("gestureend", preventDefault, options);

    return () => {
      document.removeEventListener("touchmove", preventPinchTouch);
      document.removeEventListener("touchend", preventDoubleTapZoom);
      document.removeEventListener("wheel", preventTrackpadZoom);
      document.removeEventListener("gesturestart", preventDefault);
      document.removeEventListener("gesturechange", preventDefault);
      document.removeEventListener("gestureend", preventDefault);
    };
  }, []);

  return null;
}
