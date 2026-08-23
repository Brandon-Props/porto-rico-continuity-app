"use client";

import { db } from "@/db/schema";

export async function listActivity(productionId: string, limit = 100) {
  const entries = await db.activityLog.where({ productionId }).toArray();
  return entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}
