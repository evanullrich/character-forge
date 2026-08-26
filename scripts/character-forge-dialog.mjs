const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

// PHB point buy: 27 points, scores 8-15. The system doesn't expose this table.
const POINT_BUY_BUDGET = 27;
const POINT_BUY_MIN = 8;
const POINT_BUY_MAX = 15;
const POINT_BUY_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

function pointBuyCost(score) {
  return POINT_BUY_COSTS[score] ?? null;
}

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
      togglePointBuy: CharacterForgeDialog.#onTogglePointBuy,
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
    this.pointBuy = false;
  }

  async _prepareContext(_options) {
    const actors = game.actors
      .filter((a) => a.type === 'character' && a.isOwner)
      .sort((a, b) => a.name.localeCompare(b.name));
    const actorChoices = Object.fromEntries(actors.map((a) => [a.id, a.name]));

    return {
      actorChoices,
      selectedActorId: this.actor?.id ?? '',
      abilities: ABILITIES,
      // dnd5e stores alignment as free text and displays it verbatim, so the
      // option value must be the label itself, not the CONFIG key ('lg').
      alignments: Object.values(CONFIG.DND5E?.alignments ?? {}).map((label) => ({ label })),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector('[name="actorId"]')?.addEventListener('change', (event) => {
      this.actor = game.actors.get(event.target.value) ?? null;
    });

    for (const key of ABILITIES) {
      this.element
        .querySelector(`[name="abilities.${key}"]`)
        ?.addEventListener('input', () => this.refreshPointBuy());
    }
    this.refreshPointBuy();
  }

  /**
   * Recalculate spent/remaining points and reflect budget state in the UI.
   * No-op when point buy mode is off.
   */
  refreshPointBuy() {
    const root = this.element;
    const status = root.querySelector('.point-buy-status');
    const abilitiesSection = root.querySelector('.abilities-grid');
    if (!status || !abilitiesSection) return;

    abilitiesSection.classList.toggle('point-buy-active', this.pointBuy);
    root.querySelector('[data-action="togglePointBuy"]')?.classList.toggle('active', this.pointBuy);

    if (!this.pointBuy) {
      status.hidden = true;
      for (const key of ABILITIES) {
        const input = root.querySelector(`[name="abilities.${key}"]`);
        if (input) {
          input.min = 1;
          input.max = 30;
          input.classList.remove('invalid');
        }
      }
      return;
    }

    status.hidden = false;
    let spent = 0;
    let illegal = false;

    for (const key of ABILITIES) {
      const input = root.querySelector(`[name="abilities.${key}"]`);
      if (!input) continue;
      input.min = POINT_BUY_MIN;
      input.max = POINT_BUY_MAX;

      const score = Number(input.value);
      const cost = pointBuyCost(score);
      if (cost === null) {
        illegal = true;
        input.classList.add('invalid');
      } else {
        input.classList.remove('invalid');
        spent += cost;
      }
    }

    const remaining = POINT_BUY_BUDGET - spent;
    const over = remaining < 0;
    status.classList.toggle('over-budget', over || illegal);
    status.textContent = illegal
      ? game.i18n.format('CHARFORGE.Dialog.pointBuyInvalid', {
          min: POINT_BUY_MIN,
          max: POINT_BUY_MAX,
        })
      : game.i18n.format('CHARFORGE.Dialog.pointBuyStatus', {
          spent,
          budget: POINT_BUY_BUDGET,
          remaining,
        });
  }

  static #onTogglePointBuy(event, _target) {
    event.preventDefault();
    this.pointBuy = !this.pointBuy;

    // Entering point buy: reset to the all-8s baseline so the budget starts clean.
    if (this.pointBuy) {
      for (const key of ABILITIES) {
        const input = this.element.querySelector(`[name="abilities.${key}"]`);
        if (input) input.value = POINT_BUY_MIN;
      }
    }
    this.refreshPointBuy();
  }

  static #onRollAbilities(event, _target) {
    event.preventDefault();
    const form = this.element;
    // Rolled scores can't be expressed in point buy, so leave that mode.
    this.pointBuy = false;
    for (const key of ABILITIES) {
      const input = form.querySelector(`[name="abilities.${key}"]`);
      if (!input) continue;
      const rolls = Array.from({ length: 4 }, () => Math.ceil(Math.random() * 6)).sort((a, b) => b - a);
      const total = rolls[0] + rolls[1] + rolls[2];
      input.value = total;
    }
    this.refreshPointBuy();
  }

  static #onStandardArray(event, _target) {
    event.preventDefault();
    const form = this.element;
    this.pointBuy = false;
    ABILITIES.forEach((key, i) => {
      const input = form.querySelector(`[name="abilities.${key}"]`);
      if (input) input.value = STANDARD_ARRAY[i];
    });
    this.refreshPointBuy();
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
    // app.element is the application root <div>; FormDataExtended needs the
    // actual <form> child, which is what carries the iterable `elements` list.
    const form = app.element.querySelector('form');
    if (!form) return;
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

    // Applying to an existing actor overwrites its current stats — confirm first.
    if (actor && !(await CharacterForgeDialog.#confirmOverwrite(actor, updateData))) return;

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

  /**
   * Confirm overwriting an existing actor, showing which values actually change.
   * Returns true if the user approved the overwrite.
   */
  static async #confirmOverwrite(actor, updateData) {
    const labels = {
      'system.attributes.hp.value': game.i18n.localize('CHARFORGE.Dialog.hpValue'),
      'system.attributes.hp.max': game.i18n.localize('CHARFORGE.Dialog.hpMax'),
      'system.details.alignment': game.i18n.localize('CHARFORGE.Dialog.alignment'),
    };
    for (const key of ABILITIES) {
      labels[`system.abilities.${key}.value`] = key.toUpperCase();
    }

    const display = (path, value) => {
      if (value === '' || value === null || value === undefined) return '—';
      return String(value);
    };

    const rows = [];
    for (const [path, next] of Object.entries(updateData)) {
      if (path === 'name') continue;
      const current = foundry.utils.getProperty(actor, path);
      if (String(current ?? '') === String(next ?? '')) continue;
      rows.push(`<tr><td>${labels[path] ?? path}</td>
        <td class="cf-old">${foundry.utils.escapeHTML(display(path, current))}</td>
        <td>→</td>
        <td class="cf-new">${foundry.utils.escapeHTML(display(path, next))}</td></tr>`);
    }

    if (!rows.length) {
      ui.notifications.info(game.i18n.localize('CHARFORGE.Dialog.noChanges'));
      return false;
    }

    return foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('CHARFORGE.Dialog.confirmTitle') },
      content: `
        <p>${game.i18n.format('CHARFORGE.Dialog.confirmPrompt', {
          name: foundry.utils.escapeHTML(actor.name),
        })}</p>
        <table class="cf-diff">${rows.join('')}</table>
      `,
      yes: { label: game.i18n.localize('CHARFORGE.Dialog.confirmYes'), default: false },
      no: { label: game.i18n.localize('CHARFORGE.Dialog.confirmNo'), default: true },
    });
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
