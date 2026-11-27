"use client";

import { useEffect, useRef } from "react";

/**
 * Green "wet ink" cursor trail.
 *
 * A lightweight canvas overlay that leaves a fading, bleeding ink stroke
 * wherever the pointer travels. Only runs for fine pointers (mouse / trackpad)
 * and is fully disabled for `prefers-reduced-motion`.
 */

const TRAIL_LIFE = 820;
const MAX_TRAIL = 220;
const MAX_DROPS = 110;

type TrailPoint = { x: number; y: number; born: number; size: number };

type InkDrop = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  radius: number;
  sprite: HTMLCanvasElement;
};

function makeBlotSprite(rgb: string): HTMLCanvasElement {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, `rgba(${rgb},0.55)`);
  gradient.addColorStop(0.55, `rgba(${rgb},0.16)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function InkCursor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    if (reducedMotion.matches || !finePointer.matches) return;

    const sprites = [
      makeBlotSprite("11, 74, 48"),
      makeBlotSprite("22, 138, 87"),
      makeBlotSprite("58, 167, 117"),
    ];

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const trail: TrailPoint[] = [];
    const drops: InkDrop[] = [];

    let pointerX = -200;
    let pointerY = -200;
    let lastX = -200;
    let lastY = -200;
    let lastMoveAt = 0;
    let active = false;
    let rafId = 0;

    const spawnDrops = (x: number, y: number, intensity: number) => {
      const count = Math.random() < 0.45 ? 1 : 0;
      for (let i = 0; i < count; i += 1) {
        if (drops.length >= MAX_DROPS) drops.shift();
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.55 * intensity;
        drops.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.008 + Math.random() * 0.014,
          radius: 0.9 + Math.random() * 2.6,
          sprite: sprites[Math.floor(Math.random() * sprites.length)],
        });
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      active = true;
      lastMoveAt = performance.now();

      if (lastX < -100) {
        lastX = pointerX;
        lastY = pointerY;
        return;
      }

      const dx = pointerX - lastX;
      const dy = pointerY - lastY;
      const distance = Math.hypot(dx, dy);
      if (distance < 1.4) return;

      const now = performance.now();
      const steps = Math.min(6, Math.max(1, Math.floor(distance / 6)));
      const intensity = Math.min(1, distance / 26);

      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        const x = lastX + dx * t + (Math.random() - 0.5) * 1.1;
        const y = lastY + dy * t + (Math.random() - 0.5) * 1.1;
        trail.push({
          x,
          y,
          born: now,
          size: 8 + Math.random() * 5,
        });
        if (Math.random() < 0.4) spawnDrops(x, y, intensity);
      }

      if (trail.length > MAX_TRAIL) {
        trail.splice(0, trail.length - MAX_TRAIL);
      }

      lastX = pointerX;
      lastY = pointerY;
    };

    const onPointerLeave = () => {
      active = false;
      lastX = -200;
      lastY = -200;
    };

    const onPointerDown = (event: PointerEvent) => {
      for (let i = 0; i < 5; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.4 + Math.random() * 1.1;
        if (drops.length >= MAX_DROPS) drops.shift();
        drops.push({
          x: event.clientX,
          y: event.clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.01 + Math.random() * 0.01,
          radius: 1.2 + Math.random() * 2.4,
          sprite: sprites[Math.floor(Math.random() * sprites.length)],
        });
      }
    };

    const render = (now: number) => {
      rafId = window.requestAnimationFrame(render);
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Wide, soft bleed under the stroke.
      for (let i = 1; i < trail.length; i += 1) {
        const prev = trail[i - 1];
        const point = trail[i];
        const age = (now - point.born) / TRAIL_LIFE;
        if (age >= 1) continue;
        const fade = 1 - age;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(point.x, point.y);
        ctx.lineWidth = Math.max(1, point.size * fade * 2.2);
        ctx.strokeStyle = `rgba(22, 138, 87, ${0.06 * fade})`;
        ctx.stroke();
      }

      // Crisp ink core.
      for (let i = 1; i < trail.length; i += 1) {
        const prev = trail[i - 1];
        const point = trail[i];
        const age = (now - point.born) / TRAIL_LIFE;
        if (age >= 1) continue;
        const fade = 1 - age;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(point.x, point.y);
        ctx.lineWidth = Math.max(0.5, point.size * 0.52 * fade);
        ctx.strokeStyle = `rgba(11, 74, 48, ${0.2 * fade})`;
        ctx.stroke();
      }

      // Bleeding droplets that slowly spread and dry.
      for (let i = drops.length - 1; i >= 0; i -= 1) {
        const drop = drops[i];
        drop.x += drop.vx;
        drop.y += drop.vy;
        drop.vx *= 0.985;
        drop.vy *= 0.985;
        drop.radius += 0.2;
        drop.life -= drop.decay;
        if (drop.life <= 0) {
          drops.splice(i, 1);
          continue;
        }
        const radius = drop.radius * 2.1;
        ctx.globalAlpha = drop.life * 0.55;
        ctx.drawImage(drop.sprite, drop.x - radius, drop.y - radius, radius * 2, radius * 2);
      }
      ctx.globalAlpha = 1;

      // Live nib glow at the pointer.
      if (active && now - lastMoveAt < 140) {
        const nib = sprites[1];
        ctx.globalAlpha = 0.5;
        ctx.drawImage(nib, pointerX - 16, pointerY - 16, 32, 32);
        ctx.globalAlpha = 1;
      }

      // Retire expired trail points.
      while (trail.length && now - trail[0].born > TRAIL_LIFE) {
        trail.shift();
      }
    };

    rafId = window.requestAnimationFrame(render);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", onPointerLeave);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", onPointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="ink-cursor pointer-events-none fixed inset-0 z-40 hidden h-full w-full md:block"
    />
  );
}
