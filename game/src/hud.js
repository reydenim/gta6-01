// hud.js — DOM HUD (money, health, wanted stars, speed, objective, prompts, banner)
// and the canvas minimap (roads, player arrow, traffic, police, mission marker).
window.SOL = window.SOL || {};
SOL.hud = (() => {
  let el = {}, mapCtx = null, mapSize = 180, scale = 180 / 380;
  let bannerTimer = 0;

  function init(doc) {
    el.money = doc.getElementById('hud-money');
    el.health = doc.getElementById('hud-health-fill');
    el.stars = doc.getElementById('hud-stars');
    el.speed = doc.getElementById('hud-speed');
    el.objective = doc.getElementById('hud-objective');
    el.prompt = doc.getElementById('hud-prompt');
    el.banner = doc.getElementById('hud-banner');
    el.bannerTitle = doc.getElementById('hud-banner-title');
    el.bannerSub = doc.getElementById('hud-banner-sub');
    const map = doc.getElementById('minimap');
    mapCtx = map.getContext('2d');
  }
  function fmtMoney(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }

  function update(state, dt) {
    el.money.textContent = fmtMoney(state.money);
    el.health.style.width = Math.max(0, state.health) + '%';
    el.health.style.background = state.health > 50 ? '#4ade80' : state.health > 25 ? '#facc15' : '#ef4444';
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.stars ? '★' : '☆';
    el.stars.textContent = stars;
    el.stars.style.color = state.stars > 0 ? '#ffd23e' : 'rgba(255,255,255,0.35)';
    el.speed.textContent = state.inCar ? Math.round(state.speedKmh) + ' km/h' : '';
    el.objective.textContent = state.objective;
    el.prompt.textContent = state.prompt || '';
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) el.banner.classList.add('hidden');
    }
    drawMinimap(state);
  }

  function showBanner(title, sub, seconds) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub || '';
    el.banner.classList.remove('hidden');
    bannerTimer = seconds || 3;
  }

  function drawMinimap(state) {
    const g = mapCtx, S = mapSize, sc = scale;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(10,16,24,0.82)';
    g.fillRect(0, 0, S, S);
    const toMap = (x, z) => [S / 2 + x * sc, S / 2 + z * sc];
    // blocks
    g.fillStyle = '#3a4150';
    for (let bi = -2; bi <= 1; bi++) for (let bj = -2; bj <= 1; bj++) {
      const [x, y] = toMap((bi + 0.5) * 78 - 32, (bj + 0.5) * 78 - 32);
      g.fillRect(x, y, 64 * sc, 64 * sc);
    }
    // roads
    g.strokeStyle = '#8a93a5'; g.lineWidth = 14 * sc;
    for (const at of SOL.city.ROAD_AT) {
      const [x1, y1] = toMap(at, -180), [x2, y2] = toMap(at, 180);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      const [x3, y3] = toMap(-180, at), [x4, y4] = toMap(180, at);
      g.beginPath(); g.moveTo(x3, y3); g.lineTo(x4, y4); g.stroke();
    }
    // beach + water edge
    g.fillStyle = '#2f8fc9';
    g.fillRect(S / 2 + 172 * sc, 0, S, S);
    // mission marker
    if (state.marker) {
      const [mx, my] = toMap(state.marker.x, state.marker.z);
      const pulse = 4 + Math.sin(state.time * 4) * 1.5;
      g.fillStyle = '#ffd23e';
      g.beginPath();
      g.moveTo(mx, my - pulse - 3); g.lineTo(mx + pulse, my); g.lineTo(mx, my + pulse + 3); g.lineTo(mx - pulse, my);
      g.closePath(); g.fill();
    }
    // traffic dots
    g.fillStyle = '#facc15';
    for (const c of state.trafficCars || []) {
      const [x, y] = toMap(c.x, c.z);
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // police dots (flashing)
    const flash = Math.floor(state.time * 4) % 2 === 0;
    g.fillStyle = flash ? '#ff2020' : '#2050ff';
    for (const c of state.policeCars || []) {
      const [x, y] = toMap(c.x, c.z);
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
    // player arrow
    const [px, py] = toMap(state.playerX, state.playerZ);
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(Math.sin(state.playerHeading), -Math.cos(state.playerHeading)));
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
    g.strokeStyle = '#111111'; g.lineWidth = 1; g.stroke();
    g.restore();
  }

  return { init, update, showBanner };
})();
