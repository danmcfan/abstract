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

// Three flat tones, so lighting reads as shading drawn by hand.
const tones = new THREE.DataTexture(new Uint8Array([90, 185, 255]), 3, 1, THREE.RedFormat);
tones.minFilter = THREE.NearestFilter;
tones.magFilter = THREE.NearestFilter;
tones.needsUpdate = true;

export function toon(color: THREE.ColorRepresentation = PALETTE.surface): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: tones });
}

export function glowing(color: THREE.ColorRepresentation = PALETTE.glow): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

// One ink for every outline, so the scene can fade all of them together
// from darkness.
export const ink = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide });
ink.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    "vec3 transformed = position + normal * 0.022;",
  );
};

// A mesh with an inked outline: a slightly fattened copy drawn inside out.
// Normals are welded first so hard edges don't split the outline.
export function inked(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const hull = geometry.clone();
  for (const name of Object.keys(hull.attributes)) if (name !== "position") hull.deleteAttribute(name);
  const welded = mergeVertices(hull);
  welded.computeVertexNormals();
  mesh.add(new THREE.Mesh(welded, ink));
  return mesh;
}

// A soft additive glow sprite, standing in for bloom.
const haloTexture = (() => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
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

// A canvas the size of a sign or screen, redrawn by the caller.
export function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const redraw = () => {
    g.clearRect(0, 0, width, height);
    draw(g);
    texture.needsUpdate = true;
  };
  redraw();
  return { texture, redraw };
}

export const MONO = '"Courier Prime", "Courier New", Courier, monospace';
