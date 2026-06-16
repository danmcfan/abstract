package main

import "src/grid"
import "src/text"
import rl "vendor:raylib"

DEBUG :: false

BEZIER_SEGMENTS :: 32

SCREEN_WIDTH :: 1600
SCREEN_HEIGHT :: 900

TIME_STEP :: 1.0 / 60.0

SIDEBAR_WIDTH :: (SCREEN_WIDTH - SCREEN_HEIGHT) / 2
GRID_RECTANGLE :: rl.Rectangle{SIDEBAR_WIDTH, 0, SCREEN_WIDTH - SIDEBAR_WIDTH * 2, SCREEN_HEIGHT}
GRID_SPACING :: 20

MAX_NODES :: 2
MAX_ITERATIONS :: 8

BACKGROUND :: rl.Color{77, 101, 180, 255}
SIDEBAR :: rl.Color{50, 51, 83, 255}

HIGH_COLOR :: rl.Color{251, 255, 134, 255}
HIGH_HOVER_COLOR :: rl.Color{213, 224, 75, 255}

LOW_COLOR :: rl.Color{255, 255, 255, 255}
LOW_HOVER_COLOR :: rl.Color{199, 220, 208, 255}

TRIANGLE_SIZE :: 16
WIRE_WIDTH :: 4

NAND_WIDTH :: 96
NAND_HEIGHT :: 64

terminals_texture := rl.Texture{}
gates_texture := rl.Texture{}
wires_texture := rl.Texture{}
font_texture := rl.Texture{}

gates: [dynamic]Gate
wires: [dynamic]Wire

mouse_position: rl.Vector2
clicked_position: rl.Vector2

shift_pressed: bool

from_gate: ^Gate
from_node_index: int
to_gate: ^Gate
to_node_index: int

dragged_gate: ^Gate
drag_offset: rl.Vector2

visible_chars: f32 = 0

GateType :: enum {
	NONE,
	INPUT,
	OUTPUT,
	NAND,
}

Label :: enum {
	NONE,
	ALPHA,
	BETA,
}

input_count :: proc(gate_type: GateType) -> int {
	switch gate_type {
	case .INPUT:
		return 0
	case .OUTPUT:
		return 1
	case .NAND:
		return 2
	case .NONE:
		return 0
	case:
		panic("Invalid gate type")
	}
}

output_count :: proc(gate_type: GateType) -> int {
	switch gate_type {
	case .INPUT:
		return 1
	case .OUTPUT:
		return 0
	case .NAND:
		return 1
	case .NONE:
		return 0
	case:
		panic("Invalid gate type")
	}
}
Gate :: struct {
	label:      Label,
	type:       GateType,
	rectangle:  rl.Rectangle,
	is_hovered: bool,
	is_high:    bool,
	inputs:     [MAX_NODES]Node,
	outputs:    [MAX_NODES]Node,
}

Wire :: struct {
	from_gate:       ^Gate,
	from_node_index: int,
	to_gate:         ^Gate,
	to_node_index:   int,
	is_hovered:      bool,
}

Node :: struct {
	is_hovered: bool,
	is_high:    bool,
}

