import { MODULE_ID, TPL, ATTRIBUTES, ATTRIBUTE_LABELS, STEPS, GEAR_TYPES } from "../constants.mjs";
import * as D from "../data.mjs";
import * as R from "../rules.mjs";
import { S } from "../settings.mjs";
import { askNameAndOwner, createFromWizard } from "../create.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const HELP = {
  concept: "Give your hero a name and a one-line idea. Who were they before the posse? Everything else can change; this is just a start.",
  hindrances: "Hindrances are flaws you choose on purpose. A Major is worth 2 points, a Minor 1, up to 4 points total. Then spend those points below: 2 points buys an attribute step or an Edge slot; 1 point buys a skill point or doubles your starting money.",
  attributes: "Every attribute starts at d4. You have 5 points; each point moves one attribute up a die. Agility for shooting and fighting, Smarts for knowing things, Spirit for nerve and most magic, Strength for melee and carrying, Vigor for surviving.",
  skills: "Core skills start at d4 for free. You have 12 skill points. Raising a skill costs 1 per step up to its linked attribute and 2 per step above it. New skills cost 1 to start at d4.",
  edges: "Edges are your hero's special talents. Humans get one free; Hindrance points can buy more. Grey requirements are ones you don't meet yet.",
  arcane: "You took an Arcane Background. Pick your starting powers. Your arcane skill must be on your sheet or you can't cast.",
  gear: "Deadlands heroes start with $250 (doubled if you bought that with a Hindrance point). Buy what you need; going over needs the Marshal's blessing.",
  review: "Check the numbers. Every budget should read 0 left. Then create your hero."
};

