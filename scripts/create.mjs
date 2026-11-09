import { MODULE_ID, ATTRIBUTES } from "./constants.mjs";
import { pcFolder, humansAncestry, arcaneTable } from "./data.mjs";
import { budgets } from "./rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Ask for a name and (for GMs) which player gets the hero. Returns {name, user} or null. */
export async function askNameAndOwner(defaultName) {
  const me = game.user;
  const players = game.users.filter(u => u.role < CONST.USER_ROLES.GAMEMASTER);
  const userOpts = players.map(u => `<option value="${u.id}" ${u.id === me.id ? "selected" : ""}>${esc(u.name)}</option>`).join("");
  const ownerRow = me.isGM && players.length ? `<div class="form-group"><label>Player</label><select name="user">${userOpts}</select></div>` : "";
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("DFHB.NameYourHero") },
    content: `<form><div class="form-group"><label>Character name</label><input type="text" name="name" value="${esc(defaultName)}" autofocus/></div>${ownerRow}</form>`,
    ok: { label: "Create", callback: (ev, btn) => new FormDataExtended(btn.form).object },
    rejectClose: false
  });
  if (!res) return null;
  const user = (me.isGM && res.user) ? game.users.get(res.user) : me;
  return { name: (res.name || defaultName).trim() || defaultName, user: user ?? me };
}

export function ownershipFor(user) {
  return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
}

async function afterCreate(actor, user, note) {
  if (!user.isGM || user.id === game.user.id) await user.update({ character: actor.id }).catch(() => {});
  const gms = game.users.filter(u => u.isGM).map(u => u.id);
  await ChatMessage.create({
    whisper: [...new Set([user.id, ...gms])],
    content: `<p><b>${esc(actor.name)}</b> created for ${esc(user.name)}. ${note}</p>`
  });
}

/** Clone an archetype actor into a player's hero. */
export async function createFromArchetype(src, { name, user }) {
  const data = src.toObject();
  delete data._id;
  data.name = name;
  data.folder = (await pcFolder()).id;
  data.ownership = ownershipFor(user);
  data.prototypeToken = foundry.utils.mergeObject(data.prototypeToken ?? {}, { name, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY });
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.source`, { kind: "archetype", archetype: src.name, created: Date.now() });
  const actor = await Actor.create(data);
  await afterCreate(actor, user, `Built from the <b>${esc(src.name)}</b> archetype. Set a portrait and write two lines about who they were before the posse.`);
  return actor;
}

/**
 * Build a hero from wizard state. Creates the actor first (the system adds core skills and default
 * actions), then layers items on in the same order a player would by hand.
 */
export async function createFromWizard(state, { user }) {
  const b = budgets(state);
  const folder = await pcFolder();
  const actor = await Actor.create({
    name: state.name, type: "character", img: state.img || undefined, folder: folder.id,
    ownership: ownershipFor(user),
    prototypeToken: { name: state.name, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY, texture: state.img ? { src: state.img } : undefined },
    system: { details: { currency: b.funds.left, archetype: state.concept || "", biography: { value: state.concept ? `<p>${esc(state.concept)}</p>` : "" } } },
    flags: { [MODULE_ID]: { source: { kind: "wizard", created: Date.now() }, build: summarize(state) } }
  });

  // 1. Ancestry (system grants Adaptable)
  const humans = humansAncestry();
  if (humans) await actor.createEmbeddedDocuments("Item", [humans.toObject()]);

  // 2. Attributes
  const attrUpdate = {};
  for (const a of ATTRIBUTES) attrUpdate[`system.attributes.${a}.die.sides`] = state.attributes[a] ?? 4;
  await actor.update(attrUpdate);

  // 3. Skills — update existing (core) skills, create the rest
  const updates = [], creates = [];
  for (const s of Object.values(state.skills)) {
    const existing = actor.items.find(i => i.type === "skill" && (i.system.swid === s.swid || i.name === s.name));
    if (existing) { if (existing.system.die.sides !== s.sides) updates.push({ _id: existing.id, "system.die.sides": s.sides }); }
    else {
      const src = await fromUuid(s.uuid);
      if (src) { const o = src.toObject(); o.system.die.sides = s.sides; creates.push(o); }
    }
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  if (creates.length) await actor.createEmbeddedDocuments("Item", creates);

  // 4. Hindrances
  const hinds = [];
  for (const h of state.hindrances) {
    const src = await fromUuid(h.uuid); if (!src) continue;
    const o = src.toObject(); o.system.major = h.severity === "major"; hinds.push(o);
  }
  if (hinds.length) await actor.createEmbeddedDocuments("Item", hinds);

  // 5. Edges
  const edges = [];
  for (const e of state.edges) { const src = await fromUuid(e.uuid); if (src) edges.push(src.toObject()); }
  if (edges.length) await actor.createEmbeddedDocuments("Item", edges);

  // 6. Powers + power points
  const ab = state.arcane; // {swid, arcane, skill, powers, pp}
  if (ab && state.powers.length) {
    const pws = [];
    for (const p of state.powers) {
      const src = await fromUuid(p.uuid); if (!src) continue;
      const o = src.toObject();
      o.system.arcane = ab.arcane;
      foundry.utils.setProperty(o, "system.actions.trait", ab.skill);
      pws.push(o);
    }
    if (pws.length) await actor.createEmbeddedDocuments("Item", pws);
  }
  if (ab) await actor.update({ [`system.powerPoints.${ab.arcane}`]: { value: ab.pp, max: ab.pp } });

  // 7. Gear
  const gearDocs = [];
  for (const g of state.gear) {
    const src = await fromUuid(g.uuid); if (!src) continue;
    const o = src.toObject();
    if (o.system?.quantity !== undefined) o.system.quantity = g.qty ?? 1;
    gearDocs.push(o);
  }
  if (gearDocs.length) await actor.createEmbeddedDocuments("Item", gearDocs);

  // The system resets currency during creation; set what's left after shopping now that everything else is in place.
  await actor.update({ "system.details.currency": b.funds.left });

  await afterCreate(actor, user, `Built with the Hero Builder. $${b.funds.left} left in the poke.`);
  return actor;
}

function summarize(state) {
  return {
    attributes: state.attributes,
    skills: Object.values(state.skills).map(s => `${s.name} d${s.sides}`),
    hindrances: state.hindrances.map(h => `${h.name} (${h.severity})`),
    edges: state.edges.map(e => e.name),
    powers: state.powers.map(p => p.name),
    gear: state.gear.map(g => `${g.name} x${g.qty ?? 1}`),
    spend: state.spend
  };
}

export { arcaneTable };
