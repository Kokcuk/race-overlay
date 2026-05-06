# RaceOverlay — Project Specification

**Version:** 2.0
**Date:** 2026-05-06
**Status:** Draft

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Assumptions](#2-assumptions)
3. [Actors](#3-actors)
4. [Glossary](#4-glossary)
5. [Feature List by Priority](#5-feature-list-by-priority)
6. [User Stories and Acceptance Criteria](#6-user-stories-and-acceptance-criteria)
7. [Use Cases](#7-use-cases)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Feature Dependencies](#9-feature-dependencies)

---

## 1. Project Overview

### 1.1 Core Value Proposition

RaceOverlay is a **pure client-side web application** that lets motorsport
enthusiasts overlay telemetry from a RaceChrono VBO data file directly on
top of a race video recording. No server, no upload, no privacy concern —
everything runs inside the browser.

### 1.2 What the App Does

1. Accepts an MP4 video file (local, loaded via the File API).
2. Accepts a VBO telemetry file (plain text, exported from RaceChrono).
3. Parses speed, GPS, and lap-timing data from the VBO file in JavaScript.
4. Renders one or more **Display Objects** (widgets) on top of the video.
   The MVP ships four widgets: a `Speedometer` (white speed number),
   a `TrackMap` (mini map with a moving dot for the car's position),
   a `CurrentLapTime`, and a `BestLapTime`.
5. Provides a **CapCut-style timeline** with two "trains" — one for the
   video and one for the telemetry — that can be moved against each other
   to align them in time.

### 1.3 Scope Boundaries

| In Scope | Out of Scope |
|---|---|
| Speedometer display object | G-force or accelerometer overlay |
| Track map display object | Other telemetry channels (RPM, gear, etc.) |
| Current/Best lap time display objects | Sector splits and theoretical-best laps |
| VBO file parsing (speed + GPS + laptiming) in-browser | |
| Timeline-based sync (two trains, nudge buttons) | Automatic sync detection |
| km/h and mph (per-widget) | Multi-camera support |
| Pluggable Display Objects framework | Cloud storage or file sharing |
| File picker upload | |

---

## 2. Assumptions

| ID | Assumption |
|---|---|
| A-01 | Single-page app, no backend, no database. Static hosting only. |
| A-02 | Primary target browser is a modern desktop browser (Chrome 90+, Firefox 88+, Safari 15+). |
| A-03 | The VBO file format follows the RaceChrono export: `[header]`, `[column names]`, `[data]` sections, whitespace-separated columns. |
| A-04 | The `velocity` column is in km/h. |
| A-05 | The `time` column is GPS HHMMSS.SS; the parser converts it to seconds elapsed from the first sample. |
| A-05b | `lat` / `long` columns are in arc-minutes (RaceChrono default: north and east are positive in the captured magnitude; the format encodes south/east-of-Greenwich with the sign convention of the source GPS). The Track Map treats them as raw 2D coordinates and applies a `cos(latitude)` correction to keep aspect. |
| A-06 | VBO sample rate is nominally 10Hz but may vary; the parser handles irregular intervals. |
| A-07 | The video file is a standard MP4 the browser's `<video>` element can play without transcoding. |
| A-08 | There is no reliable automatic alignment between VBO time and video time — manual alignment via the timeline is the primary sync mechanism. |
| A-09 | Display Objects are rendered as DOM elements positioned absolutely over the video. |
| A-10 | No data leaves the browser. Files are read via `FileReader` / `URL.createObjectURL`. |
| A-11 | Maximum supported VBO file size: 50 MB. |
| A-12 | The default Bootstrap 5 theme is used for all chrome (file selectors, buttons, layout). Display objects are styled via their own config and ignore Bootstrap. |

---

## 3. Actors

### 3.1 Primary Actor: The Driver / Analyst

A person who recorded both a race video and a VBO telemetry file in the
same session and wants to review the run with speed context.

### 3.2 Secondary Actor: The Browser

The browser enforces sandbox/security constraints and provides the Web
APIs (File API, `<video>`, `URL.createObjectURL`) the app depends on.

---

## 4. Glossary

| Term | Definition |
|---|---|
| **VBO File** | RaceChrono's plain-text telemetry export. |
| **RaceChrono** | A mobile app and GPS logger system used to record speed, position, and lap times. |
| **Sample** | A single row in the VBO `[data]` section. |
| **Velocity Channel** | The `velocity` column of the VBO file (km/h). |
| **Sync Offset** | A signed value in seconds: `telemetryStart - videoStart`. Stored as a single number; visualized as the horizontal offset of the telemetry train relative to the video train on the timeline. |
| **Display Object** | A self-contained widget rendered on top of the video (e.g. Speedometer). Each Display Object has a `defaultConfig` (position, style, options) and a React component. |
| **Scene** | The list of Display Object instances currently active. |
| **Train** | A horizontal block on the timeline representing the duration of one of the two media tracks (Video or Telemetry). |
| **Start/finish line** | A 2D segment between two GPS points, declared in the VBO `[laptiming]` section. Each crossing of this segment by the car's GPS path marks a lap boundary. |
| **Lap** | A time slice between two consecutive crossings of the start/finish line. Has `complete: true` only when both bounds are crossings (i.e. recording started before and ended after the lap). |
| **Nudge Button** | A button that shifts the selected train by a fixed amount (±10s, ±1s, ±500ms, ±100ms, ±10ms, ±1ms). |
| **Dead Zone** | The portion of the video timeline that maps outside the VBO data range; widgets that depend on telemetry render a placeholder (e.g. `--`). |

---

## 5. Feature List by Priority

### MVP

| ID | Feature | Description |
|---|---|---|
| F-01 | Files panel | A right-column "Files" card with two buttons (`+ Video (.mp4)`, `+ Telemetry (.vbo)`) for adding files. Each Add button is disabled while its file is loaded — user must remove it first. Loaded files appear in a list with per-row remove buttons and inline error messages. |
| F-02 | Display Objects panel | A right-column "Display Objects" card listing every registered widget. Top buttons `Add` / `Remove` operate on the currently selected row; available rows are dimmed with `text-muted` so the in-scene rows stand out. Selection is two-way with the video stage. |
| F-03 | VBO parser | Parse `[column names]`, `[data]`, and `[laptiming]` sections. Extract `time`, `velocity`, `lat`, `long`, and the start/finish line. Compute laps from line crossings. |
| F-04 | Video player | Render the chosen video with native browser controls. |
| F-05 | Display Objects framework | Pluggable widgets defined in `src/displayObjects/`. Each widget has a `defaultConfig` and a React component receiving `{ samples, videoTime, syncOffset, config }`. |
| F-06 | Speedometer Display Object | Renders the current speed as a large white number with a unit label. |
| F-06b | Track Map Display Object | Renders the GPS route of the session as an SVG outline with a moving dot at the current car position. Auto-fits to GPS bounds; corrects aspect with `cos(latitude)`. Hides itself when the VBO has no GPS columns. |
| F-06c | Current Lap Time Display Object | Shows the elapsed time within the lap that contains the current effective time. Format: `M:SS.fff`. Shows `--` when no lap context (no GPS crossings detected). |
| F-06d | Best Lap Time Display Object | Shows the fastest **complete** lap. Format: `M:SS.fff`. Shows `--` when no complete lap exists. |
| F-07 | Two-train timeline | Below the video: video train + telemetry train on a shared seconds axis, plus a current-time playhead. |
| F-08 | Train selection | Click a train to select it; selected train shows a highlight. |
| F-09 | Nudge buttons | Shift the selected train by ±10s, ±1s, ±500ms, ±100ms, ±10ms, ±1ms. Updates the speedometer in realtime. |
| F-10 | Reset offset | Reset sync offset to zero. |
| F-11 | Dead zone handling | When current video time, after offset, falls outside the VBO range, the speedometer renders `--` and the track-map dot disappears. |
| F-12 | Error & loading states | Friendly messages near the file selectors when files are invalid or being parsed. |
| F-13 | Hover-activated widget editing | Each widget is always interactive. While the cursor is over a widget (or while it is being dragged/resized, or it is the currently selected widget in the panel), a yellow dashed outline and a bottom-right resize handle appear; click+drag moves the widget, dragging the handle resizes it uniformly. Empty space between widgets stays click-through so clicking the bare video still plays/pauses. |
| F-14 | Layout persistence | The current scene (the array of widget instances and their `config`) is persisted to `localStorage` under the key `raceoverlay.scene.v1`. On reload the scene is restored. Stored entries that reference unknown widget ids (e.g. after a registry change) are filtered out, and missing config fields are merged from `defaultConfig`. |

### Future (Nice-to-Have)

| ID | Feature | Description |
|---|---|---|
| F-20 | Additional Display Objects | G-force, lap counter, gear, RPM. |
| F-21 | Display Object config UI | Edit position, color, font size, etc. through a side panel. |
| F-22 | Drag-to-position widgets | Drag a widget on the video to reposition. |
| F-23 | Drag-to-shift trains | Drag a train horizontally on the timeline (in addition to nudge buttons). |
| F-24 | Per-widget unit toggle | Toggle km/h vs mph per Speedometer instance. |
| F-25 | Export frame | Save a single video frame with overlays burned in as PNG. |
| F-26 | Multiple Speedometers / scenes | Save and recall scene configurations. |

---

## 6. User Stories and Acceptance Criteria

### US-01: Add a Video File

**As a** driver reviewing my session,
**I want to** add my MP4 race video through the Files panel,
**So that** I can watch it with telemetry overlaid.

- AC-01a: The Files panel has a `+ Video` button that opens an OS file picker for `.mp4`.
- AC-01b: After a valid file is chosen, the video player appears with the first frame rendered, and a row labelled `MP4 <filename>` appears in the panel's file list.
- AC-01c: Files the browser cannot decode trigger a small inline error under the file list.
- AC-01d: Choosing a new file replaces the current video.
- AC-01e: A close button (`btn-close`) on the file row removes the video; the stage returns to the empty placeholder.

### US-02: Add a Telemetry File

**As a** driver reviewing my session,
**I want to** add the VBO file from the same session through the Files panel,
**So that** the widgets have data to display.

- AC-02a: The Files panel has a `+ Telemetry` button that opens a file picker for `.vbo`.
- AC-02b: After parsing, a row labelled `VBO <filename>` appears in the file list. The telemetry train appears on the timeline, sized to its duration.
- AC-02c: Files missing the `[data]` section trigger: "Invalid VBO file: [data] section not found." (shown under the file list)
- AC-02d: Files missing the `velocity` column trigger: "Invalid VBO file: no 'velocity' column found."
- AC-02e: A close button on the VBO row removes the telemetry; widgets that depend on it stop rendering, and the telemetry train disappears from the timeline.

### US-02b: Manage Display Objects from a Side Panel

**As a** driver setting up my overlay,
**I want to** add and remove widgets from a list,
**So that** I can choose what information appears on the video without touching code.

- AC-02b-a: The Display Objects panel lists every registered widget with a status pill: filled green ● when the widget is in the scene, hollow ○ when available.
- AC-02b-b: Clicking a row selects it (the row becomes `active`).
- AC-02b-c: The Add button is enabled only when the selected widget is *not* in the scene; clicking it inserts the widget at its `defaultConfig`.
- AC-02b-d: The Remove button is enabled only when the selected widget *is* in the scene; clicking it removes the widget from the stage.
- AC-02b-e: Selecting a row that is already in the scene shows the widget's edit chrome on the video stage (highlighted by the WidgetFrame). Clicking a widget on the video selects the corresponding row in the panel.

### US-03: See the Speedometer Display Object

**As a** driver,
**I want to** see my speed as a large white number on top of the video,
**So that** I can correlate what I see with how fast I was going.

- AC-03a: The speed number updates smoothly as the video plays.
- AC-03b: Speed is computed by linear interpolation between the two nearest VBO samples surrounding the (video-time − sync-offset) point.
- AC-03c: Speed is shown as an integer with the unit label ("km/h" or "mph") underneath.
- AC-03d: When in the dead zone, the speedometer shows `--`.

### US-03c: See the Current and Best Lap Time

**As a** driver,
**I want to** see how much time has elapsed in the current lap and what
my best lap time is,
**So that** I can compare my progress against my fastest reference.

- AC-03c-a: When the VBO declares a start/finish line and the recording covers at least one crossing, the Current Lap Time widget shows the elapsed time within the lap that contains the current effective time.
- AC-03c-b: The Best Lap Time widget shows the fastest **complete** lap (both bounds are crossings). Incomplete laps (recording started/ended mid-lap) are excluded.
- AC-03c-c: When no lap context exists (no GPS, no `[laptiming]` section, or no crossings), both widgets show `--` at reduced opacity.
- AC-03c-d: Lap times are formatted `M:SS.fff` (e.g. `1:23.456`).

### US-03b: See the Track Map Display Object

**As a** driver,
**I want to** see a small map of the track with my current position,
**So that** I can correlate speed and visuals with where I was on the circuit.

- AC-03b-a: When the VBO has GPS columns, a track outline appears in the corner of the video.
- AC-03b-b: A dot moves along the outline at the position corresponding to the current (video time − sync offset).
- AC-03b-c: The map auto-fits the full route bounds; aspect is corrected by `cos(mean latitude)`.
- AC-03b-d: When in the dead zone, the dot is hidden but the route outline remains visible.
- AC-03b-e: When the VBO file has no GPS columns, the track map widget hides itself entirely.

### US-03d: Move and Resize Widgets

**As a** driver setting up an overlay,
**I want to** reposition and resize each widget on top of the video,
**So that** I can lay out my own HUD without it covering important parts of the picture.

- AC-03d-a: While the cursor is over a widget, that widget shows a yellow dashed outline and a yellow square handle at its bottom-right corner.
- AC-03d-b: While the cursor is *not* over a widget, no chrome is shown — widgets look exactly as they would on a final overlay.
- AC-03d-c: Click+drag anywhere on a widget's body moves it. The new position is reflected immediately and clamped to remain within the video stage (0–95% on each axis).
- AC-03d-d: Click+drag the corner handle resizes the widget uniformly (preserves aspect). Scale is clamped to `[0.3, 5]`.
- AC-03d-e: While dragging or resizing, the chrome stays visible even if the cursor leaves the widget body.
- AC-03d-f: Empty space between widgets passes pointer events through to the underlying video, so clicking the bare video still plays / pauses.
- AC-03d-g: Layout changes are kept for the current session only. (Persistence is not in MVP.)

### US-04: Align Telemetry to Video via the Timeline

**As a** driver whose VBO and video did not start at the same instant,
**I want to** shift the telemetry against the video,
**So that** the speedometer reads correctly at every moment.

- AC-04a: Both clips (Video and Telemetry) are visible on a shared seconds axis below the video.
- AC-04b: The video clip is fixed (it is the time anchor). The telemetry clip is draggable horizontally — drag-and-drop directly on the timeline updates `syncOffset` continuously while dragging.
- AC-04c: A row of nudge buttons applies fine adjustments to telemetry: ±10s, ±1s, ±500ms, ±100ms, ±10ms, ±1ms. They are always enabled whenever telemetry is loaded.
- AC-04d: The widgets reflect the new offset immediately, without needing to replay.
- AC-04e: A "Reset" button returns sync offset to 0. It is disabled when offset is already 0.

### US-05: See Errors When Files Are Invalid

**As a** user who picked the wrong file,
**I want to** see a clear error message,
**So that** I can correct it.

- AC-05a: Errors appear under the corresponding file selector.
- AC-05b: Error text is plain English, not a raw exception.
- AC-05c: Choosing a different file clears the error.

---

## 7. Use Cases

### UC-01: Full Session Review (Primary Flow)

**Actors:** Driver
**Preconditions:** User has an MP4 video and a VBO file from the same session.

**Primary Flow:**
1. User opens the app. Two file selectors are visible.
2. User picks the MP4 — the video player appears.
3. User picks the VBO — the telemetry train appears on the timeline.
4. User presses Play. The Speedometer Display Object updates as the video plays.
5. User notices the speed is wrong and clicks the telemetry train.
6. User clicks `+1s` on the nudge controls. The speedometer updates immediately.
7. User repeats with smaller nudges (`+100ms`, `+10ms`, …) to fine-tune.
8. User watches the full session.

**Alternative Flow A: Telemetry chosen before video**
- Steps 2–3 may happen in any order. Both selectors operate independently.

**Exception X1: Video file not playable**
- Browser cannot decode the file → error appears under the video selector.

**Exception X2: VBO file malformed**
- Parser throws a coded error → error appears under the telemetry selector.

### UC-02: Session Start with No VBO Loaded

**Actors:** Driver
**Preconditions:** Only the video file is chosen.
**Primary Flow:**
1. The video plays.
2. The Speedometer renders nothing (no telemetry yet).
3. The telemetry train is absent from the timeline.

---

## 8. Non-Functional Requirements

### 8.1 Performance

| Requirement | Target |
|---|---|
| VBO parse time | < 1s for files up to 10 MB on a mid-range laptop. |
| Display Object update | Update within 16ms of the video time changing (one rAF frame). |
| Timeline interaction | Nudge button → speedometer update under 50ms. |

### 8.2 Browser Compatibility

| Browser | Minimum Version |
|---|---|
| Chrome / Chromium | 90+ |
| Firefox | 88+ |
| Safari | 15+ |
| Edge (Chromium) | 90+ |

### 8.3 Security

- No file content is sent over the network.
- The VBO parser only reads numeric values; non-numeric fields are skipped or rejected — never executed.

### 8.4 Accessibility

- Selected train uses both color and a visible border so selection is not conveyed by color alone.
- All buttons and selectors are keyboard reachable.
- The speedometer is a DOM element; screen readers can read its current value if assistive tech is configured to do so.

### 8.5 Privacy

- No analytics, no cookies, no tracking.

---

## 9. Feature Dependencies

```
F-01 (Video selector)
  └── F-04 (Video player)
        └── F-07 (Two-train timeline)         ─ requires video duration
              └── F-08 (Train selection)
                    └── F-09 (Nudge buttons)
                          └── F-10 (Reset offset)

F-02 (Telemetry selector)
  └── F-03 (VBO parser)                        ─ extracts time, velocity, lat, long, laps
        └── F-05 (Display Objects framework)
              ├── F-06  (Speedometer)
              ├── F-06b (Track Map)            ─ requires lat/long; hides if absent
              ├── F-06c (Current Lap Time)     ─ requires laps; shows -- otherwise
              └── F-06d (Best Lap Time)        ─ requires ≥1 complete lap
                    └── F-11 (Dead zone)
        └── F-07 (Two-train timeline)         ─ requires telemetry duration

F-12 (Errors / loading) — cross-cutting on F-01, F-02, F-03
```
