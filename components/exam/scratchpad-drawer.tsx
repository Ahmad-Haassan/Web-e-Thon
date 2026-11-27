"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenTool, Trash2, Undo2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import {
  loadLocalScratchpad,
  saveLocalScratchpad,
  type DrawingStroke,
} from "@/lib/offline/scratchpad-store";
import { Button, Textarea } from "@/components/ui/primitives";

export function ScratchpadDrawer({
  attemptId,
  open,
  onClose,
  isOnline,
}: {
  attemptId: string;
  open: boolean;
  onClose: () => void;
  isOnline: boolean;
}) {
  const [tab, setTab] = useState<"notes" | "draw">("notes");
  const [textContent, setTextContent] = useState("");
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [penColor, setPenColor] = useState("#1d4ed8");
  const [penWidth, setPenWidth] = useState(2);
  const [savingLabel, setSavingLabel] = useState("Saved locally");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<DrawingStroke | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from local IndexedDB first, then server if available
  useEffect(() => {
    let active = true;
    (async () => {
      const local = await loadLocalScratchpad(attemptId);
      if (active && local) {
        setTextContent(local.textContent ?? "");
        setStrokes(Array.isArray(local.drawingJson) ? local.drawingJson : []);
      }
      if (isOnline) {
        try {
          const res = await api.attempts.getScratchpad(attemptId);
          const sp = res.scratchpad;
          if (active && sp && !local) {
            setTextContent(sp.textContent ?? sp.text_content ?? "");
            const d = (sp.drawingJson ?? sp.drawing_json ?? []) as DrawingStroke[];
            if (Array.isArray(d)) setStrokes(d);
          }
        } catch {
          // ignore if endpoint unavailable or offline
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [attemptId, isOnline]);

  // Persist to IndexedDB + debounced server PUT
  const schedulePersist = (nextText: string, nextStrokes: DrawingStroke[]) => {
    setSavingLabel("Saving…");
    saveLocalScratchpad(attemptId, { textContent: nextText, drawingJson: nextStrokes });

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!isOnline) {
        setSavingLabel("Saved locally (offline)");
        return;
      }
      try {
        await api.attempts.saveScratchpad(attemptId, {
          textContent: nextText,
          drawingJson: nextStrokes,
        });
        setSavingLabel("Synced");
      } catch {
        setSavingLabel("Saved locally");
      }
    }, 900);
  };

  // Redraw strokes on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tab !== "draw") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of strokes) {
      if (stroke.points.length === 0) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, [strokes, tab, open]);

  if (!open) return null;

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  }

  return (
    <aside
      aria-label="Exam scratchpad"
      className="fixed right-0 top-14 bottom-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Scratchpad (Rough Work)</h2>
          <p className="text-[11px] text-ink-subtle">
            Not graded · {savingLabel}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close scratchpad">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex border-b border-border px-4 py-2 gap-1.5">
        <button
          type="button"
          onClick={() => setTab("notes")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            tab === "notes"
              ? "bg-accent-soft text-accent"
              : "text-ink-muted hover:bg-surface-muted"
          }`}
        >
          Text Notes
        </button>
        <button
          type="button"
          onClick={() => setTab("draw")}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
            tab === "draw"
              ? "bg-accent-soft text-accent"
              : "text-ink-muted hover:bg-surface-muted"
          }`}
        >
          <PenTool className="h-3.5 w-3.5" /> Sketch Canvas
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "notes" ? (
          <Textarea
            rows={18}
            placeholder="Use this space for calculations, outlines, or pseudo-code…"
            value={textContent}
            onChange={(e) => {
              const v = e.target.value;
              setTextContent(v);
              schedulePersist(v, strokes);
            }}
            className="h-full min-h-[340px] font-mono text-xs"
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {["#1d4ed8", "#0f172a", "#047857", "#be123c"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Pen color ${c}`}
                    onClick={() => setPenColor(c)}
                    className={`h-6 w-6 rounded-full border-2 ${
                      penColor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setPenWidth((w) => (w === 2 ? 5 : 2))}
                  className="ml-1 rounded border border-border px-2 py-0.5 text-xs text-ink-muted"
                >
                  {penWidth === 2 ? "Fine" : "Bold"}
                </button>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const next = strokes.slice(0, -1);
                    setStrokes(next);
                    schedulePersist(textContent, next);
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setStrokes([]);
                    schedulePersist(textContent, []);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </Button>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              width={400}
              height={420}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const pt = getPoint(e);
                drawingRef.current = { color: penColor, width: penWidth, points: [pt] };
              }}
              onPointerMove={(e) => {
                if (!drawingRef.current) return;
                const pt = getPoint(e);
                drawingRef.current.points.push(pt);
                const canvas = canvasRef.current;
                const ctx = canvas?.getContext("2d");
                if (ctx) {
                  const pts = drawingRef.current.points;
                  const prev = pts[pts.length - 2];
                  if (prev) {
                    ctx.strokeStyle = drawingRef.current.color;
                    ctx.lineWidth = drawingRef.current.width;
                    ctx.lineCap = "round";
                    ctx.beginPath();
                    ctx.moveTo(prev.x, prev.y);
                    ctx.lineTo(pt.x, pt.y);
                    ctx.stroke();
                  }
                }
              }}
              onPointerUp={() => {
                if (!drawingRef.current) return;
                const next = [...strokes, drawingRef.current];
                drawingRef.current = null;
                setStrokes(next);
                schedulePersist(textContent, next);
              }}
              className="w-full touch-none rounded-lg border border-border bg-white cursor-crosshair"
            />
            <p className="flex items-center gap-1 text-[11px] text-ink-subtle">
              <Eraser className="h-3 w-3" /> Sketch diagrams or equations; automatically saved locally.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
