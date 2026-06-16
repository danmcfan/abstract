package engine

import "core:fmt"
import rl "vendor:raylib"

SIDEBAR_WIDTH :: (SCREEN_WIDTH - SCREEN_HEIGHT) / 2

BACKGROUND_COLOR :: rl.Color{77, 101, 180, 255}
SIDEBAR_COLOR :: rl.Color{50, 51, 83, 255}

HIGH_COLOR :: rl.Color{251, 255, 134, 255}
HIGH_HOVER_COLOR :: rl.Color{213, 224, 75, 255}

LOW_COLOR :: rl.Color{255, 255, 255, 255}
LOW_HOVER_COLOR :: rl.Color{199, 220, 208, 255}

WIRE_WIDTH :: 4

NAND_WIDTH :: 96
NAND_HEIGHT :: 64

draw :: proc(game: ^Game, textures: Textures) {
	rl.BeginDrawing()
	defer rl.EndDrawing()

	// clear background
	rl.ClearBackground(BACKGROUND_COLOR)

	// draw line grid
	draw_line_grid(GRID_RECTANGLE, GRID_SPACING)

	// draw left and right sidebars
	rl.DrawRectangleRec({0, 0, SIDEBAR_WIDTH, SCREEN_HEIGHT}, SIDEBAR_COLOR)
	rl.DrawRectangleRec(
		{SCREEN_WIDTH - SIDEBAR_WIDTH, 0, SIDEBAR_WIDTH, SCREEN_HEIGHT},
		SIDEBAR_COLOR,
	)

	// draw wires
	// for wire in wires {
	// 	draw_wire(wire)
	// }

	// draw connection points and gates
	for node_id, node in game.nodes {
		draw_node(textures, node)
	}

	// draw in progress wire
	// if to_gate != nil {
	// 	anchor := get_line_anchor(to_gate^, to_node_index, false)
	// 	node := to_gate.inputs[to_node_index]
	// 	p1, c2, c3, p4 := get_bezier(mouse_position, anchor)
	// 	points := [4]rl.Vector2{p1, c2, c3, p4}
	// 	rl.DrawSplineBezierCubic(
	// 		raw_data(points[:]),
	// 		4,
	// 		WIRE_WIDTH,
	// 		HIGH_COLOR if node.is_high else LOW_COLOR,
	// 	)
	// }

	// draw new NAND gate
	// if shift_pressed {
	// 	rect := rl.Rectangle {
	// 		mouse_position.x - NAND_WIDTH / 2,
	// 		mouse_position.y - NAND_HEIGHT / 2,
	// 		NAND_WIDTH,
	// 		NAND_HEIGHT,
	// 	}
	// 	rect = grid.snap(rect, GRID_RECTANGLE, GRID_SPACING)
	// 	draw_nand(textures, rect, false, rl.Color{255, 255, 255, 128})
	// }

	// draw speech bubble
	// speech_rect := rl.Rectangle {
	// 	50,
	// 	SCREEN_HEIGHT - SCREEN_HEIGHT * 0.3 - 50,
	// 	SCREEN_WIDTH - 100,
	// 	SCREEN_HEIGHT * 0.3,
	// }
	// rl.DrawRectangleRec(speech_rect, rl.RAYWHITE)

	// draw incoming text to speech bubble
	// draw_text(
	// 	textures.font,
	// 	"Welcome to the wonderful world of circuits I am your host Professor Boolean",
	// 	speech_rect,
	// 	int(visible_chars),
	// )
}

// get_line_anchor :: proc(gate: Gate, node_index: int, is_right: bool) -> rl.Vector2 {
// 	spacings := get_spacings(output_count(gate.type) if is_right else input_count(gate.type))
// 	anchor := get_node_anchor(gate, spacings[node_index], is_right)
// 	if is_right do anchor.x += TRIANGLE_SIZE
// 	return anchor
// }

draw_line_grid :: proc(bounds: rl.Rectangle, spacing: f32) {
	color :: rl.Color{245, 245, 245, 16}
	line_width :: 2.0

	x := bounds.x + spacing
	for x < bounds.x + bounds.width {
		rl.DrawLineEx({x, bounds.y}, {x, bounds.y + bounds.height}, line_width, color)
		x += spacing
	}

	y := bounds.y + spacing
	for y < bounds.y + bounds.height {
		rl.DrawLineEx({bounds.x, y}, {bounds.x + bounds.width, y}, line_width, color)
		y += spacing
	}
}

// draw_wire :: proc(wire: Wire) {
// 	from_anchor := get_line_anchor(wire.from_gate^, wire.from_node_index, true)
// 	from_node := wire.from_gate.outputs[wire.from_node_index]

// 	to_anchor := get_line_anchor(wire.to_gate^, wire.to_node_index, false)

// 	color: rl.Color
// 	if wire.is_hovered {
// 		color = HIGH_HOVER_COLOR if from_node.is_high else LOW_HOVER_COLOR
// 	} else {
// 		color = HIGH_COLOR if from_node.is_high else LOW_COLOR
// 	}
// 	p1, c2, c3, p4 := get_bezier(from_anchor, to_anchor)
// 	points := [4]rl.Vector2{p1, c2, c3, p4}
// 	rl.DrawSplineBezierCubic(raw_data(points[:]), 4, WIRE_WIDTH, color)
// }


get_spacings :: proc(count: int) -> [MAX_NODES]f32 {
	spacings: [MAX_NODES]f32
	switch count {
	case 1:
		spacings[0] = 0.5
	case 2:
		spacings[0] = 0.25
		spacings[1] = 0.75
	}
	return spacings
}


// get_node_anchor :: proc(gate: Gate, spacing: f32, is_right: bool) -> rl.Vector2 {
// 	anchor := rl.Vector2{gate.rectangle.x, gate.rectangle.y + gate.rectangle.height * spacing}
// 	if is_right {
// 		anchor.x += gate.rectangle.width
// 	} else {
// 		anchor.x -= TRIANGLE_SIZE
// 	}
// 	return anchor
// }

get_triangle_points :: proc(anchor: rl.Vector2) -> (rl.Vector2, rl.Vector2, rl.Vector2) {
	p1 := rl.Vector2{anchor.x, anchor.y - TRIANGLE_SIZE}
	p2 := rl.Vector2{anchor.x, anchor.y + TRIANGLE_SIZE}
	p3 := rl.Vector2{anchor.x + TRIANGLE_SIZE, anchor.y}
	return p1, p2, p3
}
