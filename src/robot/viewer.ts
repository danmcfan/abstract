import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { blend, pose, type Pose } from "./clips";
import type { Expression } from "./expression";
import { drawFace } from "./face";
import { createLights } from "./lights";
import { ink, PALETTE } from "./look";
import { createRobot } from "./robot";
import { SHOTS } from "./stage";
import { progress, smoothstep } from "./timeline";

// A dev-only studio for the robot: its own renderer, orbit controls, and
// lighting you can move, for checking the model from every side. It builds
// the same robot, clips and face as the game's stage.

export interface Lighting {
  fill: number; // flat fill for the shade side
  fillColor: string;
  sun: number;
  sunColor: string;
  azimuth: number; // degrees round from the front, toward +x
  elevation: number; // degrees up from the floor
  rim: number; // back light, for silhouettes
  rimColor: string;
}

export type View = "game" | "close" | "front" | "side" | "back" | "top" | "low";

export interface Viewer {
  readonly face: HTMLCanvasElement;
  express(expression: Expression): void;
  talk(on: boolean): void;
  // Starts the current clip over, blending in from wherever the robot is.
  restart(): void;
  play(on: boolean): void;
  speed(rate: number): void;
  seek(seconds: number): void;
  time(): number;
  // Degrees a second the robot spins on its turntable; 0 holds it still.
  spin(degreesPerSecond: number): void;
  // Faces the robot forward again.
  unspin(): void;
  view(name: View): void;
  light(lighting: Lighting): void;
  outlines(on: boolean): void;
  shadows(on: boolean): void;
  grid(on: boolean): void;
  // A pose to hold instead of the clip's, or null to go back to the clip.
  hold(pose: Pose | null): void;
  pose(): Pose;
  // The current frame as a PNG data URL, over a solid background.
  snapshot(background: string): string;
  dispose(): void;
}

const TARGET = new THREE.Vector3(0, 1.02, 0);
const DISTANCE = 5.6;
const BLEND_SECONDS = 0.35;

// Camera positions as [azimuth, elevation] in degrees round the target.
const ORBITS: Record<Exclude<View, "game" | "close">, [number, number]> = {
  front: [0, 4],
  side: [90, 4],
  back: [180, 4],
  top: [20, 72],
  low: [25, -12],
};

export function createViewer(container: HTMLElement, onFrame?: (time: number) => void): Viewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET);
  controls.enableDamping = true;
  controls.minDistance = 1.5;
  controls.maxDistance = 14;

  const { fill, sun, floor } = createLights(scene);
  // The game's shadow box assumes the sun stays front and above; here it
  // goes anywhere, so give it a box that holds the robot from any side.
  sun.target.position.copy(TARGET);
  scene.add(sun.target);
  Object.assign(sun.shadow.camera, { left: -1.8, right: 1.8, top: 1.8, bottom: -1.8 });
  sun.shadow.camera.updateProjectionMatrix();
  const rim = new THREE.DirectionalLight(0xffffff, 0);
  rim.position.set(-2, 3.5, -5);
  rim.target.position.copy(TARGET);
  scene.add(rim, rim.target);

  const gridHelper = new THREE.GridHelper(4, 16, PALETTE.ink, PALETTE.wash);
  gridHelper.position.y = 0.001;
  gridHelper.visible = false;
  scene.add(gridHelper);

  const robot = createRobot();
  scene.add(robot.group);

  let expression: Expression = "idle";
  let talking = false;
  let playing = true;
  let rate = 1;
  let clock = 0;
  let from: Pose = pose("idle", 0);
  let last: Pose = from;
  let held: Pose | null = null;
  let spinRate = 0;
  let spun = 0;
  let then = performance.now();
  let frame = 0;

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < height ? 26 * (height / width) * 0.9 : 26;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const render = () => {
    const target = pose(expression, clock);
    last = held ?? blend(from, target, smoothstep(progress(clock, 0, BLEND_SECONDS)));
    robot.apply({ ...last, turn: last.turn + spun });
    drawFace(robot.face, expression, clock, talking);
    robot.refreshFace();
    renderer.render(scene, camera);
  };

  const loop = (now: number) => {
    const dt = Math.min((now - then) / 1000, 0.1);
    then = now;
    if (playing) clock += dt * rate;
    spun += (dt * spinRate * Math.PI) / 180;
    controls.update();
    render();
    onFrame?.(clock);
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);

  const orbit = (azimuth: number, elevation: number, distance = DISTANCE, target = TARGET) => {
    const a = THREE.MathUtils.degToRad(azimuth);
    const e = THREE.MathUtils.degToRad(elevation);
    controls.target.copy(target);
    camera.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(distance).add(target);
  };

  return {
    face: robot.face.canvas,
    express(next) {
      if (next === expression) return;
      from = last;
      expression = next;
      clock = 0;
    },
    talk(on) {
      talking = on;
    },
    restart() {
      from = last;
      clock = 0;
    },
    play(on) {
      playing = on;
    },
    speed(r) {
      rate = r;
    },
    seek(seconds) {
      clock = Math.max(0, seconds);
    },
    time: () => clock,
    spin(degrees) {
      spinRate = degrees;
    },
    unspin() {
      spun = 0;
    },
    view(name) {
      if (name === "game" || name === "close") {
        const shot = SHOTS[name === "game" ? "full" : "close"];
        controls.target.set(...shot.target);
        camera.position.set(...shot.position);
      } else orbit(...ORBITS[name]);
      controls.update();
    },
    light(l) {
      fill.intensity = l.fill;
      fill.color.set(l.fillColor);
      sun.intensity = l.sun;
      sun.color.set(l.sunColor);
      const a = THREE.MathUtils.degToRad(l.azimuth);
      const e = THREE.MathUtils.degToRad(l.elevation);
      sun.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(7).add(TARGET);
      rim.intensity = l.rim;
      rim.color.set(l.rimColor);
    },
    outlines(on) {
      ink.visible = on;
    },
    shadows(on) {
      sun.castShadow = on;
      floor.visible = on;
    },
    grid(on) {
      gridHelper.visible = on;
    },
    hold(p) {
      if (!p && held) from = held;
      held = p && structuredClone(p);
      if (!p) clock = 0;
    },
    pose: () => structuredClone(last),
    snapshot(background) {
      scene.background = new THREE.Color(background);
      render();
      const url = canvas.toDataURL("image/png");
      scene.background = null;
      return url;
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      canvas.remove();
      ink.visible = true;
    },
  };
}

// The game's own lighting, read off a fresh set of lights so it can't drift
// from the stage's. The game's sun aims at the floor, not the target, so its
// angle is measured from there.
export function gameLighting(): Lighting {
  const { fill, sun } = createLights(new THREE.Scene());
  const p = sun.position;
  return {
    fill: fill.intensity,
    fillColor: `#${fill.color.getHexString()}`,
    sun: sun.intensity,
    sunColor: `#${sun.color.getHexString()}`,
    azimuth: Math.round(THREE.MathUtils.radToDeg(Math.atan2(p.x, p.z))),
    elevation: Math.round(THREE.MathUtils.radToDeg(Math.atan2(p.y, Math.hypot(p.x, p.z)))),
    rim: 0,
    rimColor: "#ffffff",
  };
}
