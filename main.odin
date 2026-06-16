package main

import "src/engine"

main :: proc() {
	SCREEN_WIDTH: f32 = engine.SCREEN_WIDTH
	SCREEN_HEIGHT: f32 = engine.SCREEN_HEIGHT
	SIDEBAR_WIDTH: f32 = engine.SIDEBAR_WIDTH

	engine.init_window()
	defer engine.close_window()

	game := engine.new_game()
	defer engine.destroy_game(&game)

	textures := engine.new_textures()
	defer engine.destroy_textures(&textures)

	engine.add_node(&game, .INPUT, {SIDEBAR_WIDTH + 100, SCREEN_HEIGHT * 0.25}, .ALPHA)
	engine.add_node(&game, .INPUT, {SIDEBAR_WIDTH + 100, SCREEN_HEIGHT * 0.75}, .BETA)

	engine.add_node(&game, .OUTPUT, {SCREEN_WIDTH - SIDEBAR_WIDTH - 100, SCREEN_HEIGHT * 0.5})

	engine.add_node(&game, .NOT, {SCREEN_WIDTH * 0.5, SCREEN_HEIGHT * 0.25})
	engine.add_node(&game, .NAND, {SCREEN_WIDTH * 0.5, SCREEN_HEIGHT * 0.5})
	engine.add_node(&game, .XOR, {SCREEN_WIDTH * 0.5, SCREEN_HEIGHT * 0.75})

	engine.run_loop(&game, textures)
}
