import * as THREE from "three";
import { blend, pose, type Pose } from "./clips";
import type { Expression } from "./expression";
import { drawFace } from "./face";
import { PALETTE } from "./look";
import { createRobot } from "./robot";
import { progress, smoothstep } from "./timeline";

// A little film set for the robot: one renderer, one camera and lights,
// drawn into whichever element the UI mounts it in. There's only ever one,
// so the game holds a single WebGL context however many times the robot
// pops up.

// Full shows the whole robot; close is head and shoulders, for talking.
export type Shot = "full" | "close";

const SHOTS: Record<Shot, { position: [number, number, number]; target: [number, number, number] }> = {
  full: { position: [1.3, 1.45, 5.6], target: [0, 1.02, 0] },
  close: { position: [0.85, 1.85, 3.9], target: [0, 1.4, 0] },
};

export interface RobotStage {
  mount(container: HTMLElement, shot?: Shot): void;
  // Stops drawing, if the stage is still in this container.
  unmount(container: HTMLElement): void;
  express(expression: Expression): void;
  talk(talking: boolean): void;
}

const BLEND_SECONDS = 0.35;

let stage: RobotStage | undefined;

export function robotStage(): RobotStage {
  return (stage ??= createStage());
}

function createStage(): RobotStage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);

  scene.add(new THREE.HemisphereLight(PALETTE.surface, PALETTE.wash, 2.3));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2.5, 5, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -2;
  sun.shadow.camera.right = 2;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -1;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ color: PALETTE.ink, opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const robot = createRobot();
  scene.add(robot.group);

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let expression: Expression = "idle";
  let talking = false;
  let since = performance.now();
  let from: Pose = pose("idle", 0);
  let last: Pose = from;
  let frame = 0;
  let host: HTMLElement | null = null;

  const resize = () => {
    if (!host) return;
    const { width, height } = host.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the whole robot in frame when the window is tall and thin.
    camera.fov = width < height ? 26 * (height / width) * 0.9 : 26;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);

  const draw = (now: number) => {
    // Reduced motion holds each clip on one early frame.
    const t = still ? 0.6 : (now - since) / 1000;
    const target = pose(expression, t);
    last = blend(from, target, still ? 1 : smoothstep(progress(t, 0, BLEND_SECONDS)));
    robot.apply(last);
    drawFace(robot.face, expression, t, talking && !still);
    robot.refreshFace();
    renderer.render(scene, camera);
  };
  const loop = (now: number) => {
    draw(now);
    frame = requestAnimationFrame(loop);
  };

  return {
    mount(container, shot = "full") {
      camera.position.set(...SHOTS[shot].position);
      camera.lookAt(...SHOTS[shot].target);
      if (host === container) return;
      if (host) observer.unobserve(host);
      host = container;
      container.appendChild(canvas);
      observer.observe(container);
      resize();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    },
    unmount(container) {
      if (host !== container) return;
      observer.unobserve(container);
      cancelAnimationFrame(frame);
      canvas.remove();
      host = null;
    },
    express(next) {
      if (next === expression) return;
      from = last;
      expression = next;
      since = performance.now();
    },
    talk(on) {
      talking = on;
    },
  };
}
