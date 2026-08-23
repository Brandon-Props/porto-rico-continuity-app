"use client";

import { db } from "@/db/schema";
import type { ContinuityNote, NoteScope } from "@/types";
import { baseFields, enqueueSync, logActivity } from "./helpers";
import { getCurrentUser } from "@/lib/currentUser";

export async function addNote(
  productionId: string,
  scopeType: NoteScope,
  scopeId: string,
  body: string
): Promise<ContinuityNote> {
  const user = getCurrentUser();
  const note: ContinuityNote = {
    ...baseFields(),
    productionId,
    scopeType,
    scopeId,
    body,
    authorId: user?.id ?? "unknown",
    authorName: user?.displayName ?? "Unknown",
  };
  await db.continuityNotes.add(note);
  await enqueueSync("continuity_notes", note.id, "create", note);
  await logActivity(productionId, `added a ${scopeType} note`, "continuity_notes", note.id, body.slice(0, 80));
  return note;
}

export async function listNotes(scopeType: NoteScope, scopeId: string): Promise<ContinuityNote[]> {
  const notes = await db.continuityNotes
    .where({ scopeType, scopeId })
    .filter((n) => !n.deletedAt)
    .toArray();
  return notes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
