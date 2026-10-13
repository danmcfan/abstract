import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Arm, Pose } from "./clips";
import { canvasTexture, glowing, halo, inked, PALETTE, toon } from "./look";

// The helper robot, concept B from the vision board ("the crate"): a toaster
// of a body on a tank tread, a boxy CRT head with a spring antenna, and two
// ribbed arms. About two units tall, facing +z, standing on y = 0.
//
// Like every robot on the board it shows its screws and rivets, and it's
// salvaged: one rivet and one bezel screw are missing, its screen is cracked
// (drawn in face.ts), and its battery is down a bar.

export interface Robot {
  group: THREE.Group;
  // The screen's canvas; the caller draws the face and then calls refresh.
  face: CanvasRenderingContext2D;
  refreshFace(): void;
  apply(pose: Pose): void;
}

// The screen's canvas, in the same proportions as the glass.
const FACE_SIZE = { width: 300, height: 200 };

const TREAD_HEIGHT = 0.32;
// The tread's belt runs round two wheels this far either side of centre.
const AXLE = 0.38;
const BELT_RADIUS = 0.12;
// clips.ts turns the wheels to match this.
const WHEEL_RADIUS = 0.085;

// Outline weight for big parts, and for small ones.
const LINE = 0.018;
const FINE = 0.009;

const box = (w: number, h: number, d: number, r: number, segments = 3): RoundedBoxGeometry =>
  new RoundedBoxGeometry(w, h, d, segments, r);
// A cylinder lying along x, for things on the robot's sides.
const sideways = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => geometry.rotateZ(Math.PI / 2);
// A cylinder lying along z, for things on its front and back.
const facing = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => geometry.rotateX(Math.PI / 2);

