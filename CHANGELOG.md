The **major** version number in my modules (like "12") always reflects the
Foundry VTT **core** version it is compatible with (and recommended for).

## 12.0.2
### 2025-08-05 - Just a note on v13 NON-compatibility
- This "dummy" update is only a note that this module will NOT be v13-compatible for now. Due to heavy changes in v13, do NOT await it soon!
- Feel free to follow the related ticket: [#6](https://github.com/coffiarts/FoundryVTT-lock-the-sheets/issues/6)

## 12.0.1
### 2024-10-06 - Hotfix for dsa5/tde5 version 6.x
- Game system dsa5/tde5 (Das Schwarze Auge/The Black Eye) seems to have changed its handling of active effects in latest version 6.x. That was causing a breaking bug in this mod, blocking certain rolls for actors in scene. This is the fix for it.

## 12.0.0
### 2024-06-06 - v12 compatibility
- Self-explaining. No functional changes. Well, apart from ...
- ... one technical detail (for those loving such details): Due to breaking changes in v12, overlay icons on scene tokens are now rendered differently (as Active Effects, which show up in character sheets, but may be ignored). From a user's point of view this is irrelevant. Even erratically changing or deleting such effects from a sheet won't break anything.
- Still backward-compatible with v11.

## 11.0.3
### 2024-04-02 - Keybinding support
- Adds an optional keybinding for toggling sheet lock on/off (gamemasters only).
- "Optional" means: There's no preassigned key combination. Assign it to your liking in the game settings (or ignore it if you don't want to use it). My personal preference is **SHIFT + L**.

## 11.0.2
### 2023-12-21 - Add missing changelog & readme to release package
That's why Module Management+ wasn't providing links to them in game (in case anyone should have noticed that groundbreaking detail).

## 11.0.1
### 2023-12-20 - Just an x-mas cleanup release :-)
- Several internal refactorings and stability optimizations that have piled up over time.
- Mainly optimizes debug logging. Nothing vital, just wanted to push this out before x-mas, so that there's room for hopefully more interesting features in the future.

## 11.0.0
### 2023-12-19 - First official release
Let's lock 'em all!