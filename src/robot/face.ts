import type { Expression } from "./expression";

// The robot's face, drawn on the canvas behind its CRT glass: glowing eyes
// on a dark screen with scanlines. Shapes follow the vision board's
// expression sheet, squared off for the crate's screen.

const GLOW = "#7FD0FF";
const VOID = "#0A2150";
const DEEP = "#123A7C";

export function drawFace(g: CanvasRenderingContext2D, expression: Expression, time: number, talking: boolean): void {
  const { width, height } = g.canvas;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.shadowBlur = 0;

  const screen = g.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, width * 0.62);
  screen.addColorStop(0, DEEP);
  screen.addColorStop(1, VOID);
  g.fillStyle = screen;
  g.fillRect(0, 0, width, height);

  // Errors glitch the whole picture: slices slip sideways and it flickers.
  const glitch = expression === "error" && Math.sin(time * 13) > 0.55;
  if (expression === "error") g.globalAlpha = 0.75 + 0.25 * Math.abs(Math.sin(time * 37));

  g.strokeStyle = GLOW;
  g.fillStyle = GLOW;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.shadowColor = GLOW;
  g.shadowBlur = 16;
  // Features are drawn around the origin, a little larger than life.
  g.translate(width / 2, height / 2);
  g.scale(FACE_SCALE, FACE_SCALE);
  FACES[expression](g, time, 0, -12);
  if (talking && expression !== "loading" && expression !== "sleepy") mouth(g, 0, 44, time);
  else REST_MOUTHS[expression]?.(g, 0, 44, time);
  g.setTransform(1, 0, 0, 1, 0, 0);

  if (glitch) {
    const y = Math.floor(((time * 400) % height) / 8) * 8;
    g.drawImage(g.canvas, 0, y, width, 18, 10, y, width, 18);
  }

  // Scanlines and a slow rolling refresh band, for the CRT.
  g.shadowBlur = 0;
  g.globalAlpha = 1;
  g.fillStyle = "rgba(10, 33, 80, 0.35)";
  for (let y = 0; y < height; y += 4) g.fillRect(0, y, width, 1.5);
  const band = ((time * 60) % (height + 60)) - 30;
  const roll = g.createLinearGradient(0, band - 30, 0, band + 30);
  roll.addColorStop(0, "rgba(127, 208, 255, 0)");
  roll.addColorStop(0.5, "rgba(127, 208, 255, 0.06)");
  roll.addColorStop(1, "rgba(127, 208, 255, 0)");
  g.fillStyle = roll;
  g.fillRect(0, band - 30, width, 60);
  glass(g, width, height);
  g.restore();
}

// The curved glass over the picture: dark at the corners, a sheen across the
// top, and a crack in one corner from wherever the robot was salvaged.
function glass(g: CanvasRenderingContext2D, width: number, height: number) {
  const vignette = g.createRadialGradient(width / 2, height / 2, height * 0.38, width / 2, height / 2, width * 0.66);
  vignette.addColorStop(0, "rgba(4, 14, 36, 0)");
  vignette.addColorStop(1, "rgba(4, 14, 36, 0.6)");
  g.fillStyle = vignette;
  g.fillRect(0, 0, width, height);

  // Two diagonal streaks of reflection across the top-left corner.
  const streak = (from: number, to: number, alpha: number) => {
    g.fillStyle = `rgba(220, 238, 255, ${alpha})`;
    g.beginPath();
    g.moveTo(width * from, 0);
    g.lineTo(width * to, 0);
    g.lineTo(0, width * to * 0.9);
    g.lineTo(0, width * from * 0.9);
    g.fill();
  };
  streak(0.1, 0.36, 0.06);
  streak(0.42, 0.47, 0.05);

  g.strokeStyle = "rgba(200, 228, 255, 0.55)";
  g.lineWidth = 1.4;
  g.lineCap = "round";
  g.lineJoin = "round";
  const x = width - 6;
  g.beginPath();
  g.moveTo(x, 10);
  g.lineTo(x - 18, 24);
  g.lineTo(x - 30, 22);
  g.lineTo(x - 44, 31);
  g.moveTo(x - 18, 24);
  g.lineTo(x - 22, 42);
  g.lineTo(x - 36, 50);
  g.moveTo(x - 30, 22);
  g.lineTo(x - 34, 12);
  g.stroke();
}

type Draw = (g: CanvasRenderingContext2D, time: number, x: number, y: number) => void;

const FACE_SCALE = 1.3;
const EYE_GAP = 44;
const EYE = 38;

// Blinks every few seconds, for about a tenth of a second.
function openness(time: number, every = 3.7): number {
  const phase = time % every;
  return phase < 0.14 ? Math.max(0.08, Math.abs(phase - 0.07) / 0.07) : 1;
}

function squareEye(g: CanvasRenderingContext2D, x: number, y: number, size: number, open = 1) {
  const h = Math.max(4, size * open);
  g.beginPath();
  g.roundRect(x - size / 2, y - h / 2, size, h, Math.min(8, h / 2));
  g.fill();
}

function stroke(g: CanvasRenderingContext2D, width: number, path: (g: CanvasRenderingContext2D) => void) {
  g.lineWidth = width;
  g.beginPath();
  path(g);
  g.stroke();
}

