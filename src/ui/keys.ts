const FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// Whether a key pressed on this target belongs to a field the player is typing in.
export const isTyping = (target: object | null): boolean =>
  target !== null &&
  (("isContentEditable" in target && target.isContentEditable === true) ||
    ("tagName" in target && typeof target.tagName === "string" && FIELDS.has(target.tagName)));
