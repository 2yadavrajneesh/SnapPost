/** A small registry that lets the header drive the active app's undo / redo / reset actions. */
export type HistoryControl = {
  undo: () => void;
  redo: () => void;
  resetChanges: () => void;
  resetSettings: () => void;
  can: () => { undo: boolean; redo: boolean; changes: boolean; settings: boolean };
};

const controls = new Map<string, HistoryControl>();

export function registerHistory(app: string, c: HistoryControl) {
  controls.set(app, c);
  emitHistory();
  return () => {
    if (controls.get(app) === c) controls.delete(app);
    emitHistory();
  };
}
export const historyFor = (app: string) => controls.get(app);
export const emitHistory = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("snap:history"));
};
