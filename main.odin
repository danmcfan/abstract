package main

import rl "vendor:raylib"

DEBUG :: false

screen_width :: 1600
screen_height :: 900

input_circle :: Circle{rl.Vector2{80, screen_height / 2}, 10}
top_wire_rect :: rl.Rectangle{screen_width / 2 - 20, 70, 40, screen_height / 2 - 140}
transistor_rect :: rl.Rectangle{screen_width / 2 - 25, screen_height / 2 - 50, 50, 100}
bottom_wire_rect :: rl.Rectangle {
	screen_width / 2 - 20,
	screen_height / 2 + 70,
	40,
	screen_height / 2 - 140,
}
output_circle :: Circle{rl.Vector2{screen_width - 80, screen_height / 2}, 10}

nodes: [5]Node
connections: [dynamic]Connection

is_position_clicked := false
clicked_position := rl.Vector2{}
Circle :: struct {
	center: rl.Vector2,
	radius: f32,
}

Connection :: struct {
	start: rl.Vector2,
	end:   rl.Vector2,
}

Node :: struct {
	rect:     rl.Rectangle,
	circle:   Circle,
	position: rl.Vector2,
}

main :: proc() {
	if !DEBUG {
		rl.SetTraceLogLevel(.NONE)
	}

	rl.InitWindow(screen_width, screen_height, "Abstract")
	defer rl.CloseWindow()

	rl.SetTargetFPS(60)

	nodes = [5]Node {
		{circle = input_circle, position = input_circle.center},
		{rect = top_wire_rect, position = rectangle_center(top_wire_rect)},
		{rect = transistor_rect, position = rectangle_center(transistor_rect)},
		{rect = bottom_wire_rect, position = rectangle_center(bottom_wire_rect)},
		{circle = output_circle, position = output_circle.center},
	}

	connections = make([dynamic]Connection)
	defer delete(connections)

	for !rl.WindowShouldClose() {
		update()
		draw()
	}
}

update :: proc() {
	mouse_position := rl.GetMousePosition()

	if rl.IsMouseButtonPressed(.LEFT) {
		for node in nodes {
			if node.rect.width > 0 && node.rect.height > 0 {
				if rl.CheckCollisionPointRec(mouse_position, node.rect) {
					is_position_clicked = true
					clicked_position = node.position
					return
				}
			}
			if node.circle.radius > 0 {
				if rl.CheckCollisionPointCircle(
					mouse_position,
					node.circle.center,
					node.circle.radius,
				) {
					is_position_clicked = true
					clicked_position = node.position
					return
				}
			}
		}
	}

	if rl.IsMouseButtonReleased(.LEFT) {
		if !is_position_clicked do return
		is_position_clicked = false
		for node in nodes {
			if node.rect.width > 0 && node.rect.height > 0 {
				if rl.CheckCollisionPointRec(mouse_position, node.rect) {
					append(&connections, Connection{clicked_position, node.position})
					return
				}
			}
			if node.circle.radius > 0 {
				if rl.CheckCollisionPointCircle(
					mouse_position,
					node.circle.center,
					node.circle.radius,
				) {
					append(&connections, Connection{clicked_position, node.position})
					return
				}
			}
		}
	}
}

draw :: proc() {
	mouse_position := rl.GetMousePosition()

	rl.BeginDrawing()

	rl.ClearBackground(rl.BLACK)

	input_text_position := rl.Vector2{input_circle.center.x, input_circle.center.y - 40}
	input_text_position = center_text("in", 20, input_text_position)

	input_circle_color := rl.LIGHTGRAY
	if rl.CheckCollisionPointCircle(mouse_position, input_circle.center, input_circle.radius) {
		input_circle_color = rl.WHITE
	}

	rl.DrawText(
		"in",
		i32(input_text_position.x),
		i32(input_text_position.y),
		20,
		input_circle_color,
	)
	rl.DrawCircleV(input_circle.center, input_circle.radius, input_circle_color)

	output_text_position := rl.Vector2{output_circle.center.x, output_circle.center.y - 40}
	output_text_position = center_text("out", 20, output_text_position)


	output_circle_color := rl.LIGHTGRAY
	if rl.CheckCollisionPointCircle(mouse_position, output_circle.center, output_circle.radius) {
		output_circle_color = rl.WHITE
	}

	rl.DrawText(
		"out",
		i32(output_text_position.x),
		i32(output_text_position.y),
		20,
		output_circle_color,
	)
	rl.DrawCircleV(output_circle.center, output_circle.radius, output_circle_color)

	rl.DrawLineEx(
		rl.Vector2{screen_width / 2, 40},
		rl.Vector2{screen_width / 2, screen_height / 2},
		4,
		rl.YELLOW,
	)

	rl.DrawLineEx(
		rl.Vector2{screen_width / 2, screen_height / 2},
		rl.Vector2{screen_width / 2, screen_height - 40},
		4,
		rl.LIGHTGRAY,
	)

	rects := []rl.Rectangle{top_wire_rect, bottom_wire_rect}

	if DEBUG {
		for rect in rects {
			rl.DrawRectangleRec(rect, rl.Color{255, 255, 255, 64})
		}
	}

	for rect in rects {
		if rl.CheckCollisionPointRec(mouse_position, rect) {
			rl.DrawCircle(screen_width / 2, i32(mouse_position.y), 10, rl.WHITE)
		}
	}

	if is_position_clicked {
		color := rl.Color{255, 255, 255, 64}
		if clicked_position == rectangle_center(top_wire_rect) do color = rl.Color{253, 249, 0, 64}
		rl.DrawLineBezier(clicked_position, mouse_position, 4, color)
	}

	for connection in connections {
		color := rl.WHITE
		if connection.start == rectangle_center(top_wire_rect) || connection.end == rectangle_center(top_wire_rect) do color = rl.YELLOW
		rl.DrawLineBezier(connection.start, connection.end, 4, color)
	}

	rl.DrawCircle(screen_width / 2, 40, 20, rl.YELLOW)
	rl.DrawCircle(screen_width / 2, screen_height - 40, 20, rl.DARKGRAY)

	transistor_rect_color := rl.LIGHTGRAY
	if rl.CheckCollisionPointRec(mouse_position, transistor_rect) {
		transistor_rect_color = rl.WHITE
	}

	rl.DrawRectangleRec(transistor_rect, transistor_rect_color)

	rl.EndDrawing()
}

rectangle_center :: proc(rect: rl.Rectangle) -> rl.Vector2 {
	return rl.Vector2{rect.x + rect.width / 2, rect.y + rect.height / 2}
}

center_text :: proc(text: cstring, font_size: i32, position: rl.Vector2) -> rl.Vector2 {
	return rl.Vector2{position.x - f32(rl.MeasureText(text, font_size)) / 2, position.y}
}
