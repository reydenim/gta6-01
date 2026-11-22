// save.js — localStorage save: money, missions done, best wanted level.
window.SOL = window.SOL || {};
SOL.save = (() => {
  const KEY = 'solmar-city-save-v1';
  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (typeof d.money !== 'number') return null;
      return d;
    } catch { return null; }
  }
  function write(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({
        money: Math.floor(state.money),
        done: state.done,
        bestWanted: state.bestWanted,
        savedAt: Date.now(),
      }));
    } catch { /* storage unavailable: play without saving */ }
  }
  function clear() {
    try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
  return { load, write, clear };
})();
