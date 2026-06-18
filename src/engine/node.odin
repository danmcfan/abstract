package engine

import rl "vendor:raylib"

NODE_SCALE :: 4
EDGE_SCALE :: 2

TERMINAL_WIDTH :: 16
TERMINAL_HEIGHT :: 16

GATE_WIDTH :: 20
GATE_HEIGHT :: 16

INVERT_WIDTH :: 4

CONNECTION_WIDTH :: 8
CONNECTION_HEIGHT :: 8

NodeID :: distinct int
EdgeID :: distinct int

node_id_counter: NodeID = 0
edge_id_counter: EdgeID = 0

NodeType :: enum {
	INPUT,
	OUTPUT,
	NOT,
	OR,
	NOR,
	AND,
	NAND,
	XOR,
	XNOR,
}

Label :: enum {
	NONE,
	ALPHA,
	BETA,
}

Node :: struct {
	id:         NodeID,
	type:       NodeType,
	label:      Label,
	rect:       rl.Rectangle,
	is_hovered: bool,
	is_high:    bool,
	edges:      [dynamic]EdgeID,
}

Edge :: struct {
	id:         EdgeID,
	from:       NodeID,
	from_index: int,
	to:         NodeID,
	to_index:   int,
	is_hovered: bool,
	is_high:    bool,
}

add_node :: proc(game: ^Game, type: NodeType, center: rl.Vector2, label: Label = .NONE) {
	node := new_node(type, center, label)
	game.nodes[node.id] = node
}

delete_node :: proc(game: ^Game, id: NodeID) {
	node := game.nodes[id]
	for edge in node.edges {
		delete_key(&game.edges, edge)
	}
	delete_key(&game.nodes, id)
}

new_node :: proc(type: NodeType, center: rl.Vector2, label: Label = .NONE) -> Node {
	node := Node {
		id    = node_id_counter,
		type  = type,
		label = label,
		rect  = get_node_rectangle(type, center),
	}
	node_id_counter += 1
	return node
}

get_node_rectangle :: proc(type: NodeType, center: rl.Vector2) -> rl.Rectangle {
	width, height: f32
	switch type {
	case .INPUT, .OUTPUT:
		width, height = TERMINAL_WIDTH, TERMINAL_HEIGHT
	case .OR, .AND, .XOR:
		width, height = GATE_WIDTH, GATE_HEIGHT
	case .NOT, .NOR, .NAND, .XNOR:
		width, height = GATE_WIDTH + INVERT_WIDTH, GATE_HEIGHT
	case:
		panic("Invalid node type")
	}

	rect := rl.Rectangle {
		center.x - width * NODE_SCALE / 2,
		center.y - height * NODE_SCALE / 2,
		width * NODE_SCALE,
		height * NODE_SCALE,
	}
	rect = snap(rect)
	return rect
}

draw_node :: proc(textures: Textures, node: Node) {
	texture: rl.Texture
	width, height: f32
	col_width, row_height: f32
	row, col: f32

	#partial switch node.type {
	case .INPUT, .OUTPUT:
		texture = textures.terminals
		width, height = TERMINAL_WIDTH, TERMINAL_HEIGHT
		col_width, row_height = TERMINAL_WIDTH, TERMINAL_HEIGHT

		switch node.label {
		case .NONE:
			col = 0
		case .ALPHA:
			col = 1
		case .BETA:
			col = 2
		}

		row = 0
		if node.is_high do row += 2
		if node.is_hovered do row += 1

	case .NOT, .OR, .NOR, .AND, .NAND, .XOR, .XNOR:
		texture = textures.gates
		col_width, row_height = GATE_WIDTH + INVERT_WIDTH, GATE_HEIGHT

		#partial switch node.type {
		case .NOT, .NOR, .NAND, .XNOR:
			width, height = GATE_WIDTH + INVERT_WIDTH, GATE_HEIGHT
		case .OR, .AND, .XOR:
			width, height = GATE_WIDTH, GATE_HEIGHT
		}

		#partial switch node.type {
		case .NOT:
			col = 0
		case .OR:
			col = 1
		case .NOR:
			col = 2
		case .AND:
			col = 3
		case .NAND:
			col = 4
		case .XOR:
			col = 5
		case .XNOR:
			col = 6
		}

		row = 0
		if node.is_hovered do row += 1
	case:
		panic("Invalid node type")
	}

	draw_connections(textures, node)

	rl.DrawTexturePro(
		texture,
		{col * col_width, row * row_height, width, height},
		node.rect,
		{0, 0},
		0,
		rl.WHITE,
	)
}

draw_connections :: proc(textures: Textures, node: Node) {
	input_count := input_count(node.type)
	spacing_factor := 1.0 / f32(input_count + 1)
	for i in 1 ..= input_count {
		spacing := spacing_factor * f32(i) * node.rect.height
		rl.DrawTexturePro(
			textures.wires,
			{0, 0, -8, 8},
			{
				node.rect.x - (CONNECTION_WIDTH * EDGE_SCALE),
				node.rect.y + spacing - (CONNECTION_HEIGHT * EDGE_SCALE) / 2,
				CONNECTION_WIDTH * EDGE_SCALE,
				CONNECTION_HEIGHT * EDGE_SCALE,
			},
			{0, 0},
			0,
			rl.WHITE,
		)
	}

	output_count := output_count(node.type)
	spacing_factor = 1.0 / f32(output_count + 1)
	for i in 1 ..= output_count {
		spacing := spacing_factor * f32(i) * node.rect.height
		rl.DrawTexturePro(
			textures.wires,
			{0, 0, 8, 8},
			{
				node.rect.x + node.rect.width,
				node.rect.y + spacing - (CONNECTION_HEIGHT * EDGE_SCALE) / 2,
				CONNECTION_WIDTH * EDGE_SCALE,
				CONNECTION_HEIGHT * EDGE_SCALE,
			},
			{0, 0},
			0,
			rl.WHITE,
		)
	}
}

input_count :: proc(type: NodeType) -> int {
	switch type {
	case .INPUT:
		return 0
	case .OUTPUT:
		return 1
	case .NOT:
		return 1
	case .OR, .NOR, .AND, .NAND, .XOR, .XNOR:
		return 2
	case:
		panic("Invalid node type")
	}
}

output_count :: proc(type: NodeType) -> int {
	switch type {
	case .INPUT:
		return 1
	case .OUTPUT:
		return 0
	case .NOT:
		return 1
	case .OR, .NOR, .AND, .NAND, .XOR, .XNOR:
		return 1
	case:
		panic("Invalid node type")
	}
}