export function createRobot(): Robot {
  const group = new THREE.Group();
  const white = toon(PALETTE.surface);
  const wash = toon(PALETTE.wash);
  const steel = toon("#b7c7de");
  const belt = toon("#3d5f9c");
  const cleat = toon("#2c4a80");
  const inkFlat = new THREE.MeshBasicMaterial({ color: PALETTE.ink });
  const slot = new THREE.MeshBasicMaterial({ color: PALETTE.void });

  // A domed rivet or screw head on a surface facing +z; place and turn it
  // onto the surface. Screws get a slot, each at its own angle.
  let screws = 0;
  const fastener = (radius: number, screw = false): THREE.Mesh => {
    const head = inked(
      facing(new THREE.SphereGeometry(radius, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
      steel,
      FINE * 0.8,
    );
    if (screw) {
      const cut = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.5, radius * 0.32, radius * 0.5), inkFlat);
      cut.position.z = radius * 0.8;
      cut.rotation.z = (screws++ * 2.2) % Math.PI;
      head.add(cut);
    }
    return head;
  };
  // Where a fastener fell out: just the hole.
  const hole = (radius: number): THREE.Mesh => new THREE.Mesh(new THREE.CircleGeometry(radius * 0.7, 14), slot);

  // ---------------------------------------------------------------- tread
  const base = new THREE.Group();
  group.add(base);
  // The belt rides high enough that its cleats touch the floor.
  const treadY = CLEAT_RADIUS + 0.015;

  // The belt: a stadium-shaped band, with cleats that run round it as it rolls.
  const beltShape = stadium(AXLE, BELT_RADIUS);
  beltShape.holes.push(stadium(AXLE, BELT_RADIUS - 0.035));
  const band = inked(
    new THREE.ExtrudeGeometry(beltShape, { depth: 0.46, bevelEnabled: false, curveSegments: 16 }).translate(
      0,
      0,
      -0.23,
    ),
    belt,
    LINE,
  );
  band.position.y = treadY;
  base.add(band);
  const cleatGeometry = box(0.05, 0.03, 0.47, 0.008, 1);
  const cleats = Array.from({ length: 22 }, () => {
    const c = inked(cleatGeometry, cleat, FINE);
    base.add(c);
    return c;
  });

  // Inside the belt: a white chassis with road wheels on both faces.
  const chassis = inked(
    new THREE.ExtrudeGeometry(stadium(AXLE, BELT_RADIUS - 0.04), {
      depth: 0.4,
      bevelEnabled: false,
      curveSegments: 16,
    }).translate(0, 0, -0.2),
    white,
    FINE,
  );
  chassis.position.y = treadY;
  base.add(chassis);
  const wheels: THREE.Object3D[] = [];
  for (const z of [0.205, -0.205]) {
    for (const x of [-AXLE, 0, AXLE]) {
      const r = x === 0 ? 0.065 : 0.082;
      const wheel = new THREE.Group();
      wheel.position.set(x, treadY, z);
      if (z < 0) wheel.rotation.y = Math.PI;
      wheel.add(inked(facing(new THREE.CylinderGeometry(r, r, 0.03, 24)), wash, FINE));
      const hub = inked(facing(new THREE.CylinderGeometry(r * 0.45, r * 0.5, 0.05, 16)), white, FINE * 0.8);
      wheel.add(hub);
      // Three bolts, so you can see the wheels turn.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const bolt = new THREE.Mesh(new THREE.CircleGeometry(r * 0.1, 8), inkFlat);
        bolt.position.set(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, 0.0155);
        wheel.add(bolt);
      }
      base.add(wheel);
      wheels.push(wheel);
    }
  }
  // A deck plate the torso sits on.
  const deck = inked(box(0.82, 0.03, 0.42, 0.012, 2), steel, FINE);
  deck.position.y = TREAD_HEIGHT - 0.01;
  base.add(deck);

  // ---------------------------------------------------------------- torso
  // The torso pivots where it sits on the tread.
  const torso = new THREE.Group();
  torso.position.y = TREAD_HEIGHT;
  base.add(torso);

  const body = inked(box(0.88, 0.74, 0.6, 0.05), white, LINE);
  body.position.y = 0.39;
  torso.add(body);
  const TOP = 0.76;
  const FRONT = 0.3;

  // Front: a riveted plate with vents and the crate's stencilled part number.
  const plate = inked(box(0.72, 0.58, 0.03, 0.014, 2), white, FINE);
  plate.position.set(0, 0.4, FRONT);
  torso.add(plate);
  const PLATE = FRONT + 0.015;
  for (const [x, y] of [
    [-0.32, 0.65],
    [0.32, 0.65],
    [-0.32, 0.15],
  ] as const) {
    const rivet = fastener(0.02);
    rivet.position.set(x, y, PLATE);
    torso.add(rivet);
  }
  const lost = hole(0.02);
  lost.position.set(0.32, 0.15, PLATE + 0.001);
  torso.add(lost);
  for (let i = 0; i < 3; i++) {
    const vent = new THREE.Mesh(box(0.44, 0.026, 0.02, 0.008, 1), slot);
    vent.position.set(0, 0.56 - i * 0.075, PLATE - 0.006);
    torso.add(vent);
  }
  const tag = inked(box(0.32, 0.11, 0.014, 0.01, 1), wash, FINE * 0.7);
  tag.position.set(0, 0.24, PLATE + 0.004);
  torso.add(tag);
  const stencil = canvasTexture(256, 88, (g) => {
    g.fillStyle = "#1D4E9E";
    g.font = 'bold 52px "Courier Prime", "Courier New", monospace';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("74HC00", 128, 48);
  });
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.29, 0.1),
    new THREE.MeshBasicMaterial({ map: stencil.texture, transparent: true }),
  );
  label.position.set(0, 0.24, PLATE + 0.012);
  torso.add(label);

  // Top: the toaster's two bread slots, either side of the neck.
  for (const z of [0.17, -0.17]) {
    const bread = new THREE.Mesh(box(0.52, 0.01, 0.07, 0.004, 1), slot);
    bread.position.set(0, TOP + 0.001, z);
    torso.add(bread);
  }

  // Right side: the toaster lever in its track. Left side: the browning dial.
  const track = new THREE.Mesh(box(0.01, 0.34, 0.05, 0.004, 1), slot);
  track.position.set(0.441, 0.34, -0.17);
  torso.add(track);
  const lever = inked(box(0.07, 0.04, 0.085, 0.012, 2), wash, FINE);
  lever.position.set(0.475, 0.46, -0.17);
  torso.add(lever);
  const dial = inked(sideways(new THREE.CylinderGeometry(0.065, 0.07, 0.035, 20)), wash, FINE);
  dial.position.set(-0.457, 0.3, -0.15);
  torso.add(dial);
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.075), inkFlat);
  pointer.position.set(-0.476, 0.3 + 0.022, -0.15);
  pointer.rotation.x = -0.7;
  torso.add(pointer);

  // Back: a screwed-on battery hatch, its charge meter one bar short.
  const BACK = -0.3;
  const hatch = inked(box(0.56, 0.44, 0.024, 0.014, 2), white, FINE);
  hatch.position.set(0, 0.4, BACK);
  torso.add(hatch);
  for (const [x, y] of [
    [-0.24, 0.585],
    [0.24, 0.585],
    [-0.24, 0.215],
    [0.24, 0.215],
  ] as const) {
    const screw = fastener(0.018, true);
    screw.position.set(x, y, BACK - 0.012);
    screw.rotation.y = Math.PI;
    torso.add(screw);
  }
  const meter = new THREE.Mesh(box(0.3, 0.09, 0.012, 0.008, 1), slot);
  meter.position.set(0, 0.48, BACK - 0.012);
  torso.add(meter);
  const charge = glowing(PALETTE.glow);
  const flat = new THREE.MeshBasicMaterial({ color: PALETTE.blueprint });
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), i < 3 ? charge : flat);
    bar.position.set(0.096 - i * 0.064, 0.48, BACK - 0.019);
    bar.rotation.y = Math.PI;
    torso.add(bar);
  }

  // Shoulder sockets, where the arms plug in.
  for (const side of [-1, 1]) {
    const socket = inked(sideways(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20)), steel, FINE);
    socket.position.set(side * 0.45, 0.6, 0);
    torso.add(socket);
  }
  const arms = { left: createArm(white, wash, steel, -1), right: createArm(white, wash, steel, 1) };
  arms.left.shoulder.position.set(-0.49, 0.6, 0);
  arms.right.shoulder.position.set(0.49, 0.6, 0);
  torso.add(arms.left.shoulder, arms.right.shoulder);

  // A bellows neck.
  const core = inked(new THREE.CylinderGeometry(0.055, 0.055, 0.13, 14), steel, FINE);
  core.position.y = 0.82;
  torso.add(core);
  for (const y of [0.785, 0.825, 0.865]) {
    const ring = inked(new THREE.CylinderGeometry(0.085, 0.085, 0.022, 18), wash, FINE * 0.8);
    ring.position.y = y;
    torso.add(ring);
  }

  // ----------------------------------------------------------------- head
  // The head pivots on its neck.
  const head = new THREE.Group();
  head.position.y = 0.88;
  torso.add(head);
  const skull = inked(box(0.8, 0.6, 0.56, 0.08, 4), white, LINE);
  skull.position.y = 0.3;
  head.add(skull);
  const FACE = 0.28;

  // The CRT tube's tail, which makes it a television from the side.
  const tail = inked(box(0.58, 0.42, 0.22, 0.06, 3), white, LINE);
  tail.position.set(0, 0.29, -FACE - 0.08);
  head.add(tail);
  for (let i = 0; i < 4; i++) {
    const vent = new THREE.Mesh(box(0.34, 0.02, 0.01, 0.006, 1), slot);
    vent.position.set(0, 0.4 - i * 0.065, -FACE - 0.19);
    head.add(vent);
  }

  // The screen: a bezel frame round curved glass, with the face drawn on it.
  // Its edges are drawn on as flat ink: an outline hull would cross the glass.
  const frame = roundedRect(0.7, 0.5, 0.09);
  frame.holes.push(roundedRect(0.6, 0.4, 0.06));
  const bezel = new THREE.Mesh(
    new THREE.ExtrudeGeometry(frame, { depth: 0.035, bevelEnabled: false, curveSegments: 10 }),
    wash,
  );
  bezel.castShadow = bezel.receiveShadow = true;
  bezel.position.set(0, 0.3, FACE - 0.005);
  head.add(bezel);
  for (const edge of [outline(0.7, 0.5, 0.09, 0.012), outline(0.612, 0.412, 0.066, 0.012)]) {
    const line = new THREE.Mesh(edge, inkFlat);
    line.position.set(0, 0.3, FACE + 0.0305);
    head.add(line);
  }
  const screen = canvasTexture(FACE_SIZE.width, FACE_SIZE.height, () => {});
  const glass = new THREE.Mesh(
    bulge(0.61, 0.41, 0.024),
    new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }),
  );
  glass.position.set(0, 0.3, FACE + 0.003);
  head.add(glass);
  const faceContext = screen.context;
  const BEZEL = FACE + 0.03;
  for (const [x, y] of [
    [-0.31, 0.51],
    [0.31, 0.51],
    [0.31, 0.09],
  ] as const) {
    const screw = fastener(0.016, true);
    screw.position.set(x, y, BEZEL);
    head.add(screw);
  }
  const loose = hole(0.016);
  loose.position.set(-0.31, 0.09, BEZEL + 0.001);
  head.add(loose);

  // Ears: a hex bolt on the left, a tuning knob on the right.
  for (const side of [-1, 1]) {
    const housing = inked(sideways(new THREE.CylinderGeometry(0.08, 0.085, 0.03, 22)), wash, FINE);
    housing.position.set(side * 0.41, 0.3, 0);
    head.add(housing);
  }
  const nut = inked(sideways(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 6)), steel, FINE);
  nut.position.set(-0.44, 0.3, 0);
  head.add(nut);
  const knob = inked(sideways(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 12)), white, FINE);
  knob.position.set(0.45, 0.3, 0);
  head.add(knob);
  const notch = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.04, 0.01), inkFlat);
  notch.position.set(0.476, 0.315, 0);
  head.add(notch);

  // A little grille on top, behind the antenna.
  for (let i = 0; i < 3; i++) {
    const vent = new THREE.Mesh(box(0.24, 0.01, 0.022, 0.005, 1), slot);
    vent.position.set(0, 0.6 + 0.001, -0.1 - i * 0.05);
    head.add(vent);
  }

  // The spring antenna, with its light on top.
  const antenna = new THREE.Group();
  antenna.position.y = 0.6;
  head.add(antenna);
  const mount = inked(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 16), steel, FINE);
  mount.position.y = 0.015;
  antenna.add(mount);
  const socket = inked(new THREE.CylinderGeometry(0.035, 0.045, 0.04, 14), wash, FINE);
  socket.position.y = 0.045;
  antenna.add(socket);
  const coil = new THREE.Group();
  coil.position.y = 0.06;
  antenna.add(coil);
  coil.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(0.035, 0.22, 4.5), 120, 0.011, 6), inkFlat));
  const tip = new THREE.Group();
  tip.position.y = 0.25;
  coil.add(tip);
  const collar = inked(new THREE.CylinderGeometry(0.024, 0.03, 0.03, 12), steel, FINE * 0.8);
  tip.add(collar);
  const bulbMaterial = glowing(PALETTE.glow);
  const bulb = inked(new THREE.SphereGeometry(0.045, 16, 12), bulbMaterial, FINE);
  bulb.position.y = 0.05;
  bulb.castShadow = false;
  tip.add(bulb);
  const bulbHalo = halo(0.26);
  bulbHalo.position.y = 0.05;
  tip.add(bulbHalo);
  const dim = new THREE.Color("#9FB6D6");

  const placeCleats = (travel: number): void => {
    const point = new THREE.Vector2();
    cleats.forEach((c, i) => {
      const angle = beltPoint(((i / cleats.length) * BELT_PERIMETER + travel) % BELT_PERIMETER, point);
      c.position.set(point.x, treadY + point.y, 0);
      c.rotation.z = angle;
    });
  };
  placeCleats(0);

  return {
    group,
    face: faceContext,
    refreshFace: () => void (screen.texture.needsUpdate = true),
    apply(pose) {
      base.position.x = pose.slide;
      group.rotation.y = pose.turn;
      for (const wheel of wheels) wheel.rotation.z = wheel.rotation.y ? -pose.wheels : pose.wheels;
      placeCleats(-pose.wheels * WHEEL_RADIUS);
      torso.position.y = TREAD_HEIGHT + pose.hop;
      torso.rotation.set(pose.lean, 0, pose.roll);
      torso.scale.set(1 + pose.squash * 0.5, 1 - pose.squash, 1 + pose.squash * 0.5);
      head.rotation.set(pose.nod, pose.look, pose.tilt, "YXZ");
      arms.left.apply(pose.leftArm);
      arms.right.apply(pose.rightArm);
      coil.rotation.z = pose.antenna;
      coil.scale.y = pose.spring;
      bulbMaterial.color.copy(dim).lerp(PALETTE.glow, pose.led);
      bulbHalo.material.opacity = pose.led;
    },
  };
}

