import { inputCount, nodeSize, outputCount, partSpec, pinOffset, type NodeType } from "../sim/node";

// Gates are drawn as their schematic symbols: AND is a D, OR a curved
// shield, XOR an OR with an extra back line, NOT a triangle, and the
// inverted gates add a bubble. A part with no symbol is a box with its pin
// names inside. Paths are in node-local grid cells, sized to the node, with
// leads running out to where its pins sit.

export interface Glyph {
  width: number;
  height: number;
  body: string;
  // A second back line, for XOR and XNOR.
  back?: string;
  bubble?: { cx: number; cy: number; r: number };
  inLeads: string;
  // One lead per output pin, in pin order.
  outLeads: string[];
  // Where the gate's name sits, inside the body.
  label: { x: number; y: number; size: number };
  // A box part's pin names, beside their pins.
  pinLabels: { x: number; y: number; text: string; anchor: "start" | "end" }[];
}

const TOP = 0.45;
const BOTTOM = 3.55;
const BUBBLE = 0.3;

export function glyph(type: NodeType): Glyph {
  const { width, height } = nodeSize(type);
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
  const inLeads = ys.map((y) => `M 0 ${y} H 1.45`).join(" ");
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
  const ins = Array.from({ length: inputCount(type) }, (_, i) => pinOffset(type, "in", i));
  const outs = Array.from({ length: outputCount(type) }, (_, i) => pinOffset(type, "out", i));
  return {
    width,
    height,
    body: `M ${left} ${TOP} H ${right} V ${height - TOP} H ${left} Z`,
    inLeads: ins.map((y) => `M 0 ${y} H ${left}`).join(" "),
    outLeads: outs.map((y) => `M ${right} ${y} H ${width}`),
    label: { x: width / 2, y: height / 2, size: 0.5 },
    pinLabels: [
      ...ins.map((y, i) => ({ x: left + 0.2, y, text: spec?.inputs[i] ?? "", anchor: "start" as const })),
      ...outs.map((y, i) => ({ x: right - 0.2, y, text: spec?.outputs[i] ?? "", anchor: "end" as const })),
    ],
  };
}