main :: proc() {
	if !DEBUG {
		rl.SetTraceLogLevel(.NONE)
	}

	rl.InitWindow(SCREEN_WIDTH, SCREEN_HEIGHT, "Layers of Abstraction")
	defer rl.CloseWindow()

	rl.SetTargetFPS(60)

	terminals_texture = rl.LoadTexture("assets/terminals.png")
	defer rl.UnloadTexture(terminals_texture)

	gates_texture = rl.LoadTexture("assets/gates.png")
	defer rl.UnloadTexture(gates_texture)

	wires_texture = rl.LoadTexture("assets/wires.png")
	defer rl.UnloadTexture(wires_texture)

	font_texture = rl.LoadTexture("assets/font.png")
	defer rl.UnloadTexture(font_texture)

	defer delete(gates)
	defer delete(wires)

	append(
		&gates,
		Gate {
			label = .ALPHA,
			type = .INPUT,
			rectangle = grid.snap(
				{SIDEBAR_WIDTH + 40, SCREEN_HEIGHT * 0.25 - 32, 64, 64},
				GRID_RECTANGLE,
				GRID_SPACING,
			),
		},
	)
	append(
		&gates,
		Gate {
			label = .BETA,
			type = .INPUT,
			rectangle = grid.snap(
				{SIDEBAR_WIDTH + 40, SCREEN_HEIGHT * 0.75 - 32, 64, 64},
				GRID_RECTANGLE,
				GRID_SPACING,
			),
		},
	)
	append(
		&gates,
		Gate {
			type = .OUTPUT,
			rectangle = grid.snap(
				{SCREEN_WIDTH - SIDEBAR_WIDTH - 40 - 64, SCREEN_HEIGHT / 2 - 32, 64, 64},
				GRID_RECTANGLE,
				GRID_SPACING,
			),
		},
	)
	append(
		&gates,
		Gate {
			type = .NAND,
			rectangle = grid.snap(
				{
					SCREEN_WIDTH / 2 - NAND_WIDTH / 2,
					SCREEN_HEIGHT / 2 - NAND_HEIGHT / 2,
					NAND_WIDTH,
					NAND_HEIGHT,
				},
				GRID_RECTANGLE,
				GRID_SPACING,
			),
		},
	)

	simulate()

	accumulator: f32 = 0
	for !rl.WindowShouldClose() {
		accumulator += rl.GetFrameTime()
		for accumulator > TIME_STEP {
			update()
			accumulator -= TIME_STEP
		}

		draw()
	}
}

