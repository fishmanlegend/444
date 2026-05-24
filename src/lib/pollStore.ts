// Transient store for poll options between create → poll-setup → create.
// Not persisted — cleared when the round is saved.
let _options: string[] = [];
let _active = false;

export const pollStore = {
  isActive: () => _active,
  getOptions: () => _options,
  set: (opts: string[], active: boolean) => { _options = opts; _active = active; },
  clear: () => { _options = []; _active = false; },
};
