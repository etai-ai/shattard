# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SHATTARD: Awaken is a browser-based arcade game built with vanilla JavaScript and HTML5 Canvas 2D. No build tools, no dependencies, no frameworks.

## Running the Game

Open `index.html` in a browser. There is no build step, package manager, or dev server. For live reload during development, use any static file server (e.g., `python -m http.server` or VS Code Live Server).

## Architecture

Three-file structure:

- **`index.html`**: HTML markup only — two canvases (`#rain` for background, `#gameCanvas` for gameplay), three screens (`#titleScreen`, `#hud` + game, `#gameOver`) toggled via `.hidden` class, flash overlay, scanlines. Inline `onclick` handlers reference functions in `game.js`. Loads CrazyGames SDK (async), `styles.css`, and `game.js`.
- **`styles.css`**: Matrix-green theme via CSS variables (`--matrix-green`, `--glow`, etc.), screen transitions, HUD, scanline overlay, slow-mo bar, tutorial, pause overlay, wave announcements, near-miss text. Fonts: Share Tech Mono + Orbitron (Google Fonts via `@import`).
- **`game.js`**: All game logic — CrazyGames SDK wrapper, persistent stats (localStorage), matrix rain background, game state, entity spawning (good/bad/power/splitter/cluster), input (touch + mouse), pause, audio (Web Audio API sfx), tutorial animations, wave system, game loop (`requestAnimationFrame` → `gameLoop` → `update` → `render`), collision (distance-based via `Math.hypot`), rendering (vignette, entity trails, glyph text with glow, particle system, player as layered geometry avatar).

## Key Game Constants

- `PLAYER_SIZE = 31`, `MAX_LIVES = 3`, `SLOW_MO_DURATION = 3000ms`
- `NEAR_MISS_RADIUS = 1.7`, `NEAR_MISS_SCORE = 25`
- Score formula: `10 × (1 + combo × 0.5)` per good glyph collected
- Power-ups: 4% chance per spawn cycle, cyan (`#00ffff`), refills slow-mo energy

## Entity Types

- **Good glyphs**: green (`#00ff41`), collect for points + combo. Spawn ratio varies by wave (55% in wave 1 → 25% minimum).
- **Bad glyphs**: red (`#ff3333`), dodge or lose a life. Reset combo on hit.
- **Splitter glyphs**: larger bad entities (⬢) that split into 2–4 smaller threats at 45% screen height. Appear from wave 5+.
- **Power-ups**: cyan hexagon (`#00ffff`), refills slow-mo energy and grants 50 bonus points.

## Wave System

8 predefined waves with escalating difficulty, then infinite dynamic waves. Each wave defines:
- `sr`: spawn rate interval (0.65s → 0.15s minimum)
- `gr`: good glyph ratio (55% → 25% minimum)
- `sm`: speed multiplier (0.8× → 1.5×+)
- `pat`: available patterns — `normal`, `zigzag`, `cluster`, `splitter`
- `br`: breather duration between waves (3–5s), player regains 1 life if below max

Difficulty is wave-based: `difficulty = currentWave + (waveTimer / waveDuration) * 0.5`

## Key Features

- **Near-miss system**: passing within 1.7× hit distance of a bad glyph scores 25 bonus points with visual/audio feedback
- **Tutorial**: 4-step interactive tutorial on first play (move, collect, dodge, bullet time), stored in localStorage
- **Pause**: P key or HUD button, with resume/quit options
- **Persistent stats**: lifetime stats tracked in localStorage (games played, best score, highest wave, total collected/dodged, etc.)
- **Screen shake**: camera shake on taking damage
- **Player trail**: ghostly echo effect when moving fast
- **Slow-mo radar ring**: expanding ring visual during bullet time
- **Audio**: Web Audio API oscillator-based sfx. Uses `navigator.audioSession.type = 'playback'` (iOS 17+) to bypass the hardware mute switch. AudioContext created inside user gesture (`startGame` onclick) for reliable iOS unlock. Re-resumes on touchend/click/visibilitychange.
- **CrazyGames SDK**: loaded async; ad integration (midgame ads after game over), score persistence, happytime triggers. All calls are no-ops when SDK is unavailable (e.g. GitHub Pages).

## Repository

- GitHub: https://github.com/etai-ai/shattard.git
- Branch: master
- Deployed via GitHub Pages
