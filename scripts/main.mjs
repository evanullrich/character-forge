import { CharacterForgeDialog } from './character-forge-dialog.mjs';

export const MODULE_ID = 'character-forge';

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing`);

  game.settings.register(MODULE_ID, 'defaultHitDie', {
    name: `${MODULE_ID}.Settings.defaultHitDie.name`,
    hint: `${MODULE_ID}.Settings.defaultHitDie.hint`,
    scope: 'world',
    config: true,
    type: String,
    choices: { d6: 'd6', d8: 'd8', d10: 'd10', d12: 'd12' },
    default: 'd8',
  });
});

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
