# best-flight-game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Agus12341/best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Agus12341/best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Skyward Post** is a chase-view flight game for the desktop browser. You fly a little mail
plane over patchwork country, threading golden rings for points. Rings pay more in a streak,
a near miss still pays a little, and the flight ends when the hull does: birds and radio
towers each cost a point of hull, and three hits put you in a field. The speed builds the
longer you stay up, the rings wander further from the easy line, and wind gusts shove the
plane sideways with only a second of warning.

On screen you get the plane in frame with a lit instrument panel (airspeed, artificial
horizon, altimeter), digital ALT / SPD / HDG / DIST readouts, a compass tape, hull hearts,
and a streak counter. Synthesized sound throughout: a propeller engine that follows the
airspeed, a chime for each ring, a whoosh for a near miss and a thud for a hit.

## Controls

- **Arrow keys or WASD**: steer left and right, climb and dive
- **Mouse**: the plane steers toward the pointer
- **Shift**: boost (faster, and the view leans in)
- **Space or Enter, or click**: start, restart, resume
- **P or Esc**: pause

## Run it

```sh
node serve.ts
```

then open http://localhost:8080. The game is plain static files under `game/` with no build
step and no network request; any static file server works just as well.

To hand the entry in the way the grader runs it (copies `game/` and `screenshots/` and
writes `dossier.json` to the output directory):

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots are real captures of the game itself, staged deterministically with
`game/index.html?shot=start|play|end&seed=1`, the same scenes a short flight produces.

## License

MIT, see `LICENSE`.
