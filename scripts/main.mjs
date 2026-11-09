import { MODULE_ID, TPL, log } from "./constants.mjs";
import { registerSettings, S } from "./settings.mjs";
import { loadData } from "./data.mjs";
import { ArchetypePicker } from "./apps/ArchetypePicker.mjs";
import { HeroWizard } from "./apps/HeroWizard.mjs";

let picker = null;

function openPicker() {
  if (!picker) picker = new ArchetypePicker();
  picker.render({ force: true });
  return picker;
}
function openWizard() {
  const w = new HeroWizard();
  w.render({ force: true });
  return w;
}

Hooks.once("init", async () => {
  registerSettings();
  await foundry.applications.handlebars.loadTemplates([TPL("picker"), TPL("wizard")]);
  const mod = game.modules.get(MODULE_ID);
  mod.api = { openPicker, openWizard, ArchetypePicker, HeroWizard };
  log("initialised");
});

Hooks.once("ready", async () => {
  await loadData();
  if (game.system.id !== "swade") ui.notifications.warn("Dark Forge Hero Builder only works with the SWADE system.");
});

/** "New Hero" button in the Actors sidebar. */
Hooks.on("renderActorDirectory", (app, html) => {
  if (!S.get("showSidebarButton")) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".dfhb-new-hero")) return;
  const header = root.querySelector(".header-actions, .directory-header .action-buttons, .directory-header");
  if (!header) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dfhb-new-hero";
  btn.innerHTML = `<i class="fa-solid fa-hat-cowboy"></i> New Hero`;
  btn.addEventListener("click", () => openPicker());
  header.appendChild(btn);
});

/** Chat command: /hero */
Hooks.on("chatMessage", (log_, message) => {
  if (message.trim().toLowerCase() === "/hero") { openPicker(); return false; }
});
