// Email Slicer — main thread
//
//   Slice  — lay real Figma slice nodes onto the email frame (same objects you
//            get by pressing S).
//   Export — read whatever slice nodes are on the canvas right now and export
//            each one, so manual moves, resizes, renames and hand-drawn slices
//            are all honoured.
//
// Selection changes update immediately. Page node changes are debounced and
// fingerprinted, while the panel heartbeat becomes a canvas poll only when the
// granular nodechange event is unavailable.

figma.showUI(__html__, { width: 380, height: 720, themeColors: true });

var TAG = 'emailSlicer';
var SETTINGS_KEY = 'settings';

var picking = false;
var lockedIds = [];
var jobs = 0;          // >0 while a slice/export run is in flight
var lastSignature = '';

/* ---------- slice lookup ---------- */

function pageSlices() {
  try {
    if (typeof figma.currentPage.findAllWithCriteria === 'function') {
      return figma.currentPage.findAllWithCriteria({ types: ['SLICE'] });
    }
  } catch (err) {
    // Fall through — a restricted or missing API must not kill the refresh.
  }
  try {
    return figma.currentPage.findAll(function (n) { return n.type === 'SLICE'; });
  } catch (err2) {
    return [];
  }
}

function isDescendantOf(node, ancestorId) {
  var parent = node.parent;
  while (parent) {
    if (parent.id === ancestorId) return true;
    parent = parent.parent;
  }
  return false;
}

// Every slice belonging to a frame: nested children plus any page-level slice
// centred over it. Hand-drawn slices count — export should mirror the canvas.
function slicesFor(node, pool) {
  var box = node.absoluteBoundingBox;
  if (!box) return [];

  return (pool || pageSlices())
    .filter(function (slice) {
      if (slice.removed) return false;
      // A slice with no bounding box can't be placed or exported, so skip it
      // rather than letting it throw halfway through a refresh.
      var sb = slice.absoluteBoundingBox;
      if (!sb) return false;
      if (isDescendantOf(slice, node.id)) return true;

      var cx = sb.x + sb.width / 2;
      var cy = sb.y + sb.height / 2;
      return cx >= box.x && cx <= box.x + box.width &&
             cy >= box.y && cy <= box.y + box.height;
    })
    .sort(function (a, b) {
      return a.absoluteBoundingBox.y - b.absoluteBoundingBox.y;
    });
}

function mySlicesFor(node, pool) {
  return (pool || pageSlices()).filter(function (slice) {
    if (slice.removed || slice.getPluginData(TAG) !== '1') return false;
    var source = slice.getPluginData('source');
    return source ? source === node.id : slicesFor(node, [slice]).length === 1;
  });
}

/* ---------- selection snapshot ---------- */

function getTargets() {
  return figma.currentPage.selection.filter(function (node) {
    return node.type !== 'SLICE' &&
      typeof node.exportAsync === 'function' &&
      node.width > 0 && node.height > 0;
  });
}

function readGuides(node) {
  if (!('guides' in node) || !node.guides) return [];
  return node.guides
    .filter(function (g) { return g.axis === 'Y'; })
    .map(function (g) { return Math.round(g.offset); })
    .filter(function (y) { return y > 0 && y < node.height; })
    .sort(function (a, b) { return a - b; });
}

function describeNode(node, pool) {
    var box = node.absoluteBoundingBox;
    var mine = 0;
    var slices = slicesFor(node, pool).map(function (slice) {
      if (slice.getPluginData(TAG) === '1') mine++;
      var sb = slice.absoluteBoundingBox;
      return {
        id: slice.id,
        name: slice.name,
        top: Math.round(sb.y - box.y),
        height: Math.round(slice.height)
      };
    });

    return {
      id: node.id,
      name: node.name,
      width: Math.round(node.width),
      height: Math.round(node.height),
      absX: box ? box.x : 0,
      absY: box ? box.y : 0,
      guides: readGuides(node),
      slices: slices,
      onCanvas: slices.length,
      mine: mine
    };
}

