"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wraps getUserMedia for the live camera preview. If it's unavailable or denied
 * (common inside installed PWAs on some mobile browsers), `supported` flips to
 * false and the Camera screen falls back to a native file-picker capture input
 * (spec §58) — so the app never gets stuck with a dead camera button.
 */
export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

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
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("capture failed"))), "image/jpeg", 0.92);
    });
  }, []);

  const flip = useCallback(() => setFacingMode((m) => (m === "environment" ? "user" : "environment")), []);

  return { videoRef, supported, error, capture, flip, facingMode };
}
