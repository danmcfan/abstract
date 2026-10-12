// The robot's moods, from the vision board's expression sheet. Each one is a
// looping clip: a face on its screen and a way of holding itself.
export const EXPRESSIONS = ["idle", "happy", "worried", "thinking", "error", "sleepy", "amazed", "loading"] as const;

export type Expression = (typeof EXPRESSIONS)[number];
