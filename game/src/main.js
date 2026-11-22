// main.js — Solmar City bootstrap. Runs after the DOM: hands THREE to the game.
window.SOL = window.SOL || {};
window.__solmar = window.SOL;
SOL.game.init(window.THREE);

// Debug hooks for automated playtests (not part of gameplay).
window.__debug = {
  teleport(x, z) {
    const p = window.__game.player();
    if (p.inCar && p.car) { p.car.x = x; p.car.z = z; p.car.speed = 0; }
    p.x = x; p.z = z;
    p.mesh.position.set(x, 0, z);
  },
  cars() {
    return window.__game.parkedCars().map((c) => ({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), type: c.type }));
  },
};
