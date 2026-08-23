"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getActiveProductionId } from "@/db/repositories/productions";

export function AppGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    const productionId = getActiveProductionId();
    if (!productionId) {
      router.replace("/productions");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
