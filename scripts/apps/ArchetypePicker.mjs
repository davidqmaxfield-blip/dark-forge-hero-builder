import { MODULE_ID, TPL, GROUP_COLORS, GROUP_ORDER } from "../constants.mjs";
import { archetypes, archetypeMeta, loadData, strip } from "../data.mjs";
import { askNameAndOwner, createFromArchetype } from "../create.mjs";
import { S } from "../settings.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ArchetypePicker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dfhb-picker",
    classes: ["dfhb", "dfhb-picker"],
    window: { title: "DFHB.Picker.Title", icon: "fa-solid fa-hat-cowboy", resizable: true },
    position: { width: 1000, height: 720 },
    actions: {
      select: ArchetypePicker.#onSelect,
      create: ArchetypePicker.#onCreate,
      scratch: ArchetypePicker.#onScratch,
      openSheet: ArchetypePicker.#onOpenSheet
    }
  };

  static PARTS = { main: { template: TPL("picker"), scrollable: [".dfhb-cards", ".dfhb-detail-body"] } };

  selected = null;

  async _prepareContext() {
    await loadData();
    const list = archetypes();
    const groups = GROUP_ORDER.map(g => ({
      name: g, color: GROUP_COLORS[g],
      cards: list.filter(a => archetypeMeta(a.name)?.group === g).map(a => this.#card(a))
    })).filter(g => g.cards.length);
    const ungrouped = list.filter(a => !archetypeMeta(a.name)).map(a => this.#card(a));
    if (ungrouped.length) groups.push({ name: "Other", color: "#555", cards: ungrouped });
    return {
      groups,
      selected: this.selected ? this.#detail(this.selected) : null,
      primerUrl: S.get("primerUrl"),
      count: list.length
    };
  }

  #card(a) {
    const m = archetypeMeta(a.name) ?? {};
    return { id: a.id, name: a.name, img: a.img, role: m.role ?? "", tag: m.tag ?? "", pick: m.pick ?? "", color: GROUP_COLORS[m.group] ?? "#555", active: this.selected?.id === a.id };
  }

  #detail(a) {
    const m = archetypeMeta(a.name) ?? {};
    const d = (x) => x ? `d${x.die.sides}${x.die.modifier ? "+" + x.die.modifier : ""}` : "";
    const sk = a.items.filter(i => i.type === "skill").sort((x, y) => y.system.die.sides - x.system.die.sides || x.name.localeCompare(y.name));
    return {
      id: a.id, name: a.name, img: a.img, role: m.role, tag: m.tag, pick: m.pick, group: m.group, color: GROUP_COLORS[m.group] ?? "#555",
      bio: (() => { const b = strip(a.system.details?.biography?.value).slice(0, 400); const t = (m.tag ?? "").replace(/[“”"]/g, "").trim(); return (t && b.replace(/[“”"]/g, "").startsWith(t)) ? b.replace(/[“”"]/g, "").slice(t.length).trim() : b; })(),
      rank: a.system.advances?.rank ?? "Novice", advances: a.system.advances?.value ?? 0,
      attrs: ["agility", "smarts", "spirit", "strength", "vigor"].map(k => ({ k: k[0].toUpperCase() + k.slice(1, 3), v: d(a.system.attributes[k]) })),
      parry: a.system.stats?.parry?.value, tough: a.system.stats?.toughness?.value, armor: a.system.stats?.toughness?.armor,
      best: sk.filter(s => s.system.die.sides >= 8).map(s => `${s.name} ${d(s.system)}`).join(", "),
      good: sk.filter(s => s.system.die.sides === 6).map(s => `${s.name} ${d(s.system)}`).join(", "),
      edges: a.items.filter(i => i.type === "edge").map(i => i.name).join(", "),
      hindrances: a.items.filter(i => i.type === "hindrance").map(i => `${i.name} (${i.system.major ? "Major" : "Minor"})`).join(", "),
      powers: a.items.filter(i => i.type === "power").map(i => i.name).join(", "),
      weapons: a.items.filter(i => i.type === "weapon").map(i => i.name).join(", "),
      gear: a.items.filter(i => ["gear", "armor", "consumable", "shield"].includes(i.type)).map(i => i.name).join(", ")
    };
  }

  static async #onSelect(event, target) {
    this.selected = game.actors.get(target.dataset.id) ?? null;
    await this.render({ parts: ["main"] });
  }

  static async #onOpenSheet(event, target) {
    const a = game.actors.get(target.dataset.id);
    a?.sheet.render(true);
  }

  static async #onCreate(event, target) {
    const src = game.actors.get(target.dataset.id);
    if (!src) return;
    const ans = await askNameAndOwner(src.name);
    if (!ans) return;
    const actor = await createFromArchetype(src, ans);
    this.close();
    actor.sheet.render(true);
  }

  static async #onScratch() {
    const { HeroWizard } = await import("./HeroWizard.mjs");
    this.close();
    new HeroWizard().render({ force: true });
  }
}
