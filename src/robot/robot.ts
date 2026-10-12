import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Arm, Pose } from "./clips";
import { canvasTexture, glowing, halo, inked, PALETTE, toon } from "./look";

// The helper robot, concept B from the vision board ("the crate"): a toaster
// of a body on a tread, a boxy head with a CRT face, a spring antenna and
// two wiry arms. About two units tall, facing +z, standing on y = 0.

export interface Robot {
  group: THREE.Group;
  // The screen's canvas; the caller draws the face and then calls refresh.
  face: CanvasRenderingContext2D;
  refreshFace(): void;
  apply(pose: Pose): void;
}

export const FACE_SIZE = { width: 288, height: 204 };

const TREAD_HEIGHT = 0.28;

export function createRobot(): Robot {
  const group = new THREE.Group();
  const white = toon(PALETTE.surface);
  const wash = toon(PALETTE.wash);
  const inkFlat = new THREE.MeshBasicMaterial({ color: PALETTE.ink });

  // The tread: one wide pill with three wheels showing on its face.
  const base = new THREE.Group();
  group.add(base);
  const tread = inked(new RoundedBoxGeometry(1.04, TREAD_HEIGHT, 0.5, 4, 0.13), white);
  tread.position.y = TREAD_HEIGHT / 2;
  base.add(tread);
  const wheels: THREE.Object3D[] = [];
  for (const x of [-0.34, 0, 0.34]) {
    const wheel = new THREE.Group();
    wheel.position.set(x, TREAD_HEIGHT / 2, 0.255);
    const rim = inked(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 20), wash);
    rim.rotation.x = Math.PI / 2;
    wheel.add(rim);
    // A spoke, so you can see the wheels turn.
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.01), inkFlat);
    spoke.position.z = 0.017;
    wheel.add(spoke);
    base.add(wheel);
    wheels.push(wheel);
  }

  // The torso pivots where it sits on the tread.
  const torso = new THREE.Group();
  torso.position.y = TREAD_HEIGHT;
  base.add(torso);

  const body = inked(new RoundedBoxGeometry(0.88, 0.74, 0.6, 3, 0.05), white);
  body.position.y = 0.37 + 0.02;
  torso.add(body);
  for (const [x, y] of [
    [-0.36, 0.67],
    [0.36, 0.67],
    [-0.36, 0.11],
    [0.36, 0.11],
  ]) {
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), wash);
    rivet.position.set(x!, y!, 0.3);
    torso.add(rivet);
  }
  for (let i = 0; i < 3; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.022, 0.012), inkFlat);
    vent.position.set(0, 0.52 - i * 0.075, 0.302);
    torso.add(vent);
  }
  // A crate label, stencilled on.
  const plate = canvasTexture(128, 48, (g) => {
    g.fillStyle = "#1D4E9E";
    g.font = 'bold 26px "Courier Prime", "Courier New", monospace';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("74HC00", 64, 26);
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1125), new THREE.MeshBasicMaterial({ map: plate.texture, transparent: true }));
  label.position.set(0, 0.22, 0.302);
  torso.add(label);

  const arms = { left: createArm(white, -1), right: createArm(white, 1) };
  arms.left.shoulder.position.set(-0.46, 0.6, 0);
  arms.right.shoulder.position.set(0.46, 0.6, 0);
  torso.add(arms.left.shoulder, arms.right.shoulder);

  const neck = inked(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 16), wash);
  neck.position.y = 0.83;
  torso.add(neck);

  // The head pivots on its neck.
  const head = new THREE.Group();
  head.position.y = 0.88;
  torso.add(head);
  const skull = inked(new RoundedBoxGeometry(0.8, 0.6, 0.56, 4, 0.08), white);
  skull.position.y = 0.3;
  head.add(skull);

  // The CRT: a dark rounded screen, its face drawn on a canvas.
  const screen = canvasTexture(FACE_SIZE.width, FACE_SIZE.height, () => {});
  const glass = inked(roundedPanel(0.62, 0.44, 0.1, 0.02), [
    new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: PALETTE.void }),
  ]);
  glass.position.set(0, 0.3, 0.3);
  head.add(glass);
  const faceContext = (screen.texture.image as HTMLCanvasElement).getContext("2d")!;

  for (const side of [-1, 1]) {
    const bolt = inked(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), wash);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(side * 0.415, 0.3, 0);
    head.add(bolt);
  }

  // The spring antenna, with its light on top.
  const antenna = new THREE.Group();
  antenna.position.y = 0.6;
  head.add(antenna);
  const socket = inked(new THREE.CylinderGeometry(0.05, 0.06, 0.04, 14), wash);
  socket.position.y = 0.02;
  antenna.add(socket);
  const coil = new THREE.Group();
  coil.position.y = 0.04;
  antenna.add(coil);
  coil.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(0.035, 0.24, 4.5), 120, 0.011, 6), inkFlat));
  const tip = new THREE.Group();
  tip.position.y = 0.27;
  coil.add(tip);
  const bulbMaterial = glowing(PALETTE.glow);
  const bulb = inked(new THREE.SphereGeometry(0.045, 14, 10), bulbMaterial);
  bulb.castShadow = false;
  tip.add(bulb);
  const bulbHalo = halo(0.36);
  tip.add(bulbHalo);
  const dim = new THREE.Color("#9FB6D6");

  return {
    group,
    face: faceContext,
    refreshFace: () => void (screen.texture.needsUpdate = true),
    apply(pose) {
      base.position.x = pose.slide;
      group.rotation.y = pose.turn;
      for (const wheel of wheels) wheel.rotation.z = pose.wheels;
      torso.position.y = TREAD_HEIGHT + pose.hop;
      torso.rotation.set(pose.lean, 0, pose.roll);
      torso.scale.set(1 + pose.squash * 0.5, 1 - pose.squash, 1 + pose.squash * 0.5);
      head.rotation.set(pose.nod, pose.look, pose.tilt, "YXZ");
      arms.left.apply(pose.leftArm);
      arms.right.apply(pose.rightArm);
      coil.rotation.z = pose.antenna;
      coil.scale.y = pose.spring;
      bulbMaterial.color.copy(dim).lerp(PALETTE.glow, pose.led);
      (bulbHalo.material as THREE.SpriteMaterial).opacity = pose.led;
    },
  };
}

