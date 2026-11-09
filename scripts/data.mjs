import { MODULE_ID, GEAR_TYPES, CORE_SKILL_SWIDS, warn } from "./constants.mjs";
import { S, csv } from "./settings.mjs";

let _meta = null;
let _ab = null;

export async function loadData() {
  if (!_meta) {
    try { _meta = await foundry.utils.fetchJsonWithTimeout(`modules/${MODULE_ID}/data/archetypes.json`); }
    catch (e) { warn("archetypes.json failed to load", e); _meta = {}; }
  }
  if (!_ab) {
    try { _ab = await foundry.utils.fetchJsonWithTimeout(`modules/${MODULE_ID}/data/arcane-backgrounds.json`); }
    catch (e) { warn("arcane-backgrounds.json failed to load", e); _ab = {}; }
  }
  return { meta: _meta, ab: _ab };
}

export function archetypeMeta(name) { return _meta?.[name] ?? null; }
export function arcaneTable() { return _ab ?? {}; }

/** Top-level folder name for an item (null for loose items). */
function topFolderName(item) {
  let f = item.folder;
  while (f?.folder) f = f.folder;
  return f?.name ?? null;
}

/** All world items of a type, tagged with their source (top folder), filtered to the configured source folders. */
export function sourceItems(type, { gear = false } = {}) {
  const sources = gear ? csv("gearSources") : csv("sourceFolders");
  const order = new Map(sources.map((s, i) => [s, i]));
  const items = game.items.filter(i => i.type === type && order.has(topFolderName(i)));
  // Dedupe by SWID, keeping the earliest-listed source.
  const seen = new Map();
  for (const it of items) {
    const key = it.system?.swid || it.name.slugify();
    const src = topFolderName(it);
    const prev = seen.get(key);
    if (!prev || order.get(src) < order.get(topFolderName(prev))) seen.set(key, it);
  }
  return [...seen.values()]
    .map(i => ({ item: i, source: topFolderName(i) }))
    .sort((a, b) => (order.get(a.source) - order.get(b.source)) || a.item.name.localeCompare(b.item.name));
}

export function hindrances() { return sourceItems("hindrance"); }
export function edges() {
  const hidden = new Set(csv("excludedEdges").map(s => s.toLowerCase()));
  return sourceItems("edge").filter(e => !hidden.has(e.item.name.toLowerCase()));
}
export function powers() { return sourceItems("power"); }

/** Normalised name variants for a power: "Light/Darkness" -> light/darkness, light, darkness; "Detect/Conceal Arcana" -> ..., detect arcana, conceal arcana. */
export function powerNames(name) {
  const n = name.toLowerCase().replace(/\u2019/g, "'").replace(/\s*\/\s*/g, "/").trim();
  const out = new Set([n]);
  const m = n.match(/^([^/]+)\/([^ ]+)(.*)$/);
  if (m) { out.add((m[1] + m[3]).trim()); out.add((m[2] + m[3]).trim()); }
  return out;
}
/** Is this power on the arcane background's list? No list means everything is allowed. */
export function powerAllowed(item, abRow) {
  if (!abRow?.powerList) return true;
  const allowed = new Set(abRow.powerList.map(x => x.toLowerCase().replace(/\u2019/g, "'")));
  for (const v of powerNames(item.name)) if (allowed.has(v)) return true;
  return false;
}
export function skills() {
  const hidden = new Set(csv("excludedSkills").map(s => s.toLowerCase()));
  return sourceItems("skill").filter(s => !hidden.has(s.item.name.toLowerCase()));
}
/** Purchasable gear: anything with a price. Relics and natural weapons (price 0) stay out of the shop. */
export function gear() {
  return GEAR_TYPES.flatMap(t => sourceItems(t, { gear: true })).filter(({ item }) => Number(item.system?.price) > 0);
}

export function humansAncestry() {
  return game.items.find(i => i.type === "ancestry" && /^humans?$/i.test(i.name)) ?? null;
}

export function archetypeFolder() {
  return game.folders.find(f => f.type === "Actor" && f.name === S.get("archetypeFolder")) ?? null;
}
export function archetypes() {
  const f = archetypeFolder();
  return f ? f.contents.slice().sort((a, b) => a.name.localeCompare(b.name)) : [];
}

export async function pcFolder() {
  const name = S.get("pcFolder");
  return game.folders.find(f => f.type === "Actor" && f.name === name && !f.folder)
    ?? await Folder.create({ name, type: "Actor" });
}

export function isCoreSkill(item) {
  if (item.system?.isCoreSkill) return true;
  return CORE_SKILL_SWIDS.includes(item.system?.swid);
}

export function strip(html) {
  return (html ?? "").replace(/@UUID\[[^\]]+\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
