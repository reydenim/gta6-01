// player.js — the on-foot character: model builder, WASD movement, car enter/exit,
// melee punch, health. The person model is shared with pedestrians and the officer.
window.SOL = window.SOL || {};
SOL.player = (() => {
  const U = SOL.util;
  let THREE_ = null, scene_ = null;

  // detailed=true (the player) keeps separate arms for the punch animation;
  // pedestrians merge arms into the body (3 meshes per person instead of 6).
  function makePerson(shirtColor, detailed) {
    const g = new THREE_.Group();
    const skin = 0xc98d64, pants = 0x2a2f3a;
    const bodyParts = [
      { w: 0.62, h: 0.72, d: 0.34, x: 0, y: 1.16, z: 0, color: shirtColor },
      { w: 0.34, h: 0.36, d: 0.32, x: 0, y: 1.72, z: 0, color: skin },
    ];
    if (!detailed) {
      bodyParts.push(
        { w: 0.16, h: 0.66, d: 0.16, x: -0.4, y: 1.17, z: 0, color: shirtColor },
        { w: 0.16, h: 0.66, d: 0.16, x: 0.4, y: 1.17, z: 0, color: shirtColor },
      );
    }
    const body = new THREE_.Mesh(
      U.mergeBoxes(THREE_, bodyParts),
      new THREE_.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    );
    body.castShadow = true;
    g.add(body);
    const legMat = new THREE_.MeshStandardMaterial({ color: pants, roughness: 0.9 });
    const legL = new THREE_.Mesh(new THREE_.BoxGeometry(0.22, 0.8, 0.22), legMat);
    legL.position.set(-0.14, 0.4, 0); legL.geometry.translate(0, -0.4, 0);
    const legR = legL.clone(); legR.position.x = 0.14;
    g.add(legL, legR);
    let armL = { rotation: { x: 0 } }, armR = { rotation: { x: 0 } };
    if (detailed) {
      const armMat = new THREE_.MeshStandardMaterial({ color: shirtColor, roughness: 0.85 });
      armL = new THREE_.Mesh(new THREE_.BoxGeometry(0.16, 0.66, 0.16), armMat);
      armL.position.set(-0.4, 1.5, 0); armL.geometry.translate(0, -0.33, 0);
      armR = armL.clone(); armR.position.x = 0.4;
      g.add(armL, armR);
    }
    g.userData = { legL, legR, armL, armR, body };
    return g;
  }

  function init(scene, THREE) { scene_ = scene; THREE_ = THREE; }

  function create(x, z) {
    const mesh = makePerson(0x2e8f7a, true);
    mesh.position.set(x, 0, z);
    scene_.add(mesh);
    const p = {
      mesh, x, z, heading: 0, vx: 0, vz: 0,
      health: 100, lastHurtAt: -100, inCar: false, car: null,
      walkPhase: 0, punchTimer: 0, punchCooldown: 0, dead: false,
      speedKmh() { return p.inCar && p.car ? p.car.speedKmh() : Math.hypot(p.vx, p.vz) * 3.6; },
      damage(n, time) {
        if (p.dead) return;
        p.health -= n; p.lastHurtAt = time;
        if (p.health <= 0) { p.health = 0; p.dead = true; }
      },
      update(dt, input, camYaw, time, findCar, onSteal) {
        if (p.punchCooldown > 0) p.punchCooldown -= dt;
        if (p.punchTimer > 0) p.punchTimer -= dt;
        // slow health regen
        if (time - p.lastHurtAt > 5 && p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + 2 * dt);
        if (p.inCar) {
          // driving is handled by the car; player just rides
          p.x = p.car.x; p.z = p.car.z;
          p.mesh.visible = false;
          return;
        }
        p.mesh.visible = true;
        // movement relative to camera yaw
        let mx = 0, mz = 0;
        if (input.forward) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
        if (input.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
        if (input.left) { mx -= Math.cos(camYaw); mz += Math.sin(camYaw); }
        if (input.right) { mx += Math.cos(camYaw); mz -= Math.sin(camYaw); }
        const len = Math.hypot(mx, mz);
        const run = input.run ? 9 : 6;
        if (len > 0.01) {
          mx /= len; mz /= len;
          p.vx = U.damp(p.vx, mx * run, 10, dt);
          p.vz = U.damp(p.vz, mz * run, 10, dt);
          const targetHeading = Math.atan2(p.vx, p.vz);
          p.heading = U.angLerp(p.heading, targetHeading, 1 - Math.exp(-12 * dt));
          p.walkPhase += dt * (input.run ? 11 : 8);
        } else {
          p.vx = U.damp(p.vx, 0, 10, dt);
          p.vz = U.damp(p.vz, 0, 10, dt);
        }
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        const out = { x: 0, z: 0 };
        if (SOL.city.collide(p.x, p.z, 0.6, out)) { p.x += out.x; p.z += out.z; }
        mesh.position.set(p.x, 0, p.z);
        mesh.rotation.y = p.heading;
        const sw = Math.sin(p.walkPhase) * 0.55 * U.clamp(Math.hypot(p.vx, p.vz) / 6, 0, 1);
        mesh.userData.legL.rotation.x = sw;
        mesh.userData.legR.rotation.x = -sw;
        // punch animation: right arm swings forward
        if (p.punchTimer > 0) {
          mesh.userData.armR.rotation.x = -1.6 * Math.sin((p.punchTimer / 0.35) * Math.PI);
        } else {
          mesh.userData.armL.rotation.x = -sw * 0.7;
          mesh.userData.armR.rotation.x = sw * 0.7;
        }
      },
      // Try to enter the nearest car. findCar(x,z,maxDist) returns a car or null.
      tryEnterCar(findCar, onSteal) {
        if (p.inCar) return false;
        const car = findCar(p.x, p.z, 4.5);
        if (!car) return false;
        p.inCar = true; p.car = car;
        car.speed = 0;
        if (onSteal) onSteal(car);
        return true;
      },
      exitCar() {
        if (!p.inCar || !p.car) return false;
        const car = p.car;
        car.speed = 0;
        p.x = car.x - Math.sin(car.heading + Math.PI / 2) * 2.2;
        p.z = car.z - Math.cos(car.heading + Math.PI / 2) * 2.2;
        p.inCar = false; p.car = null;
        mesh.position.set(p.x, 0, p.z);
        return true;
      },
      // Melee punch: returns the pedestrians hit (game.js decides consequences).
      tryPunch(peds) {
        if (p.inCar || p.punchCooldown > 0) return [];
        p.punchTimer = 0.35; p.punchCooldown = 0.6;
        SOL.audio.punch();
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
        const hit = [];
        for (const ped of peds) {
          const dx = ped.mesh.position.x - p.x, dz = ped.mesh.position.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.3) hit.push(ped);
        }
        return hit;
      },
      respawn(x, z) {
        p.x = x; p.z = z; p.health = 100; p.dead = false;
        if (p.inCar) { p.inCar = false; p.car = null; }
        mesh.position.set(x, 0, z);
        mesh.visible = true;
      },
    };
    return p;
  }

  return { init, create, makePerson };
})();
