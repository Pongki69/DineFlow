# DineFlow Project Checklist

## Current focus: Chunk 3 floor-plan editor and reservation map

- [x] Add short/round and long/rectangular table variants to the floor editor.
- [x] Render table surfaces, supports, chair seats, backs, and legs in the 3D preview.
- [x] Replace HTML drag-and-drop with pointer-based table/object placement.
- [x] Add 2D canvas panning, wheel zoom, zoom buttons, and reset view.
- [x] Show table status colors and a status legend in the 2D editor.
- [x] Replace redundant directional buttons with precise X/Z and rotation controls.
- [x] Rework the selected-object inspector to avoid duplicate table labels and overflowing controls.
- [x] Add a room boundary and quieter major/minor grid guides to the 2D canvas.
- [x] Refresh reservation availability every 10 seconds while visible; retain the existing private-channel update path.
- [x] Refresh the editor from server changes with a 12-second fallback, while protecting unsaved drafts.
- [x] Replace the row of add buttons with a grouped “Add to floor” menu and saved-preset menu.
- [x] Move object properties into a collapsible right-side inspector on desktop.
- [x] Add persistent table presets with shape, dimensions, capacity, and per-side chair layout.
- [x] Use editable integer inputs for table capacity and chair counts, with a 1–12 seat limit and synchronized counts.
- [x] Preserve floor-plan shape and chair arrangement when saving table details.
- [x] Group floor selection, object library, canvas options, and layout actions into distinct toolbar areas.
- [x] Make the object library and table-template menus mutually exclusive, titled, and scroll-bounded.
- [x] Improve the 2D canvas hierarchy with a quieter grid, clearer room boundary, and larger objects/chairs.
- [x] Correct chair facing direction for round and rectangular layouts and replace the oversized 3D availability banner with a compact status badge.
- [x] Add long-wall and short-wall placement presets plus a separately modeled door object.
- [x] Support Ctrl/Cmd+left-click as an additive multi-selection gesture and explain it in the canvas hints.
- [x] Add tables immediately with an optimistic canvas item and automatic table numbering instead of sequential blocking prompts.
- [x] Add confirmed Remove item / Remove selected controls to the properties panel and batch persisted deletions.
- [x] Persist the door object type through the floor-plan API and support wall/door rotation in the 3D preview.
- [x] Improve the 3D preview with a room-sized floor boundary, subtle two-axis grid, more legible object labels, preview instructions, and reset-camera control.
- [x] Reflow the properties panel into a no-overflow two-column form and keep rotation accessible.
- [x] Distinguish draft save from publish and confirm before publishing.
- [x] Render configured chair arrangements consistently in the 2D editor and 3D preview.
- [x] Add snap-to-grid, Shift multi-select and box selection, group movement, context actions, duplicate, copy/paste, rotate, and delete shortcuts.
- [x] Protect active reservations and dining sessions when deleting a floor-plan object.
- [x] Add confirmed deletion for draft floors while preserving historical reservations and table records.
- [x] Replace native confirm dialogs with accessible in-app confirmation modals and show animated pending feedback for floor-plan actions.
- [x] Make the 2D grid match placement coordinates, snap dragged objects by one full grid block, and add an Align objects action for existing layouts.
- [x] Clear stale add-table status messages and let the backend choose another available number when a generated table number is already in use.
- [x] Add placeable floor panels with a tiled 3D surface and synchronize 2D grid spacing, pan, zoom, wall dimensions, and snap coordinates.
- [x] Create and apply the `floor_plan_presets` database migration locally.
- [x] Verify frontend production build and PHP syntax.
- [ ] Manually confirm short/long layouts, drag/pan/zoom, save/publish, and a second browser's live refresh.
- [ ] Manually confirm preset save, reuse, and deletion, plus multi-select and keyboard shortcuts.

## Existing local run notes

- PostgreSQL uses the local `.local/pgdata17` data directory.
- Backend development server uses `backend/php.ini` so PHP OpenSSL and PostgreSQL extensions are loaded.
- Frontend runs from `frontend` with the Vite development server.

## Remaining work

- Configure and verify Reverb credentials locally for event-driven updates; polling remains the fallback.
- Run the project automated test suite before treating the broader reservation module as production-ready.
- Floor-plan Undo/Redo and on-canvas rotation handles are not implemented yet.
- Continue only with the next requested project chunk after this floor-plan work is reviewed.
