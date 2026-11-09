# Dark Forge Hero Builder

A guided, plain-language character creator for **Deadlands: The Weird West** on Foundry VTT (SWADE system). Built for the Dark Forge campaign; usable by any Deadlands table.

Two paths:

- **Pick an archetype** — all 24 Deadlands archetypes as clickable cards, grouped by the job they do in a posse, with a detail pane (attributes, best skills, Edges, Hindrances, powers, gear) and a one-click *Create this hero*.
- **Build your own** — a step-by-step wizard: Concept → Hindrances → Attributes → Skills → Edges → (Powers) → Gear → Review. Live budgets in the sidebar, Edge requirements enforced using the system's structured data, gear tracked against starting funds, and a Finish button that only creates the actor when the build is legal.

The wizard never writes to an actor until you press **Create my hero**, so there is nothing to get out of sync.

**Rank note.** Pinnacle publishes the 24 Deadlands archetypes at **Seasoned rank with 4 advances already spent**; *Create this hero* copies them as-is. *Build your own* produces a **Novice**. If you want both paths to land at the same level, either hand wizard-built heroes 4 advances at the table or play the archetypes as-is and start the campaign at Seasoned.

**Powers.** Each Arcane Background only offers the powers on its list from the Deadlands rules (Blessed, Chi Master, Huckster, Mad Scientist, Shaman). Blessed always start with *holy symbol* and Chi Masters with *deflection*; those are added automatically. Voodooist and Witch (Companion) have no list in the core data, so they see every power until you add one to `data/arcane-backgrounds.json`.

## Requirements

- Foundry VTT **v14**
- SWADE system **6.x**
- Content: it reads Edges, Hindrances, skills, powers and gear from **world Item folders** (default `Deadlands` and `SWADE Core Rules`) and archetypes from an **Actor folder** (default `Deadlands Archetypes`). Unpack the Deadlands core module and SWADE Core Rules compendia into those folders first, or change the folder names in settings. No content is bundled.

## Install

Foundry → Add-on Modules → Install Module → paste the manifest URL:

```
https://github.com/davidqmaxfield-blip/dark-forge-hero-builder/releases/latest/download/module.json
```

On The Forge: Bazaar → Install Module → "Install via manifest URL" with the same link.

## Use

- Actors sidebar → **New Hero** button, or type `/hero` in chat, or a macro:
  ```js
  game.modules.get("dark-forge-hero-builder").api.openPicker();
  ```
- Players need permission to create Actors (Trusted Player or higher), or a GM runs it and picks the player in the name prompt.

## Settings

Budgets (attribute points, skill points, max Hindrance points, free Edge slots, starting funds), Born a Hero, which item folders feed the lists, which folders are allowed for gear (keeps modern weapons out), hidden Edges (defaults to the generic SWADE Arcane Backgrounds that Deadlands replaces), hidden skills, and an optional link to the Posse Primer PDF. Gear with no price (relics, natural weapons) never shows in the shop.

## Data files

- `data/archetypes.json` — role group, one-line pitch and "pick this if" text per archetype name. Edit freely.
- `data/arcane-backgrounds.json` — arcane name, skill, starting powers, Power Points, the allowed `powerList` and any `required` starting powers per Arcane Background SWID. The Companion entries (Voodooist, Witch) are marked `verify`; check them against your book.

## Releasing

Bump `"version"` in `module.json` and push to `main`. The GitHub Action sees there is no release for that version yet, tags `vX.Y.Z`, stamps the manifest, zips the module, and attaches `module.json` + `module.zip` to the release. Forge/Foundry pick up the new version from the `releases/latest` manifest. (Pushing a `v*` tag by hand also works.)
