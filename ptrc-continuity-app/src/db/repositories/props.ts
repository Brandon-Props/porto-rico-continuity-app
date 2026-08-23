"use client";

import { db } from "@/db/schema";
import type { Character, Prop } from "@/types";
import { baseFields, enqueueSync, logActivity } from "./helpers";

export async function createProp(productionId: string, name: string, category?: string): Promise<Prop> {
  const prop: Prop = { ...baseFields(), productionId, name, category };
  await db.props.add(prop);
  await enqueueSync("props", prop.id, "create", prop);
  await logActivity(productionId, `added prop "${name}"`, "props", prop.id);
  return prop;
}

export async function listProps(productionId: string): Promise<Prop[]> {
  const props = await db.props.where({ productionId }).filter((p) => !p.deletedAt).toArray();
  return props.sort((a, b) => a.name.localeCompare(b.name));
}

export async function findOrCreateProp(productionId: string, name: string): Promise<Prop> {
  const trimmed = name.trim();
  const existing = await db.props.where({ productionId }).filter((p) => !p.deletedAt && p.name.toLowerCase() === trimmed.toLowerCase()).first();
  return existing ?? createProp(productionId, trimmed);
}

export async function createCharacter(productionId: string, name: string, actorName?: string): Promise<Character> {
  const character: Character = { ...baseFields(), productionId, name, actorName };
  await db.characters.add(character);
  await enqueueSync("characters", character.id, "create", character);
  await logActivity(productionId, `added character "${name}"`, "characters", character.id);
  return character;
}

export async function listCharacters(productionId: string): Promise<Character[]> {
  const chars = await db.characters.where({ productionId }).filter((c) => !c.deletedAt).toArray();
  return chars.sort((a, b) => a.name.localeCompare(b.name));
}

export async function findOrCreateCharacter(productionId: string, name: string): Promise<Character> {
  const trimmed = name.trim();
  const existing = await db.characters.where({ productionId }).filter((c) => !c.deletedAt && c.name.toLowerCase() === trimmed.toLowerCase()).first();
  return existing ?? createCharacter(productionId, trimmed);
}

export async function photosForProp(productionId: string, propId: string) {
  const photos = await db.photos.where({ productionId }).filter((p) => !p.deletedAt && p.propIds.includes(propId)).toArray();
  return photos.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
}

export async function photosForCharacter(productionId: string, characterId: string) {
  const photos = await db.photos.where({ productionId }).filter((p) => !p.deletedAt && p.characterIds.includes(characterId)).toArray();
  return photos.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
}