function snapshot(pool) {
  var targets = getTargets();
  if (!targets.length) return [];
  if (pool === undefined) pool = pageSlices();
  var out = [];
  targets.forEach(function (node) {
    try {
      out.push(describeNode(node, pool));
    } catch (err) {
      // Keep the rest of the selection usable.
      out.push({
        id: node.id, name: node.name,
        width: Math.round(node.width), height: Math.round(node.height),
        absX: 0, absY: 0, guides: [], slices: [], onCanvas: 0, mine: 0
      });
    }
  });
  return out;
}

function signatureOf(nodes) {
  return nodes.map(function (n) {
    return n.id + ':' + n.width + 'x' + n.height + ':' + n.guides.join(',') + ':' +
      n.slices.map(function (s) { return s.id + '@' + s.top + '+' + s.height + '/' + s.name; }).join('|');
  }).join(';');
}

function pushSelection(force) {
  var nodes = snapshot();
  var sig = signatureOf(nodes);
  if (!force && sig === lastSignature) {
    // Nothing changed, but say so — silence is indistinguishable from a dead
    // channel, and that ambiguity is exactly what made this hard to diagnose.
    figma.ui.postMessage({ type: 'pong' });
    return;
  }
  lastSignature = sig;
  figma.ui.postMessage({ type: 'selection', nodes: nodes });
}

function pushSelectionPreview() {
  var nodes = snapshot([]);
  lastSignature = signatureOf(nodes);
  figma.ui.postMessage({ type: 'selection', nodes: nodes });
}

/* ---------- pick mode ---------- */

var lastPickId = null;

function pushPick(force) {
  var sel = figma.currentPage.selection;
  if (!sel.length) { lastPickId = null; return; }

  var node = sel[0];
  if (node.type === 'SLICE') return;
  // selectionchange forces; fallback refreshes do not, so the same click is
  // never counted twice.
  if (!force && node.id === lastPickId) return;
  lastPickId = node.id;

  // Clicking once on a frame selects the frame itself, which is almost always
  // a misfire in pick mode. Say so instead of silently doing nothing.
  if (lockedIds.indexOf(node.id) !== -1) {
    figma.ui.postMessage({
      type: 'pickHint',
      message: 'That selected the frame. Cmd/Ctrl-click to reach a layer inside it.'
    });
    return;
  }

  var box = node.absoluteBoundingBox;
  if (!box) return;

  // Which email does this layer belong to? Walk the ancestors rather than
  // guessing from position — emails sitting side by side share a Y range, so
  // vertical bounds alone can't tell them apart.
  var ownerId = null;
  var parent = node.parent;
  while (parent) {
    if (lockedIds.indexOf(parent.id) !== -1) { ownerId = parent.id; break; }
    parent = parent.parent;
  }

  figma.ui.postMessage({
    type: 'pick',
    node: {
      id: node.id,
      name: node.name,
      ownerId: ownerId,
      top: box.y,
      bottom: box.y + box.height,
      middle: box.y + box.height / 2,
      centerX: box.x + box.width / 2,
      centerY: box.y + box.height / 2
    }
  });
}

function tick(force, preview) {
  try {
    if (picking) pushPick(force);
    else if (preview) pushSelectionPreview();
    else pushSelection(force);
  } catch (err) {
    // A silent throw here would freeze the panel with no explanation.
    figma.ui.postMessage({
      type: 'error',
      message: 'Refresh failed: ' + (err && err.message ? err.message : String(err))
    });
  }
}

figma.on('selectionchange', function () {
  tick(true, true);
  queueRefresh();
});

