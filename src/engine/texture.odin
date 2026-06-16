package engine

import rl "vendor:raylib"

Textures :: struct {
	terminals: rl.Texture,
	gates:     rl.Texture,
	wires:     rl.Texture,
	font:      rl.Texture,
}

new_textures :: proc() -> Textures {
	return Textures {
		terminals = rl.LoadTexture("assets/terminals.png"),
		gates = rl.LoadTexture("assets/gates.png"),
		wires = rl.LoadTexture("assets/wires.png"),
		font = rl.LoadTexture("assets/font.png"),
	}
}

destroy_textures :: proc(textures: ^Textures) {
	rl.UnloadTexture(textures.terminals)
	rl.UnloadTexture(textures.gates)
	rl.UnloadTexture(textures.wires)
	rl.UnloadTexture(textures.font)
}
