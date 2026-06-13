package main

import rl "vendor:raylib"

screen_width :: 800
screen_height :: 600

x_offset_min: i32 = -100
x_offset_max: i32 = 100

main :: proc() {
	rl.InitWindow(screen_width, screen_height, "Abstract")
	defer rl.CloseWindow()

	rl.SetTargetFPS(60)

	x_offset: i32 = 0
	x_increment: i32 = 1

	for !rl.WindowShouldClose() {
		x_offset += x_increment

		if x_offset > x_offset_max {
			x_increment = -1
		} else if x_offset < x_offset_min {
			x_increment = 1
		}

		rl.BeginDrawing()

		rl.ClearBackground(rl.RAYWHITE)
		rl.DrawText("some basic shapes available in raylib", 20, 20, 20, rl.DARKGRAY)

		rl.DrawLine(18, 42, screen_width - 18, 42, rl.BLACK)

		rl.DrawCircle(screen_width / 2 + x_offset, screen_height / 2, 100, rl.RED)

		rl.EndDrawing()
	}
}
