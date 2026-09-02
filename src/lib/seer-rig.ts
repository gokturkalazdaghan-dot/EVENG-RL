import * as THREE from "three";

const SKIN = 0xf4c2b0;
const HAIR = 0xff8ec4;
const HAIR2 = 0xffb0d8;
const TEE = 0xff4fa3;
const SKIRT = 0xff2e8a;
const SHOE = 0xffd6ea;

function mat(color: number, extra?: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.06, ...extra });
}

function pivotLimb(r: number, len: number, color: number) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), mat(color));
  mesh.position.y = -len / 2 - r * 0.2;
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

export function createKahin() {
  const root = new THREE.Group();
  root.name = "kahin";
  root.scale.setScalar(0.92);

  const hips = new THREE.Group();
  hips.name = "hips";
  hips.position.y = 0.78;
  root.add(hips);

  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), mat(SKIN));
  pelvis.scale.set(1.35, 0.7, 0.95);
  pelvis.position.y = -0.02;
  hips.add(pelvis);

  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.16, 12), mat(SKIN));
  waist.position.y = 0.12;
  hips.add(waist);

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.11, 0.16, 16), mat(SKIRT));
  skirt.position.y = -0.08;
  skirt.castShadow = true;
  hips.add(skirt);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.14, 6, 12), mat(TEE));
  torso.position.y = 0.32;
  torso.castShadow = true;
  hips.add(torso);

  const bustL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat(TEE));
  bustL.scale.set(1.05, 0.85, 1.1);
  bustL.position.set(-0.055, 0.33, 0.09);
  const bustR = bustL.clone();
  bustR.position.x = 0.055;
  hips.add(bustL, bustR);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), mat(SKIN));
  collar.position.y = 0.46;
  hips.add(collar);

  const leftLeg = pivotLimb(0.045, 0.38, SKIN);
  leftLeg.name = "leftLeg";
  leftLeg.position.set(-0.07, -0.08, 0);
  const leftShoe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(SHOE));
  leftShoe.scale.set(1.05, 0.45, 1.4);
  leftShoe.position.set(0, -0.52, 0.03);
  leftLeg.add(leftShoe);
  hips.add(leftLeg);

  const rightLeg = pivotLimb(0.045, 0.38, SKIN);
  rightLeg.name = "rightLeg";
  rightLeg.position.set(0.07, -0.08, 0);
  const rightShoe = leftShoe.clone();
  rightLeg.add(rightShoe);
  hips.add(rightLeg);

  const leftArm = pivotLimb(0.032, 0.3, SKIN);
  leftArm.name = "leftArm";
  leftArm.position.set(-0.18, 0.36, 0);
  leftArm.rotation.z = 0.18;
  const sleeveL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.08, 10), mat(TEE));
  sleeveL.position.set(0, -0.02, 0);
  leftArm.add(sleeveL);
  hips.add(leftArm);

  const rightArm = pivotLimb(0.032, 0.3, SKIN);
  rightArm.name = "rightArm";
  rightArm.position.set(0.18, 0.36, 0);
  rightArm.rotation.z = -0.18;
  const sleeveR = sleeveL.clone();
  rightArm.add(sleeveR);
  hips.add(rightArm);

  const head = new THREE.Group();
  head.name = "head";
  head.position.y = 0.62;
  hips.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 16), mat(SKIN));
  skull.scale.set(0.92, 1.05, 0.9);
  skull.castShadow = true;
  head.add(skull);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), mat(SKIN));
  jaw.scale.set(0.85, 0.7, 0.75);
  jaw.position.set(0, -0.08, 0.02);
  head.add(jaw);

  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 14, 0, Math.PI * 2, 0, Math.PI / 1.7), mat(HAIR));
  hairBack.rotation.x = 0.25;
  hairBack.position.set(0, 0.03, -0.03);
  head.add(hairBack);

  const bang = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), mat(HAIR2));
  bang.scale.set(1.6, 0.45, 0.7);
  bang.position.set(0, 0.1, 0.1);
  head.add(bang);

  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), mat(HAIR2));
  bun.position.set(0, 0.18, -0.04);
  head.add(bun);

  const lockL = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.16, 4, 8), mat(HAIR));
  lockL.position.set(-0.12, -0.02, 0.04);
  lockL.rotation.z = 0.35;
  const lockR = lockL.clone();
  lockR.position.x = 0.12;
  lockR.rotation.z = -0.35;
  head.add(lockL, lockR);

  const eyeWhite = mat(0xfff8fb);
  const iris = mat(0x4a2a38);
  function eye(x: number) {
    const g = new THREE.Group();
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), eyeWhite);
    w.scale.set(1.15, 1, 0.7);
    const i = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), iris);
    i.position.z = 0.016;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), mat(0xffffff));
    shine.position.set(0.006, 0.006, 0.026);
    g.add(w, i, shine);
    g.position.set(x, 0.02, 0.125);
    return g;
  }
  head.add(eye(-0.045), eye(0.045));

  const browM = mat(0xe07aaa);
  const browL = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.04, 3, 6), browM);
  browL.rotation.z = Math.PI / 2.4;
  browL.position.set(-0.045, 0.055, 0.12);
  const browR = browL.clone();
  browR.position.x = 0.045;
  browR.rotation.z = Math.PI - Math.PI / 2.4;
  head.add(browL, browR);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), mat(SKIN));
  nose.scale.set(0.7, 0.9, 1.1);
  nose.position.set(0, -0.01, 0.14);
  head.add(nose);

  const lip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat(0xe56b8a));
  lip.scale.set(1.3, 0.45, 0.7);
  lip.position.set(0, -0.055, 0.125);
  head.add(lip);

  const blushM = mat(0xf4a0b4, { transparent: true, opacity: 0.45 });
  const bl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), blushM);
  bl.scale.set(1, 0.55, 0.4);
  bl.position.set(-0.08, -0.02, 0.11);
  const br = bl.clone();
  br.position.x = 0.08;
  head.add(bl, br);

  const cup = new THREE.Group();
  cup.name = "cup";
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.07, 12), mat(0xfff6ee));
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), mat(0x6b3a28));
  tea.rotation.x = -Math.PI / 2;
  tea.position.y = 0.036;
  cup.add(mug, tea);
  cup.position.set(0.02, 0.22, 0.2);
  hips.add(cup);

  const clips = [walkClip(), idleClip(), palmClip(), dreamClip()];
  return { root, clips };
}