update :: proc() {
	visible_chars += TIME_STEP * (60.0 / 5.0)

	mouse_position = rl.GetMousePosition()
	mouse_left_pressed := rl.IsMouseButtonPressed(.LEFT)
	mouse_left_released := rl.IsMouseButtonReleased(.LEFT)
	mouse_right_pressed := rl.IsMouseButtonPressed(.RIGHT)
	shift_pressed = rl.IsKeyDown(.LEFT_SHIFT) || rl.IsKeyDown(.RIGHT_SHIFT)

	for &gate, gate_index in gates {
		gate.is_hovered = rl.CheckCollisionPointRec(mouse_position, gate.rectangle)
		if gate.is_hovered && mouse_left_pressed {
			dragged_gate = &gate
			drag_offset = mouse_position - {gate.rectangle.x, gate.rectangle.y}
		}

		input_spacings := get_spacings(input_count(gate.type))
		for i in 0 ..< input_count(gate.type) {
			anchor := get_node_anchor(gate, input_spacings[i], false)
			gate.inputs[i].is_hovered = rl.CheckCollisionPointTriangle(
				mouse_position,
				get_triangle_points(anchor),
			)

			if gate.inputs[i].is_hovered && mouse_left_pressed {
				to_gate = &gate
				to_node_index = i
			}

			if gate.inputs[i].is_hovered && mouse_left_released && from_gate != nil {
				append(
					&wires,
					Wire {
						from_gate = from_gate,
						from_node_index = from_node_index,
						to_gate = &gate,
						to_node_index = i,
					},
				)
				simulate()
			}
		}

		output_spacings := get_spacings(output_count(gate.type))
		for i in 0 ..< output_count(gate.type) {
			anchor := get_node_anchor(gate, output_spacings[i], true)
			gate.outputs[i].is_hovered = rl.CheckCollisionPointTriangle(
				mouse_position,
				get_triangle_points(anchor),
			)

			if gate.outputs[i].is_hovered && mouse_left_pressed {
				from_gate = &gate
				from_node_index = i
			}

			if gate.outputs[i].is_hovered && mouse_left_released && to_gate != nil {
				append(
					&wires,
					Wire {
						from_gate = &gate,
						from_node_index = i,
						to_gate = to_gate,
						to_node_index = to_node_index,
					},
				)
				simulate()
			}
		}

		if gate.is_hovered && mouse_right_pressed && gate.type == .NAND {
			for wire, wire_index in wires {
				if wire.from_gate == &gate || wire.to_gate == &gate {
					unordered_remove(&wires, wire_index)
				}
			}

			unordered_remove(&gates, gate_index)
			simulate()
		}
	}

	for &wire, wire_index in wires {
		from_anchor := get_line_anchor(wire.from_gate^, wire.from_node_index, true)
		to_anchor := get_line_anchor(wire.to_gate^, wire.to_node_index, false)

		wire.is_hovered = check_collision_point_bezier(
			mouse_position,
			from_anchor,
			to_anchor,
			WIRE_WIDTH,
		)

		if wire.is_hovered && mouse_right_pressed {
			unordered_remove(&wires, wire_index)
			simulate()
		}
	}

	if shift_pressed && mouse_left_pressed {
		append(
			&gates,
			Gate {
				type = .NAND,
				rectangle = grid.snap(
					{
						mouse_position.x - NAND_WIDTH / 2,
						mouse_position.y - NAND_HEIGHT / 2,
						NAND_WIDTH,
						NAND_HEIGHT,
					},
					GRID_RECTANGLE,
					GRID_SPACING,
				),
			},
		)
		simulate()
	}

	if dragged_gate != nil {
		dragged_gate.rectangle.x = mouse_position.x - drag_offset.x
		dragged_gate.rectangle.y = mouse_position.y - drag_offset.y
		dragged_gate.rectangle = grid.snap(dragged_gate.rectangle, GRID_RECTANGLE, GRID_SPACING)
	}

	if mouse_left_released {
		if dragged_gate != nil {
			dragged_gate = nil
			drag_offset = {0, 0}
		} else {
			from_gate = nil
			from_node_index = 0
			to_gate = nil
			to_node_index = 0
		}
	}

	if rl.IsKeyPressed(.SPACE) {
		for &gate in gates {
			if gate.type == .INPUT && gate.label == .NONE {
				for i in 0 ..< output_count(gate.type) {
					gate.outputs[i].is_high = !gate.outputs[i].is_high
				}
			}
		}
		simulate()
	}

	if rl.IsKeyPressed(.ONE) {
		for &gate in gates {
			if gate.type == .INPUT && gate.label == .ALPHA {
				for i in 0 ..< output_count(gate.type) {
					gate.outputs[i].is_high = !gate.outputs[i].is_high
				}
			}
		}
		simulate()
	}

	if rl.IsKeyPressed(.TWO) {
		for &gate in gates {
			if gate.type == .INPUT && gate.label == .BETA {
				for i in 0 ..< output_count(gate.type) {
					gate.outputs[i].is_high = !gate.outputs[i].is_high
				}
			}
		}
		simulate()
	}
}

check_collision_point_bezier :: proc(point, start, end: rl.Vector2, thick: f32) -> bool {
	p1, c2, c3, p4 := get_bezier(start, end)

	threshold := i32(thick * 2)

	prev := start
	for i in 1 ..= BEZIER_SEGMENTS {
		t := f32(i) / f32(BEZIER_SEGMENTS)
		current := rl.GetSplinePointBezierCubic(p1, c2, c3, p4, t)

		if rl.CheckCollisionPointLine(point, prev, current, threshold) do return true
		prev = current
	}
	return false
}

get_bezier :: proc(start, end: rl.Vector2) -> (p1, c2, c3, p4: rl.Vector2) {
	handle := abs(end.x - start.x) * 0.5
	return start, {start.x + handle, start.y}, {end.x - handle, end.y}, end
}

