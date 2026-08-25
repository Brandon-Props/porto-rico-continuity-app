"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wraps getUserMedia for the live camera preview. If it's unavailable or denied
 * (common inside installed PWAs on some mobile browsers), `supported` flips to
 * false and the Camera screen falls back to a native file-picker capture input
 * (spec §58) — so the app never gets stuck with a dead camera button.
 */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  // Digital zoom via cropping, not the getUserMedia zoom capability — iOS
  // Safari doesn't expose hardware zoom control through the web camera API at
  // all, so relying on it would mean pinch-zoom simply did nothing on an
  // iPhone, which is most of this crew's devices. A plain crop-and-scale
  // works identically everywhere: the preview is CSS-scaled to visually
  // match (see the camera page), and capture() below crops the same region
  // out of the real frame so the saved photo matches what was framed.
  const [zoom, setZoomState] = useState(MIN_ZOOM);

  const setZoom = useCallback((next: number) => {
    setZoomState(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }
    try {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setSupported(true);
      setError(null);
    } catch (err) {
      setSupported(false);
      setError(err instanceof Error ? err.message : "Camera unavailable");
    }
  }, [facingMode, stop]);

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const capture = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return reject(new Error("Camera not ready"));
      const canvas = document.createElement("canvas");
      // At zoom 1 this is the whole frame, same as before. At zoom > 1, crop
      // a centered region matching the current zoom level and draw ONLY that
      // into the canvas at 1:1 native pixels (not upscaled), so the saved
      // photo matches what was actually framed on screen without a soft,
      // stretched result.
      const sourceWidth = video.videoWidth / zoom;
      const sourceHeight = video.videoHeight / zoom;
      const sourceX = (video.videoWidth - sourceWidth) / 2;
      const sourceY = (video.videoHeight - sourceHeight) / 2;
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("capture failed"))), "image/jpeg", 0.92);
    });
  }, [zoom]);

  const flip = useCallback(() => setFacingMode((m) => (m === "environment" ? "user" : "environment")), []);

  return { videoRef, supported, error, capture, flip, facingMode, zoom, setZoom };
}