function walkClip() {
  const t = [0, 0.25, 0.5, 0.75, 1];
  return new THREE.AnimationClip("Walk", 0.8, [
    new THREE.NumberKeyframeTrack("leftLeg.rotation[x]", t, [0.7, -0.65, 0.7, -0.65, 0.7]),
    new THREE.NumberKeyframeTrack("rightLeg.rotation[x]", t, [-0.65, 0.7, -0.65, 0.7, -0.65]),
    new THREE.NumberKeyframeTrack("leftArm.rotation[x]", t, [-0.45, 0.4, -0.45, 0.4, -0.45]),
    new THREE.NumberKeyframeTrack("rightArm.rotation[x]", t, [0.4, -0.45, 0.4, -0.45, 0.4]),
    new THREE.NumberKeyframeTrack(".position[y]", t, [0.78, 0.82, 0.78, 0.82, 0.78]),
    new THREE.NumberKeyframeTrack("cup.rotation[x]", t, [-0.1, 0.12, -0.1, 0.12, -0.1]),
  ]);
}

function idleClip() {
  const t = [0, 0.5, 1, 1.5, 2];
  return new THREE.AnimationClip("Idle", 2, [
    new THREE.NumberKeyframeTrack(".position[y]", t, [0.78, 0.8, 0.78, 0.8, 0.78]),
    new THREE.NumberKeyframeTrack("head.rotation[x]", t, [0.02, -0.06, 0.02, -0.06, 0.02]),
    new THREE.NumberKeyframeTrack("leftArm.rotation[z]", t, [0.18, 0.26, 0.18, 0.26, 0.18]),
    new THREE.NumberKeyframeTrack("rightArm.rotation[z]", t, [-0.18, -0.26, -0.18, -0.26, -0.18]),
    new THREE.NumberKeyframeTrack("cup.rotation[x]", t, [-0.15, 0.05, -0.15, 0.05, -0.15]),
  ]);
}

function palmClip() {
  const t = [0, 1];
  return new THREE.AnimationClip("Palm", 1, [
    new THREE.NumberKeyframeTrack("rightArm.rotation[x]", t, [-1.2, -1.25]),
    new THREE.NumberKeyframeTrack("rightArm.rotation[y]", t, [-0.35, -0.3]),
    new THREE.NumberKeyframeTrack("head.rotation[y]", t, [0.22, 0.28]),
    new THREE.NumberKeyframeTrack("cup.scale[x]", t, [0.01, 0.01]),
  ]);
}

function dreamClip() {
  const t = [0, 1.2, 2.4];
  return new THREE.AnimationClip("Dream", 2.4, [
    new THREE.NumberKeyframeTrack("head.rotation[x]", t, [0.16, 0.26, 0.16]),
    new THREE.NumberKeyframeTrack(".rotation[y]", t, [0.12, -0.12, 0.12]),
    new THREE.NumberKeyframeTrack(".position[y]", t, [0.78, 0.81, 0.78]),
  ]);
}

export function floor() {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 24),
    new THREE.MeshStandardMaterial({ color: 0xffd4e6, roughness: 0.92, metalness: 0 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
