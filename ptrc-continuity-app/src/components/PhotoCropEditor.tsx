"use client";

// A drag-to-crop overlay in the same full-screen editor style as
// PhotoAnnotationEditor.tsx. The crop rectangle is tracked in FRACTIONS of the
// image (0..1 on each axis) rather than pixels, so it's independent of
// whatever resolution the preview image happens to be displayed at — the
// caller re-applies those same fractions to the full-resolution original when
// actually cropping (see cropPhoto in db/repositories/photos.ts).

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_SIZE = 0.08;
const DEFAULT_RECT: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };

type DragMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function PhotoCropEditor({
  imageUrl,
  onSave,
  onClose,
}: {
  imageUrl: string;
  onSave: (rect: CropRect) => void;
  onClose: () => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<CropRect>(DEFAULT_RECT);
  const dragRef = useRef<{ mode: DragMode; startClientX: number; startClientY: number; startRect: CropRect } | null>(null);

  const measure = () => {
    if (imgRef.current) setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
  };

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const beginDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { mode, startClientX: e.clientX, startClientY: e.clientY, startRect: rect };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !imgSize) return;
    const dx = (e.clientX - drag.startClientX) / imgSize.w;
    const dy = (e.clientY - drag.startClientY) / imgSize.h;
    const start = drag.startRect;
    let { x, y, w, h } = start;

    if (drag.mode === "move") {
      x = clamp01(start.x + dx);
      y = clamp01(start.y + dy);
      x = Math.min(x, 1 - w);
      y = Math.min(y, 1 - h);
    } else {
      if (drag.mode.includes("n")) {
        const newY = clamp01(start.y + dy);
        const newH = start.y + start.h - newY;
        if (newH >= MIN_SIZE) {
          y = newY;
          h = newH;
        }
      }
      if (drag.mode.includes("s")) {
        const newH = clamp01(start.y + start.h + dy) - start.y;
        if (newH >= MIN_SIZE) h = newH;
      }
      if (drag.mode.includes("w")) {
        const newX = clamp01(start.x + dx);
        const newW = start.x + start.w - newX;
        if (newW >= MIN_SIZE) {
          x = newX;
          w = newW;
        }
      }
      if (drag.mode.includes("e")) {
        const newW = clamp01(start.x + start.w + dx) - start.x;
        if (newW >= MIN_SIZE) w = newW;
      }
    }
    setRect({ x, y, w, h });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleReset = () => setRect(DEFAULT_RECT);
  const handleSave = () => onSave(rect);

  const handleStyle: React.CSSProperties = {
    position: "absolute",
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    touchAction: "none",
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-3">
        <button onClick={onClose} className="tap-target text-white">Cancel</button>
        <span className="text-sm font-bold text-white">Crop</span>
        <button onClick={handleSave} className="tap-target font-bold text-[var(--accent)]">Save</button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            className="block max-h-[70vh] max-w-full select-none"
            draggable={false}
            onLoad={measure}
          />

          {imgSize && (
            <div
              className="absolute left-0 top-0 touch-none"
              style={{ width: imgSize.w, height: imgSize.h }}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {/* Darken everything outside the crop rect using a giant box-shadow — a
                  standard trick that avoids needing four separate mask rectangles. */}
              <div
                onPointerDown={beginDrag("move")}
                className="absolute cursor-move border-2 border-white"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
                }}
              />
              {(
                [
                  ["nw", rect.x, rect.y],
                  ["ne", rect.x + rect.w, rect.y],
                  ["sw", rect.x, rect.y + rect.h],
                  ["se", rect.x + rect.w, rect.y + rect.h],
                ] as const
              ).map(([mode, fx, fy]) => (
                <div
                  key={mode}
                  onPointerDown={beginDrag(mode)}
                  style={{ ...handleStyle, left: `${fx * 100}%`, top: `${fy * 100}%` }}
                  className="flex cursor-grab items-center justify-center rounded-full border-2 border-black bg-white"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 p-3">
        <Button size="md" variant="secondary" onClick={handleReset}>
          Reset
        </Button>
        <p className="text-xs text-white/60">Drag the corners to resize, drag inside to move</p>
      </div>
    </div>
  );
}
