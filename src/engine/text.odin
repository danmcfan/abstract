package engine

import "core:strings"
import rl "vendor:raylib"

CHAR_WIDTH :: 7
CHAR_HEIGHT :: 8

SPACE_WIDTH :: 4
GAP_WIDTH :: 1
SCALE :: 6

draw_text :: proc(texture: rl.Texture, text: string, rect: rl.Rectangle, visible: int = -1) {
	text_lower := strings.to_lower(text, context.temp_allocator)
	words := strings.split(text_lower, " ", context.temp_allocator)

	padding: f32 = SPACE_WIDTH * SCALE / 2
	max_x := rect.x + rect.width - padding
	max_y := rect.y + rect.height - padding

	x := rect.x + padding
	y := rect.y + padding
	chars_drawn := 0

	for word in words {
		word_width: f32 = 0
		for c in word {
			word_width += char_advance(c)
		}
		word_width += char_advance(' ')

		if x + word_width > max_x && x > rect.x + padding {
			x = rect.x + padding
			y += line_height()
		}
		if y + line_height() > max_y do break

		for c in word {
			if visible >= 0 && chars_drawn >= visible do return
			draw_char(texture, c, &x, y)
			chars_drawn += 1
		}

		if visible >= 0 && chars_drawn >= visible do return
		x += char_advance(' ')
		chars_drawn += 1
	}
}

char_advance :: proc(char: rune) -> f32 {
	if char == ' ' do return f32((SPACE_WIDTH + GAP_WIDTH) * SCALE)
	if char < 'a' || char > 'z' do return 0

	char_width: f32 = 5
	if char == 'i' do char_width = 3
	if char == 'm' do char_width = 7
	if char == 'w' do char_width = 9
	if char == 'z' do char_width = 6

	return f32((char_width + GAP_WIDTH) * SCALE)
}

line_height :: proc() -> f32 {
	return f32((CHAR_HEIGHT + 4) * SCALE)
}

draw_char :: proc(texture: rl.Texture, char: rune, x: ^f32, y: f32) {
	if char < 'a' || char > 'z' do return

	char_width: f32 = 5
	if char == 'i' do char_width = 3
	if char == 'm' do char_width = 7
	if char == 'w' do char_width = 9
	if char == 'z' do char_width = 6

	index := int(char - 'a')
	row := index / 9
	col := index % 9
	if char > 'w' do col += 1

	rl.DrawTexturePro(
		texture,
		{f32(col * CHAR_WIDTH), f32(row * CHAR_HEIGHT), char_width, CHAR_HEIGHT},
		{x^, y, char_width * SCALE, CHAR_HEIGHT * SCALE},
		{0, 0},
		0,
		rl.WHITE,
	)
	x^ += char_advance(char)
}