// Figma blocks the "documentchange" event under dynamic-page access unless you
// call loadAllPagesAsync first, and recommends PageNode.on("nodechange")
// instead. This is what catches slices being moved, resized or deleted by hand.
var nodeWatcher = null;
var watchedPage = null;
var refreshTimer = null;
function queueRefresh() {
  if (jobs > 0 || refreshTimer !== null || typeof setTimeout !== 'function') return;
  refreshTimer = setTimeout(function () {
    refreshTimer = null;
    if (jobs === 0) tick(false);
  }, 100);
}

function watchPage() {
  try {
    if (nodeWatcher && watchedPage) watchedPage.off('nodechange', nodeWatcher);
  } catch (ignored) {}
  nodeWatcher = queueRefresh;
  watchedPage = figma.currentPage;
  try {
    watchedPage.on('nodechange', nodeWatcher);
    return true;
  } catch (err) {
    nodeWatcher = null;
    watchedPage = null;
    return false;
  }
}
var watching = watchPage();

figma.on('currentpagechange', function () {
  watching = watchPage();
  lastSignature = '';
  tick(true, true);
  queueRefresh();
});

async function resolve(id) {
  var node = await figma.getNodeByIdAsync(id);
  if (!node || node.removed) throw new Error('That node is no longer on the canvas.');
  return node;
}

/* ---------- creating slices ---------- */

async function markSlices(id, bands, scale, format) {
  var node = await resolve(id);
  var box = node.absoluteBoundingBox;

  for (var i = 0; i < bands.length; i++) {
    var band = bands[i];
    var slice = figma.createSlice();

    // Keep slices at the page level, matching Figma's createSlice() default.
    // Nested export targets can make Figma's native exporter package one JPEG
    // as a document-level ZIP.
    slice.resize(node.width, band.height);
    slice.x = box.x;
    slice.y = box.y + band.top;

    slice.name = band.name;
    slice.setPluginData(TAG, '1');
    slice.setPluginData('source', id);
    slice.exportSettings = [{
      format: format === 'image/png' ? 'PNG' : 'JPG',
      constraint: { type: 'SCALE', value: scale }
    }];
  }

  return bands.length;
}

/* ---------- messages ---------- */

async function pushSettings() {
  try {
    var values = await figma.clientStorage.getAsync(SETTINGS_KEY);
    figma.ui.postMessage({
      type: 'settings',
      values: values && typeof values === 'object' ? values : {}
    });
  } catch (err) {
    figma.ui.postMessage({ type: 'settings', values: {} });
  }
}

