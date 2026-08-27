PLEASE NOTE THIS IS A PERSONAL PROJECT CREATED USING CLAUDE AI. USE AT YOUR OWN RISK.
# Character Forge

A Foundry VTT (v13+) module for the dnd5e system. Opens a dialog to fill out
a player character sheet by hand, with optional auto-generation helpers
(roll ability scores, standard array, roll max HP).

## Installation

In Foundry's **Add-on Modules** tab, install via manifest URL:

```
https://github.com/evanullrich/character-forge/releases/latest/download/module.json
```

## Usage

Open the **Actors** directory and click **Open Character Forge** at the
bottom, or call the module API from a macro:

```js
game.modules.get("character-forge").api.open();
```

Pick an existing character (or leave blank to create a new one), fill in
values, and click **Apply to Actor**.

## Development

This module uses plain ES modules — no build step. Symlink or copy this
folder into your Foundry `Data/modules/character-forge` directory, enable
it in a world, and reload.

## Releasing

Tag a version to publish a GitHub Release with the packaged module:

```bash
git tag v1.0.0
git push --tags
```

The `manifest` URL in `module.json` always points at the latest release.
