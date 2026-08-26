const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export class CharacterForgeDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'character-forge-dialog',
    classes: ['character-forge'],
    tag: 'div',
    window: {
      title: 'CHARFORGE.Dialog.title',
      icon: 'fa-solid fa-hammer',
      resizable: true,
    },
    position: { width: 520, height: 'auto' },
    actions: {
      rollAbilities: CharacterForgeDialog.#onRollAbilities,
      standardArray: CharacterForgeDialog.#onStandardArray,
      rollHp: CharacterForgeDialog.#onRollHp,
      apply: CharacterForgeDialog.#onApply,
    },
  };

  static PARTS = {
    form: { template: 'modules/character-forge/templates/character-forge.hbs' },
  };

  constructor({ actor = null, ...options } = {}) {
    super(options);
    this.actor = actor;
  }

  async _prepareContext(_options) {
    const actors = game.actors
      .filter((a) => a.type === 'character' && a.isOwner)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      actors,
      selectedActorId: this.actor?.id ?? '',
      abilities: ABILITIES,
      alignments: CONFIG.DND5E?.alignments ?? {},
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector('[name="actorId"]')?.addEventListener('change', (event) => {
      this.actor = game.actors.get(event.target.value) ?? null;
    });
  }

  static #onRollAbilities(event, _target) {
    event.preventDefault();
    const form = this.element;
    for (const key of ABILITIES) {
      const input = form.querySelector(`[name="abilities.${key}"]`);
      if (!input) continue;
      const rolls = Array.from({ length: 4 }, () => Math.ceil(Math.random() * 6)).sort((a, b) => b - a);
      const total = rolls[0] + rolls[1] + rolls[2];
      input.value = total;
    }
  }

  static #onStandardArray(event, _target) {
    event.preventDefault();
    const form = this.element;
    ABILITIES.forEach((key, i) => {
      const input = form.querySelector(`[name="abilities.${key}"]`);
      if (input) input.value = STANDARD_ARRAY[i];
    });
  }

  static async #onRollHp(event, _target) {
    event.preventDefault();
    const form = this.element;
    const die = game.settings.get('character-forge', 'defaultHitDie');
    const conInput = form.querySelector('[name="abilities.con"]');
    const conScore = Number(conInput?.value) || 10;
    const conMod = Math.floor((conScore - 10) / 2);

    const roll = new foundry.dice.Roll(`1${die} + ${conMod}`);
    await roll.evaluate();
    const hpMaxInput = form.querySelector('[name="hp.max"]');
    const hpValueInput = form.querySelector('[name="hp.value"]');
    const total = Math.max(1, roll.total);
    if (hpMaxInput) hpMaxInput.value = total;
    if (hpValueInput) hpValueInput.value = total;

    await roll.toMessage({ flavor: game.i18n.localize('CHARFORGE.Dialog.rollHp') });
  }

  static async #onApply(event, target) {
    event.preventDefault();
    const app = this;
    const form = app.element;
    const formData = new foundry.applications.ux.FormDataExtended(form).object;

    let actor = app.actor;
    const name = formData['name']?.trim();

    const updateData = {
      'system.attributes.hp.value': Number(formData['hp.value']) || 0,
      'system.details.alignment': formData['alignment'] || '',
    };
    // HP max is auto-derived from class Hit Dice + CON unless explicitly overridden here.
    const hpMax = formData['hp.max'];
    if (hpMax !== '' && hpMax != null) {
      updateData['system.attributes.hp.max'] = Number(hpMax);
    }
    for (const key of ABILITIES) {
      updateData[`system.abilities.${key}.value`] = Number(formData[`abilities.${key}`]) || 10;
    }

    if (!actor) {
      if (!name) {
        ui.notifications.warn(game.i18n.localize('CHARFORGE.Dialog.noActor'));
        return;
      }
      actor = await Actor.create({ name, type: 'character' });
    } else if (name && name !== actor.name) {
      updateData.name = name;
    }

    await actor.update(updateData);
    await app.#applyBackground(actor, formData['background']?.trim());

    ui.notifications.info(game.i18n.format('CHARFORGE.Dialog.applied', { name: actor.name }));
    app.actor = actor;
    app.render();
  }

  // Background is a linked Item (system.details.background), not free text.
  async #applyBackground(actor, backgroundName) {
    if (!backgroundName) return;

    const existingId = actor.system.details?.background;
    const existing = existingId ? actor.items.get(existingId) : null;
    if (existing) {
      if (existing.name !== backgroundName) await existing.update({ name: backgroundName });
      return;
    }

    const [created] = await actor.createEmbeddedDocuments('Item', [
      { name: backgroundName, type: 'background' },
    ]);
    await actor.update({ 'system.details.background': created.id });
  }
}
