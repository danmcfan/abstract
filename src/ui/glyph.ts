import { bitOf, inputCount, nodeSize, outputCount, partSpec, pinOffset, type NodeType } from "../sim/node";

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

// busWidth is how many signals a split or join carries.
export function glyph(type: NodeType, busWidth = 1): Glyph {
  const { width, height } = nodeSize(type, busWidth);
  if (type === "SPLIT" || type === "JOIN") return bundle(type, busWidth, width, height);
  if (!hasSymbol(type)) return box(type, width, height);
  const mid = height / 2;
  const inverted = type === "NAND" || type === "NOR" || type === "XNOR" || type === "NOT";
  const shifted = type === "XOR" || type === "XNOR" ? 0.35 : 0;

  let body: string;
  let front: number;
  let label: Glyph["label"];
  switch (type) {
    case "NOT":
      front = 3.9;
      body = `M 1.2 0.75 L ${front} ${mid} L 1.2 3.25 Z`;
      label = { x: 2.05, y: mid, size: 0.46 };
      break;
    case "OR":
    case "NOR":
    case "XOR":
    case "XNOR": {
      const back = 0.85 + shifted;
      front = 3.95 + shifted;
      body = `M ${back} ${TOP} Q ${back + 2.05} ${TOP} ${front} ${mid} Q ${back + 2.05} ${BOTTOM} ${back} ${BOTTOM} Q ${back + 0.6} ${mid} ${back} ${TOP} Z`;
      label = { x: back + 1.35, y: mid, size: 0.56 };
      break;
    }
    case "AND":
    case "NAND":
    default: {
      const r = (BOTTOM - TOP) / 2;
      front = 3.85;
      const flat = front - r;
      body = `M 1 ${TOP} H ${flat} A ${r} ${r} 0 0 1 ${flat} ${BOTTOM} H 1 Z`;
      label = { x: 2.25, y: mid, size: 0.56 };
    }
  }

  const ys = inputCount(type) === 1 ? [mid] : [1, height - 1];
  const inLeads = ys.map((y) => `M 0 ${y} H 1.45`);
  const bubble = inverted ? { cx: front + BUBBLE, cy: mid, r: BUBBLE } : undefined;
  const outLeads = [`M ${bubble ? front + BUBBLE * 2 : front} ${mid} H ${width}`];
  const back = shifted ? `M 0.6 ${TOP} Q 1.2 ${mid} 0.6 ${BOTTOM}` : undefined;
  return { width, height, body, back, bubble, inLeads, outLeads, label, pinLabels: [] };
}

const SYMBOLS = new Set<NodeType>(["NOT", "OR", "NOR", "XOR", "XNOR", "AND", "NAND"]);

export function hasSymbol(type: NodeType): boolean {
  return SYMBOLS.has(type);
}

function box(type: NodeType, width: number, height: number): Glyph {
  const spec = partSpec(type);
  const left = 1;
  const right = width - 1;
  const flare = type === "DEMUX" ? 0.3 : 0;
  const ins = Array.from({ length: inputCount(type) }, (_, i) => pinOffset(type, "in", i));
  const outs = Array.from({ length: outputCount(type) }, (_, i) => pinOffset(type, "out", i));
  return {
    width,
    height,
    body: `M ${left} ${TOP + flare} L ${right} ${TOP - flare} V ${height - TOP + flare} L ${left} ${height - TOP - flare} Z`,
    inLeads: ins.map((y) => `M 0 ${y} H ${left}`),
    outLeads: outs.map((y) => `M ${right} ${y} H ${width}`),
    label: { x: width / 2, y: height / 2, size: 0.5 },
    pinLabels: [
      ...ins.map((y, i) => ({ x: left + 0.2, y, text: spec?.inputs[i] ?? "", anchor: "start" as const })),
      ...outs.map((y, i) => ({ x: right - 0.2, y, text: spec?.outputs[i] ?? "", anchor: "end" as const })),
    ],
  };
}

const BAR = { left: 1.2, right: 1.8, inset: 0.4 };

function bundle(type: "SPLIT" | "JOIN", busWidth: number, width: number, height: number): Glyph {
  const bus = height / 2;
  const bits = Array.from({ length: busWidth }, (_, i) => pinOffset(type, type === "SPLIT" ? "out" : "in", i, busWidth));
  const busLead = type === "SPLIT" ? `M 0 ${bus} H ${BAR.left}` : `M ${BAR.right} ${bus} H ${width}`;
  const bitLeads = bits.map((y) => (type === "SPLIT" ? `M ${BAR.right} ${y} H ${width}` : `M 0 ${y} H ${BAR.left}`));
  return {
    width,
    height,
    body: `M ${BAR.left} ${BAR.inset} H ${BAR.right} V ${height - BAR.inset} H ${BAR.left} Z`,
    inLeads: type === "SPLIT" ? [busLead] : bitLeads,
    outLeads: type === "SPLIT" ? bitLeads : [busLead],
    pinLabels: bits.map((y, i) => ({
      x: type === "SPLIT" ? BAR.right + 0.2 : 0.2,
      y: y - 0.4,
      text: String(bitOf(busWidth, i)),
      anchor: "start" as const,
    })),
  };
}
