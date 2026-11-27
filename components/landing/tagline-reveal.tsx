"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-driven word-by-word tagline reveal (respects prefers-reduced-motion).
 */
export function TaglineReveal({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const words = text.split(" ");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setProgress(1);
      return;
    }

    let rafId = 0;
    const update = () => {
      rafId = 0;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const start = vh * 0.88;
      const end = vh * 0.32;
      const raw = (start - rect.top) / (start - end);
      setProgress(Math.min(1, Math.max(0, raw)));
    };

    const onScroll = () => {
      if (!rafId) rafId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={containerRef} className="max-w-3xl">
      <p className="text-2xl sm:text-4xl font-medium leading-[1.28] tracking-[-0.02em]">
        {words.map((word, idx) => {
          const threshold = idx / Math.max(1, words.length);
          const lit = progress >= threshold;
          return (
            <span
              key={`${word}-${idx}`}
              className="inline-block mr-[0.28em] transition-[opacity,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                opacity: lit ? 1 : 0.26,
              }}
            >
              {word}
            </span>
          );
        })}
      </p>
    </div>
  );
}