interface ArmRig {
  shoulder: THREE.Group;
  apply(arm: Arm): void;
}

// An arm: ball shoulder, banded conduit upper arm, elbow, conduit forearm
// and a hand. side is -1 for the arm on the left (as you look at it), +1 on the
// right. The right hand is a two-fingered claw, the left a round mitt.
function createArm(white: THREE.Material, wash: THREE.Material, steel: THREE.Material, side: -1 | 1): ArmRig {
  const shoulder = new THREE.Group();
  shoulder.add(inked(new THREE.SphereGeometry(0.058, 16, 12), white, FINE));
  shoulder.add(conduit(0.25, 0.03, steel));
  const elbow = new THREE.Group();
  elbow.position.y = -0.26;
  shoulder.add(elbow);
  elbow.add(inked(new THREE.SphereGeometry(0.044, 14, 10), steel, FINE));
  elbow.add(conduit(0.22, 0.028, steel));
  const hand = new THREE.Group();
  hand.position.y = -0.24;
  elbow.add(hand);
  const cuff = inked(new THREE.CylinderGeometry(0.04, 0.036, 0.045, 16), wash, FINE);
  cuff.position.y = 0.01;
  hand.add(cuff);
  if (side > 0) {
    // Two fingers, each bent in at the knuckle to pinch.
    for (const finger of [-1, 1]) {
      const knuckle = new THREE.Group();
      knuckle.position.set(finger * 0.022, -0.012, 0);
      knuckle.rotation.z = finger * 0.4;
      hand.add(knuckle);
      const lower = inked(new THREE.CapsuleGeometry(0.016, 0.05, 3, 10), white, FINE);
      lower.position.y = -0.03;
      knuckle.add(lower);
      const tipGroup = new THREE.Group();
      tipGroup.position.y = -0.062;
      tipGroup.rotation.z = -finger * 0.75;
      knuckle.add(tipGroup);
      const tip = inked(new THREE.ConeGeometry(0.016, 0.05, 10), white, FINE);
      tip.rotation.z = Math.PI;
      tip.position.y = -0.022;
      tipGroup.add(tip);
    }
  } else {
    const mitt = inked(new THREE.SphereGeometry(0.052, 16, 12), white, FINE);
    mitt.position.y = -0.04;
    hand.add(mitt);
  }

  return {
    shoulder,
    apply(arm: Arm): void {
      shoulder.rotation.set(-arm.reach, 0, side * arm.raise, "ZXY");
      elbow.rotation.set(-arm.bend, 0, 0);
    },
  };
}

