let _value = '';
export const locationStore = {
  get: () => _value,
  set: (v: string) => { _value = v; },
  clear: () => { _value = ''; },
};
