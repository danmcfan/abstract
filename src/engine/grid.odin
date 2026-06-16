package engine

import "core:math"
import rl "vendor:raylib"

GRID_RECTANGLE :: rl.Rectangle{SIDEBAR_WIDTH, 0, SCREEN_WIDTH - SIDEBAR_WIDTH * 2, SCREEN_HEIGHT}
GRID_SPACING :: 20

snap :: proc(rect: rl.Rectangle) -> rl.Rectangle {
	r := rect
	bounds := GRID_RECTANGLE
	spacing: f32 = GRID_SPACING

	r.x = math.round((r.x - bounds.x) / spacing) * spacing + bounds.x
	r.y = math.round((r.y - bounds.y) / spacing) * spacing + bounds.y

	r.x = clamp(r.x, bounds.x, bounds.x + bounds.width - r.width)
	r.y = clamp(r.y, bounds.y, bounds.y + bounds.height - r.height)

	return r
}
