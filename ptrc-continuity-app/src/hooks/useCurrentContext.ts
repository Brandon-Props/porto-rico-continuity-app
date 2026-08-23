"use client";

import { useCallback, useEffect, useState } from "react";

// Smart defaults (spec §35): once a crew member is working Scene 36 / Shot B / Take 4,
// the next photo — and the next time they open the camera at all — should default to
// exactly that, with no re-selection required.

export interface WorkingContext {
  sceneId?: string;
  shotId?: string;
  takeId?: string;
  category?: string;
}

const KEY = "ptrc.workingContext";

function read(): WorkingContext {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function write(ctx: WorkingContext) {
  window.localStorage.setItem(KEY, JSON.stringify(ctx));
}

export function useCurrentContext() {
  const [ctx, setCtx] = useState<WorkingContext>({});

  useEffect(() => {
    setCtx(read());
  }, []);

  const update = useCallback((patch: Partial<WorkingContext>) => {
    setCtx((prev) => {
      const next = { ...prev, ...patch };
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setCtx({});
    write({});
  }, []);

  return { context: ctx, updateContext: update, clearContext: clear };
}
