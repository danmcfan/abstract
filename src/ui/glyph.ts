import { inputCount, nodeSize, type NodeType } from "../sim/node";

// Gates are drawn as their schematic symbols: AND is a D, OR a curved
// shield, XOR an OR with an extra back line, NOT a triangle, and the
// inverted gates add a bubble. Paths are in node-local grid cells, sized to
// the node, with leads running out to where its pins sit.

export interface Glyph {
  width: number;
  height: number;
  body: string;
  // A second back line, for XOR and XNOR.
  back?: string;
  bubble?: { cx: number; cy: number; r: number };
  inLeads: string;
  outLead: string;
  // Where the gate's name sits, inside the body.
  label: { x: number; y: number; size: number };
}

const TOP = 0.45;
const BOTTOM = 3.55;
const BUBBLE = 0.3;

export function glyph(type: NodeType): Glyph {
  const { width, height } = nodeSize(type);
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
  const outLead = `M ${bubble ? front + BUBBLE * 2 : front} ${mid} H ${width}`;
  const back = shifted ? `M 0.6 ${TOP} Q 1.2 ${mid} 0.6 ${BOTTOM}` : undefined;
  return { width, height, body, back, bubble, inLeads, outLead, label };
}
