package engine

import rl "vendor:raylib"

TERMINALS_PNG :: #load("assets/terminals.png")
GATES_PNG :: #load("assets/gates.png")
WIRES_PNG :: #load("assets/wires.png")
FONT_PNG :: #load("assets/font.png")

Textures :: struct {
	terminals: rl.Texture,
	gates:     rl.Texture,
	wires:     rl.Texture,
	font:      rl.Texture,
}

new_textures :: proc() -> Textures {
	return Textures {
		terminals = load_texture_from_memory(TERMINALS_PNG),
		gates = load_texture_from_memory(GATES_PNG),
		wires = load_texture_from_memory(WIRES_PNG),
		font = load_texture_from_memory(FONT_PNG),
	}
}

destroy_textures :: proc(textures: ^Textures) {
	rl.UnloadTexture(textures.terminals)
	rl.UnloadTexture(textures.gates)
	rl.UnloadTexture(textures.wires)
	rl.UnloadTexture(textures.font)
}

load_texture_from_memory :: proc(data: []u8) -> rl.Texture {
	image := rl.LoadImageFromMemory(".png", raw_data(data), i32(len(data)))
	defer rl.UnloadImage(image)
	return rl.LoadTextureFromImage(image)
}
