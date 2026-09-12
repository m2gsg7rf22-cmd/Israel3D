// Player character: procedural low-poly rig with a hip pivot and four limb
// pivots, shared by the on-foot walk/run animation and the seated moto pose.
export function buildCharacter(THREE, scene) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#e0b28e', roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: '#2f5fa8', roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: '#33384a', roughness: 0.85 });

  const hips = new THREE.Group();
  hips.position.y = 0.9;
  group.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), shirt);
  torso.position.y = 0.34;
  torso.castShadow = true;
  hips.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), skin);
  head.position.y = 0.72;
  head.castShadow = true;
  hips.add(head);

  function makeLimb(mat, len, x, side) {
    const pivot = new THREE.Group();
    pivot.position.set(x, side === 'leg' ? 0 : 0.58, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, len, 0.14), mat);
    mesh.position.y = -len / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    hips.add(pivot);
    return pivot;
  }
  const legL = makeLimb(pants, 0.85, -0.11, 'leg');
  const legR = makeLimb(pants, 0.85, 0.11, 'leg');
  const armL = makeLimb(shirt, 0.6, -0.28, 'arm');
  const armR = makeLimb(shirt, 0.6, 0.28, 'arm');

  scene.add(group);
  return { group, legL, legR, armL, armR, shirtMat: shirt, pantsMat: pants };
}

// walk/run swing cycle shared by updateFoot each frame
export function applyLocomotionSwing(character, phase, speed, runSpeed) {
  const speedFactor = Math.max(0, Math.min(Math.abs(speed) / runSpeed, 1.35));
  const swing = Math.sin(phase) * 0.55 * speedFactor;
  character.legL.rotation.x = swing;
  character.legR.rotation.x = -swing;
  character.armL.rotation.x = -swing * 0.8;
  character.armR.rotation.x = swing * 0.8;
}

// reparents the rig onto the motorcycle's seat socket with a seated pose
export function seatOnMoto(scene, character, motoGroup) {
  scene.remove(character.group);
  motoGroup.add(character.group);
  character.group.position.set(0, 0.21, -0.35);
  character.group.rotation.set(0, 0, 0);
  character.legL.rotation.x = -1.35;
  character.legR.rotation.x = -1.35;
  character.armL.rotation.x = -0.35;
  character.armR.rotation.x = -0.35;
}

export function unseatFromMoto(scene, character, motoGroup, footYaw) {
  motoGroup.remove(character.group);
  scene.add(character.group);
  character.group.rotation.set(0, footYaw, 0);
  character.legL.rotation.x = 0;
  character.legR.rotation.x = 0;
  character.armL.rotation.x = 0;
  character.armR.rotation.x = 0;
}