const FACES: Record<Expression, Draw> = {
  idle(g, t, x, y) {
    const look = Math.sin(t * 0.7) * 6;
    const open = openness(t);
    squareEye(g, x - EYE_GAP + look, y, EYE, open);
    squareEye(g, x + EYE_GAP + look, y, EYE, open);
  },
  happy(g, t, x, y) {
    const lift = Math.abs(Math.sin(t * 6)) * 4;
    for (const side of [-1, 1]) {
      stroke(g, 11, (g) => {
        const cx = x + side * EYE_GAP;
        g.moveTo(cx - 20, y + 10 - lift);
        g.lineTo(cx, y - 12 - lift);
        g.lineTo(cx + 20, y + 10 - lift);
      });
    }
  },
  worried(g, t, x, y) {
    const shake = Math.sin(t * 40) * 1.5;
    for (const side of [-1, 1]) {
      const cx = x + side * EYE_GAP + shake;
      squareEye(g, cx, y + 8, 30, openness(t, 2.3));
      // Brows, raised at the inner ends.
      stroke(g, 6, (g) => {
        g.moveTo(cx + side * 20, y - 14);
        g.lineTo(cx - side * 14, y - 26);
      });
    }
  },
  thinking(g, t, x, y) {
    squareEye(g, x - EYE_GAP + 6, y - 10, EYE, openness(t, 4.4));
    stroke(g, 8, (g) => {
      g.moveTo(x + EYE_GAP - 16, y + 2);
      g.lineTo(x + EYE_GAP + 22, y - 2);
    });
    // Thought dots, filling in one at a time.
    const n = Math.floor(t * 2.5) % 4;
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.arc(x + 62 + i * 14, y - 38, 3 + i, 0, Math.PI * 2);
      g.fill();
    }
  },
  error(g, t, x, y) {
    const jolt = Math.sin(t * 50) > 0.7 ? 6 : 0;
    for (const side of [-1, 1]) {
      const cx = x + side * EYE_GAP + jolt;
      stroke(g, 10, (g) => {
        g.moveTo(cx - 16, y - 16);
        g.lineTo(cx + 16, y + 16);
        g.moveTo(cx + 16, y - 16);
        g.lineTo(cx - 16, y + 16);
      });
    }
  },
  sleepy(g, t, x, y) {
    for (const side of [-1, 1]) {
      stroke(g, 8, (g) => {
        const cx = x + side * EYE_GAP;
        g.moveTo(cx - 20, y + 4);
        g.quadraticCurveTo(cx, y + 18, cx + 20, y + 4);
      });
    }
    // Zs drift up out of the corner and fade.
    g.font = 'bold 30px "Courier Prime", "Courier New", monospace';
    for (let i = 0; i < 2; i++) {
      const p = (t * 0.45 + i * 0.5) % 1;
      g.globalAlpha = Math.sin(p * Math.PI);
      g.fillText("z", x + 66 + p * 18, y - 4 - p * 36);
    }
    g.globalAlpha = 1;
  },
  amazed(g, t, x, y) {
    const r = 24 + Math.sin(t * 9) * 1.2;
    for (const side of [-1, 1]) {
      const cx = x + side * EYE_GAP;
      g.beginPath();
      g.arc(cx, y, r, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.shadowBlur = 0;
      g.fillStyle = VOID;
      g.beginPath();
      g.arc(cx + 5, y - 5, 7, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  },
  loading(g, t, x, y) {
    for (let i = 0; i < 3; i++) {
      const p = (t * 1.4 - i * 0.18) % 1;
      g.globalAlpha = 0.25 + 0.75 * Math.max(0, Math.sin(p * Math.PI));
      g.beginPath();
      g.arc(x + (i - 1) * 34, y + 8, 10, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  },
};

// A talking mouth: a bar that opens and shuts with the syllables.
function mouth(g: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const open = Math.abs(Math.sin(t * 15) * Math.sin(t * 6.3 + 1));
  const h = 5 + open * 18;
  g.beginPath();
  g.roundRect(x - 22, y - h / 2, 44, h, Math.min(6, h / 2));
  g.fill();
}

const REST_MOUTHS: Partial<Record<Expression, Draw>> = {
  idle: (g, _t, x, y) => stroke(g, 6, (g) => (g.moveTo(x - 14, y), g.lineTo(x + 14, y))),
  happy: (g, _t, x, y) => stroke(g, 7, (g) => (g.moveTo(x - 26, y - 8), g.quadraticCurveTo(x, y + 14, x + 26, y - 8))),
  worried: (g, t, x, y) =>
    stroke(g, 5, (g) => {
      g.moveTo(x - 24, y);
      for (let i = 1; i <= 6; i++) g.lineTo(x - 24 + i * 8, y + (i % 2 ? -5 : 5) + Math.sin(t * 30) * 1.5);
    }),
  thinking: (g, _t, x, y) => stroke(g, 6, (g) => (g.moveTo(x + 2, y), g.lineTo(x + 24, y - 4))),
  error: (g, _t, x, y) =>
    stroke(g, 5, (g) => {
      g.moveTo(x - 26, y);
      for (let i = 1; i <= 5; i++) g.lineTo(x - 26 + i * 10.4, y + (i % 2 ? -7 : 7));
    }),
  amazed: (g, _t, x, y) => stroke(g, 6, (g) => g.arc(x, y, 9, 0, Math.PI * 2)),
};
