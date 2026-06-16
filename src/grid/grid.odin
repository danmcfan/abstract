package grid

import "core:math"
import rl "vendor:raylib"

snap :: proc(rect: rl.Rectangle, bounds: rl.Rectangle, spacing: f32) -> rl.Rectangle {
	r := rect

	r.x = math.round((r.x - bounds.x) / spacing) * spacing + bounds.x
	r.y = math.round((r.y - bounds.y) / spacing) * spacing + bounds.y

	r.x = clamp(r.x, bounds.x, bounds.x + bounds.width - r.width)
	r.y = clamp(r.y, bounds.y, bounds.y + bounds.height - r.height)

	return r
}
