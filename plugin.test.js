const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadPlugin(options = {}) {
  const messages = [];
  const handlers = {};
  let scans = 0;
  const storage = options.storage || {};
  const slices = options.slices || [];
  const nodes = options.nodes || {};
  const page = {
    selection: options.selection || [],
    findAllWithCriteria() { scans++; return slices.filter((slice) => !slice.removed); },
    findAll() { scans++; return slices.filter((slice) => !slice.removed); },
    on(type, callback) { handlers[`page:${type}`] = callback; },
    off() {},
    appendChild() {}
  };
  const figma = {
    currentPage: page,
    showUI() {},
    ui: { postMessage(message) { messages.push(message); }, onmessage: null },
    on(type, callback) { handlers[type] = callback; },
    notify() {},
    clientStorage: {
      async getAsync(key) { return storage[key]; },
      async setAsync(key, value) { storage[key] = value; }
    },
    getNodeByIdAsync: async (id) => nodes[id] || null,
    createSlice() {
      if (options.createSlice) return options.createSlice();
      throw new Error('Unexpected slice creation');
    }
  };
  const context = { __html__: '', figma, setInterval() {}, setTimeout };
  vm.runInNewContext(fs.readFileSync('code.js', 'utf8'), context);
  return { context, figma, handlers, messages, page, scans: () => scans, storage };
}

test('startup waits for the panel before reading the selected frames', async () => {
  const frame = {
    id: 'frame', name: 'Email', width: 600, height: 1000,
    absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 1000 },
    exportAsync() {}
  };
  const plugin = loadPlugin({ selection: [frame] });

  assert.equal(plugin.scans(), 0);

  await plugin.figma.ui.onmessage({ type: 'ready' });

  assert.equal(plugin.scans(), 0);
  const selection = plugin.messages.find((message) => message.type === 'selection');
  assert.equal(selection.nodes.length, 1);
  assert.equal(selection.nodes[0].id, 'frame');

  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.equal(plugin.scans(), 1);
});

test('settings load on startup and save through Figma client storage', async () => {
  const plugin = loadPlugin({ storage: { settings: { mode: 'even', scale: '1' } } });
  await plugin.figma.ui.onmessage({ type: 'ready' });
  await new Promise((resolve) => setImmediate(resolve));

  const loaded = plugin.messages.find((message) => message.type === 'settings');
  assert.equal(loaded.values.mode, 'even');
  assert.equal(loaded.values.scale, '1');

  await plugin.figma.ui.onmessage({
    type: 'saveSettings',
    values: { mode: 'height', scale: '2' }
  });
  assert.equal(plugin.storage.settings.mode, 'height');
  assert.equal(plugin.storage.settings.scale, '2');
});

test('an empty selection does not scan every slice on the page', async () => {
  const plugin = loadPlugin();
  await plugin.figma.ui.onmessage({ type: 'ready' });

  assert.equal(plugin.scans(), 0);
  const selection = plugin.messages.find((message) => message.type === 'selection');
  assert.equal(selection.nodes.length, 0);
});

test('a heartbeat does not rescan the page when nodechange is available', async () => {
  const frame = {
    id: 'frame', name: 'Email', width: 600, height: 1000,
    absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 1000 },
    exportAsync() {}
  };
  const plugin = loadPlugin({ selection: [frame] });
  const scansAfterSelection = plugin.scans();

  await plugin.figma.ui.onmessage({ type: 'poll' });

  assert.equal(plugin.scans(), scansAfterSelection);
  assert.equal(plugin.messages.some((message) => message.type === 'pong'), true);
});

test('selectionchange publishes frames before enriching their slice counts', async () => {
  function frame(id) {
    return {
      id, name: `Email ${id}`, width: 600, height: 1000,
      absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 1000 },
      exportAsync() {}
    };
  }
  const first = frame('1');
  const second = frame('2');
  const plugin = loadPlugin({ selection: [first] });

  plugin.page.selection = [first, second];
  plugin.handlers.selectionchange();

  assert.equal(plugin.scans(), 0);
  const update = plugin.messages.at(-1);
  assert.equal(update.type, 'selection');
  assert.equal(update.nodes.length, 2);
  assert.equal(update.nodes[0].id, '1');
  assert.equal(update.nodes[1].id, '2');

  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.equal(plugin.scans(), 1);
});

test('a burst of node changes produces one page refresh', async () => {
  const frame = {
    id: 'frame', name: 'Email', width: 600, height: 1000,
    absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 1000 },
    exportAsync() {}
  };
  const plugin = loadPlugin({ selection: [frame] });
  const before = plugin.scans();

  plugin.handlers['page:nodechange']();
  plugin.handlers['page:nodechange']();
  plugin.handlers['page:nodechange']();
  await new Promise((resolve) => setTimeout(resolve, 130));

  assert.equal(plugin.scans(), before + 1);
});

test('changing pages detaches the watcher from the previous page', () => {
  const plugin = loadPlugin();
  let detached = false;
  plugin.page.off = function (type) {
    if (type === 'nodechange') detached = true;
  };
  plugin.figma.currentPage = {
    selection: [],
    findAllWithCriteria() { return []; },
    findAll() { return []; },
    on() {}, off() {}
  };

  plugin.handlers.currentpagechange();

  assert.equal(detached, true);
});

