import type { ReactNode } from "react";
import { AppGuard } from "@/components/AppGuard";
import { BottomNav } from "@/components/BottomNav";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <AppGuard>
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
        <div className="flex-1 pb-2">{children}</div>
        <BottomNav />
      </div>
    </AppGuard>
  );
}
