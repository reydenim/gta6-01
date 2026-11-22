// vehicles.js — car models (box-built, original) and arcade driving physics.
// Model is Z-forward: front is +Z, so mesh.rotation.y === heading. No physics engine:
// speed + heading + simple circle collisions.
window.SOL = window.SOL || {};
SOL.vehicles = (() => {
  const U = SOL.util;
  const TYPES = {
    sedan: { max: 26, accel: 13, len: 4.4, h: 0.75, cabinH: 0.6 },
    taxi: { max: 26, accel: 13, len: 4.4, h: 0.75, cabinH: 0.6 },
    van: { max: 22, accel: 10, len: 5.0, h: 1.15, cabinH: 0.8 },
    sports: { max: 36, accel: 17, len: 4.2, h: 0.55, cabinH: 0.45 },
    police: { max: 30, accel: 15, len: 4.4, h: 0.75, cabinH: 0.6 },
  };
  const COLORS = [0xd83a2e, 0x2e7dd8, 0xe8c33a, 0xf2f2f2, 0x222226, 0xd85fa2, 0x3ab56a, 0x8a5fd8];
  let THREE_ = null;

  // One merged vertex-colored body mesh + 4 spinning wheels = 5 draw calls per car.
  function makeCarModel(color, type) {
    const t = TYPES[type] || TYPES.sedan;
    const g = new THREE_.Group();
    const bodyColor = type === 'police' ? 0xf2f2f2 : color;
    const parts = [
      { w: 2.0, h: t.h, d: t.len, x: 0, y: 0.38 + t.h / 2, z: 0, color: bodyColor },
      { w: 1.8, h: t.cabinH, d: t.len * 0.5, x: 0, y: 0.38 + t.h + t.cabinH / 2 - 0.05, z: -t.len * 0.06, color: 0x101418 },
      { w: 0.4, h: 0.18, d: 0.1, x: -0.6, y: 0.72, z: t.len / 2 + 0.02, color: 0xfff6c9 },
      { w: 0.4, h: 0.18, d: 0.1, x: 0.6, y: 0.72, z: t.len / 2 + 0.02, color: 0xfff6c9 },
      { w: 0.4, h: 0.18, d: 0.1, x: -0.6, y: 0.72, z: -t.len / 2 - 0.02, color: 0xff2a2a },
      { w: 0.4, h: 0.18, d: 0.1, x: 0.6, y: 0.72, z: -t.len / 2 - 0.02, color: 0xff2a2a },
    ];
    if (type === 'taxi') parts.push({ w: 0.5, h: 0.22, d: 0.7, x: 0, y: 0.38 + t.h + t.cabinH + 0.08, z: -0.1, color: 0xffe14d });
    if (type === 'sports') parts.push({ w: 1.9, h: 0.08, d: 0.5, x: 0, y: 1.25, z: -t.len / 2 + 0.1, color: bodyColor });
    if (type === 'police') {
      parts.push({ w: 1.9, h: 0.1, d: 1.0, x: 0, y: 0.38 + t.h + 0.03, z: t.len / 2 - 0.5, color: 0x14141a });
      parts.push({ w: 1.4, h: 0.12, d: 0.5, x: 0, y: 0.38 + t.h + t.cabinH + 0.02, z: -0.1, color: 0x222222 });
    }
    const body = new THREE_.Mesh(
      U.mergeBoxes(THREE_, parts),
      new THREE_.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.5 }),
    );
    body.castShadow = true;
    g.add(body);
    // wheels: steering group (front) holds a cylinder mesh; spin via rotateY (local Y == axle).
    const wheelGeo = new THREE_.CylinderGeometry(0.38, 0.38, 0.3, 12);
    const wheelMat = new THREE_.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
    const wheels = [], steerGroups = [];
    for (const [wx, wz] of [[0.95, t.len * 0.32], [-0.95, t.len * 0.32], [0.95, -t.len * 0.32], [-0.95, -t.len * 0.32]]) {
      const holder = new THREE_.Group();
      holder.position.set(wx, 0.38, wz);
      const w = new THREE_.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2; // cylinder axis -> X (axle)
      w.castShadow = true;
      holder.add(w);
      g.add(holder);
      wheels.push(w);
      if (wz > 0) steerGroups.push(holder);
    }
    if (type === 'police') {
      const red = new THREE_.Mesh(new THREE_.BoxGeometry(0.6, 0.16, 0.4), new THREE_.MeshBasicMaterial({ color: 0xff2020 }));
      red.position.set(0.4, 0.38 + t.h + t.cabinH + 0.1, -0.1); g.add(red);
      const blue = new THREE_.Mesh(new THREE_.BoxGeometry(0.6, 0.16, 0.4), new THREE_.MeshBasicMaterial({ color: 0x2050ff }));
      blue.position.set(-0.4, 0.38 + t.h + t.cabinH + 0.1, -0.1); g.add(blue);
      g.userData.lightRed = red; g.userData.lightBlue = blue;
    }
    g.userData.wheels = wheels; g.userData.steerGroups = steerGroups;
    return g;
  }

  // A drivable car. input: {throttle:-1..1, steer:-1..1, brake:bool}.
  function createCar(scene, opts) {
    const type = opts.type || 'sedan';
    const t = TYPES[type];
    const color = opts.color != null ? opts.color : U.pick(opts.rng || Math.random, COLORS);
    const mesh = makeCarModel(color, type);
    mesh.position.set(opts.x || 0, 0, opts.z || 0);
    mesh.rotation.y = opts.heading || 0;
    scene.add(mesh);
    const car = {
      mesh, type, max: t.max, accel: t.accel,
      speed: 0, heading: opts.heading || 0,
      x: opts.x || 0, z: opts.z || 0,
      radius: 2.1, crashed: false, crashTimer: 0,
      police: type === 'police',
      update(dt, input) {
        const maxRev = 9;
        if (input.brake) {
          car.speed = U.damp(car.speed, 0, 6, dt);
        } else if (input.throttle > 0) {
          car.speed += car.accel * input.throttle * dt;
        } else if (input.throttle < 0) {
          car.speed += car.accel * 0.55 * input.throttle * dt;
        } else {
          car.speed = U.damp(car.speed, 0, 0.7, dt);
        }
        car.speed = U.clamp(car.speed, -maxRev, car.max);
        const steerAuthority = U.clamp(Math.abs(car.speed) / 8, 0, 1) * 1.9;
        car.heading += input.steer * steerAuthority * Math.sign(car.speed || 1) * dt;
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        car.x += fx * car.speed * dt;
        car.z += fz * car.speed * dt;
        const out = { x: 0, z: 0 };
        if (SOL.city.collide(car.x, car.z, car.radius, out)) {
          car.x += out.x; car.z += out.z;
          if (Math.abs(car.speed) > 6 && car.crashTimer <= 0) {
            car.crashTimer = 0.4;
            SOL.audio.crash();
          }
          car.speed *= 0.55;
        }
        if (car.crashTimer > 0) car.crashTimer -= dt;
        mesh.position.set(car.x, 0, car.z);
        mesh.rotation.y = car.heading;
        const wSpin = (car.speed * dt) / 0.38;
        for (const w of mesh.userData.wheels) w.rotateY(wSpin);
        for (const s of mesh.userData.steerGroups) s.rotation.y = -input.steer * 0.35;
      },
      speedKmh() { return Math.abs(car.speed) * 3.6; },
      destroy() { scene.remove(mesh); },
    };
    return car;
  }

  function init(THREE) { THREE_ = THREE; }
  return { init, createCar, makeCarModel, TYPES, COLORS };
})();
