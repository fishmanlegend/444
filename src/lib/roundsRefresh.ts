let _listeners: Array<() => void> = [];

export function onRoundsChanged(fn: () => void): () => void {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter((f) => f !== fn); };
}

export function notifyRoundsChanged(): void {
  _listeners.forEach((fn) => fn());
}
