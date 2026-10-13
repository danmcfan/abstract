import * as THREE from "three";
import { PALETTE } from "./look";

// The robot's lighting: a flat, cool fill for the shade side and one sun that
// casts shadows, high and to the robot's right, so the tops of its boxes
// catch full light, their fronts a little less and their far sides fall into
// blue shade. A floor shows only the shadow. The stage and the dev viewer
// share it, so the viewer's "game" lighting is the real thing.
//
// Lights here are physical: a white surface reaches full white at an
// intensity of pi, so fill plus sun add up to about that.

export interface Lights {
  fill: THREE.AmbientLight;
  sun: THREE.DirectionalLight;
  floor: THREE.Mesh;
}

export function createLights(scene: THREE.Scene): Lights {
  const fill = new THREE.AmbientLight("#d3e0f5", 2.05);
  scene.add(fill);

  const sun = new THREE.DirectionalLight(0xffffff, 1.25);
  sun.position.set(-2.4, 6, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -2;
  sun.shadow.camera.right = 2;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -1;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.ShadowMaterial({ color: PALETTE.inkDeep, opacity: 0.2 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  return { fill, sun, floor };
}