test('prepare removes a moved plugin slice using its source frame ID', async () => {
  const page = { id: 'page' };
  const frame = {
    id: 'frame',
    absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 1000 }
  };
  const slice = {
    parent: page,
    removed: false,
    absoluteBoundingBox: { x: 1000, y: 1000, width: 600, height: 500 },
    getPluginData(key) {
      if (key === 'emailSlicer') return '1';
      if (key === 'source') return 'frame';
      return '';
    },
    remove() { this.removed = true; }
  };
  const plugin = loadPlugin({ slices: [slice], nodes: { frame } });

  await plugin.figma.ui.onmessage({ type: 'prepare', ids: ['frame'] });

  assert.equal(slice.removed, true);
});

test('pick mode falls back to existing canvas slice boundaries', () => {
  const source = fs.readFileSync('ui.html', 'utf8');
  const match = source.match(/  function pickedPoints\(frame\) \{[\s\S]*?\n  \}/);
  assert.ok(match, 'pickedPoints helper is missing');

  const context = { picks: {}, frame: { id: 'frame', slices: [{ top: 0 }, { top: 250 }, { top: 500 }, { top: 750 }] } };
  vm.runInNewContext(`${match[0]}\nresult = pickedPoints(frame);`, context);
  assert.deepEqual(Array.from(context.result), [250, 500, 750]);

  context.picks.frame = [];
  vm.runInNewContext('result = pickedPoints(frame);', context);
  assert.deepEqual(Array.from(context.result), []);
});

test('mark keeps slices at page level for native single-file export', async () => {
  const nested = [];
  const frame = {
    id: 'frame', width: 600, height: 1000,
    absoluteBoundingBox: { x: 100, y: 200, width: 600, height: 1000 },
    appendChild(node) { nested.push(node); }
  };
  const slice = {
    resize(width, height) { this.width = width; this.height = height; },
    setPluginData() {}
  };
  const plugin = loadPlugin({ nodes: { frame }, createSlice: () => slice });

  await plugin.figma.ui.onmessage({
    type: 'mark', nodeId: 'frame', scale: 2, format: 'image/jpeg',
    bands: [{ top: 250, height: 300, name: 'slice 1' }]
  });

  assert.equal(nested.length, 0);
  assert.equal(slice.x, 100);
  assert.equal(slice.y, 450);
  assert.equal(slice.width, 600);
  assert.equal(slice.height, 300);
});

test('each Download next click saves exactly one prepared file', () => {
  const source = fs.readFileSync('ui.html', 'utf8');
  const match = source.match(/  function downloadNext\(\) \{[\s\S]*?\n  \}/);
  assert.ok(match, 'downloadNext helper is missing');
  assert.match(source, /el\('downloadNext'\)\.addEventListener\('click', downloadNext\);/);

  const saved = [];
  const context = {
    downloads: [{ blob: 'one', filename: 'one.jpg' }, { blob: 'two', filename: 'two.jpg' }],
    downloadIndex: 0,
    save(blob, filename) { saved.push({ blob, filename }); },
    updateDownloadButton() {},
    setStatus() {}
  };
  vm.runInNewContext(`${match[0]}\ndownloadNext();`, context);

  assert.deepEqual(saved, [{ blob: 'one', filename: 'one.jpg' }]);
  assert.equal(context.downloadIndex, 1);
  assert.equal(context.downloads.length, 2);
});

test('Download all as ZIP keeps the separate files available', async () => {
  const source = fs.readFileSync('ui.html', 'utf8');
  const next = source.match(/  function downloadNext\(\) \{[\s\S]*?\n  \}/);
  const zip = source.match(/  async function downloadZip\(\) \{[\s\S]*?\n  \}/);
  assert.ok(next, 'downloadNext helper is missing');
  assert.ok(zip, 'downloadZip helper is missing');
  assert.match(source, /el\('downloadZip'\)\.addEventListener\('click', downloadZip\);/);

  const saved = [];
  const context = {
    downloads: [
      { blob: { async arrayBuffer() { return Uint8Array.of(1).buffer; } }, filename: 'one.jpg' },
      { blob: { async arrayBuffer() { return Uint8Array.of(2).buffer; } }, filename: 'two.jpg' }
    ],
    downloadIndex: 0,
    packingZip: false,
    zipName: 'slices.zip',
    buildZip(files) { return files.map((file) => file.name).join(','); },
    save(blob, filename) { saved.push({ blob, filename }); },
    updateDownloadButton() {},
    setStatus() {}
  };
  vm.runInNewContext(next[0] + '\n' + zip[0], context);
  context.downloadNext();
  await context.downloadZip();

  assert.deepEqual(saved, [
    { blob: context.downloads[0].blob, filename: 'one.jpg' },
    { blob: 'one.jpg,two.jpg', filename: 'slices.zip' }
  ]);
  assert.equal(context.downloads.length, 2);
});

test('ZIP failures are reported and the ZIP button recovers', async () => {
  const source = fs.readFileSync('ui.html', 'utf8');
  const match = source.match(/  async function downloadZip\(\) \{[\s\S]*?\n  \}/);
  const statuses = [];
  const context = {
    downloads: [{ blob: { async arrayBuffer() { throw new Error('Broken image'); } }, filename: 'one.jpg' }],
    packingZip: false,
    zipName: 'slices.zip',
    updateDownloadButton() {},
    setStatus(message, bad) { statuses.push({ message, bad }); }
  };
  vm.runInNewContext(match[0], context);

  await context.downloadZip();

  assert.deepEqual(statuses, [{ message: 'Broken image', bad: true }]);
  assert.equal(context.packingZip, false);
});
