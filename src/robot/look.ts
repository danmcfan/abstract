import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// The world is drawn like the vision board's blueprint sketches: white
// cel-shaded shapes with blue ink outlines, glowing cyan where something is
// powered.

export const PALETTE = {
  paper: new THREE.Color("#F5F8FC"),
  surface: new THREE.Color("#FFFFFF"),
  wash: new THREE.Color("#E4EDF9"),
  ink: new THREE.Color("#1D4E9E"),
  inkDeep: new THREE.Color("#0F2C5E"),
  pencil: new THREE.Color("#5A6578"),
  void: new THREE.Color("#0A2150"),
  glow: new THREE.Color("#7FD0FF"),
  // The vision board's dark "blueprint mode": navy paper, white lines.
  blueprint: new THREE.Color("#123A7C"),
  chalk: new THREE.Color("#EAF2FF"),
};

// Flat tones by how squarely a surface faces the sun: turned away, glancing,
// and full on. Shade then reads as hand-drawn bands with crisp edges, not a
// soft gradient. Each band starts at a dot(normal, light).
const BANDS: [from: number, tone: number][] = [
  [-1, 0],
  [0.06, 0.55],
  [0.42, 1],
];
const tones = ((): THREE.DataTexture => {
  const size = 64;
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const facing = ((i + 0.5) / size) * 2 - 1;
    data[i] = Math.round(255 * BANDS.reduce((tone, [from, t]) => (facing >= from ? t : tone), 0));
  }
  const texture = new THREE.DataTexture(data, size, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
})();

export function toon(color: THREE.ColorRepresentation = PALETTE.surface): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: tones });
}

export function glowing(color: THREE.ColorRepresentation = PALETTE.glow): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

// One ink for every outline, so they can all be hidden together.
export const ink = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide });

// A mesh with an inked outline: a copy fattened along its normals by
// outline units, drawn inside out. Small parts take thinner lines. Normals
// are welded first so hard edges don't split the outline.
export function inked(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  outline = 0.02,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const hull = geometry.clone();
  for (const name of Object.keys(hull.attributes)) if (name !== "position") hull.deleteAttribute(name);
  const welded = mergeVertices(hull);
  welded.computeVertexNormals();
  const position = welded.getAttribute("position");
  const normal = welded.getAttribute("normal");
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(
      i,
      position.getX(i) + normal.getX(i) * outline,
      position.getY(i) + normal.getY(i) * outline,
      position.getZ(i) + normal.getZ(i) * outline,
    );
  }
  mesh.add(new THREE.Mesh(welded, ink));
  return mesh;
}

// A soft additive glow sprite, standing in for bloom.
const haloTexture = ((): THREE.CanvasTexture => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = context2d(canvas);
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
})();

export function halo(size: number, color: THREE.ColorRepresentation = PALETTE.glow): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: haloTexture,
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    }),
  );
  sprite.scale.setScalar(size);
  return sprite;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = canvas.getContext("2d");
  if (g === null) throw new Error("No 2D canvas context available");
  return g;
}

export interface CanvasTexture {
  texture: THREE.CanvasTexture;
  context: CanvasRenderingContext2D;
  redraw: () => void;
}

// A canvas the size of a sign or screen, redrawn by the caller.
export function canvasTexture(
  width: number,
  height: number,
  draw: (g: CanvasRenderingContext2D) => void,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = context2d(canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const redraw = (): void => {
    g.clearRect(0, 0, width, height);
    draw(g);
    texture.needsUpdate = true;
  };
  redraw();
  return { texture, context: g, redraw };
}