// A wiry arm: shoulder, upper arm, elbow, forearm, and a hand. side is -1
// for the arm on the left (as you look at it), +1 on the right. The right
// hand is a claw, the left a round mitt.
function createArm(material: THREE.Material, side: -1 | 1) {
  const shoulder = new THREE.Group();
  const joint = inked(new THREE.SphereGeometry(0.06, 14, 10), material);
  shoulder.add(joint);
  const upper = inked(new THREE.CapsuleGeometry(0.038, 0.2, 4, 10), material);
  upper.position.y = -0.13;
  shoulder.add(upper);
  const elbow = new THREE.Group();
  elbow.position.y = -0.26;
  shoulder.add(elbow);
  const fore = inked(new THREE.CapsuleGeometry(0.036, 0.17, 4, 10), material);
  fore.position.y = -0.11;
  elbow.add(fore);
  const hand = new THREE.Group();
  hand.position.y = -0.24;
  elbow.add(hand);
  if (side > 0) {
    for (const finger of [-1, 1]) {
      const claw = inked(new THREE.CapsuleGeometry(0.022, 0.07, 3, 8), material);
      claw.position.set(finger * 0.03, -0.03, 0);
      claw.rotation.z = finger * 0.45;
      hand.add(claw);
    }
  } else {
    hand.add(inked(new THREE.SphereGeometry(0.05, 12, 10), material));
  }

  return {
    shoulder,
    apply(arm: Arm) {
      shoulder.rotation.set(-arm.reach, 0, side * arm.raise, "ZXY");
      elbow.rotation.set(-arm.bend, 0, 0);
    },
  };
}

// A rounded rectangle slab facing +z. Its front face is material group 0,
// with UVs spanning the rectangle; the sides are group 1.
function roundedPanel(width: number, height: number, radius: number, depth: number): THREE.BufferGeometry {
  const w = width / 2 - radius;
  const h = height / 2 - radius;
  const shape = new THREE.Shape();
  shape.moveTo(-w, -height / 2);
  shape.lineTo(w, -height / 2);
  shape.absarc(w, -h, radius, -Math.PI / 2, 0, false);
  shape.lineTo(width / 2, h);
  shape.absarc(w, h, radius, 0, Math.PI / 2, false);
  shape.lineTo(-w, height / 2);
  shape.absarc(-w, h, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(-width / 2, -h);
  shape.absarc(-w, -h, radius, Math.PI, Math.PI * 1.5, false);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  geometry.translate(0, 0, -depth);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, position.getX(i) / width + 0.5, position.getY(i) / height + 0.5);
  }
  // Extrude puts the caps in group 0 and the sides in group 1; only the
  // front cap shows.
  return geometry;
}

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private radius: number,
    private height: number,
    private turns: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, t * this.height, Math.sin(a) * this.radius);
  }
}