figma.ui.onmessage = async function (msg) {
  try {
    if (msg.type === 'ready') {
      pushSettings();
      tick(true, true);
      queueRefresh();
      return;
    }

    if (msg.type === 'saveSettings') {
      await figma.clientStorage.setAsync(SETTINGS_KEY, msg.values || {});
      return;
    }

    if (msg.type === 'startPicking') {
      picking = true;
      lockedIds = msg.ids || [];
      lastPickId = null;
      figma.notify('Pick mode on — Cmd/Ctrl-click a layer inside an email.', { timeout: 4000 });
      return;
    }

    if (msg.type === 'stopPicking') {
      // The live selection is whatever layer was clicked last. Put the email
      // frames back so the queue doesn't refill with a text layer.
      var restore = [];
      for (var r = 0; r < lockedIds.length; r++) {
        var back = await figma.getNodeByIdAsync(lockedIds[r]);
        if (back && !back.removed) restore.push(back);
      }
      picking = false;
      lockedIds = [];
      if (restore.length) figma.currentPage.selection = restore;
      pushSelection(true);
      return;
    }

    if (msg.type === 'prepare') {
      jobs++;
      var pool = pageSlices();
      for (var c = 0; c < msg.ids.length; c++) {
        var target = await figma.getNodeByIdAsync(msg.ids[c]);
        if (!target || target.removed) continue;
        mySlicesFor(target, pool).forEach(function (slice) { slice.remove(); });
      }
      figma.ui.postMessage({ type: 'prepared', count: pageSlices().length });
      return;
    }

    if (msg.type === 'mark') {
      var made = await markSlices(msg.nodeId, msg.bands, msg.scale, msg.format);
      figma.ui.postMessage({ type: 'marked', count: made });
      return;
    }

    if (msg.type === 'endJob') {
      jobs = Math.max(0, jobs - 1);
      pushSelection(true);
      return;
    }

    // Read the canvas as it stands right now. Nothing is recomputed, so manual
    // edits and hand-drawn slices come along.
    if (msg.type === 'listSlices') {
      jobs++;
      var listPool = pageSlices();
      var out = [];
      for (var f = 0; f < msg.ids.length; f++) {
        var frame = await figma.getNodeByIdAsync(msg.ids[f]);
        if (!frame || frame.removed) continue;
        out.push({
          id: frame.id,
          name: frame.name,
          slices: slicesFor(frame, listPool).map(function (slice) {
            return { id: slice.id, name: slice.name, mine: slice.getPluginData(TAG) === '1' };
          })
        });
      }
      figma.ui.postMessage({ type: 'sliceList', frames: out });
      return;
    }

    if (msg.type === 'exportSlice') {
      var slice = await resolve(msg.nodeId);
      var bytes = await slice.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: msg.scale }
      });
      figma.ui.postMessage({ type: 'sliceImage', nodeId: msg.nodeId, bytes: bytes });
      return;
    }

    // Only ever clears the frames handed in. No ids means nothing is selected,
    // which must not be read as "clear the whole page".
    if (msg.type === 'clear') {
      if (!msg.ids || !msg.ids.length) {
        figma.notify('Select the email frames you want to clear first.');
        figma.ui.postMessage({ type: 'cleared', count: 0, empty: true });
        return;
      }

      var removed = 0;
      var clearPool = pageSlices();
      for (var i = 0; i < msg.ids.length; i++) {
        var owner = await figma.getNodeByIdAsync(msg.ids[i]);
        if (!owner || owner.removed) continue;
        mySlicesFor(owner, clearPool).forEach(function (slice) {
          slice.remove();
          removed++;
        });
      }

      figma.notify(removed
        ? 'Removed ' + removed + ' slice' + (removed === 1 ? '' : 's') +
          ' from ' + msg.ids.length + ' frame' + (msg.ids.length === 1 ? '' : 's') + '.'
        : 'No plugin slices on the selected frames.');
      figma.ui.postMessage({ type: 'cleared', count: removed });
      pushSelection(true);
      return;
    }

    if (msg.type === 'select') {
      var nodes = [];
      for (var j = 0; j < msg.ids.length; j++) {
        var n = await figma.getNodeByIdAsync(msg.ids[j]);
        if (n && !n.removed) nodes.push(n);
      }
      if (nodes.length) {
        if (!picking) figma.currentPage.selection = nodes;
        figma.viewport.scrollAndZoomIntoView(nodes);
      }
      return;
    }

    if (msg.type === 'poll') {
      if (jobs === 0) {
        if (watching) figma.ui.postMessage({ type: 'pong' });
        else tick(false);
      }
      return;
    }

    if (msg.type === 'diagnose') {
      figma.ui.postMessage({
        type: 'diagnosis',
        selection: figma.currentPage.selection.length,
        targets: getTargets().length,
        slicesOnPage: pageSlices().length,
        nodechange: watching,
        timers: typeof setTimeout === 'function',
        picking: picking,
        jobs: jobs
      });
      return;
    }

    if (msg.type === 'refresh') {
      if (!picking) pushSelection(true);
      return;
    }

    if (msg.type === 'notify') {
      figma.notify(msg.message);
      return;
    }
  } catch (err) {
    jobs = 0;
    var detail = err && err.message ? err.message : String(err);
    figma.notify('Email Slicer: ' + detail);
    figma.ui.postMessage({ type: 'error', message: detail });
  }
};
