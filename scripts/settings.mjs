import { MODULE_ID } from "./constants.mjs";

export const S = {
  get(key) { return game.settings.get(MODULE_ID, key); }
};

export function registerSettings() {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, { scope: "world", config: true, ...data });

  reg("archetypeFolder", { name: "Archetype folder", hint: "Name of the Actor folder that holds the archetype heroes.", type: String, default: "Deadlands Archetypes" });
  reg("pcFolder", { name: "Player character folder", hint: "Actor folder new heroes are filed into (created if missing).", type: String, default: "Player Characters" });
  reg("sourceFolders", { name: "Item source folders", hint: "Comma-separated top-level Item folder names to draw Edges, Hindrances, skills, powers and gear from. First listed wins when two items share an identifier.", type: String, default: "Deadlands, SWADE Core Rules" });
  reg("gearSources", { name: "Gear source folders", hint: "Comma-separated top-level Item folder names allowed for weapons, armor and equipment (keeps modern gear out).", type: String, default: "Deadlands" });
  reg("excludedEdges", { name: "Hidden Edges", hint: "Comma-separated Edge names never shown to players. Default hides the generic SWADE Arcane Backgrounds that Deadlands replaces.", type: String, default: "Arcane Background (Gifted), Arcane Background (Magic), Arcane Background (Miracles), Arcane Background (Psionics), Arcane Background (Weird Science)" });
  reg("excludedSkills", { name: "Hidden skills", hint: "Comma-separated skill names never shown to players.", type: String, default: "Electronics, Hacking, Psionics, Unskilled Attempt, Piloting, Driving" });

  reg("attributePoints", { name: "Attribute points", type: Number, default: 5 });
  reg("skillPoints", { name: "Skill points", type: Number, default: 12 });
  reg("hindranceMax", { name: "Maximum Hindrance points", type: Number, default: 4 });
  reg("freeEdges", { name: "Free Edge slots", hint: "Humans get 1 (Adaptable).", type: Number, default: 1 });
  reg("startingFunds", { name: "Starting funds ($)", type: Number, default: 250 });
  reg("bornAHero", { name: "Born a Hero", hint: "Ignore Rank requirements on Edges during creation.", type: Boolean, default: false });
  reg("allowOverBudget", { name: "Allow finishing over budget", hint: "If off, the Finish button is disabled until every budget is exactly spent and nothing is overspent.", type: Boolean, default: false });

  reg("primerUrl", { name: "Posse Primer link", hint: "Optional URL to the Posse Primer PDF; shown on the welcome screen.", type: String, default: "" });
  reg("showSidebarButton", { name: "Show 'New Hero' button in the Actors sidebar", type: Boolean, default: true, requiresReload: true });
}

export function csv(key) {
  return String(S.get(key) ?? "").split(",").map(s => s.trim()).filter(Boolean);
}
