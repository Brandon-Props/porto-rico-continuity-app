"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";

type Tool = "arrow" | "circle" | "rectangle" | "freehand" | "text";

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: "freehand", icon: "✎", label: "Draw" },
  { id: "arrow", icon: "↗", label: "Arrow" },
  { id: "circle", icon: "◯", label: "Circle" },
  { id: "rectangle", icon: "▭", label: "Box" },
  { id: "text", icon: "T", label: "Text" },
];

interface Point {
  x: number;
  y: number;
}

/**
 * A lightweight annotation layer. The base photo is drawn once, then every shape the
 * user adds is redrawn on top from a shape list (never mutating the source pixels),
 * so "preserve the original" (spec §17) is structural, not a convention to remember.
 */
export function PhotoAnnotationEditor({
  imageUrl,
  onSave,
  onClose,
}: {
  imageUrl: string;
  onSave: (blob: Blob) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("freehand");
  const [color] = useState("#f5a623");
  const shapesRef = useRef<{ tool: Tool; points: Point[]; text?: string }[]>([]);
  const drawingRef = useRef(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      redraw();
    };
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  function redraw() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.lineWidth = Math.max(4, canvas.width * 0.006);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.font = `${Math.max(24, canvas.width * 0.04)}px sans-serif`;
    for (const shape of shapesRef.current) drawShape(ctx, shape);
  }

  function drawShape(ctx: CanvasRenderingContext2D, shape: { tool: Tool; points: Point[]; text?: string }) {
    const [start, end] = shape.points;
    if (!start) return;
    switch (shape.tool) {
      case "freehand": {
        ctx.beginPath();
        shape.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        break;
      }
      case "rectangle": {
        if (!end) break;
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        break;
      }
      case "circle": {
        if (!end) break;
        const r = Math.hypot(end.x - start.x, end.y - start.y);
        ctx.beginPath();
        ctx.arc(start.x, start.y, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "arrow": {
        if (!end) break;
        drawArrow(ctx, start, end);
        break;
      }
      case "text": {
        if (shape.text) ctx.fillText(shape.text, start.x, start.y);
        break;
      }
    }
  }

  function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point) {
    const headLength = 24;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function toCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toCanvasPoint(e);
    if (tool === "text") {
      const text = window.prompt("Label text:");
      if (text?.trim()) {
        shapesRef.current.push({ tool: "text", points: [pt], text: text.trim() });
        redraw();
      }
      return;
    }
    drawingRef.current = true;
    shapesRef.current.push({ tool, points: [pt] });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const pt = toCanvasPoint(e);
    const current = shapesRef.current[shapesRef.current.length - 1];
    if (tool === "freehand") current.points.push(pt);
    else current.points[1] = pt;
    redraw();
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
  };

  const handleUndo = () => {
    shapesRef.current.pop();
    redraw();
  };

  const handleSave = () => {
    canvasRef.current?.toBlob((blob) => blob && onSave(blob), "image/jpeg", 0.9);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-3">
        <button onClick={onClose} className="tap-target text-white">Cancel</button>
        <span className="text-sm font-bold text-white">Annotate</span>
        <button onClick={handleSave} className="tap-target font-bold text-[var(--accent)]">Save</button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full touch-none rounded-lg"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
      <div className="flex items-center justify-center gap-2 p-3">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`tap-target flex flex-col items-center rounded-xl px-3 py-1.5 text-xs ${tool === t.id ? "bg-[var(--accent)] text-black" : "text-white"}`}
          >
            <span className="text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
        <Button size="md" variant="secondary" onClick={handleUndo}>
          Undo
        </Button>
      </div>
    </div>
  );
}
