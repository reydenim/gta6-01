[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![make.fun rank](https://make.fun/badge/gta6-01/reydenim/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![make.fun reward](https://make.fun/badge/gta6-01/reydenim/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar City

A 3D open-world crime game built for [make.fun's "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) — a sun-soaked coastal metropolis where a newcomer driver takes jobs, steals cars, and tries not to get caught by the Solmar PD. All original: no Rockstar names, characters, maps, art, or music anywhere.

## How to play

Open `game/index.html` in a desktop browser (or serve the repo with `node serve.ts` and open http://localhost:8080). No network requests, no build step.

- **WASD** move / drive, **mouse drag** orbit the camera, **SHIFT** run
- **E** steal a car / get out / start a job at the Marina Garage
- **SPACE** brake, **F** punch, **ESC** pause, **M** mute

## What's in it

- A 5x5-block city with a road grid, traffic lights of buildings, neon signs, palm trees, landmarks (Marina Garage, Harbor Cafe, Palm Hotel, Neon Club, Sunset Motors), and a beach on the east side
- On-foot third-person play and drivable cars (sedans, taxis, vans, a sports car, police cruisers) with arcade physics, spinning wheels, and steering
- AI traffic on the road grid and pedestrians on the sidewalks who flee when scared
- A wanted system (0-5 stars): stealing cars, hitting pedestrians, and ramming police raise it; police cruisers chase and ram you, officers try to bust you on foot; it decays when you stay out of sight
- A 3-mission story: Danny, new in town, takes jobs from Mara at the Marina Garage — a delivery, a pickup, and a getaway from the police — with map markers, objectives, and cash rewards
- HUD with a live minimap (streets, player arrow, traffic, police, mission marker), wanted stars, health, money, speed, and objective text
- Start screen, pause, and localStorage saves (money, missions completed, best wanted level)
- Procedural WebAudio only: engine hum, sirens, pickups, impacts, and a simple music loop — no audio files

## Tech

- Three.js r160 (vendored minified under `game/vendor/`), plain ES modules, system fonts, canvas-generated textures
- One clear job per source file under `game/src/`: `city`, `player`, `vehicles`, `traffic`, `police`, `missions`, `hud`, `audio`, `save`, `game`, `main`, `util`

Built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC.