// A length of conduit hanging down from the origin, banded with steel rings.
function conduit(length: number, radius: number, steel: THREE.Material): THREE.Object3D {
  const tube = inked(new THREE.CylinderGeometry(radius, radius, length, 14), toon(PALETTE.surface), FINE);
  tube.position.y = -length / 2;
  for (const t of [0.25, 0.5, 0.75]) {
    const band = inked(new THREE.CylinderGeometry(radius * 1.22, radius * 1.22, 0.02, 14), steel, FINE * 0.7);
    band.position.y = length / 2 - t * length;
    tube.add(band);
  }
  return tube;
}

// A flat ring of ink tracing a rounded rectangle, facing +z.
function outline(width: number, height: number, radius: number, weight: number): THREE.BufferGeometry {
  const shape = roundedRect(width, height, radius);
  shape.holes.push(roundedRect(width - 2 * weight, height - 2 * weight, radius - weight));
  return new THREE.ShapeGeometry(shape, 10);
}

// A pill along x, centred on the origin: semicircles round (+-half, 0).
function stadium(half: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-half, -radius);
  shape.lineTo(half, -radius);
  shape.absarc(half, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-half, radius);
  shape.absarc(-half, 0, radius, Math.PI / 2, (Math.PI * 3) / 2, false);
  return shape;
}

