export type ImportFieldKey =
  | "shootDay"
  | "shootDate"
  | "sceneNumber"
  | "scenePart"
  | "unit"
  | "scriptDay"
  | "intExt"
  | "location"
  | "setName"
  | "dayNight"
  | "description"
  | "cast"
  | "background"
  | "props"
  | "vehicles"
  | "sfx"
  | "vfx"
  | "notes";

export const IMPORT_FIELDS: { key: ImportFieldKey; label: string; required?: boolean }[] = [
  { key: "shootDay", label: "Shoot Day", required: true },
  { key: "shootDate", label: "Shooting Date", required: true },
  { key: "sceneNumber", label: "Scene Number", required: true },
  { key: "scenePart", label: "Scene Part" },
  { key: "unit", label: "Unit" },
  { key: "scriptDay", label: "Script Day" },
  { key: "intExt", label: "INT / EXT" },
  { key: "location", label: "Location" },
  { key: "setName", label: "Set" },
  { key: "dayNight", label: "Day / Night" },
  { key: "description", label: "Scene Description" },
  { key: "cast", label: "Cast" },
  { key: "background", label: "Background / Extras" },
  { key: "props", label: "Props" },
  { key: "vehicles", label: "Vehicles" },
  { key: "sfx", label: "SFX" },
  { key: "vfx", label: "VFX" },
  { key: "notes", label: "Notes" },
];

export type ColumnMapping = Partial<Record<ImportFieldKey, number>>;

/** Best-effort guess so the wizard doesn't start from a totally blank mapping. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalized = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  const guesses: Record<ImportFieldKey, string[]> = {
    shootDay: ["shootday", "day", "dayno", "daynumber"],
    shootDate: ["shootingdate", "date", "shootdate"],
    sceneNumber: ["scene", "sceneno", "scenenumber", "scn"],
    scenePart: ["scenepart", "part"],
    unit: ["unit"],
    scriptDay: ["scriptday", "storyday"],
    intExt: ["intext", "int/ext", "intorext"],
    location: ["location", "loc"],
    setName: ["set", "setname"],
    dayNight: ["daynight", "dn"],
    description: ["scenedescription", "description", "synopsis"],
    cast: ["cast", "castno", "characters"],
    background: ["background", "extras", "atmosphere", "bg"],
    props: ["props"],
    vehicles: ["vehicles"],
    sfx: ["sfx", "specialeffects"],
    vfx: ["vfx", "visualeffects"],
    notes: ["notes", "comments"],
  };

  (Object.keys(guesses) as ImportFieldKey[]).forEach((key) => {
    const idx = normalized.findIndex((h) => guesses[key].includes(h));
    if (idx >= 0) mapping[key] = idx;
  });

  return mapping;
}
