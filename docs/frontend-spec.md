# RaceOverlay — Frontend Specification

**Version:** 3.0
**Date:** 2026-05-06
**Scope:** UI/UX, component hierarchy, the new IDE-style two-column
layout (navbar + 80% stage / 20% side panels), the Display Objects
framework, the timeline, files & display-objects management panels,
and accessibility.

---

## Table of Contents

1. [Assumptions](#1-assumptions)
2. [Tech Stack](#2-tech-stack)
3. [Page Layout](#3-page-layout)
4. [Component Hierarchy](#4-component-hierarchy)
5. [Files Panel](#5-files-panel)
5b. [Display Objects Panel](#5b-display-objects-panel)
6. [Video Player & Display Object Layer](#6-video-player--display-object-layer)
7. [Display Objects Framework](#7-display-objects-framework)
7b. [Widget Frame — drag, resize, selection](#7b-widget-frame--drag-resize-selection)
8. [Speedometer (Display Object)](#8-speedometer-display-object)
8b. [Track Map (Display Object)](#8b-track-map-display-object)
8c. [Current Lap Time (Display Object)](#8c-current-lap-time-display-object)
8d. [Best Lap Time (Display Object)](#8d-best-lap-time-display-object)
9. [Two-Train Timeline](#9-two-train-timeline)
10. [Nudge Controls](#10-nudge-controls)
11. [Loading & Error States](#11-loading--error-states)
12. [Responsive Design](#12-responsive-design)
13. [Accessibility](#13-accessibility)
14. [State-Driven Rendering](#14-state-driven-rendering)

---

## 1. Assumptions

| ID | Assumption |
|---|---|
| FE-A-01 | UI uses **default Twitter Bootstrap 5** for chrome (navbar, cards, buttons, list-group, alerts). The overall composition is inspired by the [Bootstrap 2 hero example](https://getbootstrap.com/2.0.2/examples/hero.html): a top navbar with the brand title and a generous body area below. Custom CSS is reserved for what Bootstrap doesn't cover (timeline, video stage, display-object overlay layer, the 80/20 column split). |
| FE-A-02 | Single page application. No router. |
| FE-A-03 | Display Objects are absolutely positioned DOM elements over the `<video>`. The `<video>` uses native browser controls. |
| FE-A-04 | Tailwind is **not** used in this project. |
| FE-A-05 | Minimum supported viewport width is 768px. Below that, the layout reflows; the timeline becomes horizontally scrollable. |
| FE-A-06 | All layout uses Bootstrap's grid + flex utilities. No float-based layouts. |

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Build tool | Vite |
| Framework | React 19 (functional components, hooks) |
| CSS framework | Bootstrap 5 (default theme), imported globally in `main.jsx` |
| Charts | None — removed in v2 |
| State management | `useState` / `useReducer`, no external store |

---

## 3. Page Layout

A Bootstrap navbar at the top, then a 80% / 20% body split. Files and
Display Objects management are stacked card panels in the right column.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Race Overlay                                Hover a widget to edit   │  ← navbar
├──────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ ┌──────────────────────┐│
│ │                                          │ │ Files                ││
│ │             VIDEO STAGE                  │ │ [+ Video][+ Telemetry]││
│ │                                          │ │ MP4  race.mp4   [×]   ││
│ │  87 km/h         ┌────────────────┐      │ │ VBO  session.vbo[×]   ││
│ │                  │  track map     │      │ ├──────────────────────┤│
│ │                  └────────────────┘      │ │ Display Objects      ││
│ │                                          │ │ [Add]      [Remove]  ││
│ │  LAP 0:32.150  BEST 1:23.456             │ │ Speedometer       ●  ││
│ │                                          │ │ Track Map         ●  ││
│ └──────────────────────────────────────────┘ │ Current Lap Time  ●  ││
│ [native video controls]                       │ Best Lap Time     ●  ││
│ ┌──────────────────────────────────────────┐ └──────────────────────┘│
│ │ 0:00 ── 0:30 ── 1:00 ── 1:30 ── 2:00     │                         │
│ │ Video    [══════════════════════]        │                         │
│ │ Telem.       [══════════════════════]    │                         │
│ └──────────────────────────────────────────┘                         │
│ Selected: Telemetry train                                             │
│ [-10s]…[-1ms] | [+1ms]…[+10s]    offset = +0.150s   [Reset]          │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 Column Sizing

The split is implemented with custom flex CSS rather than Bootstrap's
12-column grid because the user spec calls for a precise 80/20 ratio:

```css
.app-main  { display: flex; gap: 1rem; align-items: flex-start; }
.app-stage { flex: 0 0 calc(80% - 0.5rem); min-width: 0; }
.app-side  { flex: 0 0 calc(20% - 0.5rem); min-width: 220px; max-width: 360px; position: sticky; top: 1rem; }
```

`min-width: 0` on `.app-stage` lets the video shrink below its intrinsic
content width. `position: sticky` on `.app-side` keeps the panels in view
while scrolling on tall screens. Below 992px viewport width the columns
stack vertically.

---

## 4. Component Hierarchy

```
<App>                                       (src/App.jsx)
├── <nav class="navbar"> "Race Overlay"
└── .container-fluid
    └── .app-main (flex 80/20)
        ├── .app-stage  (left, 80%)
        │   ├── .video-stage
        │   │   ├── <video controls playsInline>
        │   │   └── <DisplayObjectLayer>    (src/components/DisplayObjectLayer.jsx)
        │   │        └── for each instance in `scene` →
        │   │             <WidgetFrame>      (src/components/WidgetFrame.jsx)
        │   │               └── def.Component({ samples, laps, videoTime, syncOffset, config })
        │   └── <Timeline>                   (src/components/Timeline.jsx)
        │       ├── timeline (label column + ruler + tracks + playhead)
        │       └── <NudgeControls> (inline)
        │
        └── .app-side   (right, 20%)
            ├── <FilesPanel>                 (src/components/FilesPanel.jsx)
            └── <DisplayObjectsPanel>        (src/components/DisplayObjectsPanel.jsx)
```

---

## 5. Files Panel

`FilesPanel` (`src/components/FilesPanel.jsx`) is a Bootstrap card with
the header **Files**.

Layout inside the card body:

1. Two flex-equal buttons (`btn-sm btn-primary fw-semibold`, with the
   accepted extension shown in the label, e.g. `+ Video (.mp4)`):
   - **+ Video (.mp4)** — opens an OS file picker filtered to `video/mp4,video/*`. On select calls `onAddVideo(file)`. Disabled while a video is already loaded — user must click the close button on the row to remove the current video first.
   - **+ Telemetry (.vbo)** — opens an OS file picker filtered to `.vbo,text/*`. On select calls `onAddVbo(file)`. Disabled while a telemetry file is already loaded.
2. A `list-group list-group-flush` showing the currently loaded files,
   one row per file. Each row contains:
   - A `bg-secondary` badge with the type code (`MP4` or `VBO`).
   - The filename (truncated with `text-truncate`).
   - A Bootstrap `btn-close` that calls `onRemoveVideo` / `onRemoveVbo`.
3. Inline error alerts (`alert alert-danger py-1 px-2 small`) appear under
   the list when `videoError` or `vboError` is set.
4. A small "Loading…" indicator while a file is being parsed.

The panel does not own state. It is a controlled component — the parent
(`App`) holds filenames, errors, loading flags, and the add/remove
handlers.

---

## 5b. Display Objects Panel

`DisplayObjectsPanel` (`src/components/DisplayObjectsPanel.jsx`) is a
Bootstrap card with the header **Display Objects**.

### 5b.1 Layout

1. Two flex-equal buttons (filled, `fw-semibold`, with the strong
   disabled style described in §11.2):
   - **Add** (`btn-sm btn-primary`) — enabled when a row is selected and the corresponding object is *not* in the scene. Calls `onAdd(selectedId)`.
   - **Remove** (`btn-sm btn-danger`) — enabled when a row is selected and the object *is* in the scene. Calls `onRemove(selectedId)`.
2. A `list-group` enumerating every entry in the registry's
   `DISPLAY_OBJECTS` array. Each row:
   - Is `list-group-item-action` and toggles to `active` when its id matches `selectedId`.
   - Available rows (not in the scene) get the `text-muted` class so the in-scene rows visually stand out without an explicit badge.
   - Click on the row → `onSelect(obj.id)`.

### 5b.2 Two-way Selection

Selection is shared with the video stage:

- `selectedDisplayObjectId` lives in `App` state.
- The panel reflects it (the matching row is `active`).
- The `WidgetFrame` whose instance id matches it shows the edit chrome (outline + handle), so the user can locate the selected widget on the video.
- Clicking a `WidgetFrame` (mousedown) calls `onSelect(instanceId)` — selecting it both visually and in the panel.

### 5b.3 Single Instance per Type

The MVP supports one instance of each Display Object at a time. **Add**
is a no-op when an instance already exists; **Remove** removes the only
instance. Multiple instances of the same widget is a future
enhancement.

---

## 6. Video Player & Display Object Layer

The video stage is a single `position: relative` block with a fixed 16:9
aspect ratio. Inside it:
- A native `<video controls preload="metadata">` element fills the stage.
- A `<DisplayObjectLayer>` (`position: absolute; inset: 0; pointer-events: none`)
  hosts every active widget.

`pointer-events: none` is important — clicks pass through widgets to the
video, so the user can play/pause by clicking the video.

The current `videoTime` is updated:
- Every `requestAnimationFrame` while a video is loaded (smooth display).
- On `timeupdate` and `seeked` events (catches paused state).

---

## 7. Display Objects Framework

> A Display Object is a self-contained widget that renders on top of the
> video. The framework is intentionally minimal — adding a new widget
> means writing one component and adding one entry to a registry.

### 7.1 Contract

A Display Object is an object with this shape:

```js
{
  id:            string,              // stable unique id
  label:         string,               // human-readable name
  defaultConfig: object,               // design tokens (position, scale, style, ...)
  Component:     React.ComponentType,  // props: { samples, laps, videoTime, syncOffset, config }
}
```

The framework owns two fields of the config and the widget owns the rest:

| Field | Owner | Notes |
|---|---|---|
| `position: { x, y }` | framework (`WidgetFrame`) | Top-left in % of stage (0–100). |
| `scale: number` | framework (`WidgetFrame`) | Uniform scale (default 1). Applied as `transform: scale(...)` on the frame, with `transform-origin: top left`. |
| anything else (`style`, `size`, `unit`, `label`, ...) | the widget Component | The widget is responsible for rendering with these. Position and scale are *not* applied by the widget. |

The full set of props passed to every widget Component:

| Prop | Type | Notes |
|---|---|---|
| `samples` | `Array<{ time, velocity, lat, long }>` | always present when the layer renders. |
| `laps` | `Array<Lap>` or `null` | derived from VBO `[laptiming]`. May be empty. |
| `videoTime` | `number` | current video playback time, in seconds. |
| `syncOffset` | `number` | telemetry → video offset, in seconds. |
| `config` | `object` | the widget's instance config (a copy of `defaultConfig`). |

Widgets that don't need a particular prop simply ignore it.

### 7.2 Registry

`src/displayObjects/registry.js` exports:

- `DISPLAY_OBJECTS` — the array of all known Display Objects.
- `DEFAULT_SCENE` — the default list of widget instances. Each instance
  is `{ id, config }` — `id` references an entry in `DISPLAY_OBJECTS`,
  `config` is a copy (or override) of `defaultConfig`.
- `getDisplayObjectById(id)` — lookup helper.

### 7.3 Adding a New Widget

1. Create `src/displayObjects/MyWidget.jsx`. The component receives
   `{ samples, videoTime, syncOffset, config }`.
2. Add an entry to `DISPLAY_OBJECTS` in `registry.js`:
   ```js
   {
     id: 'my-widget',
     label: 'My Widget',
     defaultConfig: { /* ... */ },
     Component: MyWidget,
   }
   ```
3. (Optional) Add it to `DEFAULT_SCENE` to render it by default.

### 7.4 Why `defaultConfig`?

`defaultConfig` is the **design contract** of the widget. It declares
every knob the widget supports — position, color, size, units, etc. —
in one place. The runtime reads `instance.config` (which starts as a
copy of `defaultConfig`); a future Phase will let users edit it through
a side panel without touching widget code.

Convention: a `defaultConfig` typically contains `position` (% of stage),
a `style` block (color, fontSize, fontFamily, padding, etc.), and any
widget-specific options (e.g. `unit: 'kph'`).

---

## 7b. Widget Frame — drag, resize, selection

`WidgetFrame` (`src/components/WidgetFrame.jsx`) wraps every Display
Object. It owns positioning + scale and provides drag/resize affordances
on hover.

### 7b.1 Layout

The frame is `position: absolute` at `(config.position.x%, config.position.y%)`
relative to the parent stage. It applies `transform: scale(config.scale)`
with `transform-origin: top left` so scaling grows the widget toward the
bottom-right while keeping the anchor point stable.

### 7b.2 Pointer-event policy

- `DisplayObjectLayer` keeps `pointer-events: none` so empty space
  between widgets passes clicks through to the `<video>`.
- Each `WidgetFrame` sets `pointer-events: auto`. This lets the frame
  receive `mouseenter` / `mouseleave` for hover detection and `mousedown`
  for drag/resize.
- Net effect: clicking on a widget interacts with the widget; clicking
  on the bare video plays/pauses it as usual.

### 7b.3 Hover/selection-activated chrome

The frame tracks two internal booleans plus an external one:

- `hovered` — set on `mouseenter`, cleared on `mouseleave`.
- `interacting` — set when a drag or resize starts, cleared when it ends.
- `selected` (prop) — true when this widget's id matches `selectedDisplayObjectId` in `App`.

`showChrome = hovered || interacting || selected`. While `showChrome` is true:

- A 1px dashed yellow outline marks the widget.
- A 12×12 yellow square handle appears at the bottom-right corner.
- `cursor: move` on the body, `cursor: nwse-resize` on the handle.
- The outline thickness, handle size, and handle border are
  **inverse-scaled** by the current scale so they stay visually constant
  regardless of widget size.

`interacting` keeps the chrome visible if the cursor leaves the widget
during a drag/resize — without it, the affordance would flicker off the
moment the cursor crossed the widget edge.

### 7b.4 Click selects the widget

`mousedown` on the frame body (which also starts a drag) calls
`onSelect()`. Whether or not the user actually drags, the widget becomes
the selected one — its row in the Display Objects panel becomes
highlighted, and `selected` keeps the chrome visible. This is the
"click on widget → highlights in list" half of the two-way selection
binding described in §5b.2.

### 7b.3 Drag

Mouse-down on the body starts a drag.

```
dxPct = ((ev.clientX − startX) / stageRect.width) × 100
dyPct = ((ev.clientY − startY) / stageRect.height) × 100
newPos = clamp(startPos + (dxPct, dyPct), [0, 95]²)
```

The result is reported as `onConfigChange({ position: newPos })`. The
clamp keeps a fragment of the widget visible.

### 7b.4 Resize

Mouse-down on the corner handle starts a resize. It uses geometric
distance from the widget's top-left corner to the cursor:

```
startDist = hypot(startX − origin.x, startY − origin.y)
ratio     = currentDist / startDist
newScale  = clamp(startScale × ratio, 0.3, 5)
```

This produces a uniform-aspect resize (no width-only / height-only
options) which keeps every widget readable without per-widget logic.

### 7b.5 Persistence

Every change to the scene (drag, resize, add, remove) flows through
`App.handleConfigChange` / `handleAddToScene` / `handleRemoveFromScene`,
all of which call `setScene`. A `useEffect([scene])` writes the scene
to `localStorage` under the key `raceoverlay.scene.v1`.

On mount, `useState(loadScene)` reads the same key and:

- filters out entries whose `id` doesn't match any registered widget
  (handles the case where a widget was removed from the registry), and
- merges each remaining entry's `config` over its widget's
  `defaultConfig` (handles the case where a new config field was added
  to the widget after the user's data was saved).

If reading fails (private mode, JSON corruption, missing
`localStorage`), the app falls back to `DEFAULT_SCENE`.

---

## 8. Speedometer (Display Object)

### 8.1 Default Config

```js
{
  position: { x: 5, y: 5 },              // % of video stage
  style: {
    color: '#ffffff',                    // ← white, per spec
    fontSize: 64,
    fontWeight: 700,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, "Roboto Mono", monospace',
    textShadow: '... 4-direction outline + soft black glow',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: '8px 12px',
    borderRadius: 6,
  },
  unit: 'kph',                           // 'kph' | 'mph'
}
```

### 8.2 Render Logic

1. Compute `effectiveTime = videoTime − syncOffset`.
2. Call `getSpeedAtTime(samples, effectiveTime)` → `{ speedKph, inDeadZone }`.
3. If `inDeadZone`, render `--` at 50% opacity. Otherwise render
   `Math.round(speed)` plus a smaller unit label (`km/h` or `mph`).
4. Always uses `font-variant-numeric: tabular-nums` so digit changes
   don't cause layout shift.

---

## 8b. Track Map (Display Object)

A small SVG map of the route with a moving dot showing the current car
position.

### 8b.1 Default Config

```js
{
  position: { x: 72, y: 5 },              // % of stage (top-right area)
  size: { width: 220, height: 160 },      // px
  style: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 6,
    padding: 8,
    trackColor: '#ffffff',
    trackWidth: 2,                         // multiplier
    dotColor: '#ffc107',
    dotRadius: 5,                          // multiplier
    dotStrokeColor: '#000000',
    dotStrokeWidth: 2,                     // multiplier
  },
}
```

### 8b.2 Coordinate System

VBO `lat` / `long` are stored in arc-minutes. RaceLogic's sign convention
is **positive north** for latitude and **positive west** for longitude.
The widget projects each sample as:

```
y = −lat                    // flip so larger latitude is up
x = −long × cos(meanLat)    // flip so east is right; cosine correction preserves aspect
```

The viewBox is the bounding box of all projected points expanded by 6%
padding. `preserveAspectRatio="xMidYMid meet"` guarantees the route
itself isn't stretched when the widget is sized.

### 8b.3 Render Logic

1. On samples change, compute the static `path d="..."` string and
   viewBox via `useMemo` — this work happens once per VBO load.
2. Each render: compute `effectiveTime = videoTime − syncOffset` and
   call `getPositionAtTime(samples, effectiveTime)` → `{ lat, long, inDeadZone }`.
3. Project the live position with the same transform and place a circle
   at that coordinate. When `inDeadZone`, the dot is omitted but the
   path remains.
4. If the VBO has no GPS data (no `lat` / `long` columns, or all values
   are NaN), the widget renders nothing and contributes nothing to the
   DOM.

### 8b.4 Stroke Width Scaling

The path stroke and dot radius are multiplied by `span / 100` (where
`span` is the larger of the bounding-box width/height in projected
coordinates). This keeps visual line thickness proportional to the
viewBox so the map reads consistently at any widget size.

---

## 8c. Current Lap Time (Display Object)

Shows elapsed time within the lap that contains the current effective
VBO time.

### 8c.1 Default Config

```js
{
  position: { x: 5, y: 78 },
  label: 'LAP',                          // small caption above the time
  style: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: 700,
    fontFamily: 'ui-monospace, ...',
    textShadow: '... 4-direction outline ...',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: '6px 10px',
    borderRadius: 6,
  },
}
```

### 8c.2 Render Logic

1. Compute `effectiveTime = videoTime − syncOffset`.
2. `lap = getLapAtTime(laps, effectiveTime)`.
3. If `lap` exists, render `formatLapTime(effectiveTime − lap.startTime)`.
   Otherwise render `--` at 50% opacity.
4. The label (`LAP`) is rendered above the value at 0.4× the value font size.

The widget covers both partial and complete laps — it doesn't care
which kind of lap the time falls in, only that there is one.

---

## 8d. Best Lap Time (Display Object)

Shows the fastest **complete** lap.

### 8d.1 Default Config

```js
{
  position: { x: 25, y: 78 },
  label: 'BEST',
  style: { /* identical baseline to Current Lap Time */ }
}
```

### 8d.2 Render Logic

1. `best = getBestLap(laps)` → the lap with the shortest duration whose
   `complete` flag is true.
2. If `best` exists, render `formatLapTime(best.duration)`. Otherwise
   render `--` at 50% opacity.
3. This widget is independent of `videoTime` — it never re-computes
   per frame.

---

## 9. Two-Clip Timeline

The timeline is a **shared seconds-axis** with two horizontal clips: the
video clip (read-only, anchored at t=0) and the telemetry clip
(draggable, anchored at `syncOffset`). The whole control is intentionally
short on the vertical axis (≈90 px tall including the nudge row) so it
doesn't compete with the video for space.

### 9.1 Layout

The timeline DOM is split into an 80px label column and a flexible area:

```
┌─── label col ───┬──────────── timeline-area ───────────┐
│                 │ ruler ticks                            │
│ Video           │ [════ video clip ════]                 │
│ Telemetry       │     [════ telemetry clip ════]   ← drag│
│                 │ ↑ playhead spans tracks                │
└─────────────────┴────────────────────────────────────────┘
```

A vertical red playhead marks the current `videoTime`.

### 9.2 Axis Math

```
videoStart      = 0
videoEnd        = videoDuration
telemetryStart  = syncOffset
telemetryEnd    = syncOffset + telemetryDuration

minT = min(videoStart, telemetryStart, 0)
maxT = max(videoEnd, telemetryEnd, 1)
span = maxT − minT  (clamped to ≥ 1)

toPct(t) = ((t − minT) / span) × 100
```

Each clip is positioned with `left: toPct(start)%` and
`width: toPct(end) − toPct(start)%`.

### 9.3 Tick Step Heuristic

| Span | Step |
|---|---|
| ≤ 10s  | 1s  |
| ≤ 60s  | 5s  |
| ≤ 300s | 30s |
| ≤ 1800s | 60s |
| > 1800s | 300s (5 min) |

### 9.4 Telemetry Drag

Mousedown on the telemetry clip starts a drag (cursor switches from
`grab` to `grabbing`). The frame computes a `pixels-per-second` ratio
based on the captured layout, then on each `mousemove` updates
`syncOffset` to `startOffset + dx / pxPerSec`. There is no clamp — the
user is free to drag the clip past either end of the visible axis (the
layout span will then expand to accommodate it).

The video clip has `cursor: default` and no `mousedown` handler. It is
intentionally non-interactive to keep the model simple: telemetry moves,
video stays.

---

## 10. Nudge Controls

A row of small `btn-light` buttons below the timeline. They always
operate on the **telemetry** clip — there is no clip-selection step —
and are enabled whenever a telemetry file is loaded.

| Button | Action |
|---|---|
| `−10s` | `syncOffset −= 10` |
| `−1s` | `syncOffset −= 1` |
| `−500ms` | `syncOffset −= 0.5` |
| `−100ms` | `syncOffset −= 0.1` |
| `−10ms` | `syncOffset −= 0.01` |
| `−1ms` | `syncOffset −= 0.001` |
| `+10s` ... `+1ms` | reverse signs |

A "Reset" button next to the offset readout zeros `syncOffset`. It is
disabled when offset is already 0 or telemetry is not loaded.

### 10.1 Realtime Update

`syncOffset` is a piece of React state owned by `App`. Changing it
triggers an immediate re-render of:
- The Telemetry clip's position on the timeline.
- Every Display Object that depends on `effectiveTime`.

No `requestAnimationFrame` work is needed — React's render loop is fast
enough at the resolution the user perceives (sub-50ms button latency).

---

## 11. Loading & Error States

| State | Visual |
|---|---|
| File loading | The corresponding "+ Video" / "+ Telemetry" button is disabled; a small "Loading…" line appears below the file list. |
| Parse error | A small Bootstrap `alert alert-danger` appears below the file list inside the Files panel. |
| No video chosen | The video stage shows an empty placeholder (`.video-stage--empty`) with a 1px dashed border and the message "No video loaded — Use the Files panel to add one." |
| No telemetry chosen | The telemetry train is absent from the timeline. The Display Object Layer renders nothing. |

---

## 12. Responsive Design

| Breakpoint | Layout |
|---|---|
| `≥ md` (≥ 768px) | File selectors are side-by-side (Bootstrap `col-md-6`). |
| `< md` | File selectors stack vertically. The timeline gains horizontal scroll if it overflows. |

The video stage always stretches to 100% width with a 16:9 aspect ratio.

---

## 13. Accessibility

- All buttons and the file picker are keyboard reachable.
- Trains are `role="button"` with `tabIndex={0}` and respond to
  `Enter` / `Space` to select.
- Disabled nudge buttons use Bootstrap's `disabled` styling, not `display: none`.
- The selected train's distinguishing feature is **both** color **and**
  a visible 2px border + glow, so selection is not conveyed by color alone.
- Errors are placed as Bootstrap `role="alert"` regions so assistive
  tech announces them without explicit focus.

---

## 14. State-Driven Rendering

| App State | Affects |
|---|---|
| `videoUrl` | `<video src>` and `.video-stage` visibility. |
| `videoDuration` | Video train length on the timeline. |
| `vboSamples` | Data source for Speedometer and Track Map. Without it no widget renders. Track Map additionally requires GPS columns. |
| `vboLaps` | Data source for Current/Best Lap Time. Computed once at parse time from `[laptiming]` + GPS crossings. |
| `selectedDisplayObjectId` | Drives the `active` row in the Display Objects panel and the `selected` prop on every WidgetFrame. |
| `scene` (mutable) | Updated by Add/Remove in the panel. The matching WidgetFrame appears or disappears from the stage. |
| `vboDuration` | Telemetry train length on the timeline. |
| `videoTime` | Speedometer reading; timeline playhead position. |
| `syncOffset` | Telemetry train left position; Speedometer's effective VBO time. |
| `selectedTrain` | Highlight on the train; enabled state of nudge buttons. |
| `videoError` / `vboError` | Inline alert under each selector. |
