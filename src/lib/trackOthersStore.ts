const _store: Record<string, boolean> = {};
export const trackOthersStore = {
  get: (roundId: string): boolean => _store[roundId] ?? false,
  set: (roundId: string, val: boolean): void => { _store[roundId] = val; },
};
