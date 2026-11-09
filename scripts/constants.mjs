export const MODULE_ID = "dark-forge-hero-builder";
export const TPL = (name) => `modules/${MODULE_ID}/templates/${name}.hbs`;

export const ATTRIBUTES = ["agility", "smarts", "spirit", "strength", "vigor"];
export const ATTRIBUTE_LABELS = { agility: "Agility", smarts: "Smarts", spirit: "Spirit", strength: "Strength", vigor: "Vigor" };
export const DIE_STEPS = [4, 6, 8, 10, 12];
export const CORE_SKILL_SWIDS = ["athletics", "common-knowledge", "notice", "persuasion", "stealth"];

export const GROUP_COLORS = {
  "Front Line": "#4b3a2a", "Gunhand": "#8b2e1f", "Arcane": "#1f5a58", "Healer": "#5a3a6a",
  "Face": "#7a5c1e", "Scout": "#3f5a2e", "Brains": "#2f4a63"
};
export const GROUP_ORDER = ["Front Line", "Gunhand", "Arcane", "Healer", "Face", "Scout", "Brains"];

export const GEAR_TYPES = ["weapon", "armor", "shield", "gear", "consumable"];

export const STEPS = [
  { id: "concept",    label: "Concept" },
  { id: "hindrances", label: "Hindrances" },
  { id: "attributes", label: "Attributes" },
  { id: "skills",     label: "Skills" },
  { id: "edges",      label: "Edges" },
  { id: "arcane",     label: "Powers", conditional: true },
  { id: "gear",       label: "Gear" },
  { id: "review",     label: "Review" }
];

export function log(...args) { console.log(`DFHB |`, ...args); }
export function warn(...args) { console.warn(`DFHB |`, ...args); }
