const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// dnd5e 5.x still uses the internal item type "race" even though the UI calls
// it Species. Assuming "species" here silently matches nothing.
const SPECIES_TYPE = 'race';
const CLASS_TYPE = 'class';

/**
 * Index every Item of `type` across all Item compendia the user can see.
 *
 * Names collide heavily in practice (2014 SRD vs 2024 packs vs third-party
 * content all ship a "Fighter"), so each option is labelled with its source
 * pack and keyed by UUID rather than by name. Some packs also ship the same
 * name twice in different folders (a 2014 and a 2024 cut of one species), so
 * when the pack label alone is still ambiguous the folder name is appended.
 */
function compendiumChoices(type) {
  const entries = [];
  for (const pack of game.packs) {
    if (pack.documentName !== 'Item') continue;
    for (const entry of pack.index) {
      if (entry.type !== type) continue;
      entries.push({
        uuid: entry.uuid,
        name: entry.name,
        pack: pack.metadata.label,
        folder: pack.folders.get(entry.folder)?.name ?? '',
      });
    }
  }

  // Only reach for the folder name where "name (pack)" would be a duplicate;
  // adding it everywhere makes the common case noisier for no benefit.
  const counts = {};
  for (const e of entries) {
    const key = `${e.name}\u0000${e.pack}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  entries.sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      a.pack.localeCompare(b.pack) ||
      a.folder.localeCompare(b.folder)
  );

  return Object.fromEntries(
    entries.map((e) => {
      const ambiguous = counts[`${e.name}\u0000${e.pack}`] > 1 && e.folder;
      const source = ambiguous ? `${e.pack} \u2013 ${e.folder}` : e.pack;
      return [e.uuid, `${e.name} (${source})`];
    })
  );
}

/**
 * Apply a class Item's level-1 Hit Points advancement.
 *
 * dnd5e derives max HP from the HitPoints advancement's stored `value`, which
 * is normally filled in by the system's own advancement flow when a class is
 * dropped on a sheet. `createEmbeddedDocuments` bypasses that flow entirely, so
 * the advancement lands unapplied and the character sits at 0 HP. Asking the
 * advancement for its own automatic level-1 value keeps the "max hit die at
 * level 1" rule in the system's hands rather than reimplementing it here.
 */
async function applyLevelOneHitPoints(item) {
  const advancement = item.advancement?.byType?.HitPoints?.[0];
  if (!advancement) return;

  const value = await advancement.automaticApplicationValue(1);
  if (!value || !Object.keys(value).length) return;

  await item.update({ [`system.advancement.${advancement.id}.value`]: value });
}

/**
 * Step two of character creation: attach a species and a class to an actor that
 * has already been saved. Both are optional so the dialog can be skipped.
 */
export class OriginDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'character-forge-origin',
    classes: ['character-forge'],
    tag: 'div',
    window: {
      title: 'CHARFORGE.Origin.title',
      icon: 'fa-solid fa-dna',
      resizable: true,
    },
    position: { width: 520, height: 'auto' },
    actions: {
      applyOrigin: OriginDialog.#onApplyOrigin,
      skipOrigin: OriginDialog.#onSkip,
    },
  };

  static PARTS = {
    form: { template: 'modules/character-forge/templates/origin.hbs' },
  };

  constructor({ actor, ...options } = {}) {
    super(options);
    this.actor = actor;
  }

  async _prepareContext(_options) {
    const existingSpecies = this.actor.items.find((i) => i.type === SPECIES_TYPE);
    const existingClass = this.actor.items.find((i) => i.type === CLASS_TYPE);

    return {
      actorName: this.actor.name,
      speciesChoices: compendiumChoices(SPECIES_TYPE),
      classChoices: compendiumChoices(CLASS_TYPE),
      existingSpecies: existingSpecies?.name ?? null,
      existingClass: existingClass?.name ?? null,
    };
  }

  static #onSkip(event, _target) {
    event.preventDefault();
    this.close();
  }

  static async #onApplyOrigin(event, _target) {
    event.preventDefault();
    const app = this;
    const form = app.element.querySelector('form');
    if (!form) return;
    const formData = new foundry.applications.ux.FormDataExtended(form).object;

    const actor = app.actor;
    if (!actor?.isOwner) {
      ui.notifications.error(game.i18n.localize('CHARFORGE.Dialog.noUpdatePermission'));
      return;
    }

    const wanted = [
      { uuid: formData['species'], type: SPECIES_TYPE },
      { uuid: formData['class'], type: CLASS_TYPE },
    ].filter((w) => w.uuid);

    if (!wanted.length) {
      ui.notifications.warn(game.i18n.localize('CHARFORGE.Origin.nothingSelected'));
      return;
    }

    try {
      const toCreate = [];
      const toDelete = [];

      for (const { uuid, type } of wanted) {
        const source = await fromUuid(uuid);
        if (!source) continue;

        // dnd5e allows only one species, and adding a class the actor already
        // has stacks levels rather than replacing it, so drop the old one.
        const existing = actor.items.find((i) => i.type === type);
        if (existing) toDelete.push(existing.id);
        toCreate.push(source.toObject());
      }

      if (toDelete.length) await actor.deleteEmbeddedDocuments('Item', toDelete);
      const created = toCreate.length
        ? await actor.createEmbeddedDocuments('Item', toCreate)
        : [];

      const characterClass = created.find((i) => i.type === CLASS_TYPE);
      if (characterClass) {
        // The level-1 "max hit die" rule only applies to the original class, so
        // record it before asking the advancement for its automatic value.
        if (actor.system.details.originalClass !== characterClass.id) {
          await actor.update({ 'system.details.originalClass': characterClass.id });
        }
        await applyLevelOneHitPoints(characterClass);
        // Advancement only moves max HP; start the character at full health.
        const max = actor.system.attributes.hp.max;
        if (max) await actor.update({ 'system.attributes.hp.value': max });
      }

      ui.notifications.info(game.i18n.format('CHARFORGE.Origin.applied', { name: actor.name }));
      app.close();
    } catch (err) {
      console.error('character-forge | Failed to apply origin', err);
      ui.notifications.error(game.i18n.localize('CHARFORGE.Origin.applyFailed'));
    }
  }
}
