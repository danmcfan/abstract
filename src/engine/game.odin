package engine

import rl "vendor:raylib"

DEBUG :: false

SCREEN_WIDTH :: 1600
SCREEN_HEIGHT :: 900
FPS :: 60

TIME_STEP :: 1.0 / FPS

Game :: struct {
	nodes: map[NodeID]Node,
	edges: map[EdgeID]Edge,
}

init_window :: proc() {
	if !DEBUG do rl.SetTraceLogLevel(.NONE)
	rl.InitWindow(SCREEN_WIDTH, SCREEN_HEIGHT, "Layers of Abstraction")
	rl.SetTargetFPS(FPS)
}

close_window :: proc() {
	rl.CloseWindow()
}

new_game :: proc() -> Game {
	game := Game{}
	return game
}

destroy_game :: proc(game: ^Game) {
	delete(game.nodes)
	delete(game.edges)
}

run_loop :: proc(game: ^Game, textures: Textures) {
	accumulator: f32 = 0
	for !rl.WindowShouldClose() {
		accumulator += rl.GetFrameTime()
		for accumulator > TIME_STEP {
			update(game)
			accumulator -= TIME_STEP
		}

		draw(game, textures)
	}
}
