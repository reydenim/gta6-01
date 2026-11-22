// police.js — wanted level (0-5 stars), police chase cars, and the busted sequence.
window.SOL = window.SOL || {};
SOL.police = (() => {
  const U = SOL.util;
  let scene_ = null, rng_ = Math.random;
  let stars = 0, lastCrimeAt = -100, decayTimer = 0, ramCooldown = 0, bustTimer = 0;
  let cars = [], officer = null, officerTimer = 0;
  let bustedFlag = false, timeNow = 0;

  function init(scene, rng) { scene_ = scene; rng_ = rng || Math.random; }

  function addStars(n) {
    if (stars >= 5) return;
    stars = Math.min(5, stars + n);
    lastCrimeAt = timeNow;
    decayTimer = 0;
  }
  function getStars() { return stars; }
  function clearStars() { stars = 0; syncCars(); }

  function spawnPolice() {
    const p = SOL.city.roadPoint(rng_);
    // spawn 60-90 units away from the player if we know where they are
    const car = SOL.vehicles.createCar(scene_, { x: p.x, z: p.z, heading: 0, type: 'police', rng: rng_ });
    cars.push({ car, stuck: 0 });
    return car;
  }
  function despawnPolice() {
    const c = cars.pop();
    if (c) {
      if (officer && officer.carRef === c.car) { removeOfficer(); }
      c.car.destroy();
    }
  }
  function syncCars() {
    const want = Math.min(stars, 4);
    while (cars.length < want) spawnPolice();
    while (cars.length > want) despawnPolice();
  }

  function removeOfficer() {
    if (officer) { scene_.remove(officer.mesh); officer = null; }
  }

  function update(dt, player) {
    timeNow += dt;
    if (ramCooldown > 0) ramCooldown -= dt;
    syncCars();
    // wanted decay: quiet for 12s, then -1 star every 8s
    if (stars > 0 && timeNow - lastCrimeAt > 12) {
      let nearest = Infinity;
      for (const c of cars) nearest = Math.min(nearest, Math.hypot(c.car.x - player.x, c.car.z - player.z));
      if (nearest > 60) {
        decayTimer += dt;
        if (decayTimer >= 8) { stars--; decayTimer = 0; syncCars(); }
      } else decayTimer = 0;
    }
    // police chase
    let nearestDist = null;
    for (const c of cars) {
      const car = c.car;
      const dx = player.x - car.x, dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (nearestDist == null || dist < nearestDist) nearestDist = dist;
      // desired heading toward the player (with a little prediction)
      const px = player.x + (player.vx || 0) * 0.4, pz = player.z + (player.vz || 0) * 0.4;
      const desired = Math.atan2(px - car.x, pz - car.z);
      const steer = U.clamp(U.angDiff(car.heading, desired) * 1.6, -1, 1);
      car.update(dt, { throttle: 1, steer, brake: dist < 4 && Math.abs(car.speed) > 4 });
      // flashing light bar
      const phase = Math.floor(timeNow * 6) % 2 === 0;
      if (car.mesh.userData.lightRed) {
        car.mesh.userData.lightRed.visible = phase;
        car.mesh.userData.lightBlue.visible = !phase;
      }
      // ram the player
      if (dist < 3.4 && ramCooldown <= 0) {
        ramCooldown = 2.5;
        if (player.onCarHit) player.onCarHit(dx / (dist || 1), dz / (dist || 1), car.speed);
      }
      // on foot: an officer gets out and walks up to bust the player
      if (!player.inCar && dist < 9 && !officer) {
        officer = { mesh: SOL.player.makePerson(0x1c2f6e), carRef: car, walkPhase: 0 };
        officer.mesh.position.set(car.x + 2, 0, car.z);
        scene_.add(officer.mesh);
        officerTimer = 0;
      }
    }
    if (officer) {
      const dx = player.x - officer.mesh.position.x, dz = player.z - officer.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (player.inCar || d > 25 || stars === 0) { removeOfficer(); bustTimer = 0; }
      else {
        officer.mesh.position.x += (dx / (d || 1)) * 3.2 * dt;
        officer.mesh.position.z += (dz / (d || 1)) * 3.2 * dt;
        officer.mesh.rotation.y = Math.atan2(dx, dz);
        officer.walkPhase += dt * 8;
        const sw = Math.sin(officer.walkPhase) * 0.5;
        officer.mesh.userData.legL.rotation.x = sw;
        officer.mesh.userData.legR.rotation.x = -sw;
        if (d < 2.2) {
          bustTimer += dt;
          if (bustTimer > 2.5) { bustedFlag = true; bustTimer = 0; }
        } else bustTimer = 0;
      }
    }
    return nearestDist;
  }

  function consumeBusted() { const b = bustedFlag; bustedFlag = false; return b; }
  function nearestDist(player) {
    let m = null;
    for (const c of cars) {
      const d = Math.hypot(c.car.x - player.x, c.car.z - player.z);
      if (m == null || d < m) m = d;
    }
    return m;
  }
  return { init, addStars, getStars, clearStars, update, consumeBusted, nearestDist, get cars() { return cars.map((c) => c.car); } };
})();
