"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getCurrentUser, setCurrentUser, tryRecoverCurrentUserFromDb } from "@/lib/currentUser";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // A device can land here not because it's genuinely new, but because
  // localStorage got cleared (an iOS storage-eviction quirk) while the
  // IndexedDB data — productions, scenes, photos — is still intact. Check
  // for that silently before showing "set up this device" to someone who
  // already set it up once. See tryRecoverCurrentUserFromDb for the details.
  const [checkingRecovery, setCheckingRecovery] = useState(true);

  useEffect(() => {
    if (getCurrentUser()) {
      router.replace("/productions");
      return;
    }
    tryRecoverCurrentUserFromDb().then((recovered) => {
      if (recovered) {
        router.replace("/productions");
      } else {
        setCheckingRecovery(false);
      }
    });
  }, [router]);

  const canContinue = name.trim().length > 1;

  const handleContinue = () => {
    if (!canContinue) return;
    setCurrentUser(name.trim(), email.trim() || undefined);
    router.replace("/productions");
  };

  if (checkingRecovery) {
    return (
      <div className="flex h-dvh items-center justify-center text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col justify-center gap-6 bg-[var(--bg)] px-6">
      <div className="text-center">
        <div className="mb-3 text-5xl">🎬</div>
        <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">PTRC Continuity</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Set-ready continuity photos. Works offline, syncs when you&apos;re back online.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <label className="text-sm font-semibold text-[var(--text)]">
          Your name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Adrian Diaz"
            className="tap-target mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-base text-[var(--text)] outline-none"
          />
        </label>
        <label className="text-sm font-semibold text-[var(--text)]">
          Email (optional, for future invites)
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
            className="tap-target mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-base text-[var(--text)] outline-none"
          />
        </label>
        <Button size="lg" fullWidth disabled={!canContinue} onClick={handleContinue}>
          Continue
        </Button>
        <p className="text-center text-xs text-[var(--text-muted)]">
          No cloud account is required yet — this identifies you on this device only.
        </p>
      </div>
    </div>
  );
}
