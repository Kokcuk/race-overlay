# RaceOverlay — Test Cases

**Version:** 2.0
**Date:** 2026-05-06
**Scope:** Unit tests for parsing/interpolation, integration tests for
the file pickers and the Display Objects framework, and end-to-end
scenarios for the timeline-based sync flow.

---

## Table of Contents

1. [Assumptions](#1-assumptions)
2. [Test Data](#2-test-data)
3. [Unit Tests — VBO Parser](#3-unit-tests--vbo-parser)
4. [Unit Tests — Speed Interpolation](#4-unit-tests--speed-interpolation)
5. [Unit Tests — Display Objects Registry](#5-unit-tests--display-objects-registry)
6. [Integration Tests — File Pickers](#6-integration-tests--file-pickers)
7. [Integration Tests — Timeline & Nudge](#7-integration-tests--timeline--nudge)
8. [End-to-End Scenarios](#8-end-to-end-scenarios)
9. [Edge Cases](#9-edge-cases)

---

## 1. Assumptions

| ID | Assumption |
|---|---|
| TC-A-01 | Unit tests run in Node.js (Vitest). The parser and math utilities are ES modules. |
| TC-A-02 | Integration tests run in jsdom or a real browser (Vitest + RTL or Playwright component tests). |
| TC-A-03 | E2E tests use Playwright against `http://localhost:5173/` (Vite dev server) or the production build. |
| TC-A-04 | Speed values in assertions use a tolerance of ±0.001 km/h to account for FP arithmetic. |

---

## 2. Test Data

### 2.1 Synthetic VBO Fixtures

`VBO_MINIMAL` — three samples, 0.0–0.2s, velocities 50/55/60.

`VBO_FULL` — four samples spanning 0.0–1.0s with several extra columns
(lat, long, heading, height) which the parser should ignore.

`VBO_NO_VELOCITY` — VBO missing the `velocity` column.

`VBO_NO_DATA_SECTION` — VBO missing `[data]`.

`VBO_SINGLE_SAMPLE` — VBO with exactly one row.

`VBO_IRREGULAR_INTERVALS` — non-uniform time spacing.

(See historical spec versions for full fixture text. The fixtures themselves did not change.)

---

## 3. Unit Tests — VBO Parser

### TC-P-01: Parse minimal valid VBO

**Steps:** call `parseVBO(VBO_MINIMAL)`.
**Expected:** returns `{ samples: [...] }` with three entries; first is `{ time: 0.0, velocity: 50.0 }`; no error.

### TC-P-02: Ignore non-velocity columns

**Steps:** call `parseVBO(VBO_FULL)`.
**Expected:** four samples; only `time` and `velocity` keys present.

### TC-P-03: Missing `[data]` section

**Expected:** throws an Error with `code === 'MISSING_DATA_SECTION'`.

### TC-P-04: Missing velocity column

**Expected:** throws with `code === 'MISSING_VELOCITY_COLUMN'`.

### TC-P-05: Insufficient data (<2 samples)

**Expected:** throws with `code === 'INSUFFICIENT_DATA'`.

### TC-P-06: CRLF line endings

**Steps:** replace all `\n` with `\r\n` in `VBO_MINIMAL`, parse.
**Expected:** identical output to TC-P-01.

### TC-P-07: Irregular intervals preserved

**Expected:** every sample appears in the output with its original time.

### TC-P-07b: Parser extracts lat/long when present

**Steps:** parse a VBO whose `[column names]` line includes `lat` and `long` and whose data rows contain numeric values for both.
**Expected:** every sample has finite `lat` and `long` fields equal to the parsed values.

### TC-P-07c: Parser sets lat/long to NaN when columns are missing

**Steps:** parse `VBO_MINIMAL` (no GPS columns).
**Expected:** every sample has `lat: NaN` and `long: NaN`. No throw.

### TC-P-08: Non-numeric velocity rows are skipped

**Steps:** Insert a row with `velocity = "N/A"`, parse.
**Expected:** the malformed row is excluded; no throw; remaining rows present.

---

## 4. Unit Tests — Speed Interpolation

All call `getSpeedAtTime(samples, effectiveTime)`.

### TC-I-01: Exact sample time

`samples = [{time:0, velocity:50}, {time:1, velocity:60}]`,
`getSpeedAtTime(samples, 0)` → `{ speedKph: 50, inDeadZone: false }`.

### TC-I-02: Linear interpolation

`getSpeedAtTime(samples, 0.5)` → `speedKph ≈ 55`.

### TC-I-03: Before first sample → dead zone

`getSpeedAtTime(samples, -1)` → `inDeadZone: true`.

### TC-I-04: After last sample → dead zone

`getSpeedAtTime(samples, 5)` → `inDeadZone: true`.

### TC-I-05: Empty samples → dead zone

`getSpeedAtTime([], 1)` → `inDeadZone: true`.

### TC-I-06: `computeEffectiveTime`

`computeEffectiveTime(videoTime=10, syncOffset=3) === 7`.

---

## 5. Unit Tests — Display Objects Registry

### TC-D-01: Speedometer is registered

**Steps:** import `DISPLAY_OBJECTS` from `displayObjects/registry.js`.
**Expected:** array contains an entry with `id === 'speedometer'`.

### TC-D-02: Default scene contains the Speedometer

**Steps:** import `DEFAULT_SCENE`.
**Expected:** `DEFAULT_SCENE[0].id === 'speedometer'`. Each entry has shape `{ id, config }`.

### TC-D-03: getDisplayObjectById returns the right widget

**Expected:** `getDisplayObjectById('speedometer')` → object with the same `id` and a callable `Component`.

### TC-D-04: Speedometer renders dead zone correctly

**Steps:** render `<Speedometer samples={[{time:0,velocity:0},{time:1,velocity:10}]} videoTime={5} syncOffset={0} config={defaultConfig} />`.
**Expected:** rendered text contains `--`; opacity is 0.5.

### TC-D-05: Speedometer renders rounded value

**Steps:** render with samples = `[{time:0,velocity:80},{time:1,velocity:80}]`, videoTime=0.5, syncOffset=0.
**Expected:** text contains `80` and `km/h`.

### TC-D-06: Speedometer respects unit config

**Steps:** override `config.unit` to `'mph'`.
**Expected:** unit label is `mph`; numeric value matches `Math.round(speedKph * 0.621371)`.

### TC-D-07: TrackMap is registered

**Steps:** import `DISPLAY_OBJECTS`.
**Expected:** array contains an entry with `id === 'track-map'` whose `defaultConfig` includes `position`, `size`, and a `style` object with `trackColor` and `dotColor`.

### TC-D-08: TrackMap renders nothing when GPS data is missing

**Steps:** render `<TrackMap samples={[{time:0,velocity:50,lat:NaN,long:NaN},{time:1,velocity:60,lat:NaN,long:NaN}]} videoTime={0} syncOffset={0} config={defaultConfig} />`.
**Expected:** the component returns `null` (no DOM produced).

### TC-D-09: TrackMap renders path and dot for valid GPS

**Steps:** render with three GPS samples forming a small triangle, videoTime=0, syncOffset=0.
**Expected:** an `<svg>` is rendered containing a `<path>` (with `d` attribute starting with `M`) and a `<circle>` at the first sample's projected coordinate.

### TC-D-10: TrackMap hides the dot but keeps the path in dead zone

**Preconditions:** valid GPS samples covering 0..1s.
**Steps:** render with videoTime=10, syncOffset=0 (out of range).
**Expected:** `<path>` present; no `<circle>`.

### TC-D-11: getPositionAtTime interpolates lat/long

**Preconditions:** `samples = [{time:0, lat:10, long:20}, {time:1, lat:20, long:40}]`.
**Steps:** call `getPositionAtTime(samples, 0.5)`.
**Expected:** `{ lat ≈ 15, long ≈ 30, inDeadZone: false }`.

### TC-D-12: getPositionAtTime returns dead zone when GPS is NaN

**Preconditions:** samples have `lat = NaN`.
**Expected:** `inDeadZone === true`.

---

## 5b. Unit Tests — Lap Engine

### TC-L-01: computeLaps returns one incomplete lap when no crossings exist

**Preconditions:** samples whose GPS path doesn't cross the start/finish line.
**Expected:** `laps.length === 1`; `laps[0].complete === false`; `laps[0].startTime === samples[0].time`; `laps[0].endTime === samples[N-1].time`.

### TC-L-02: computeLaps splits at every crossing

**Preconditions:** synthetic samples whose GPS goes back and forth across a horizontal start/finish line at known times t=2, t=5, t=8.
**Expected:** four laps; first and last are `complete:false`, middle two are `complete:true` with durations 3 and 3.

### TC-L-03: getLapAtTime finds the right lap

**Steps:** With laps `[(0..2 incomplete), (2..5 complete), (5..8 complete)]`, call `getLapAtTime(laps, 3)`.
**Expected:** the second lap (`startTime: 2, endTime: 5`).

### TC-L-04: getBestLap ignores incomplete laps

**Steps:** With laps as in TC-L-02 plus a deliberately shorter incomplete lap of 1s, call `getBestLap`.
**Expected:** returns one of the 3-second complete laps; never the 1-second incomplete one.

### TC-L-05: getBestLap returns null when no complete laps exist

**Expected:** `null`.

### TC-L-06: formatLapTime — typical values

| Input | Expected |
|---|---|
| `0` | `"0:00.000"` |
| `5.7` | `"0:05.700"` |
| `65.123` | `"1:05.123"` |
| `90.456` | `"1:30.456"` |
| `123.999` | `"2:03.999"` |

### TC-L-07: parser extracts start/finish line from `[laptiming]`

**Steps:** parse a VBO containing `[laptiming]` followed by a `Start` row with four numeric fields.
**Expected:** `result.startFinishLine` has `p1` / `p2` matching the parsed numbers; `result.laps` is an array.

### TC-L-08: parser tolerates missing `[laptiming]`

**Expected:** `result.startFinishLine === null`; `result.laps.length === 1` with `complete: false` covering the full recording.

---

## 5c. Unit Tests — Lap Time Widgets

### TC-LW-01: CurrentLapTime renders elapsed lap time

**Preconditions:** `laps = [{ startTime: 100, endTime: 200, duration: 100, complete: true, index: 1 }]`, videoTime = 130, syncOffset = 0.
**Steps:** render `<CurrentLapTime />` with the default config.
**Expected:** rendered text contains the label `LAP` and the value `0:30.000`.

### TC-LW-02: CurrentLapTime renders `--` when no lap covers the time

**Preconditions:** `laps = []` or videoTime outside any lap.
**Expected:** rendered text contains `--`; opacity 0.5.

### TC-LW-03: BestLapTime renders fastest complete lap

**Preconditions:** `laps = [{duration:90, complete:true}, {duration:88, complete:true}, {duration:80, complete:false}]`.
**Expected:** rendered text contains the label `BEST` and the value `1:28.000`.

### TC-LW-04: BestLapTime renders `--` when there is no complete lap

**Expected:** text contains `--` at 0.5 opacity.

---

## 5d. Integration Tests — Widget Frame (Hover-activated drag & resize)

These tests exercise the `WidgetFrame` wrapper. They use a fixed-size
stage element so percent ↔ pixel math is predictable.

### TC-WF-01: No chrome when not hovered

**Preconditions:** widget rendered, cursor outside its bounds.
**Expected:** the wrapper's `outline` style is `none`; no resize-handle element is in the DOM under the widget.

### TC-WF-02: Hover shows outline and resize handle

**Steps:** dispatch `mouseenter` on the widget.
**Expected:** the wrapper's outline becomes `1px dashed #ffc107` (inverse-scaled); a yellow square handle is rendered in the bottom-right corner.

### TC-WF-03: mouseleave hides the chrome

**Steps:** after TC-WF-02, dispatch `mouseleave`.
**Expected:** outline returns to `none`; the handle is removed.

### TC-WF-04: Drag the speedometer to a new position

**Preconditions:** stage size 1000×500. Speedometer at default position (5, 5) %.
**Steps:** mousedown at the speedometer body, mousemove +200px right and +100px down, mouseup.
**Expected:** the speedometer's `position` becomes `{ x: 25, y: 25 }` ± 0.1 (because 200/1000 = 20% and 100/500 = 20%, added to the 5/5 starting point).

### TC-WF-05: Drag clamps to keep widget on stage

**Steps:** drag a widget far past the right edge of the stage.
**Expected:** `position.x` is clamped at 95 (never exceeds it). Same for y.

### TC-WF-06: Resize handle scales the widget uniformly

**Preconditions:** Speedometer hovered, scale = 1.
**Steps:** mousedown the handle, mousemove so the cursor is twice as far from the widget's top-left corner, mouseup.
**Expected:** the speedometer's `scale` becomes ≈ 2.0 (clamped to 5).

### TC-WF-07: Resize is clamped to [0.3, 5]

**Expected:** scale never falls below 0.3 or rises above 5 regardless of cursor position.

### TC-WF-08: Chrome stays visible while dragging even if cursor leaves the body

**Steps:** mousedown on widget body, mousemove far away from the widget so the cursor leaves its bounds while still dragging.
**Expected:** outline + handle remain visible until mouseup. After mouseup, if the cursor is no longer over the widget, chrome disappears.

### TC-WF-09: Empty layer space passes clicks through to the video

**Preconditions:** widget visible at top-left, but cursor over an empty area of the layer (no widget).
**Steps:** click on that empty area.
**Expected:** the `<video>` element receives the click (play / pause toggles).

### TC-WF-10: Widget without `scale` config defaults to 1

**Steps:** render a widget instance whose config does not include a `scale` key.
**Expected:** the wrapper's `transform` is `scale(1)`.

### TC-WF-11: Outline and handle are inverse-scaled

**Steps:** set scale to 2, hover the widget, inspect the DOM.
**Expected:** the dashed outline width and the handle's `width`/`height` styles are halved (so the visual size at scale=2 matches the visual size at scale=1).

### TC-WF-12: Scene survives a page reload

**Steps:** add a Track Map to the scene, drag it to a new position and scale it to 1.5, then reload the page.
**Expected:** the scene loads with the same widgets in the same positions and at the same scales (driven by `localStorage.getItem('raceoverlay.scene.v1')`).

### TC-WF-13: Scene falls back to default when storage is invalid

**Steps:** put `"not json"` into `localStorage.raceoverlay.scene.v1`, reload.
**Expected:** the app initializes with `DEFAULT_SCENE`. No exception is thrown.

### TC-WF-14: Scene tolerates ids that are no longer registered

**Steps:** write `[{"id":"removed-widget","config":{}}, {"id":"speedometer","config":{}}]` into storage, reload.
**Expected:** only the Speedometer is rendered; the unknown id is silently dropped.

---

## 6. Integration Tests — Files Panel

### TC-FP-01: Adding a valid MP4 sets the video src and lists the file

**Steps:** click `+ Video`, simulate change event on the hidden input with a `video/mp4` File.
**Expected:** the `<video>` `src` is an Object URL; a list row appears with the badge `MP4` and the filename; the empty placeholder is gone.

### TC-FP-02: Adding a `.txt` file via the video button shows an error

**Steps:** trigger the video input with a `text/plain` File.
**Expected:** Bootstrap `alert alert-danger` appears under the file list with text matching `/MP4/i`. The video player does not appear; no row is added.

### TC-FP-03: Adding a valid VBO lists the file and populates the telemetry train

**Expected:** the panel shows a `VBO` row; the timeline shows a green telemetry train sized to `(timeRange.end − timeRange.start)`.

### TC-FP-04: Adding a malformed VBO shows an inline error

**Expected:** alert appears under the file list with the parser's message; no row is added; no telemetry train.

### TC-FP-05: The close button removes a file

**Preconditions:** both video and VBO loaded.
**Steps:** click the `btn-close` on the MP4 row.
**Expected:** the row disappears; `<video>` is no longer rendered; the empty placeholder returns. The VBO row stays.

### TC-FP-06: Replacing a previously chosen file works

**Expected:** the new file replaces the previous video / telemetry; the old object URL is revoked. The list reflects the new filename.

---

## 6b. Integration Tests — Display Objects Panel

### TC-DP-01: Panel lists every registered Display Object

**Expected:** the list contains exactly `DISPLAY_OBJECTS.length` rows; each row's text matches the corresponding `label`.

### TC-DP-02: Available rows are visually de-emphasized (no status pill)

**Preconditions:** scene contains `speedometer` only.
**Expected:** the speedometer row has no extra modifier. All other rows have the `text-muted` class. No `●` or `○` pill is present in any row.

### TC-DP-03: Clicking a row selects it

**Steps:** click the Track Map row.
**Expected:** the row gets the `active` class; `selectedDisplayObjectId === 'track-map'`.

### TC-DP-04: Add button enablement

**Preconditions:** Track Map is *not* in the scene; the Track Map row is selected.
**Expected:** the Add button is enabled; the Remove button is disabled.

**Reverse:** when Track Map *is* in the scene, Add is disabled and Remove is enabled.

### TC-DP-05: Add inserts the widget at default config

**Steps:** select an "available" row, click Add.
**Expected:** the row's status pill becomes ●; the corresponding WidgetFrame appears on the video stage at the widget's `defaultConfig.position` and `defaultConfig.scale`.

### TC-DP-06: Remove deletes the widget from the scene

**Steps:** select an "in-scene" row, click Remove.
**Expected:** the row's status pill becomes ○; the WidgetFrame is unmounted.

### TC-DP-07: Selecting a row in the panel highlights the widget on the video

**Steps:** with the Speedometer in the scene, click the Speedometer row.
**Expected:** the Speedometer's WidgetFrame shows its hover-style chrome (yellow dashed outline + corner handle) even without the cursor over the widget.

### TC-DP-08: Clicking a widget on the video selects its row in the panel

**Steps:** mousedown on the speedometer widget on the video stage.
**Expected:** the Speedometer row in the panel becomes `active`; `selectedDisplayObjectId === 'speedometer'`.

---

## 7. Integration Tests — Timeline & Nudge

### TC-T-01: Telemetry clip starts at offset 0

**Preconditions:** both files chosen, `syncOffset = 0`.
**Expected:** telemetry clip's left edge aligns with the video clip's left edge.

### TC-T-02: Nudge buttons are enabled whenever telemetry is loaded

**Expected:** with no telemetry, every nudge button is disabled. With telemetry loaded, every button (`−10s` … `+10s`) is enabled. There is no clip-selection step.

### TC-T-03: `+1s` shifts telemetry +1s

**Steps:** click `+1s`.
**Expected:** `syncOffset === 1`; telemetry clip's left edge moves right; offset readout shows `+1.000s`.

### TC-T-04: Each nudge step matches its label

For each step in `[10000, 1000, 500, 100, 10, 1]` ms, clicking `+step` from offset 0 sets `syncOffset` to `step / 1000`.

### TC-T-05: Reset returns offset to zero

**Steps:** set syncOffset to 5.5 via nudges, click Reset.
**Expected:** `syncOffset === 0`; Reset button becomes disabled.

### TC-T-06: Dragging the telemetry clip updates `syncOffset` continuously

**Preconditions:** telemetry loaded, syncOffset = 0, timeline area width = 1000px, span = 10s (so 100 px/s).
**Steps:** mousedown on the telemetry clip, mousemove +200px, mouseup.
**Expected:** `syncOffset` ends at ~+2.0; the clip moves to track the cursor while dragging (within span-recompute drift, see §9.4).

### TC-T-07: Video clip is not draggable

**Steps:** mousedown on the video clip, mousemove, mouseup.
**Expected:** `syncOffset` does not change. The video clip's cursor is `default` (not `grab`).

### TC-T-08: Speedometer reflects offset change immediately

**Preconditions:** video paused at videoTime=2.0; samples cover 0..10s; current speedometer reads X.
**Steps:** click `+1s`.
**Expected:** speedometer reading changes (because `effectiveTime` shifts from `2 → 1`).

### TC-T-09: Playhead tracks current videoTime

**Expected:** as the video plays, the red playhead moves left-to-right inside the timeline area, matching `videoTime` on the shared axis.

### TC-T-10: Timeline UI never uses the word "train"

**Expected:** no visible text in the Timeline component contains "train". Labels read "Video" and "Telemetry"; the nudge caption reads "Adjust telemetry".

---

## 8. End-to-End Scenarios

### TC-E2E-01: Full happy path

1. Open the app. See two file selectors.
2. Pick an MP4 → video player appears with the first frame.
3. Pick a VBO → telemetry train appears on the timeline.
4. Press Play → speedometer updates as video plays.
5. Pause; click telemetry train; click `+500ms`.
6. Speedometer reading updates instantly.

### TC-E2E-02: Dead zone after large offset

**Setup:** offset telemetry by `+5s` so the first 5s of video map to before the VBO start.
**Expected:** during the first 5s of video, speedometer shows `--` at reduced opacity.

### TC-E2E-03: Replace files at any time

**Steps:** load both files, then re-pick a different VBO.
**Expected:** new telemetry duration is reflected on the timeline; speedometer uses the new samples.

### TC-E2E-04: Error recovery

**Steps:** pick a `.vbo` for the video selector.
**Expected:** error alert under the video selector. Picking a real MP4 then clears the error and shows the player.

---

## 9. Edge Cases

| TC-ID | Description | Input | Expected |
|---|---|---|---|
| TC-EC-01 | VBO covers a tiny range (1s) | telemetryDuration=1 | Telemetry train is short; nudge precision still works to 1ms. |
| TC-EC-02 | Video much longer than telemetry | videoDuration=600, telemetryDuration=10 | Telemetry train appears as a small green block. Dead zone everywhere outside it. |
| TC-EC-03 | Telemetry much longer than video | videoDuration=10, telemetryDuration=600 | Timeline span fills with telemetry train; video train is short. |
| TC-EC-04 | Negative syncOffset puts telemetry start before t=0 | syncOffset=-5 | Telemetry train extends to the left of the video train; axis `minT` includes the negative range. |
| TC-EC-05 | Nudge at sub-millisecond precision | repeated `+1ms` | syncOffset increments by 0.001 each click; readout shows three decimal places. |
| TC-EC-06 | Page reload | F5 | App returns to initial state. No persistence in MVP. |
| TC-EC-07 | Speed = 0 (stopped) | velocity=0 in samples | Speedometer renders `0` (not `--`). |
| TC-EC-08 | Speed exactly at boundary | videoTime + offset = first sample's time | Returns the first sample's velocity (boundary inclusive). |
