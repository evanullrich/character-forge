import { CharacterForgeDialog } from './character-forge-dialog.mjs';

export const MODULE_ID = 'character-forge';

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing`);

  game.settings.register(MODULE_ID, 'defaultHitDie', {
    name: 'CHARFORGE.Settings.defaultHitDie.name',
    hint: 'CHARFORGE.Settings.defaultHitDie.hint',
    scope: 'world',
    config: true,
    type: String,
    choices: { d6: 'd6', d8: 'd8', d10: 'd10', d12: 'd12' },
    default: 'd8',
  });

  game.settings.register(MODULE_ID, 'playersCanCreate', {
    name: 'CHARFORGE.Settings.playersCanCreate.name',
    hint: 'CHARFORGE.Settings.playersCanCreate.hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => syncActorCreatePermission(value),
  });
});

/**
 * Mirror the module's toggle onto Foundry's own ACTOR_CREATE permission.
 *
 * Foundry enforces document creation server-side, so the module setting alone
 * cannot grant it -- without this a GM would have to flip the same decision in
 * two places. Only the player-facing roles are touched: Assistants and
 * Gamemasters keep whatever they already had, and every other permission in
 * the object is left exactly as it was.
 */
async function syncActorCreatePermission(enabled) {
  if (!game.user?.isGM) return;

  const { PLAYER, TRUSTED } = CONST.USER_ROLES;
  const permissions = foundry.utils.deepClone(game.settings.get('core', 'permissions'));
  const current = permissions.ACTOR_CREATE ?? [];

  const without = current.filter((role) => role !== PLAYER && role !== TRUSTED);
  const next = enabled ? [...without, PLAYER, TRUSTED].sort((a, b) => a - b) : without;

  // Foundry rejects no-op writes to this setting, and skipping them also keeps
  // the module from broadcasting a permission update on every world load.
  if (next.length === current.length && next.every((r) => current.includes(r))) return;

  permissions.ACTOR_CREATE = next;

  try {
    await game.settings.set('core', 'permissions', permissions);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to update the ACTOR_CREATE permission`, err);
    ui.notifications.error(game.i18n.localize('CHARFORGE.Settings.permissionSyncFailed'));
  }
}

Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | Ready`);

  game.modules.get(MODULE_ID).api = {
    open: (actor) => new CharacterForgeDialog({ actor }).render({ force: true }),
  };
});

Hooks.on('renderActorDirectory', (app, element) => {
  const root = element instanceof HTMLElement ? element : element[0];
  const footer = root?.querySelector('.directory-footer') ?? root?.querySelector('.directory-header');
  if (!footer) return;

  // Handlebars re-renders (and replaces) this footer on every directory
  // re-render (folder toggle, actor CRUD, search, etc.), discarding any
  // previously appended button along with its listener. Re-inject each time
  // the hook fires instead of relying on the node/listener surviving.
  let button = footer.querySelector('.character-forge-open');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.classList.add('character-forge-open');
    button.innerHTML = `<i class="fa-solid fa-hammer"></i> ${game.i18n.localize('CHARFORGE.OpenButton')}`;
    footer.appendChild(button);
  }
  button.onclick = () => new CharacterForgeDialog().render({ force: true });
});
