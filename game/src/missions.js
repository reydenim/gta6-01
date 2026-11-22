// missions.js — three story missions in Solmar City. A newcomer driver, Danny, takes
// jobs from Mara at the Marina Garage. Each mission has steps, a 3D beacon marker,
// objective text and a cash reward. All names and story are original.
window.SOL = window.SOL || {};
SOL.missions = (() => {
  const U = SOL.util;
  let THREE_ = null, scene_ = null;
  let beacon = null, beaconRing = null;
  let active = null;      // {def, step, phase, timer}
  let doneCount = 0;
  let cometCar = null, lena = null;
  let nextId = 0;

  const LM = () => SOL.city.LANDMARKS;
  function defs() {
    return [
      {
        id: 0, title: 'First Delivery', reward: 200,
        intro: 'Mara: "New in town? Good. Take this package to the Harbor Cafe. Drive careful, the streets are watching."',
        steps: [
          { type: 'enterCar', text: 'Get in a car' },
          { type: 'goto', x: LM().cafe.x, z: LM().cafe.z + 12, radius: 8, text: 'Deliver the package to the Harbor Cafe' },
        ],
      },
      {
        id: 1, title: 'The Pickup', reward: 350,
        intro: 'Mara: "A singer named Lena needs a ride from the Palm Hotel to the Neon Club. She pays well. Don\'t keep her waiting."',
        steps: [
          { type: 'goto', x: LM().hotel.x, z: LM().hotel.z + 12, radius: 8, text: 'Pick up Lena at the Palm Hotel', needCar: true },
          { type: 'pickup', text: 'Lena is getting in...' },
          { type: 'goto', x: LM().club.x, z: LM().club.z + 12, radius: 8, text: 'Drop Lena off at the Neon Club', needCar: true },
        ],
      },
      {
        id: 2, title: 'The Getaway', reward: 600,
        intro: 'Mara: "Last job. The red Comet at Sunset Motors is ours tonight. Take it, lose the heat, and bring it home to the garage."',
        steps: [
          { type: 'steal', text: 'Steal the red Comet at Sunset Motors' },
          { type: 'loseWanted', text: 'Lose the police, then bring the Comet to the Marina Garage' },
          { type: 'goto', x: LM().garage.x, z: LM().garage.z + 12, radius: 9, text: 'Park the Comet at the Marina Garage', needCar: true },
        ],
      },
    ];
  }

  function init(scene, THREE) {
    THREE_ = THREE; scene_ = scene;
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true), beaconMat);
    beacon.visible = false;
    scene.add(beacon);
    beaconRing = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    beaconRing.visible = false;
    scene.add(beaconRing);
  }
  function setComet(car) { cometCar = car; }

  function startMarkerPos() { return { x: LM().garage.x, z: LM().garage.z + 12 }; }
  function allDone() { return doneCount >= 3; }
  function isActive() { return !!active; }
  function currentDef() { return active ? active.def : null; }

  function startNext() {
    if (doneCount >= 3) return null;
    const def = defs()[doneCount];
    active = { def, step: 0, phase: 'go', timer: 0 };
    return def;
  }
  function currentStep() { return active ? active.def.steps[active.step] : null; }
  function objectiveText() {
    if (!active) {
      if (allDone()) return 'All jobs done. Solmar is yours, Danny.';
      return 'Go to the Marina Garage and press E to start a job';
    }
    return active.def.title + ' — ' + currentStep().text;
  }
  function markerPos() {
    if (!active) return startMarkerPos();
    const s = currentStep();
    if (!s) return startMarkerPos();
    if (s.type === 'steal') return { x: LM().dealer.x, z: LM().dealer.z + 12 };
    if (s.type === 'loseWanted') return { x: LM().garage.x, z: LM().garage.z + 12 };
    return { x: s.x, z: s.z };
  }
  function advance() {
    active.step++;
    active.phase = 'go'; active.timer = 0;
    if (active.step >= active.def.steps.length) {
      const def = active.def;
      active = null; doneCount++;
      return { done: def };
    }
    return { step: currentStep() };
  }

  function update(dt, player, time) {
    // beacon follows the current objective (or the garage start marker)
    const mp = markerPos();
    beacon.position.set(mp.x, 15, mp.z);
    beaconRing.position.set(mp.x, 6 + Math.sin(time * 2) * 0.5, mp.z);
    beaconRing.rotation.y = time * 1.5;
    beacon.visible = true; beaconRing.visible = true;
    if (!active) return null;
    const s = currentStep();
    const px = player.x, pz = player.z;
    const distTo = (x, z) => Math.hypot(px - x, pz - z);
    if (s.type === 'enterCar') {
      if (player.inCar) return advance();
    } else if (s.type === 'goto') {
      if (distTo(s.x, s.z) < s.radius && (!s.needCar || player.inCar)) return advance();
    } else if (s.type === 'pickup') {
      if (active.phase === 'go') {
        // Lena walks to the car
        if (!lena) {
          lena = SOL.player.makePerson(0xd53a7b);
          lena.position.set(player.x + 3, 0, player.z + 3);
          scene_.add(lena);
          active.phase = 'boarding'; active.timer = 0;
        }
      } else {
        active.timer += dt;
        const t = Math.min(1, active.timer / 1.4);
        lena.position.x = U.lerp(lena.position.x, player.x + 1.5, 0.12);
        lena.position.z = U.lerp(lena.position.z, player.z + 1.5, 0.12);
        if (t >= 1) {
          scene_.remove(lena); lena = null;
          return advance();
        }
      }
    } else if (s.type === 'steal') {
      if (player.inCar && player.car === cometCar) return advance();
    } else if (s.type === 'loseWanted') {
      if (SOL.police.getStars() === 0) return advance();
    }
    return null;
  }

  return { init, setComet, startNext, isActive, currentDef, objectiveText, markerPos, update, allDone, startMarkerPos, get doneCount() { return doneCount; } };
})();