// The path the cleats ride, just outside the belt, starting top left and
// running clockwise as seen from the front.
const CLEAT_RADIUS = BELT_RADIUS + 0.012;
const BELT_PERIMETER = 4 * AXLE + 2 * Math.PI * CLEAT_RADIUS;

// Puts the point at distance s along the belt into out; returns the cleat's tilt.
function beltPoint(distance: number, out: THREE.Vector2): number {
  const straight = 2 * AXLE;
  const arc = Math.PI * CLEAT_RADIUS;
  let s = distance < 0 ? distance + BELT_PERIMETER : distance;
  if (s < straight) return (out.set(-AXLE + s, CLEAT_RADIUS), 0);
  s -= straight;
  if (s < arc) {
    const a = s / CLEAT_RADIUS;
    return (out.set(AXLE + Math.sin(a) * CLEAT_RADIUS, Math.cos(a) * CLEAT_RADIUS), -a);
  }
  s -= arc;
  if (s < straight) return (out.set(AXLE - s, -CLEAT_RADIUS), -Math.PI);
  s -= straight;
  const a = s / CLEAT_RADIUS;
  return (out.set(-AXLE - Math.sin(a) * CLEAT_RADIUS, -Math.cos(a) * CLEAT_RADIUS), -Math.PI - a);
}

// A rounded rectangle centred on the origin.
function roundedRect(width: number, height: number, radius: number): THREE.Shape {
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
  return shape;
}

// CRT glass: a rectangle facing +z that bulges out by depth in the middle.
function bulge(width: number, height: number, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, 24, 16);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = (position.getX(i) / width) * 2;
    const y = (position.getY(i) / height) * 2;
    position.setZ(i, depth * (1 - x * x) * (1 - y * y));
  }
  geometry.computeVertexNormals();
  return geometry;
}

class Helix extends THREE.Curve<THREE.Vector3> {
  private readonly radius: number;
  private readonly height: number;
  private readonly turns: number;

  constructor(radius: number, height: number, turns: number) {
    super();
    this.radius = radius;
    this.height = height;
    this.turns = turns;
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, t * this.height, Math.sin(a) * this.radius);
  }
}