export class HeroWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dfhb-wizard",
    classes: ["dfhb", "dfhb-wizard"],
    window: { title: "DFHB.Wizard.Title", icon: "fa-solid fa-hammer", resizable: true },
    position: { width: 980, height: 740 },
    actions: {
      goStep: HeroWizard.#goStep, next: HeroWizard.#next, back: HeroWizard.#back,
      pickImage: HeroWizard.#pickImage,
      addHindrance: HeroWizard.#addHindrance, removeHindrance: HeroWizard.#removeHindrance,
      spendPlus: HeroWizard.#spendPlus, spendMinus: HeroWizard.#spendMinus,
      attrUp: HeroWizard.#attrUp, attrDown: HeroWizard.#attrDown,
      skillUp: HeroWizard.#skillUp, skillDown: HeroWizard.#skillDown, addSkill: HeroWizard.#addSkill, removeSkill: HeroWizard.#removeSkill,
      addEdge: HeroWizard.#addEdge, removeEdge: HeroWizard.#removeEdge, toggleQualified: HeroWizard.#toggleQualified,
      addPower: HeroWizard.#addPower, removePower: HeroWizard.#removePower, addArcaneSkill: HeroWizard.#addArcaneSkill,
      addGear: HeroWizard.#addGear, removeGear: HeroWizard.#removeGear, gearTab: HeroWizard.#gearTab, commonKit: HeroWizard.#commonKit,
      toggleDesc: HeroWizard.#toggleDesc,
      finish: HeroWizard.#finish
    }
  };

  static PARTS = { main: { template: TPL("wizard"), scrollable: [".dfhb-body", ".dfhb-list"] } };

  constructor(options = {}) {
    super(options);
    this.hero = {
      step: "concept", name: "", concept: "", img: "",
      hindrances: [], spend: { attribute: 0, edge: 0, skill: 0, funds: 0 },
      attributes: Object.fromEntries(ATTRIBUTES.map(a => [a, 4])),
      skills: {}, edges: [], edgeItems: [], arcane: null, powers: [], gear: [],
      ui: { filter: "", qualifiedOnly: true, gearTab: "weapon", open: new Set() }
    };
  }

  // ---------- helpers ----------
  get steps() {
    return STEPS.filter(s => !s.conditional || (s.id === "arcane" && this.hero.arcane));
  }
  #stepIndex() { return this.steps.findIndex(s => s.id === this.hero.step); }

  async #ensureSkills() {
    if (Object.keys(this.hero.skills).length) return;
    for (const { item } of D.skills()) {
      if (D.isCoreSkill(item)) this.hero.skills[item.uuid] = this.#skillEntry(item, 4, true);
    }
  }
  #skillEntry(item, sides, core) {
    return { uuid: item.uuid, name: item.name, swid: item.system.swid, attribute: item.system.attribute || "agility", sides, core };
  }

  #refreshArcane() {
    const abEdge = this.hero.edgeItems.find(e => e.system?.isArcaneBackground);
    if (!abEdge) { this.hero.arcane = null; this.hero.powers = []; return; }
    const table = D.arcaneTable();
    const swid = abEdge.system.swid;
    const row = table[swid] ?? Object.entries(table).find(([k]) => swid.endsWith(k.replace(/^arcane-background-/, "")))?.[1];
    const m = abEdge.name.match(/\(([^)]+)\)/);
    this.hero.arcane = {
      swid, edgeName: abEdge.name,
      arcane: row?.arcane ?? (m ? m[1] : abEdge.name),
      skill: row?.skill ?? "Spellcasting",
      powers: row?.powers ?? 3, pp: row?.pp ?? 10, verify: !!row?.verify,
      row: row ?? null, required: row?.required ?? []
    };
    // Mandatory starting powers (Blessed: holy symbol; Chi Master: deflection) are added automatically and can't be removed.
    for (const req of this.hero.arcane.required) {
      const hit = D.powers().find(({ item }) => D.powerNames(item.name).has(req));
      if (hit && !this.hero.powers.some(p => p.uuid === hit.item.uuid)) this.hero.powers.unshift({ uuid: hit.item.uuid, name: hit.item.name, swid: hit.item.system.swid, pp: hit.item.system.pp, locked: true });
    }
    // Drop powers the new background can't take.
    this.hero.powers = this.hero.powers.filter(p => p.locked || D.powerAllowed({ name: p.name }, this.hero.arcane.row));
    if (this.hero.powers.length > this.hero.arcane.powers) this.hero.powers.length = this.hero.arcane.powers;
  }

  #validate() {
    const b = R.budgets(this.hero);
    const errors = [], warnings = [];
    if (!this.hero.name.trim()) errors.push("Your hero needs a name.");
    if (b.hindrance.have > b.hindrance.max) errors.push(`Too many Hindrance points (${b.hindrance.have}/${b.hindrance.max}).`);
    if (b.hindrance.left < 0) errors.push("You've spent more Hindrance points than you have.");
    if (b.hindrance.left > 0) warnings.push(`${b.hindrance.left} Hindrance point(s) unspent.`);
    if (b.attributes.left < 0) errors.push("Too many attribute points spent.");
    if (b.attributes.left > 0) warnings.push(`${b.attributes.left} attribute point(s) unspent.`);
    if (b.skills.left < 0) errors.push("Too many skill points spent.");
    if (b.skills.left > 0) warnings.push(`${b.skills.left} skill point(s) unspent.`);
    if (b.edges.left < 0) errors.push("More Edges than slots.");
    if (b.edges.left > 0) warnings.push(`${b.edges.left} Edge slot(s) unused.`);
    for (const e of this.hero.edgeItems) {
      const r = R.checkRequirements(e, this.hero);
      if (!r.ok) errors.push(`${e.name}: needs ${r.reasons.join("; ")}.`);
    }
    if (this.hero.arcane) {
      const hasSkill = Object.values(this.hero.skills).some(s => s.name === this.hero.arcane.skill);
      if (!hasSkill) errors.push(`Your Arcane Background needs the ${this.hero.arcane.skill} skill.`);
      if (this.hero.powers.length < this.hero.arcane.powers) warnings.push(`You can take ${this.hero.arcane.powers - this.hero.powers.length} more power(s).`);
    }
    if (b.funds.left < 0) (S.get("allowOverBudget") ? warnings : errors).push(`Over budget by $${-b.funds.left}.`);
    return { errors, warnings, canFinish: errors.length === 0 && (S.get("allowOverBudget") || true) };
  }

  // ---------- context ----------
  async _prepareContext() {
    await D.loadData();
    await this.#ensureSkills();
    const st = this.hero;
    const b = R.budgets(st);
    const steps = this.steps.map((s, i) => ({ ...s, index: i + 1, active: s.id === st.step, done: i < this.#stepIndex() }));
    const ctx = { state: st, steps, step: st.step, help: HELP[st.step], budgets: b, derived: R.derived(st), isFirst: this.#stepIndex() === 0, isLast: st.step === "review", filter: st.ui.filter, source: {} };

    if (st.step === "hindrances") {
      const taken = new Set(st.hindrances.map(h => h.uuid));
      ctx.hindranceList = D.hindrances().filter(({ item }) => !taken.has(item.uuid) && this.#match(item.name))
        .map(({ item, source }) => ({ uuid: item.uuid, name: item.name, source, severity: item.system.severity ?? (item.system.major ? "major" : "minor"),
          canMajor: ["major", "either"].includes(item.system.severity ?? (item.system.major ? "major" : "minor")),
          canMinor: ["minor", "either"].includes(item.system.severity ?? (item.system.major ? "major" : "minor")),
          desc: D.strip(item.system.description).slice(0, 320), open: st.ui.open.has(item.uuid) }));
      ctx.spendRows = [
        { key: "attribute", label: "Raise an attribute one die", cost: 2, n: st.spend.attribute },
        { key: "edge", label: "Gain an Edge slot", cost: 2, n: st.spend.edge },
        { key: "skill", label: "Gain an extra skill point", cost: 1, n: st.spend.skill },
        { key: "funds", label: "Double starting funds", cost: 1, n: st.spend.funds, max: 1 }
      ];
    }
    if (st.step === "attributes") {
      ctx.attrRows = ATTRIBUTES.map(a => ({ key: a, label: ATTRIBUTE_LABELS[a], sides: st.attributes[a], canUp: st.attributes[a] < 12 && b.attributes.left > 0, canDown: st.attributes[a] > 4,
        linked: Object.values(st.skills).filter(s => s.attribute === a).map(s => s.name).join(", ") }));
    }
    if (st.step === "skills") {
      const have = new Set(Object.keys(st.skills));
      ctx.skillRows = Object.values(st.skills).sort((x, y) => (y.core - x.core) || x.name.localeCompare(y.name)).map(s => {
        const attr = st.attributes[s.attribute] ?? 4;
        const nextCost = s.sides < 12 ? (R.nextDie(s.sides) <= attr ? 1 : 2) : null;
        return { ...s, attrLabel: ATTRIBUTE_LABELS[s.attribute], attrSides: attr, cost: R.skillCost(s.sides, attr, s.core), nextCost, canUp: s.sides < 12 && b.skills.left >= nextCost, canDown: s.core ? s.sides > 4 : true, above: s.sides > attr };
      });
      ctx.skillList = D.skills().filter(({ item }) => !have.has(item.uuid) && this.#match(item.name))
        .map(({ item, source }) => ({ uuid: item.uuid, name: item.name, source, attrLabel: ATTRIBUTE_LABELS[item.system.attribute] ?? "", desc: D.strip(item.system.description).slice(0, 200), open: st.ui.open.has(item.uuid) }));
    }
    if (st.step === "edges") {
      const taken = new Set(st.edges.map(e => e.uuid));
      ctx.edgeRows = st.edgeItems.map(e => ({ uuid: e.uuid, name: e.name, isAB: e.system.isArcaneBackground, req: R.checkRequirements(e, st) }));
      ctx.edgeList = D.edges().filter(({ item }) => !taken.has(item.uuid) && this.#match(item.name)).map(({ item, source }) => {
        const req = R.checkRequirements(item, st);
        return { uuid: item.uuid, name: item.name, source, isAB: item.system.isArcaneBackground, req, labels: req.labels.join(", ") || "None", desc: D.strip(item.system.description).slice(0, 320), open: st.ui.open.has(item.uuid), category: item.system.category ?? "" };
      }).filter(r => !st.ui.qualifiedOnly || r.req.ok || r.isAB)
        .sort((a, b) => (b.req.ok - a.req.ok) || (b.isAB - a.isAB) || a.name.localeCompare(b.name));
      ctx.qualifiedOnly = st.ui.qualifiedOnly;
    }
    if (st.step === "arcane" && st.arcane) {
      const taken = new Set(st.powers.map(p => p.uuid));
      const hasSkill = Object.values(st.skills).some(s => s.name === st.arcane.skill);
      ctx.arcane = { ...st.arcane, hasSkill, left: st.arcane.powers - st.powers.length };
      ctx.powerRows = st.powers;
      ctx.powerList = D.powers().filter(({ item }) => !taken.has(item.uuid) && this.#match(item.name) && (item.system.rank ?? "Novice") === "Novice" && D.powerAllowed(item, st.arcane.row))
        .map(({ item, source }) => ({ uuid: item.uuid, name: item.name, source, pp: item.system.pp, range: item.system.range, duration: item.system.duration, desc: D.strip(item.system.description).slice(0, 320), open: st.ui.open.has(item.uuid) }));
    }
    if (st.step === "gear") {
      const tab = st.ui.gearTab;
      ctx.gearTabs = [["all", "All"], ["weapon", "Weapons"], ["armor", "Armor"], ["shield", "Shields"], ["gear", "Gear"], ["consumable", "Ammo & Consumables"]].map(([k, l]) => ({ key: k, label: l, active: k === tab }));
      ctx.gearRows = st.gear.map(g => ({ ...g, total: (g.price ?? 0) * (g.qty ?? 1) }));
      const isAmmo = (i) => /ammunition|shells|cartridge|ammo/i.test(i.name);
      ctx.gearList = D.gear().filter(({ item }) => this.#match(item.name) && (tab === "all" || (tab === "consumable" ? (item.type === "consumable" || isAmmo(item)) : (item.type === tab && !isAmmo(item))))).map(({ item, source }) => ({
        uuid: item.uuid, name: item.name, source, type: item.type, price: item.system.price ?? 0, weight: item.system.weight ?? 0,
        damage: item.system.damage ?? "", range: item.system.range ?? "", armor: item.system.armor ?? "", notes: D.strip(item.system.notes ?? "").slice(0, 80),
        desc: D.strip(item.system.description).slice(0, 240), open: st.ui.open.has(item.uuid)
      }));
    }
    if (st.step === "review") {
      ctx.validation = this.#validate();
      ctx.summary = {
        attrs: ATTRIBUTES.map(a => `${ATTRIBUTE_LABELS[a]} d${st.attributes[a]}`).join(", "),
        skills: Object.values(st.skills).sort((x, y) => x.name.localeCompare(y.name)).map(s => `${s.name} d${s.sides}`).join(", "),
        hindrances: st.hindrances.map(h => `${h.name} (${h.severity === "major" ? "Major" : "Minor"})`).join(", ") || "None",
        edges: st.edges.map(e => e.name).join(", ") || "None",
        powers: st.powers.map(p => p.name).join(", "),
        gear: st.gear.map(g => `${g.name}${g.qty > 1 ? " x" + g.qty : ""}`).join(", ") || "Nothing but the clothes on your back"
      };
    }
    return ctx;
  }

  #match(name) { const f = this.hero.ui.filter.trim().toLowerCase(); return !f || name.toLowerCase().includes(f); }

  _onRender(context, options) {
    const el = this.element;
    el.querySelector('[data-field="name"]')?.addEventListener("change", e => { this.hero.name = e.target.value; });
    el.querySelector('[data-field="concept"]')?.addEventListener("change", e => { this.hero.concept = e.target.value; });
    const filter = el.querySelector('[data-field="filter"]');
    if (filter) {
      filter.addEventListener("input", foundry.utils.debounce(e => { this.hero.ui.filter = e.target.value; this.render({ parts: ["main"] }); }, 250));
      if (this.hero.ui.filter) { filter.focus(); filter.setSelectionRange(filter.value.length, filter.value.length); }
    }
    el.querySelectorAll('[data-field="qty"]').forEach(inp => inp.addEventListener("change", e => {
      const g = this.hero.gear.find(x => x.uuid === e.target.dataset.uuid); if (g) { g.qty = Math.max(1, parseInt(e.target.value) || 1); this.render({ parts: ["main"] }); }
    }));
  }

  // ---------- navigation ----------
  async #setStep(id) { this.hero.step = id; this.hero.ui.filter = ""; await this.render({ parts: ["main"] }); }
  static async #goStep(e, t) { await this.#setStep(t.dataset.step); }
  static async #next() { const i = this.#stepIndex(); if (i < this.steps.length - 1) await this.#setStep(this.steps[i + 1].id); }
  static async #back() { const i = this.#stepIndex(); if (i > 0) await this.#setStep(this.steps[i - 1].id); }

  static async #toggleDesc(e, t) { const u = t.dataset.uuid; const o = this.hero.ui.open; o.has(u) ? o.delete(u) : o.add(u); await this.render({ parts: ["main"] }); }

  static async #pickImage() {
    const fp = new foundry.applications.apps.FilePicker.implementation({ type: "image", current: this.hero.img || "", callback: (path) => { this.hero.img = path; this.render({ parts: ["main"] }); } });
    fp.render(true);
  }

  // ---------- hindrances ----------
  static async #addHindrance(e, t) {
    const item = await fromUuid(t.dataset.uuid); if (!item) return;
    const severity = t.dataset.severity;
    const b = R.budgets(this.hero);
    const cost = severity === "major" ? 2 : 1;
    if (b.hindrance.have + cost > b.hindrance.max) return ui.notifications.warn(`That would put you over ${b.hindrance.max} Hindrance points.`);
    this.hero.hindrances.push({ uuid: item.uuid, name: item.name, severity });
    await this.render({ parts: ["main"] });
  }
  static async #removeHindrance(e, t) {
    this.hero.hindrances = this.hero.hindrances.filter(h => h.uuid !== t.dataset.uuid);
    // Clamp spending to what's still available
    let b = R.budgets(this.hero);
    const order = ["funds", "skill", "edge", "attribute"];
    while (b.hindrance.left < 0) { const k = order.find(k => this.hero.spend[k] > 0); if (!k) break; this.hero.spend[k]--; b = R.budgets(this.hero); }
    await this.render({ parts: ["main"] });
  }
  static async #spendPlus(e, t) {
    const k = t.dataset.key; const cost = (k === "attribute" || k === "edge") ? 2 : 1;
    const b = R.budgets(this.hero);
    if (k === "funds" && this.hero.spend.funds >= 1) return;
    if (b.hindrance.left < cost) return ui.notifications.warn("Not enough Hindrance points for that.");
    this.hero.spend[k]++;
    await this.render({ parts: ["main"] });
  }
  static async #spendMinus(e, t) {
    const k = t.dataset.key; if (this.hero.spend[k] <= 0) return;
    this.hero.spend[k]--;
    await this.render({ parts: ["main"] });
  }

  // ---------- attributes ----------
  static async #attrUp(e, t) {
    const a = t.dataset.key; const b = R.budgets(this.hero);
    if (this.hero.attributes[a] >= 12 || b.attributes.left <= 0) return;
    this.hero.attributes[a] = R.nextDie(this.hero.attributes[a]);
    await this.render({ parts: ["main"] });
  }
  static async #attrDown(e, t) {
    const a = t.dataset.key; if (this.hero.attributes[a] <= 4) return;
    this.hero.attributes[a] = R.prevDie(this.hero.attributes[a]);
    await this.render({ parts: ["main"] });
  }

  // ---------- skills ----------
  static async #skillUp(e, t) {
    const s = this.hero.skills[t.dataset.uuid]; if (!s || s.sides >= 12) return;
    const attr = this.hero.attributes[s.attribute] ?? 4; const cost = R.nextDie(s.sides) <= attr ? 1 : 2;
    if (R.budgets(this.hero).skills.left < cost) return ui.notifications.warn(`That step costs ${cost} skill point(s); you don't have enough.`);
    s.sides = R.nextDie(s.sides);
    await this.render({ parts: ["main"] });
  }
  static async #skillDown(e, t) {
    const s = this.hero.skills[t.dataset.uuid]; if (!s) return;
    if (s.sides <= 4) { if (!s.core) delete this.hero.skills[t.dataset.uuid]; }
    else s.sides = R.prevDie(s.sides);
    await this.render({ parts: ["main"] });
  }
  static async #addSkill(e, t) {
    const item = await fromUuid(t.dataset.uuid); if (!item) return;
    if (R.budgets(this.hero).skills.left < 1) return ui.notifications.warn("No skill points left.");
    this.hero.skills[item.uuid] = this.#skillEntry(item, 4, false);
    await this.render({ parts: ["main"] });
  }
  static async #removeSkill(e, t) { const s = this.hero.skills[t.dataset.uuid]; if (s && !s.core) delete this.hero.skills[t.dataset.uuid]; await this.render({ parts: ["main"] }); }

  // ---------- edges ----------
  static async #toggleQualified() { this.hero.ui.qualifiedOnly = !this.hero.ui.qualifiedOnly; await this.render({ parts: ["main"] }); }
  static async #addEdge(e, t) {
    const item = await fromUuid(t.dataset.uuid); if (!item) return;
    const b = R.budgets(this.hero);
    if (b.edges.left <= 0) return ui.notifications.warn("No Edge slots left. Spend Hindrance points on another slot, or remove an Edge.");
    const req = R.checkRequirements(item, this.hero);
    if (!req.ok) return ui.notifications.warn(`${item.name} needs: ${req.reasons.join("; ")}.`);
    if (item.system.isArcaneBackground && this.hero.edgeItems.some(x => x.system.isArcaneBackground)) return ui.notifications.warn("One Arcane Background at creation. Remove the other first.");
    this.hero.edges.push({ uuid: item.uuid, name: item.name });
    this.hero.edgeItems.push(item);
    this.#refreshArcane();
    await this.render({ parts: ["main"] });
  }
  static async #removeEdge(e, t) {
    this.hero.edges = this.hero.edges.filter(x => x.uuid !== t.dataset.uuid);
    this.hero.edgeItems = this.hero.edgeItems.filter(x => x.uuid !== t.dataset.uuid);
    this.#refreshArcane();
    if (this.hero.step === "arcane" && !this.hero.arcane) this.hero.step = "edges";
    await this.render({ parts: ["main"] });
  }

  // ---------- arcane ----------
  static async #addArcaneSkill() {
    const ab = this.hero.arcane; if (!ab) return;
    const entry = D.skills().find(({ item }) => item.name === ab.skill); if (!entry) return ui.notifications.error(`Skill ${ab.skill} not found in your sources.`);
    if (R.budgets(this.hero).skills.left < 1) return ui.notifications.warn("No skill points left for the arcane skill. Lower something else first.");
    this.hero.skills[entry.item.uuid] = this.#skillEntry(entry.item, 4, false);
    await this.render({ parts: ["main"] });
  }
  static async #addPower(e, t) {
    const item = await fromUuid(t.dataset.uuid); if (!item || !this.hero.arcane) return;
    if (this.hero.powers.length >= this.hero.arcane.powers) return ui.notifications.warn(`You can only take ${this.hero.arcane.powers} starting powers.`);
    this.hero.powers.push({ uuid: item.uuid, name: item.name, swid: item.system.swid, pp: item.system.pp });
    await this.render({ parts: ["main"] });
  }
  static async #removePower(e, t) {
    const p = this.hero.powers.find(x => x.uuid === t.dataset.uuid);
    if (p?.locked) return ui.notifications.info(`${p.name} comes with ${this.hero.arcane.edgeName}; it can't be removed.`);
    this.hero.powers = this.hero.powers.filter(x => x.uuid !== t.dataset.uuid); await this.render({ parts: ["main"] });
  }

  // ---------- gear ----------
  static async #gearTab(e, t) { this.hero.ui.gearTab = t.dataset.tab; this.hero.ui.filter = ""; await this.render({ parts: ["main"] }); }
  static async #addGear(e, t) {
    const item = await fromUuid(t.dataset.uuid); if (!item) return;
    const ex = this.hero.gear.find(g => g.uuid === item.uuid);
    if (ex) ex.qty = (ex.qty ?? 1) + 1;
    else this.hero.gear.push({ uuid: item.uuid, name: item.name, type: item.type, price: item.system.price ?? 0, armor: item.system.armor ?? 0, qty: 1 });
    await this.render({ parts: ["main"] });
  }
  static async #removeGear(e, t) {
    const g = this.hero.gear.find(x => x.uuid === t.dataset.uuid); if (!g) return;
    if ((g.qty ?? 1) > 1) g.qty--; else this.hero.gear = this.hero.gear.filter(x => x.uuid !== t.dataset.uuid);
    await this.render({ parts: ["main"] });
  }
  static async #commonKit() {
    const wanted = ["Bedroll", "Canteen", "Rope (20 yards)", "Mess kit", "Backpack"];
    const all = D.gear();
    for (const w of wanted) {
      const hit = all.find(({ item }) => item.name.toLowerCase() === w.toLowerCase());
      if (hit && !this.hero.gear.some(g => g.uuid === hit.item.uuid)) this.hero.gear.push({ uuid: hit.item.uuid, name: hit.item.name, type: hit.item.type, price: hit.item.system.price ?? 0, armor: 0, qty: 1 });
    }
    await this.render({ parts: ["main"] });
  }

  // ---------- finish ----------
  static async #finish() {
    const v = this.#validate();
    if (v.errors.length) return ui.notifications.error(v.errors[0]);
    const ans = await askNameAndOwner(this.hero.name || "New Hero");
    if (!ans) return;
    this.hero.name = ans.name;
    const actor = await createFromWizard(this.hero, { user: ans.user });
    this.close();
    actor.sheet.render(true);
  }
}
