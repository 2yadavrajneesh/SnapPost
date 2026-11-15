/** A small registry that lets the header drive the active app's undo / redo / reset actions. */
export type HistoryControl = {
  undo: () => void;
  redo: () => void;
  resetChanges: () => void;
  resetSettings: () => void;
  can: () => { undo: boolean; redo: boolean; changes: boolean; settings: boolean };
};

/** An app can hold several controls (one per tool or tab). `scope` names which one the header should drive. */
const controls = new Map<string, Map<string, HistoryControl>>();
const active = new Map<string, string>();

export function registerHistory(app: string, c: HistoryControl, scope = "") {
  const m = controls.get(app) ?? new Map<string, HistoryControl>();
  controls.set(app, m);
  m.set(scope, c);
  emitHistory();
  return () => {
    if (m.get(scope) === c) m.delete(scope);
    emitHistory();
  };
}
/** Choose which tool's history the header shows (for apps with tabs). */
export function setHistoryScope(app: string, scope: string) {
  if ((active.get(app) ?? "") === scope) return;
  active.set(app, scope);
  emitHistory();
}
export const historyFor = (app: string) => controls.get(app)?.get(active.get(app) ?? "");
export const emitHistory = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("snap:history"));
};
