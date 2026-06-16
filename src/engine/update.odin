package engine

import rl "vendor:raylib"

MAX_NODES :: 2
MAX_ITERATIONS :: 8

TRIANGLE_SIZE :: 16

visible_chars: f32 = 0
mouse_position: rl.Vector2
mouse_left_pressed: bool
mouse_left_released: bool
mouse_right_pressed: bool
shift_pressed: bool
dragged_gate: ^Node
drag_offset: rl.Vector2

update :: proc(game: ^Game) {
	visible_chars += TIME_STEP * (60.0 / 5.0)

	mouse_position = rl.GetMousePosition()
	mouse_left_pressed := rl.IsMouseButtonPressed(.LEFT)
	mouse_left_released := rl.IsMouseButtonReleased(.LEFT)
	mouse_right_pressed := rl.IsMouseButtonPressed(.RIGHT)
	shift_pressed = rl.IsKeyDown(.LEFT_SHIFT) || rl.IsKeyDown(.RIGHT_SHIFT)

	for node_id, &node in game.nodes {
		node.is_hovered = rl.CheckCollisionPointRec(mouse_position, node.rect)
		if node.is_hovered && mouse_left_pressed {
			dragged_gate = &node
			drag_offset = mouse_position - {node.rect.x, node.rect.y}
		}
	}

	if dragged_gate != nil {
		dragged_gate.rect.x = mouse_position.x - drag_offset.x
		dragged_gate.rect.y = mouse_position.y - drag_offset.y
		dragged_gate.rect = snap(dragged_gate.rect)
	}

	if mouse_left_released {
		if dragged_gate != nil {
			dragged_gate = nil
			drag_offset = {0, 0}
		}
	}
}

// check_collision_point_bezier :: proc(point, start, end: rl.Vector2, thick: f32) -> bool {
// 	p1, c2, c3, p4 := get_bezier(start, end)

// 	threshold := i32(thick * 2)

// 	prev := start
// 	for i in 1 ..= BEZIER_SEGMENTS {
// 		t := f32(i) / f32(BEZIER_SEGMENTS)
// 		current := rl.GetSplinePointBezierCubic(p1, c2, c3, p4, t)

// 		if rl.CheckCollisionPointLine(point, prev, current, threshold) do return true
// 		prev = current
// 	}
// 	return false
// }

// get_bezier :: proc(start, end: rl.Vector2) -> (p1, c2, c3, p4: rl.Vector2) {
// 	handle := abs(end.x - start.x) * 0.5
// 	return start, {start.x + handle, start.y}, {end.x - handle, end.y}, end
// }

// simulate :: proc() {
// 	for _ in 0 ..< MAX_ITERATIONS {
// 		changed := false

// 		for wire in wires {
// 			src_high := wire.from_gate.outputs[wire.from_node_index].is_high
// 			dst_high := &wire.to_gate.inputs[wire.to_node_index].is_high

// 			if dst_high^ != src_high {
// 				dst_high^ = src_high
// 				changed = true
// 			}
// 		}

// 		for &gate in gates {
// 			switch gate.type {
// 			case .NAND:
// 				out := !(gate.inputs[0].is_high && gate.inputs[1].is_high)
// 				if gate.outputs[0].is_high != out {
// 					gate.outputs[0].is_high = out
// 					changed = true
// 				}
// 			case .INPUT:
// 				out := gate.outputs[0].is_high
// 				if gate.is_high != out {
// 					gate.is_high = out
// 					changed = true
// 				}
// 			case .OUTPUT:
// 				out := gate.inputs[0].is_high
// 				if gate.is_high != out {
// 					gate.is_high = out
// 					changed = true
// 				}
// 			case .NONE:
// 			}
// 		}

// 		if !changed do break
// 	}
// }