simulate :: proc() {
	for _ in 0 ..< MAX_ITERATIONS {
		changed := false

		for wire in wires {
			src_high := wire.from_gate.outputs[wire.from_node_index].is_high
			dst_high := &wire.to_gate.inputs[wire.to_node_index].is_high

			if dst_high^ != src_high {
				dst_high^ = src_high
				changed = true
			}
		}

		for &gate in gates {
			switch gate.type {
			case .NAND:
				out := !(gate.inputs[0].is_high && gate.inputs[1].is_high)
				if gate.outputs[0].is_high != out {
					gate.outputs[0].is_high = out
					changed = true
				}
			case .INPUT:
				out := gate.outputs[0].is_high
				if gate.is_high != out {
					gate.is_high = out
					changed = true
				}
			case .OUTPUT:
				out := gate.inputs[0].is_high
				if gate.is_high != out {
					gate.is_high = out
					changed = true
				}
			case .NONE:
			}
		}

		if !changed do break
	}
}

draw :: proc() {
	rl.BeginDrawing()
	defer rl.EndDrawing()

	rl.ClearBackground(BACKGROUND)

	draw_line_grid(GRID_RECTANGLE, GRID_SPACING)

	rl.DrawRectangleRec({0, 0, SIDEBAR_WIDTH, SCREEN_HEIGHT}, SIDEBAR)
	rl.DrawRectangleRec({SCREEN_WIDTH - SIDEBAR_WIDTH, 0, SIDEBAR_WIDTH, SCREEN_HEIGHT}, SIDEBAR)

	for wire in wires {
		draw_wire(wire)
	}

	for gate in gates {
		draw_nodes(gate)
		draw_gate(gate)
	}

	if from_gate != nil {
		anchor := get_line_anchor(from_gate^, from_node_index, true)
		node := from_gate.outputs[from_node_index]
		p1, c2, c3, p4 := get_bezier(anchor, mouse_position)
		points := [4]rl.Vector2{p1, c2, c3, p4}
		rl.DrawSplineBezierCubic(
			raw_data(points[:]),
			4,
			WIRE_WIDTH,
			HIGH_COLOR if node.is_high else LOW_COLOR,
		)
	}

	if to_gate != nil {
		anchor := get_line_anchor(to_gate^, to_node_index, false)
		node := to_gate.inputs[to_node_index]
		p1, c2, c3, p4 := get_bezier(mouse_position, anchor)
		points := [4]rl.Vector2{p1, c2, c3, p4}
		rl.DrawSplineBezierCubic(
			raw_data(points[:]),
			4,
			WIRE_WIDTH,
			HIGH_COLOR if node.is_high else LOW_COLOR,
		)
	}

	if shift_pressed {
		rect := rl.Rectangle {
			mouse_position.x - NAND_WIDTH / 2,
			mouse_position.y - NAND_HEIGHT / 2,
			NAND_WIDTH,
			NAND_HEIGHT,
		}
		rect = grid.snap(rect, GRID_RECTANGLE, GRID_SPACING)
		draw_nand(rect, false, rl.Color{255, 255, 255, 128})
	}

	speech_rect := rl.Rectangle {
		50,
		SCREEN_HEIGHT - SCREEN_HEIGHT * 0.3 - 50,
		SCREEN_WIDTH - 100,
		SCREEN_HEIGHT * 0.3,
	}
	rl.DrawRectangleRec(speech_rect, rl.RAYWHITE)
	text.draw_text(
		font_texture,
		"Welcome to the wonderful world of circuits I am your host Professor Boolean",
		speech_rect,
		int(visible_chars),
	)
}

get_line_anchor :: proc(gate: Gate, node_index: int, is_right: bool) -> rl.Vector2 {
	spacings := get_spacings(output_count(gate.type) if is_right else input_count(gate.type))
	anchor := get_node_anchor(gate, spacings[node_index], is_right)
	if is_right do anchor.x += TRIANGLE_SIZE
	return anchor
}

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

