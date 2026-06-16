package engine

import rl "vendor:raylib"

TERMINAL_WIDTH :: 64
TERMINAL_HEIGHT :: 64

GATE_WIDTH :: 96
GATE_HEIGHT :: 64

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
	case .NOT, .OR, .NOR, .AND, .NAND, .XOR, .XNOR:
		width, height = GATE_WIDTH, GATE_HEIGHT
	case:
		panic("Invalid node type")
	}

	rect := rl.Rectangle{center.x - width / 2, center.y - height / 2, width, height}
	rect = snap(rect)
	return rect
}

draw_node :: proc(textures: Textures, node: Node) {
	texture: rl.Texture
	width, height: f32
	row, col: f32

	#partial switch node.type {
	case .INPUT, .OUTPUT:
		texture = textures.terminals
		width, height = 16, 16

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
		width, height = 24, 16

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

	rl.DrawTexturePro(
		texture,
		{col * width, row * height, width, height},
		node.rect,
		{0, 0},
		0,
		rl.WHITE,
	)
}
