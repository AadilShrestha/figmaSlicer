# Email Slicer

A Figma plugin that cuts email frames into slices. It drops real Figma
slice nodes onto your design — the same objects you get by pressing `S` — and
can export the cut regions as separate image files.

Works across as many frames as you select at once. No zip, no account, no
subscription. Runs offline.

## Install

During development, Figma can run the plugin straight from this folder. Once it
is published, install it from its Figma Community page instead.

1. Keep `manifest.json`, `code.js`, and `ui.html` in one folder.
2. Open the Figma **desktop app** (browser Figma can't read a local folder).
3. Menu → **Plugins → Development → Import plugin from manifest…**
4. Pick `manifest.json`.

It now lives under **Plugins → Development → Email Slicer**, permanently.

## Remembered settings

Cut mode, cut edge, slice count and height, skips, slice name, format, scale,
quality, and save mode are remembered when the plugin or Figma restarts. Figma
stores them locally for this plugin ID. They do not sync to another device and
can disappear if local browser/cache data is cleared or the plugin ID changes.

Selections, picked cuts, and per-frame count overrides are intentionally not
remembered because they belong to the current document session.

## Four ways to cut

Select one or more email frames. Every one appears in the queue with its own cut
preview and slice count. Click any row to zoom to it.

### Clicked layers

Click where you want the cuts instead of measuring anything.

1. Select your email frames.
2. Hit **Start picking cuts**. The queue freezes on those frames.
3. `Cmd`/`Ctrl`-click any layer inside an email — that's Figma's deep-select, and
   it reaches inside a frame in one click. The plugin reads that layer's position
   and adds a cut there.
4. Keep clicking. Two clicks gives you three slices, and so on. You can pan and
   zoom freely the whole time.
5. **Done picking** puts your frames back in the queue.

**Cut at the layer's** sets whether the cut lands on the layer's top edge, bottom
edge, or middle. Top edge is usually what you want — click a section heading and
the cut lands right above it.

**Undo last cut** steps backwards one click at a time, across frames, in the
order you made them. **Clear all cuts** wipes them.

Cuts are tracked per frame, so with several emails selected you can click through
all of them in one pass and each keeps its own set. The owning email is worked
out from the clicked layer's **ancestry**, not its position — emails laid out
side by side share a Y range, so vertical bounds alone can't tell them apart.
If the layer has no selected ancestor, it falls back to geometry using both
axes.

Since emails are often all named the same thing, the status line disambiguates
with `#1`, `#2`, `#3` in queue order, and reports both the count on that email
and the running total. **Undo last cut** steps back in the order you clicked,
across emails, and names which one it undid.

> **Why clicking a layer, not a point?** Figma exposes no canvas mouse events to
> plugins — no plugin can read where your cursor is. Selection is the only signal
> available. It works out better here anyway: cuts land on real section edges
> rather than a few pixels off.

### Horizontal guides

Press `Shift + R` for rulers, select the frame, drag guides down from the top
ruler. Guides are read per frame, so each email can cut differently in the same
run. The queue shows a guide count — if it reads zero, the guide attached to the
canvas instead of the frame. Select the frame first, then drag.

### Equal parts

N slices of the same height. With more than one email selected, each row in the
queue gets its own number box — so a short email can be 3 slices while a long
one is 9, in the same run. Changing the main **Slices per email** box resets
every override back to it.

### Max slice height

Cap each slice and let it work out the count.

## Skip top / skip bottom

Trims a band off either end that gets **no slice at all**. Made for the case
where every email ends in a footer you've already built in Klaviyo — set
**Skip bottom** to that footer's height and the slices stop above it.

The skipped bands show as dimmed areas in each frame's preview strip. Guides and
picked cuts that land inside a skipped band are ignored.

## Naming

Slices are named `slice 1`, `slice 2`, `slice 3`… and numbering **continues from
whatever is already on the canvas**. If the page has 12 slices, the next run
starts at `slice 13`. Across a multi-frame run the count keeps going, so nothing
collides.

Change **Slice name** from `slice` to anything else and you get `hero 1`,
`hero 2`, and so on. Downloaded files use the identical name, so the slice node
and its image file always match.

## Two steps: Slice, then Export

They're separate buttons on purpose.

**Slice** lays the markers down and stops. The queue then shows how many slices
sit on each frame, and the Export section shows the total. Nothing is exported
and no files are written.

**Export slices** reads **whatever is on the canvas at that moment**. Nothing is
recomputed from the plugin's settings, so everything you did in between is
honoured:

- dragged or resized a slice → exports the new region
- renamed a slice → the file uses the new name
- deleted a slice → it isn't exported
- drew your own extra slice with `S` → it gets exported too

So the loop is: slice roughly, nudge the boundaries by eye, then export. You
never have to get the cuts perfect first time.

Each slice exports through its own node, so it renders exactly what sits beneath
it — the same result as Figma's export panel. JPG quality is applied afterwards,
which Figma's export panel doesn't offer.

### Save as

- **Separate image files** (default) — one JPG or PNG download per slice,
  staggered ~280ms apart because browsers throttle rapid downloads.
- **One ZIP archive** — a single save prompt no matter how many slices.
  13 emails at 6 slices each is 78 separate save dialogs otherwise; this is one.
  With several emails selected, each gets its own folder inside the ZIP, so two
  emails can both contain a `slice 1` without clashing.

The ZIP is written directly by the plugin using the stored (uncompressed)
method. JPG and PNG are already compressed, so deflate would save almost
nothing, and this avoids JSZip — which needs a bundler, while this plugin is
deliberately plain files with no build step.

If two slices end up with the same name, the second gets a `(2)` suffix.

Re-running **Slice** replaces that frame's markers instead of stacking
duplicates.

**Remove slices on selected** only touches the emails you currently have
selected. With nothing selected it refuses and says so, rather than clearing the
page. Slices you drew by hand are never removed — but they *are* included when
you export.

## The panel tracks the canvas

Selecting one or many frames updates the queue immediately through Figma's
`selectionchange` event, before the page-wide slice count is enriched in the
background. Slice edits use the page's granular `nodechange` event, debounced
into one refresh when Figma emits a burst. Move, resize, rename, delete, or draw
a slice with `S` and the queue and Export count follow automatically.

Each frame's preview strip shows two things at once: **blue lines** are the cuts
your current settings would make, **grey ticks** are slices already on the
canvas. When they line up, Slice would reproduce what's already there.

Three things keep it in step:

1. `selectionchange` — fires the moment you select a different frame.
2. `PageNode.on("nodechange")` — Figma blocks the `documentchange` event under
   `"documentAccess": "dynamic-page"` unless you call `loadAllPagesAsync()`
   first, and documents `nodechange` as the granular alternative. This is what
   catches slices moved, resized, renamed or deleted by hand.
3. The panel sends a heartbeat. When `nodechange` is available it gets a cheap
   `pong`; if that event is unavailable, the same heartbeat becomes the fallback
   canvas poll.

With `nodechange` available, an idle heartbeat does not traverse the document.

**The `live` indicator** next to the frame count shows the panel and the plugin
are talking. It should read `live`. If it goes `stale`, the link is genuinely
broken — press **Refresh**, which also prints a diagnostic line: selection
count, frames recognised, slices on the page, and whether `nodechange` and
timers are available. That line is what to send if something still misbehaves.

Status messages sit at the **top** of the panel, above the queue. At the bottom
they fall below the fold on a long panel, which makes pick mode look dead when
it's actually working.

## Why export takes a while

Exporting is deliberately slow. Each slice is rendered individually through its
own node — that's what makes manual edits and hand-drawn slices come out right —
and Figma renders on its main thread, so the app is unresponsive while it works.
Then each render is re-encoded to JPG at your chosen quality.

Twenty seconds for a long email at 2x is normal. If you want it faster:

- Drop **Export scale** to 1x (roughly a quarter of the pixels).
- Use fewer, taller slices.
- Export **PNG**, which skips the re-encode step, though the files are bigger.

The ZIP itself is not the slow part — it's stored, not compressed, so packing is
near-instant. The time is all in rendering.

## Notes

- **Design at 600px wide, export at 2x.** 600px is the standard email content
  width; 2x keeps it sharp on retina.
- **JPG at 80–85 is the right default** for email. PNG gets big fast, and size
  hurts — Gmail clips messages over 102KB of HTML.
- **The queue shows a live count** per frame, e.g. `600 × 3200 · 4 guides ·
  5 on canvas`, so you always know what Export will pick up.
- **Auto-layout frames**: auto layout reflows its children, so the plugin probes
  whether a slice can hold an absolute position. If it can't, slices are placed
  on the page directly over the frame. They look and export identically; they
  just won't follow if you drag the frame. Re-run after moving it.
- **JPG has no transparency.** Transparent areas fill white rather than going
  black.
- **The first run may ask permission** to download multiple files. Allow it —
  downloads are staggered ~280ms apart for that reason.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Tells Figma what to load |
| `code.js` | Selection, pick mode, creating slices, exporting slices |
| `ui.html` | The panel: queue, previews, cut math, encoding, ZIP, downloads |
| `plugin.test.js` | Dependency-free regression checks (`node --test plugin.test.js`) |
| `README.md` | This |

## A note on the panel code

The whole `ui.html` script runs inside an IIFE under `'use strict'`. That isn't
stylistic. Top-level `var` in a plugin panel shares scope with `window`, and
`window.history` is read-only — so `var history = []` silently failed and every
selection update threw `history.filter is not a function` before it could
render. `window.frames`, `name`, `status`, `top` and `length` are the same trap.
Keep new state inside the IIFE.

## Changing it

- **Cut math** is `cutPoints()` and `region()` in `ui.html`, both working in 1x
  frame pixels. Add a mode with a branch in `cutPoints()` plus an `<option>` on
  the `mode` select — previews, counts, marking, and downloads all read from it.
- **Pick mode** is `pushPick()` in `code.js` and `addPick()` in `ui.html`.
- **Numbering** happens in `run()` in `ui.html`; the starting number comes from
  the `prepare` round-trip, which counts slices already on the page.
- **Export** is `exportSlices()` in `ui.html` and `listSlices` / `exportSlice`
  in `code.js`. It deliberately queries the canvas rather than reusing the cut
  math, which is what makes manual edits survive.
- **Live updates** are `snapshot()` / `signatureOf()` / `watchPage()` in
  `code.js`. Selection updates are event-driven; the panel heartbeat is the
  fallback only when `nodechange` is unavailable.
- **The ZIP writer** is `buildZip()` in `ui.html` — about 60 lines, stored
  entries, UTF-8 names, verified against `python zipfile` and `unzip`.
- **The queue DOM** is built once per selection and updated in place, so live
  refreshes never steal focus from a number box you're typing in.
- **Slice markers** are `markSlices()` in `code.js`. Plugin-made slices carry
  plugin data so `removeSlices()` never touches hand-drawn ones.
