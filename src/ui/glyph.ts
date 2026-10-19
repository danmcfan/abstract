import { pinOffset, type Look, type NodeKind } from "../sim/kind";
import { bitOf } from "../sim/node";

// Gates are drawn as their schematic symbols: AND is a D, OR a curved
// shield, XOR an OR with an extra back line, NOT a triangle, and the
// inverted gates add a bubble. A part with no symbol is a box with its pin
// names inside; DEMUX's box flares out towards its outputs, the way the
// signal fans out. A split or join is a bar with its bus on one side and a
// numbered single-signal pin for each bit on the other. Paths are in
// node-local grid cells, sized to the node, with leads running out to where
// its pins sit.

export interface Glyph {
  width: number;
  height: number;
  body: string;
  // A second back line, for XOR and XNOR.
  back?: string | undefined;
  bubble?: { cx: number; cy: number; r: number } | undefined;
  // One lead per input pin, in pin order.
  inLeads: string[];
  // One lead per output pin, in pin order.
  outLeads: string[];
  // Where the gate's name sits, inside the body. A split or join has none.
  label?: { x: number; y: number; size: number };
  // A box part's pin names, or a split's or join's bit numbers, beside their
  // pins.
  pinLabels: { x: number; y: number; text: string; anchor: "start" | "end" }[];
}

const TOP = 0.45;
const BOTTOM = 3.55;
const BUBBLE = 0.3;

// busWidth is how many signals a split or join carries. Terminals are drawn
// by the board itself, so they have no glyph.
export function glyph(kind: NodeKind, busWidth = 1): Glyph {
  const { width, height } = kind.size(busWidth);
  const { look } = kind;
  if (look.shape === "bundle") return bundle(kind, look.bus, busWidth, width, height);
  if (look.shape === "box") return box(kind, look, width, height);
  if (look.shape === "symbol") return symbol(kind, look, width, height);
  throw new Error(`A ${look.shape} has no glyph`);
}

function symbol(kind: NodeKind, look: Extract<Look, { shape: "symbol" }>, width: number, height: number): Glyph {
  const mid = height / 2;
  const shifted = look.exclusive ? 0.35 : 0;

  let body: string;
  let front: number;
  let label: Glyph["label"];
  switch (look.symbol) {
    case "not":
      front = 3.9;
      body = `M 1.2 0.75 L ${front} ${mid} L 1.2 3.25 Z`;
      label = { x: 2.05, y: mid, size: 0.56 };
      break;
    case "or": {
      const back = 0.85 + shifted;
      front = 3.95 + shifted;
      body = `M ${back} ${TOP} Q ${back + 2.05} ${TOP} ${front} ${mid} Q ${back + 2.05} ${BOTTOM} ${back} ${BOTTOM} Q ${back + 0.6} ${mid} ${back} ${TOP} Z`;
      label = { x: back + 1.35, y: mid, size: 0.68 };
      break;
    }
    case "and": {
      const r = (BOTTOM - TOP) / 2;
      front = 3.85;
      const flat = front - r;
      body = `M 1 ${TOP} H ${flat} A ${r} ${r} 0 0 1 ${flat} ${BOTTOM} H 1 Z`;
      label = { x: 2.25, y: mid, size: 0.72 };
    }
  }

  const ys = kind.inputCount(1) === 1 ? [mid] : [1, height - 1];
  const inLeads = ys.map((y) => `M 0 ${y} H 1.45`);
  const bubble = look.inverted ? { cx: front + BUBBLE, cy: mid, r: BUBBLE } : undefined;
  const outLeads = [`M ${bubble ? front + BUBBLE * 2 : front} ${mid} H ${width}`];
  const back = shifted ? `M 0.6 ${TOP} Q 1.2 ${mid} 0.6 ${BOTTOM}` : undefined;
  return { width, height, body, back, bubble, inLeads, outLeads, label, pinLabels: [] };
}

// A box's name is as large as it can be, up to BOX_LABEL, while it still
// fits between the pin names (Courier's letters are 0.6 of their size wide),
// but never below BOX_LABEL_MIN, the smallest size that still reads; a long
// name in a narrow box may then crowd its pin names.
const BOX_LABEL = 0.62;
const BOX_LABEL_MIN = 0.5;
const PIN_NAME_ROOM = 0.9;
function boxLabelSize(name: string, inside: number, look: Extract<Look, { shape: "box" }>): number {
  const room = inside - (look.inputs.length > 0 ? PIN_NAME_ROOM : 0) - (look.outputs.length > 0 ? PIN_NAME_ROOM : 0);
  return Math.min(BOX_LABEL, Math.max(BOX_LABEL_MIN, room / (name.length * 0.6)));
}

function box(kind: NodeKind, look: Extract<Look, { shape: "box" }>, width: number, height: number): Glyph {
  const left = 1;
  const right = width - 1;
  const { flare } = look;
  const ins = Array.from({ length: kind.inputCount(1) }, (_, i) => pinOffset(kind, "in", i));
  const outs = Array.from({ length: kind.outputCount(1) }, (_, i) => pinOffset(kind, "out", i));
  return {
    width,
    height,
    body: `M ${left} ${TOP + flare} L ${right} ${TOP - flare} V ${height - TOP + flare} L ${left} ${height - TOP - flare} Z`,
    inLeads: ins.map((y) => `M 0 ${y} H ${left}`),
    outLeads: outs.map((y) => `M ${right} ${y} H ${width}`),
    label: { x: width / 2, y: height / 2, size: boxLabelSize(kind.type, right - left, look) },
    pinLabels: [
      ...ins.map((y, i) => ({ x: left + 0.2, y, text: look.inputs[i] ?? "", anchor: "start" as const })),
      ...outs.map((y, i) => ({ x: right - 0.2, y, text: look.outputs[i] ?? "", anchor: "end" as const })),
    ],
  };
}

const BAR = { left: 1.2, right: 1.8, inset: 0.4 };

// A split takes its bus in on the left; a join gives it out on the right.
function bundle(kind: NodeKind, bus: "in" | "out", busWidth: number, width: number, height: number): Glyph {
  const split = bus === "in";
  const middle = height / 2;
  const bits = Array.from({ length: busWidth }, (_, i) => pinOffset(kind, split ? "out" : "in", i, busWidth));
  const busLead = split ? `M 0 ${middle} H ${BAR.left}` : `M ${BAR.right} ${middle} H ${width}`;
  const bitLeads = bits.map((y) => (split ? `M ${BAR.right} ${y} H ${width}` : `M 0 ${y} H ${BAR.left}`));
  return {
    width,
    height,
    body: `M ${BAR.left} ${BAR.inset} H ${BAR.right} V ${height - BAR.inset} H ${BAR.left} Z`,
    inLeads: split ? [busLead] : bitLeads,
    outLeads: split ? bitLeads : [busLead],
    pinLabels: bits.map((y, i) => ({
      x: split ? BAR.right + 0.2 : 0.2,
      y: y - 0.4,
      text: String(bitOf(busWidth, i)),
      anchor: "start" as const,
    })),
  };
}
