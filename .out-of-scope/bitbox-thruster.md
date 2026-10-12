# Bitbox's thruster

Bitbox doesn't get a thruster, and nothing in the game coughs, sputters or puffs from one.

## Why this is out of scope

The vision board's first draft gave the robot a thruster that coughs when the board short-circuits (now called **unstable**). Bitbox as built is a crate robot on a tread, with no thruster on the model. Adding one would mean new geometry on the 3D model, a new clip, and lighting or particle work for the cough, all for one small reaction to one state.

Bitbox already has a way to react to an unstable board: his `error` expression, which has its own face and clip, says the line that explains what went wrong. That reaction reads clearly, costs nothing new, and keeps every reaction in one system (expressions and clips) instead of adding a one-off effect.

The vision board's "Motion and sound" sheet no longer mentions the thruster. The unstable sound cue is a buzz and a pop.

## Prior requests

- #26: "Motion" (the thruster cough item was dropped in triage)
