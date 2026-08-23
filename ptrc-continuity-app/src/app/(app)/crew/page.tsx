"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { PickerSheet } from "@/components/ui/PickerSheet";
import { getActiveProductionId } from "@/db/repositories/productions";
import { listMembers, addLocalMember, updateMemberRole } from "@/db/repositories/productions";
import type { Role } from "@/types";

const ROLES: { id: Role; label: string }[] = [
  { id: "admin", label: "Administrator" },
  { id: "prop_master", label: "Prop Master" },
  { id: "asst_prop_master", label: "Assistant Prop Master" },
  { id: "continuity", label: "Continuity" },
  { id: "crew", label: "Crew Member" },
  { id: "read_only", label: "Read Only" },
];

export default function CrewPage() {
  const productionId = getActiveProductionId() ?? "";
  const members = useLiveQuery(() => listMembers(productionId), [productionId]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("crew");
  const [rolePickerFor, setRolePickerFor] = useState<string | null>(null);

  return (
    <div className="flex flex-col">
      <TopBar title="Crew & Roles" back />
      <p className="px-4 pt-3 text-xs text-[var(--text-muted)]">
        Roles gate what a crew member can do in the app UI today; enforcement travels to the server once Supabase Auth + RLS is wired up (see ARCHITECTURE.md).
      </p>

      <div className="flex flex-col gap-2 px-4 py-4">
        {members?.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div>
              <div className="font-bold text-[var(--text)]">{m.displayName}</div>
              <div className="text-xs text-[var(--text-muted)]">{ROLES.find((r) => r.id === m.role)?.label}</div>
            </div>
            <button onClick={() => setRolePickerFor(m.id)} className="text-xs font-semibold text-[var(--accent)]">Change Role</button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 px-4 pb-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Add Crew Member</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="tap-target rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--text)] outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="tap-target rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--text)]"
        >
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        <Button
          onClick={async () => {
            if (!name.trim()) return;
            await addLocalMember(productionId, name.trim(), role);
            setName("");
          }}
          disabled={!name.trim()}
        >
          Add to Crew
        </Button>
        <p className="text-xs text-[var(--text-muted)]">
          This adds a placeholder crew record for now. Real invites (email/link) arrive once accounts are backed by Supabase Auth.
        </p>
      </div>

      <PickerSheet
        open={!!rolePickerFor}
        title="Set Role"
        items={ROLES.map((r) => ({ id: r.id, label: r.label }))}
        onSelect={(id) => rolePickerFor && updateMemberRole(rolePickerFor, id as Role)}
        onClose={() => setRolePickerFor(null)}
      />
    </div>
  );
}
