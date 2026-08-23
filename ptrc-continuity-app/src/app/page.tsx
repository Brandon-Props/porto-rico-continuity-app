"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getActiveProductionId } from "@/db/repositories/productions";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    const productionId = getActiveProductionId();
    router.replace(productionId ? "/today" : "/productions");
  }, [router]);

  return (
    <div className="flex h-dvh items-center justify-center bg-[var(--bg)] text-[var(--text-muted)]">
      Loading…
    </div>
  );
}