draw_wire :: proc(wire: Wire) {
	from_anchor := get_line_anchor(wire.from_gate^, wire.from_node_index, true)
	from_node := wire.from_gate.outputs[wire.from_node_index]

	to_anchor := get_line_anchor(wire.to_gate^, wire.to_node_index, false)

	color: rl.Color
	if wire.is_hovered {
		color = HIGH_HOVER_COLOR if from_node.is_high else LOW_HOVER_COLOR
	} else {
		color = HIGH_COLOR if from_node.is_high else LOW_COLOR
	}
	p1, c2, c3, p4 := get_bezier(from_anchor, to_anchor)
	points := [4]rl.Vector2{p1, c2, c3, p4}
	rl.DrawSplineBezierCubic(raw_data(points[:]), 4, WIRE_WIDTH, color)
}

draw_nodes :: proc(gate: Gate) {
	input_spacings := get_spacings(input_count(gate.type))
	for i in 0 ..< input_count(gate.type) {
		draw_node(gate, gate.inputs[i], input_spacings[i], false)
	}

	output_spacings := get_spacings(output_count(gate.type))
	for i in 0 ..< output_count(gate.type) {
		draw_node(gate, gate.outputs[i], output_spacings[i], true)
	}
}

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

draw_node :: proc(gate: Gate, node: Node, spacing: f32, is_right: bool) {
	offset_x: f32 = 8 if node.is_high else 0
	offset_y: f32 = 8 if node.is_hovered else 0

	anchor := get_node_anchor(gate, spacing, is_right)

	rl.DrawTexturePro(
		wires_texture,
		{offset_x, offset_y, 8, 8},
		{anchor.x, anchor.y - TRIANGLE_SIZE / 2, TRIANGLE_SIZE, TRIANGLE_SIZE},
		{0, 0},
		0,
		rl.WHITE,
	)
}

get_node_anchor :: proc(gate: Gate, spacing: f32, is_right: bool) -> rl.Vector2 {
	anchor := rl.Vector2{gate.rectangle.x, gate.rectangle.y + gate.rectangle.height * spacing}
	if is_right {
		anchor.x += gate.rectangle.width
	} else {
		anchor.x -= TRIANGLE_SIZE
	}
	return anchor
}

get_triangle_points :: proc(anchor: rl.Vector2) -> (rl.Vector2, rl.Vector2, rl.Vector2) {
	p1 := rl.Vector2{anchor.x, anchor.y - TRIANGLE_SIZE}
	p2 := rl.Vector2{anchor.x, anchor.y + TRIANGLE_SIZE}
	p3 := rl.Vector2{anchor.x + TRIANGLE_SIZE, anchor.y}
	return p1, p2, p3
}


draw_gate :: proc(gate: Gate) {
	switch gate.type {
	case .INPUT:
		offset_x: f32 = 0
		if gate.label == .ALPHA {
			offset_x = 16
		} else if gate.label == .BETA {
			offset_x = 32
		}

		offset_y: f32 = 32 if gate.is_high else 0
		offset_y += 16 if gate.is_hovered else 0
		rl.DrawTexturePro(
			terminals_texture,
			{offset_x, offset_y, 16, 16},
			gate.rectangle,
			{0, 0},
			0,
			rl.WHITE,
		)
	case .OUTPUT:
		offset_y: f32 = 32 if gate.is_high else 0
		offset_y += 16 if gate.is_hovered else 0
		rl.DrawTexturePro(
			terminals_texture,
			{0, offset_y, 16, 16},
			gate.rectangle,
			{0, 0},
			0,
			rl.WHITE,
		)
	case .NAND:
		draw_nand(gate.rectangle, gate.is_hovered, rl.WHITE)
	case .NONE:
		panic("Invalid gate type")
	}
}

draw_nand :: proc(rect: rl.Rectangle, is_hovered: bool, color: rl.Color = rl.WHITE) {
	offset_y: f32 = 16 if is_hovered else 0
	rl.DrawTexturePro(gates_texture, {0, offset_y, 24, 16}, rect, {0, 0}, 0, color)
}
