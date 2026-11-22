// game.js — Solmar City orchestrator: renderer, lights, camera, input, states,
// collisions, particles, parked cars, shot mode, and the main loop.
window.SOL = window.SOL || {};
SOL.game = (() => {
  const U = SOL.util;
  let THREE_ = null, renderer = null, scene = null, camera = null;
  let player = null, parkedCars = [], comet = null;
  let state = 'menu'; // menu | playing | paused | busted | wasted
  let money = 100, bestWanted = 0;
  let camYaw = Math.PI, camPitch = 0.32, camDist = 8, shake = 0;
  let keys = {}, mouseDown = false, lastMX = 0, lastMY = 0;
  let time = 0, saveTimer = 0, stateTimer = 0, shotMode = null, shotStartWall = 0;
  let lastFrameT = 0, chaseStaged = false;
  let rng = U.mulberry32(20261122);
  let particles = null, pGeo = null, pData = [];
  let menuAngle = 0;
  let policeProxy = null;

  function init(THREE) {
    THREE_ = THREE;
    const canvas = document.getElementById('game');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ec9e8);
    scene.fog = new THREE.Fog(0xa8c8d8, 120, 420);
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
    camera.position.set(0, 40, 120);

    // warm sun + sky bounce
    const sun = new THREE.DirectionalLight(0xffe3b3, 2.6);
    sun.position.set(120, 180, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
    sun.shadow.camera.far = 500;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a6a4a, 1.1));
    SOL.game._sun = sun;

    SOL.vehicles.init(THREE);
    SOL.city.init(scene, THREE);
    SOL.player.init(scene, THREE);
    SOL.traffic.init(scene, THREE, rng);
    SOL.police.init(scene, rng);
    SOL.missions.init(scene, THREE);
    SOL.hud.init(document);

    // player starts at the Marina Garage
    player = SOL.player.create(39, 56);
    player.heading = Math.PI;
    // parked cars around the roads
    for (let i = 0; i < 8; i++) parkedCars.push(spawnParked(rng));
    // the red Comet at Sunset Motors (mission 3 target)
    comet = SOL.vehicles.createCar(scene, { x: 117, z: 134, heading: 0, type: 'sports', color: 0xd81f2a, rng });
    parkedCars.push(comet);
    SOL.missions.setComet(comet);

    // particles: dust puffs at the rear wheels
    pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(150 * 3);
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({ color: 0xcbb98a, size: 1.4, transparent: true, opacity: 0.55, depthWrite: false });
    particles = new THREE.Points(pGeo, pMat);
    particles.frustumCulled = false;
    scene.add(particles);
    for (let i = 0; i < 150; i++) pData.push({ life: 0, x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0 });
    pGeo.attributes.position.needsUpdate = true;

    // police proxy object (updated each frame before police.update)
    policeProxy = {
      x: 0, z: 0, vx: 0, vz: 0, inCar: false,
      onCarHit(dx, dz, speed) {
        if (player.inCar && player.car) {
          player.car.x += dx * 1.6; player.car.z += dz * 1.6;
          player.car.speed *= 0.82;
          shake = Math.min(1, shake + 0.5);
          SOL.audio.crash();
        } else {
          player.damage(8, time);
          player.x += dx * 2; player.z += dz * 2;
          shake = Math.min(1, shake + 0.6);
        }
      },
    };

    // saved progress
    const saved = SOL.save.load();
    if (saved) {
      money = saved.money; bestWanted = saved.bestWanted || 0;
      const cont = document.getElementById('btn-continue');
      if (cont) cont.classList.remove('hidden');
    }

    bindInput();
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // shot mode: deterministic states for screenshots (?shot=chase|drive|city|mission)
    const q = new URLSearchParams(window.location.search);
    shotMode = q.get('shot');
    if (shotMode) { shotStartWall = performance.now(); applyShotMode(shotMode); }

    window.__game = { renderer, scene, camera, state: () => state, player: () => player, parkedCars: () => parkedCars };
    renderer.setAnimationLoop(loop);
  }

  function spawnParked(rng) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const at = U.pick(rng, SOL.city.ROAD_AT);
    const t = (rng() * 2 - 1) * 140;
    const side = rng() < 0.5 ? -1 : 1;
    const types = ['sedan', 'sedan', 'taxi', 'van'];
    let x, z, heading;
    if (axis === 'x') { x = t; z = at + side * 5.8; heading = side > 0 ? -Math.PI / 2 : Math.PI / 2; }
    else { x = at + side * 5.8; z = t; heading = side > 0 ? Math.PI : 0; }
    return SOL.vehicles.createCar(scene, { x, z, heading, type: U.pick(rng, types), rng });
  }

  function applyShotMode(shot) {
    setState('playing'); // also unhides the HUD (and the mission banner inside it)
    SOL.audio.init();
    if (shot === 'chase') {
      const car = SOL.vehicles.createCar(scene, { x: 3.5, z: -40, heading: 0, type: 'sports', color: 0xd81f2a, rng });
      parkedCars.push(car);
      player.x = 3.5; player.z = -40;
      player.inCar = true; player.car = car; car.speed = 22;
      SOL.police.addStars(3);
      // two traffic cars ahead on the same road, driving the same way
      SOL.traffic.spawnAt(SOL.vehicles.createCar(scene, { x: 3.5, z: 12, heading: 0, type: 'sedan', rng }), 'z', 0, 1, 12);
      SOL.traffic.spawnAt(SOL.vehicles.createCar(scene, { x: 3.5, z: 55, heading: 0, type: 'taxi', rng }), 'z', 0, 1, 55);
      camYaw = 0; camPitch = 0.28; camDist = 11;
    } else if (shot === 'drive') {
      const car = SOL.vehicles.createCar(scene, { x: -40, z: -3.5, heading: Math.PI / 2, type: 'taxi', color: 0xe8c33a, rng });
      parkedCars.push(car);
      player.x = -40; player.z = -3.5;
      player.inCar = true; player.car = car; car.speed = 14;
      camYaw = Math.PI / 2; camPitch = 0.26; camDist = 10;
    } else if (shot === 'city') {
      player.x = 39; player.z = 70; player.heading = Math.PI * 0.75;
      camYaw = Math.PI * 0.75; camPitch = 0.3; camDist = 9;
      SOL.traffic.placePedsNear(39, 39, 3); // peds on the sidewalk edge right by the player
    } else if (shot === 'mission') {
      const def = SOL.missions.startNext();
      const car = SOL.vehicles.createCar(scene, { x: -117, z: 82, heading: 0, type: 'sedan', color: 0x2e7dd8, rng });
      parkedCars.push(car);
      player.x = -117; player.z = 82;
      player.inCar = true; player.car = car; car.speed = 0;
      camYaw = 0; camPitch = 0.3; camDist = 11;
      if (def) SOL.hud.showBanner(def.title, def.intro, 8); // long banner: this shot is the mission's cover
    }
  }

  function bindInput() {
    const canvas = document.getElementById('game');
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'KeyM') { SOL.audio.setMuted(!SOL.audio.isMuted()); }
      if (e.code === 'Escape' && state === 'playing') setState('paused');
      else if (e.code === 'Escape' && state === 'paused') setState('playing');
      if (e.code === 'KeyE' && state === 'playing') doAction();
      if (e.code === 'KeyF' && state === 'playing') doPunch();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    canvas.addEventListener('mousedown', (e) => { mouseDown = true; lastMX = e.clientX; lastMY = e.clientY; });
    window.addEventListener('mouseup', () => { mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown || state !== 'playing') return;
      camYaw -= (e.clientX - lastMX) * 0.005;
      camPitch = U.clamp(camPitch + (e.clientY - lastMY) * 0.004, 0.08, 1.1);
      lastMX = e.clientX; lastMY = e.clientY;
    });
    document.getElementById('btn-play').addEventListener('click', () => startGame(false));
    document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
    document.getElementById('btn-resume').addEventListener('click', () => setState('playing'));
    document.getElementById('btn-quit').addEventListener('click', () => setState('menu'));
  }

  function startGame(continueSave) {
    SOL.audio.init(); SOL.audio.resume(); SOL.audio.startMusic();
    document.getElementById('menu').classList.add('hidden');
    if (!continueSave) { money = 100; }
    setState('playing');
  }
  function setState(s) {
    state = s;
    document.getElementById('pause').classList.toggle('hidden', s !== 'paused');
    document.getElementById('menu').classList.toggle('hidden', s !== 'menu');
    if (s === 'menu') {
      document.getElementById('hud').classList.add('hidden');
    } else {
      document.getElementById('hud').classList.remove('hidden');
    }
  }

  function findNearestCar(x, z, maxDist) {
    let best = null, bd = maxDist;
    const consider = (car) => {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bd) { bd = d; best = car; }
    };
    for (const c of parkedCars) consider(c);
    for (const t of SOL.traffic.cars) consider(t.car);
    return best;
  }

  function doAction() {
    if (player.inCar) { player.exitCar(); return; }
    // mission start marker at the garage
    if (!SOL.missions.isActive() && !SOL.missions.allDone()) {
      const m = SOL.missions.startMarkerPos();
      if (Math.hypot(player.x - m.x, player.z - m.z) < 6) {
        const def = SOL.missions.startNext();
        if (def) { SOL.hud.showBanner(def.title, def.intro, 4); SOL.audio.pickup(); }
        return;
      }
    }
    // steal a car
    const car = findNearestCar(player.x, player.z, 4.5);
    if (car) {
      const trafficEntry = SOL.traffic.cars.find((t) => t.car === car);
      if (trafficEntry) {
        // pull the car out of traffic
        SOL.traffic.cars.splice(SOL.traffic.cars.indexOf(trafficEntry), 1);
        parkedCars.push(car);
      }
      player.inCar = true; player.car = car; car.speed = 0;
      SOL.police.addStars(1);
      SOL.audio.pickup();
      if (car === comet && SOL.missions.isActive() && SOL.missions.currentDef() && SOL.missions.currentDef().id === 2) {
        SOL.police.addStars(2); // the Comet job brings real heat
      }
    }
  }

  function doPunch() {
    const hit = player.tryPunch(SOL.traffic.peds);
    for (const ped of hit) {
      SOL.traffic.knockDown(ped, player.x, player.z);
      SOL.police.addStars(1);
    }
  }

  function spawnDust(car) {
    const back = { x: car.x - Math.sin(car.heading) * 1.8, z: car.z - Math.cos(car.heading) * 1.8 };
    for (const p of pData) {
      if (p.life <= 0) {
        p.life = 0.7; p.x = back.x; p.y = 0.3; p.z = back.z;
        p.vx = (Math.random() - 0.5) * 2; p.vy = 1 + Math.random(); p.vz = (Math.random() - 0.5) * 2;
        return;
      }
    }
  }

  function loop() {
    const now = performance.now();
    const dt = lastFrameT ? Math.min(0.05, Math.max(0.001, (now - lastFrameT) / 1000)) : 0.016;
    lastFrameT = now;
    time += dt;
    if (state === 'menu') {
      menuAngle += dt * 0.05;
      camera.position.set(Math.sin(menuAngle) * 130, 55, Math.cos(menuAngle) * 130);
      camera.lookAt(0, 0, 0);
      SOL.traffic.update(dt, null, rng);
      SOL.city.update(dt, time);
      renderer.render(scene, camera);
      return;
    }
    if (state === 'paused') { renderer.render(scene, camera); return; }

    // --- input ---
    const input = {
      forward: !!keys['KeyW'] || !!keys['ArrowUp'],
      back: !!keys['KeyS'] || !!keys['ArrowDown'],
      left: !!keys['KeyA'] || !!keys['ArrowLeft'],
      right: !!keys['KeyD'] || !!keys['ArrowRight'],
      run: !!keys['ShiftLeft'] || !!keys['ShiftRight'],
    };
    const drive = {
      throttle: (input.forward ? 1 : 0) + (input.back ? -0.7 : 0),
      steer: (input.left ? -1 : 0) + (input.right ? 1 : 0),
      brake: !!keys['Space'],
    };

    // --- player ---
    if (!player.dead) {
      if (player.inCar && player.car) {
        player.car.update(dt, drive);
        player.x = player.car.x; player.z = player.car.z;
        if (Math.abs(player.car.speed) > 12 && Math.abs(drive.steer) > 0.5) spawnDust(player.car);
        // camera follows behind the car
        const targetYaw = player.car.heading;
        camYaw = U.angLerp(camYaw, targetYaw, 1 - Math.exp(-2.2 * dt));
      } else {
        player.update(dt, input, camYaw, time, findNearestCar, null);
      }
    }
    if (player.dead && state === 'playing') {
      setState('wasted');
      stateTimer = 0;
      money = Math.max(0, money - 50);
      SOL.hud.showBanner('WASTED', 'The streets of Solmar are unforgiving.', 3);
      SOL.audio.busted();
    }

    // --- traffic + peds ---
    SOL.traffic.update(dt, player.inCar ? player.car : null, rng);
    // player car vs traffic cars: push the player out, slow traffic
    if (player.inCar && player.car) {
      for (const t of SOL.traffic.cars) {
        const dx = player.car.x - t.car.x, dz = player.car.z - t.car.z;
        const d = Math.hypot(dx, dz);
        if (d < 4.2 && d > 0.01) {
          const push = (4.2 - d) / 2;
          player.car.x += (dx / d) * push; player.car.z += (dz / d) * push;
          t.car.speed *= 0.6;
          if (Math.abs(player.car.speed) > 8) SOL.audio.crash();
          player.car.speed *= 0.85;
        }
      }
      // player car vs pedestrians: knock them down, wanted up
      for (const ped of SOL.traffic.peds) {
        if (ped.state === 'down') continue;
        const dx = ped.mesh.position.x - player.car.x, dz = ped.mesh.position.z - player.car.z;
        if (Math.hypot(dx, dz) < 2.4 && Math.abs(player.car.speed) > 3) {
          SOL.traffic.knockDown(ped, player.car.x, player.car.z);
          SOL.police.addStars(1);
          SOL.audio.crash();
        }
      }
      // player car vs police cars: bounce apart
      // (police rams are handled by police.update's onCarHit)
    }
    // peds flee from a fast player car
    if (player.inCar && player.car && Math.abs(player.car.speed) > 5) {
      SOL.traffic.fleeFrom(player.car.x, player.car.z, 8);
    }

    // --- police ---
    policeProxy.x = player.x; policeProxy.z = player.z;
    policeProxy.vx = player.inCar ? Math.sin(player.car.heading) * player.car.speed : player.vx;
    policeProxy.vz = player.inCar ? Math.cos(player.car.heading) * player.car.speed : player.vz;
    policeProxy.inCar = player.inCar;
    const nearestPolice = SOL.police.update(dt, policeProxy);
    bestWanted = Math.max(bestWanted, SOL.police.getStars());
    // chase shot: stage the police cars AHEAD of the player, in frame, so the shot reads
    if (shotMode === 'chase' && !chaseStaged && SOL.police.cars.length >= 3) {
      chaseStaged = true;
      const spots = [[6, 18], [-6, 10], [10, 32]];
      SOL.police.cars.forEach((pc, i) => {
        pc.x = player.x + spots[i][0];
        pc.z = player.z + spots[i][1];
        pc.heading = 0; pc.speed = 20;
      });
    }
    if (SOL.police.consumeBusted()) {
      setState('busted');
      stateTimer = 0;
      const fine = Math.min(money, Math.max(100, Math.floor(money * 0.1)));
      money -= fine;
      SOL.police.clearStars();
      SOL.hud.showBanner('BUSTED', 'Fine paid: $' + fine + '. Mara will hear about this.', 3);
      SOL.audio.busted();
    }

    // --- missions ---
    const ev = SOL.missions.update(dt, player, time);
    if (ev && ev.done) {
      money += ev.done.reward;
      SOL.hud.showBanner('JOB DONE: ' + ev.done.title, 'Earned $' + ev.done.reward, 3.5);
      SOL.audio.missionDone();
      SOL.save.write({ money, done: SOL.missions.doneCount, bestWanted });
    }

    // --- audio ---
    const driving = player.inCar && player.car;
    SOL.audio.update(
      driving ? Math.abs(player.car.speed) / player.car.max : 0,
      driving,
      nearestPolice,
    );

    // --- city + particles ---
    SOL.city.update(dt, time);
    for (const p of pData) {
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= 2 * dt;
      } else { p.y = -10; }
    }
    const posAttr = pGeo.attributes.position;
    for (let i = 0; i < pData.length; i++) {
      posAttr.setXYZ(i, pData[i].x, pData[i].y, pData[i].z);
    }
    posAttr.needsUpdate = true;

    // --- sun follows the player so shadows stay close ---
    SOL.game._sun.position.set(player.x + 120, 180, player.z + 60);
    SOL.game._sun.target.position.set(player.x, 0, player.z);
    SOL.game._sun.target.updateMatrixWorld();

    // --- camera ---
    updateCamera(dt);

    // --- busted/wasted timers ---
    if (state === 'busted' || state === 'wasted') {
      stateTimer += dt;
      if (stateTimer > 2.5) {
        player.respawn(39, 56);
        player.heading = Math.PI;
        camYaw = Math.PI;
        setState('playing');
      }
    }

    // --- HUD ---
    SOL.hud.update({
      money, health: player.health, stars: SOL.police.getStars(),
      inCar: player.inCar, speedKmh: player.speedKmh(),
      objective: SOL.missions.objectiveText(),
      prompt: promptText(),
      marker: SOL.missions.markerPos(),
      trafficCars: SOL.traffic.cars.map((t) => t.car),
      policeCars: SOL.police.cars,
      playerX: player.x, playerZ: player.z, playerHeading: player.inCar ? player.car.heading : player.heading,
      time,
    }, dt);

    // --- save + shot readiness (wall-clock: headless rendering is slow, game time lags) ---
    saveTimer += dt;
    if (saveTimer > 30) { saveTimer = 0; SOL.save.write({ money, done: SOL.missions.doneCount, bestWanted }); }
    if (shotMode && !window.__shotReady && performance.now() - shotStartWall > 4000) {
      window.__shotReady = true;
    }

    renderer.render(scene, camera);
  }

  function promptText() {
    if (player.inCar) return 'E: get out   SPACE: brake';
    if (!SOL.missions.isActive() && !SOL.missions.allDone()) {
      const m = SOL.missions.startMarkerPos();
      if (Math.hypot(player.x - m.x, player.z - m.z) < 6) return 'E: start job';
    }
    const car = findNearestCar(player.x, player.z, 4.5);
    if (car) return 'E: steal car   F: punch';
    return 'WASD: move   F: punch   M: mute';
  }

  function updateCamera(dt) {
    let tx, ty, tz, lookX, lookY, lookZ;
    if (player.inCar && player.car) {
      const back = camDist + 3;
      tx = player.car.x - Math.sin(camYaw) * back;
      tz = player.car.z - Math.cos(camYaw) * back;
      ty = 5.0 + camPitch * 4;
      lookX = player.car.x + Math.sin(player.car.heading) * 8;
      lookZ = player.car.z + Math.cos(player.car.heading) * 8;
      lookY = 2.0;
    } else {
      tx = player.x - Math.sin(camYaw) * camDist;
      tz = player.z - Math.cos(camYaw) * camDist;
      ty = 2.2 + camPitch * 5;
      lookX = player.x; lookZ = player.z; lookY = 1.6;
    }
    // keep the camera out of buildings: clamp height above the ground plane is enough
    // for this skyline (buildings are thin); raise the camera when it would clip.
    const k = 1 - Math.exp(-8 * dt);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (ty - camera.position.y) * k;
    camera.position.z += (tz - camera.position.z) * k;
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 2);
      camera.position.x += (Math.random() - 0.5) * shake * 0.6;
      camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    }
    camera.lookAt(lookX, lookY, lookZ);
  }

  return { init };
})();
