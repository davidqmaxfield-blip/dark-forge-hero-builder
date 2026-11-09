import { ATTRIBUTES, DIE_STEPS } from "./constants.mjs";
import { S } from "./settings.mjs";

const RANKS = ["Novice", "Seasoned", "Veteran", "Heroic", "Legendary"];

/** Cost to raise an attribute from d4 to `sides`: 1 point per step. */
export function attributeCost(sides) { return Math.max(0, (sides - 4) / 2); }

/**
 * Cost of a skill at `sides` with linked attribute at `attrSides`.
 * Core skills start at d4 free. Other skills pay 1 for d4. Each further step costs 1 while
 * the new die is <= the linked attribute, 2 once it exceeds it.
 */
export function skillCost(sides, attrSides, isCore) {
  if (!sides) return 0;
  let cost = isCore ? 0 : 1;              // getting to d4
  for (let d = 6; d <= sides; d += 2) cost += d <= attrSides ? 1 : 2;
  return cost;
}

export function hindrancePoints(hinds) {
  return hinds.reduce((n, h) => n + (h.severity === "major" ? 2 : 1), 0);
}

/** How the Hindrance points were spent. */
export function spendCost(spend) {
  return 2 * (spend.attribute ?? 0) + 2 * (spend.edge ?? 0) + 1 * (spend.skill ?? 0) + 1 * (spend.funds ?? 0);
}

export function budgets(state) {
  const hp = hindrancePoints(state.hindrances);
  const spent = spendCost(state.spend);
  const attrMax = S.get("attributePoints") + (state.spend.attribute ?? 0);
  const attrUsed = ATTRIBUTES.reduce((n, a) => n + attributeCost(state.attributes[a] ?? 4), 0);
  const skillMax = S.get("skillPoints") + (state.spend.skill ?? 0);
  const skillUsed = Object.values(state.skills).reduce((n, s) => n + skillCost(s.sides, state.attributes[s.attribute] ?? 4, s.core), 0);
  const edgeMax = S.get("freeEdges") + (state.spend.edge ?? 0);
  const edgeUsed = state.edges.length;
  const funds = S.get("startingFunds") * ((state.spend.funds ?? 0) ? 2 : 1);
  const cents = (n) => Math.round(n * 100) / 100;
  const gearCost = cents(state.gear.reduce((n, g) => n + (g.price ?? 0) * (g.qty ?? 1), 0));
  return {
    hindrance: { have: hp, max: S.get("hindranceMax"), spent, left: hp - spent },
    attributes: { used: attrUsed, max: attrMax, left: attrMax - attrUsed },
    skills: { used: skillUsed, max: skillMax, left: skillMax - skillUsed },
    edges: { used: edgeUsed, max: edgeMax, left: edgeMax - edgeUsed },
    funds: { total: funds, spent: gearCost, left: cents(funds - gearCost) }
  };
}

/** Derived stat preview (the system recomputes for real after creation). */
export function derived(state) {
  const fighting = Object.values(state.skills).find(s => s.swid === "fighting")?.sides ?? 0;
  const vigor = state.attributes.vigor ?? 4;
  const armor = state.gear.filter(g => g.type === "armor").reduce((n, g) => Math.max(n, g.armor ?? 0), 0);
  return { pace: 6, parry: 2 + Math.floor(fighting / 2), toughness: 2 + Math.floor(vigor / 2) + armor, armor };
}

/**
 * Evaluate an Edge's structured requirements against the wizard state.
 * SWADE stores an array of {type, selector, value, combinator, label}. Consecutive entries joined by
 * "or" form a group; groups are ANDed. (Marksman: Seasoned AND (Athletics d8 OR Shooting d8).)
 * Returns { ok, reasons: [strings for unmet] , labels: [all] }.
 */
export function checkRequirements(edge, state, { bornAHero = S.get("bornAHero") } = {}) {
  const reqs = edge.system?.requirements ?? [];
  if (!reqs.length) return { ok: true, reasons: [], labels: [] };

  const edgeSwids = new Set(state.edgeItems.map(e => e.system?.swid));
  const hasAnyAB = state.edgeItems.some(e => e.system?.isArcaneBackground);
  const skillsBySwid = Object.fromEntries(Object.values(state.skills).map(s => [s.swid, s.sides]));

  const evalOne = (r) => {
    switch (r.type) {
      case "rank": return { ok: bornAHero || (r.value ?? 0) <= 0, label: RANKS[r.value ?? 0] ?? "Rank" };
      case "attribute": {
        const have = state.attributes[r.selector] ?? 4;
        return { ok: have >= (r.value ?? 4), label: `${capital(r.selector)} d${r.value}+` };
      }
      case "skill": {
        const have = skillsBySwid[r.selector] ?? 0;
        return { ok: have >= (r.value ?? 4), label: `${r.label || capital(r.selector)} d${r.value}+` };
      }
      case "edge": {
        const sel = String(r.selector ?? "");
        if (/^arcane-background$|^any-arcane-background$|arcane-background-any/.test(sel)) return { ok: hasAnyAB, label: r.label || "Arcane Background" };
        if (sel.startsWith("arcane-background") && !edgeSwids.has(sel)) {
          // tolerate short vs long swids across content modules
          const short = sel.replace(/^arcane-background-/, "");
          const ok = [...edgeSwids].some(s => s === sel || s === short || s === `arcane-background-${short}`);
          return { ok, label: r.label || sel };
        }
        return { ok: edgeSwids.has(sel), label: r.label || sel };
      }
      case "ancestry": return { ok: true, label: r.label || "Ancestry" }; // Deadlands: human only
      case "power": return { ok: state.powers.some(p => p.swid === r.selector), label: r.label || r.selector };
      default: return { ok: true, label: r.label || r.selector || "Special" , soft: true };
    }
  };

  // Group by OR chains
  const groups = [];
  let cur = [];
  for (let i = 0; i < reqs.length; i++) {
    cur.push(reqs[i]);
    const joinsNext = (reqs[i].combinator ?? "and") === "or" && i < reqs.length - 1;
    if (!joinsNext) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);

  const reasons = [], labels = [];
  let ok = true;
  for (const g of groups) {
    const results = g.map(evalOne);
    labels.push(results.map(r => r.label).join(" or "));
    if (!results.some(r => r.ok)) { ok = false; reasons.push(results.map(r => r.label).join(" or ")); }
  }
  return { ok, reasons, labels };
}

function capital(s) { return String(s ?? "").charAt(0).toUpperCase() + String(s ?? "").slice(1); }

export function nextDie(sides) { const i = DIE_STEPS.indexOf(sides); return i >= 0 && i < DIE_STEPS.length - 1 ? DIE_STEPS[i + 1] : null; }
export function prevDie(sides) { const i = DIE_STEPS.indexOf(sides); return i > 0 ? DIE_STEPS[i - 1] : null; }
