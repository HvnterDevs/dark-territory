const $ = id => document.getElementById(id);
const STORAGE_KEY = 'dark-territory-digital-twin-v1';
const SVG_NS = 'http://www.w3.org/2000/svg';
const initialState = () => ({
  nextId: 15,
  tracks: Array.from({ length: 14 }, (_, index) => {
    const points = [
      [320, 150, 0], [440, 150, 0], [560, 150, 0], [680, 150, 0],
      [740, 210, 90], [740, 330, 90], [740, 450, 90],
      [680, 510, 180], [560, 510, 180], [440, 510, 180], [320, 510, 180],
      [260, 450, 270], [260, 330, 270], [260, 210, 270]
    ];
    const [x, y, rotation] = points[index];
    return { id: `T${index + 1}`, kind: 'straight', x, y, rotation };
  }),
  devices: [
    { id: 'D1', kind: 'train', name: 'Class 37 · DCC-3', x: 440, y: 150, rotation: 0, controller: 'DCC-01', running: false, throttle: 0, direction: 'Forward', progress: 180 },
    { id: 'D2', kind: 'signal', name: 'Signal S-01', x: 620, y: 150, rotation: 0, controller: 'IO-02', aspect: 'Clear' },
    { id: 'D3', kind: 'crossing', name: 'Crosswalk X-01', x: 740, y: 330, rotation: 90, controller: 'IO-03', active: false },
    { id: 'D4', kind: 'sensor', name: 'Block sensor B-01', x: 440, y: 510, rotation: 0, controller: 'IO-02', occupied: false }
  ],
  controllers: [
    { id: 'DCC-01', name: 'DCC Command Station', detail: 'Locomotive bus · address 3', connected: true, supports: ['train'] },
    { id: 'IO-02', name: 'Signal & Sensor MCU', detail: 'Microcontroller · 4 I/O', connected: true, supports: ['signal', 'sensor'] },
    { id: 'IO-03', name: 'Crossing MCU', detail: 'Microcontroller · 2 I/O', connected: true, supports: ['crossing'] }
  ],
  activity: ['Twin ready · simulated controllers online.']
});

let state = restoreState();
let activeTool = 'select';
let selectedId = null;
let rotation = 0;
let viewBox = { x: 0, y: 0, width: 1000, height: 620 };
let pointerAction = null;
let toastTimer;
let trainFrame = 0;

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 1 && Array.isArray(saved.tracks) && Array.isArray(saved.devices) && Array.isArray(saved.controllers)) {
      const base = initialState();
      return {
        ...base,
        ...saved,
        tracks: saved.tracks.filter(item => ['straight', 'curve', 'turnout'].includes(item.kind)).slice(0, 500),
        devices: saved.devices.filter(item => ['train', 'signal', 'crossing', 'sensor'].includes(item.kind)).slice(0, 250),
        controllers: base.controllers.map(controller => ({ ...controller, connected: saved.controllers.find(item => item.id === controller.id)?.connected !== false })),
        activity: Array.isArray(saved.activity) ? saved.activity.slice(0, 20) : base.activity
      };
    }
  } catch { /* Use the example layout when local browser data is missing or invalid. */ }
  return initialState();
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...state })); }
  catch { /* The editor stays usable if browser storage is unavailable. */ }
}

function svgEl(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (parent) parent.append(node);
  return node;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function toast(message) {
  $('twinToast').textContent = message;
  $('twinToast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('twinToast').classList.remove('show'), 1700);
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  state.activity.unshift(`${timestamp}  ${message}`);
  state.activity = state.activity.slice(0, 20);
  persist();
  renderActivity();
}

// The editor talks to this adapter only. Replace it with a server transport later;
// browser UI and device controls do not need to know about a hardware protocol.
const controllerAdapter = {
  async setOnline(controllerId, online) {
    await Promise.resolve();
    const controller = state.controllers.find(item => item.id === controllerId);
    if (!controller) throw new Error('Controller not found.');
    controller.connected = online;
    if (!online) {
      for (const device of state.devices.filter(item => item.controller === controllerId)) {
        if (device.kind === 'train') { device.running = false; device.throttle = 0; }
      }
    }
    return { accepted: true, mode: 'simulated' };
  },
  async command(controllerId, device, command, value) {
    await Promise.resolve();
    const controller = state.controllers.find(item => item.id === controllerId);
    if (!controller?.connected) throw new Error('The assigned controller is offline.');
    if (!controller.supports.includes(device.kind)) throw new Error('This controller does not support that device type.');
    if (command === 'train') Object.assign(device, value);
    if (command === 'signal') device.aspect = value;
    if (command === 'crossing') device.active = value;
    if (command === 'sensor') device.occupied = value;
    return { accepted: true, mode: 'simulated', receivedAt: Date.now() };
  }
};

function deviceOnline(device) {
  return state.controllers.find(item => item.id === device.controller)?.connected === true;
}

function deviceState(device) {
  if (!deviceOnline(device)) return 'OFFLINE';
  if (device.kind === 'train') return device.running ? `${device.throttle}% · RUNNING` : 'IDLE';
  if (device.kind === 'signal') return String(device.aspect || 'Stop').toUpperCase();
  if (device.kind === 'crossing') return device.active ? 'LIGHTS ACTIVE' : 'STANDBY';
  return device.occupied ? 'OCCUPIED' : 'CLEAR';
}

function trackPath(track) {
  if (track.kind === 'curve') return 'M -60 0 A 60 60 0 0 0 0 -60';
  if (track.kind === 'turnout') return 'M -60 0 L 60 0 M -25 0 Q 12 0 55 -38';
  return 'M -60 0 L 60 0';
}

function makeTrackArt(group, track) {
  const path = trackPath(track);
  svgEl('path', { d: path, class: 'track-bed' }, group);
  svgEl('path', { d: path, class: 'track-center' }, group);
  if (track.kind === 'straight') {
    for (let x = -54; x <= 54; x += 12) svgEl('path', { d: `M ${x} -8 L ${x} 8`, class: 'track-tie' }, group);
    svgEl('path', { d: 'M -60 -4 L 60 -4 M -60 4 L 60 4', class: 'track-rail' }, group);
  } else if (track.kind === 'curve') {
    for (let index = 0; index <= 9; index++) {
      const angle = Math.PI + index * (Math.PI / 2 / 9);
      const x1 = Math.cos(angle) * 53, y1 = Math.sin(angle) * 53;
      const x2 = Math.cos(angle) * 67, y2 = Math.sin(angle) * 67;
      svgEl('path', { d: `M ${x1} ${y1} L ${x2} ${y2}`, class: 'track-tie' }, group);
    }
  } else {
    for (let x = -54; x <= 54; x += 12) svgEl('path', { d: `M ${x} -8 L ${x} 8`, class: 'track-tie' }, group);
    svgEl('path', { d: 'M -60 -4 L 60 -4 M -60 4 L 60 4 M -23 1 Q 12 1 54 -37', class: 'track-rail' }, group);
    svgEl('path', { d: track.branch === false ? 'M -20 0 L 23 0' : 'M -20 0 Q 8 0 33 -21', class: 'turnout-blade' }, group);
  }
}

function deviceArt(group, device) {
  const online = deviceOnline(device);
  const stateText = deviceState(device);
  const art = svgEl('g', { transform: `rotate(${device.rotation || 0})` }, group);
  if (device.kind === 'signal') {
    svgEl('path', { d: 'M 0 8 L 0 -29', class: 'device-post' }, art);
    svgEl('rect', { x: -12, y: -37, width: 24, height: 26, rx: 5, class: 'signal-case' }, art);
    svgEl('circle', { cx: 0, cy: -29, r: 5, class: `signal-lamp ${device.aspect === 'Clear' && online ? 'lamp-green' : device.aspect === 'Approach' && online ? 'lamp-yellow' : 'lamp-red'}` }, art);
    svgEl('circle', { cx: 0, cy: 9, r: 8, class: 'device-hit' }, art);
  } else if (device.kind === 'train') {
    svgEl('rect', { x: -29, y: -14, width: 58, height: 28, rx: 7, class: 'train-body' }, art);
    svgEl('rect', { x: -9, y: -10, width: 17, height: 16, rx: 2, class: 'train-window' }, art);
    svgEl('path', { d: 'M -22 -10 L -13 -10 M 14 -10 L 22 -10', class: 'train-detail' }, art);
    svgEl('circle', { cx: -17, cy: 15, r: 4, class: 'train-wheel' }, art);
    svgEl('circle', { cx: 17, cy: 15, r: 4, class: 'train-wheel' }, art);
    svgEl('circle', { cx: 0, cy: 0, r: 37, class: 'device-hit' }, art);
  } else if (device.kind === 'crossing') {
    svgEl('rect', { x: -34, y: -13, width: 68, height: 26, rx: 3, class: 'road-surface' }, art);
    for (let x = -23; x <= 23; x += 12) svgEl('path', { d: `M ${x} -12 L ${x} 12`, class: 'crossing-stripe' }, art);
    for (const side of [-1, 1]) {
      svgEl('rect', { x: side * 27 - 5, y: -23, width: 10, height: 12, rx: 3, class: 'crossing-lamp-case' }, art);
      svgEl('circle', { cx: side * 27, cy: -17, r: 3.4, class: `crossing-lamp ${device.active && online ? 'lamp-red' : 'lamp-dim'}` }, art);
    }
    svgEl('circle', { cx: 0, cy: 0, r: 39, class: 'device-hit' }, art);
  } else {
    svgEl('circle', { cx: 0, cy: 0, r: 13, class: 'sensor-ring' }, art);
    svgEl('circle', { cx: 0, cy: 0, r: 5, class: `sensor-core ${device.occupied && online ? 'sensor-occupied' : ''}` }, art);
    svgEl('circle', { cx: 0, cy: 0, r: 20, class: 'device-hit' }, art);
  }
  const caption = svgEl('text', { x: 0, y: device.kind === 'train' ? 35 : 26, class: 'device-caption' }, group);
  caption.textContent = device.name;
  const status = svgEl('text', { x: 0, y: device.kind === 'train' ? 47 : 38, class: `device-subcaption ${online ? '' : 'offline-text'}` }, group);
  status.textContent = stateText;
}

function renderMap() {
  const tracks = $('twinTracks'), devices = $('twinDevices'), selection = $('twinSelection');
  tracks.replaceChildren(); devices.replaceChildren(); selection.replaceChildren();
  for (const track of state.tracks) {
    const group = svgEl('g', { transform: `translate(${track.x} ${track.y}) rotate(${track.rotation})`, class: `track-piece ${selectedId === track.id ? 'is-selected' : ''}`, 'data-entity-id': track.id, 'data-entity-type': 'track' }, tracks);
    makeTrackArt(group, track);
    const title = svgEl('title', {}, group); title.textContent = `${track.kind} track · ${track.id}`;
  }
  for (const device of state.devices) {
    const group = svgEl('g', { transform: `translate(${device.x} ${device.y})`, class: `rail-device device-${device.kind} ${selectedId === device.id ? 'is-selected' : ''}`, 'data-entity-id': device.id, 'data-entity-type': 'device' }, devices);
    deviceArt(group, device);
    const title = svgEl('title', {}, group); title.textContent = `${device.name} · ${stateTextForTitle(device)}`;
  }
  const selected = [...state.tracks, ...state.devices].find(item => item.id === selectedId);
  if (selected) {
    svgEl('circle', { cx: selected.x, cy: selected.y, r: selected.kind === 'train' ? 41 : 26, class: 'selection-ring' }, selection);
  }
  $('twinTrackCount').textContent = `${state.tracks.length} track ${state.tracks.length === 1 ? 'piece' : 'pieces'}`;
  $('twinDeviceCount').textContent = `${state.devices.length} ${state.devices.length === 1 ? 'device' : 'devices'}`;
  renderSelection();
  renderControllers();
}

function stateTextForTitle(device) { return deviceState(device); }

function renderControllers() {
  const host = $('controllerList');
  host.innerHTML = state.controllers.map(controller => {
    const count = state.devices.filter(device => device.controller === controller.id).length;
    return `<article class="controller-card ${controller.connected ? 'controller-online' : 'controller-offline'}">
      <div class="controller-card-top"><span class="controller-chip">${controller.id}</span><span class="connection-state"><i></i>${controller.connected ? 'ONLINE' : 'OFFLINE'}</span></div>
      <b>${esc(controller.name)}</b><small>${esc(controller.detail)}</small>
      <div class="controller-card-bottom"><span>${count} assigned ${count === 1 ? 'device' : 'devices'}</span><button class="controller-toggle ${controller.connected ? '' : 'disconnected'}" data-controller="${controller.id}">${controller.connected ? 'Disconnect' : 'Reconnect'}</button></div>
    </article>`;
  }).join('');
  host.querySelectorAll('[data-controller]').forEach(button => button.addEventListener('click', async () => {
    const controller = state.controllers.find(item => item.id === button.dataset.controller);
    try {
      await controllerAdapter.setOnline(controller.id, !controller.connected);
      log(`${controller.id} ${controller.connected ? 'reconnected' : 'disconnected'} · simulated link.`);
      if (selectedId && state.devices.some(device => device.id === selectedId)) renderSelection();
      renderMap();
    } catch (error) { toast(error.message); }
  }));
}

function renderSelection() {
  const host = $('selectedDevice');
  const device = state.devices.find(item => item.id === selectedId);
  const track = state.tracks.find(item => item.id === selectedId);
  if (!device && !track) {
    $('selectedTitle').textContent = 'Select a device'; $('selectedStatus').textContent = '—'; $('selectedStatus').className = 'device-status';
    host.innerHTML = '<p>Choose an element on the plan to see its status and controls. Select & move lets you drag track and devices into place.</p>';
    return;
  }
  if (track) {
    $('selectedTitle').textContent = `${track.kind[0].toUpperCase()}${track.kind.slice(1)} track`;
    $('selectedStatus').textContent = 'LAYOUT'; $('selectedStatus').className = 'device-status';
    host.innerHTML = `<div class="device-summary"><span>Piece ID</span><b>${esc(track.id)}</b></div><div class="device-summary"><span>Position</span><b>${Math.round(track.x)}, ${Math.round(track.y)}</b></div><div class="device-summary"><span>Rotation</span><b>${Math.round(track.rotation)}°</b></div><button class="button full selected-remove" id="selectedRemove">Remove this piece</button>`;
    $('selectedRemove').addEventListener('click', removeSelected);
    return;
  }
  const online = deviceOnline(device);
  $('selectedTitle').textContent = device.name;
  $('selectedStatus').textContent = deviceState(device);
  $('selectedStatus').className = `device-status ${online ? 'is-online' : 'is-offline'}`;
  const controllers = state.controllers.filter(item => item.supports.includes(device.kind));
  const controllerSelect = `<label class="twin-control-label">Controller<select id="deviceController" ${controllers.length < 2 || !online ? 'disabled' : ''}>${controllers.map(item => `<option value="${item.id}" ${device.controller === item.id ? 'selected' : ''}>${esc(item.id)} · ${esc(item.name)}</option>`).join('')}</select></label>`;
  let controls = '';
  if (device.kind === 'train') controls = `<div class="train-control"><label class="twin-control-label">Throttle <b id="deviceThrottleValue">${device.throttle}%</b><input id="deviceThrottle" type="range" min="0" max="100" value="${device.throttle}" ${online ? '' : 'disabled'}></label><div class="train-control-row"><label class="twin-control-label">Direction<select id="deviceDirection" ${online ? '' : 'disabled'}><option ${device.direction === 'Forward' ? 'selected' : ''}>Forward</option><option ${device.direction === 'Reverse' ? 'selected' : ''}>Reverse</option></select></label><button class="button run-device" id="deviceRun" ${online ? '' : 'disabled'}>${device.running ? 'Ⅱ Stop train' : '▶ Run train'}</button></div></div>`;
  if (device.kind === 'signal') controls = `<label class="twin-control-label">Signal aspect<select id="deviceAspect" ${online ? '' : 'disabled'}><option ${device.aspect === 'Clear' ? 'selected' : ''}>Clear</option><option ${device.aspect === 'Approach' ? 'selected' : ''}>Approach</option><option ${device.aspect === 'Stop' ? 'selected' : ''}>Stop</option></select></label>`;
  if (device.kind === 'crossing') controls = `<div class="control-state-row"><span>Crosswalk light circuit</span><button class="toggle-control ${device.active ? 'control-on' : ''}" id="deviceCrossing" ${online ? '' : 'disabled'}>${device.active ? 'ACTIVE' : 'STANDBY'}</button></div>`;
  if (device.kind === 'sensor') controls = `<div class="control-state-row"><span>Block occupancy input</span><button class="toggle-control ${device.occupied ? 'control-on' : ''}" id="deviceSensor" ${online ? '' : 'disabled'}>${device.occupied ? 'OCCUPIED' : 'CLEAR'}</button></div>`;
  host.innerHTML = `<div class="device-summary"><span>Device ID</span><b>${esc(device.id)}</b></div>${controllerSelect}${controls}${!online ? '<div class="offline-note">Reconnect this controller to send commands.</div>' : '<div class="command-note">Commands use the local simulated adapter.</div>'}<button class="button full selected-remove" id="selectedRemove">Remove this device</button>`;
  $('selectedRemove').addEventListener('click', removeSelected);
  $('deviceController')?.addEventListener('change', event => {
    device.controller = event.target.value;
    log(`${device.id} assigned to ${device.controller}.`);
    renderMap();
  });
  $('deviceThrottle')?.addEventListener('input', event => {
    const value = Number(event.target.value);
    $('deviceThrottleValue').textContent = `${value}%`;
    device.throttle = value;
    if (value === 0) device.running = false;
    persist();
  });
  $('deviceThrottle')?.addEventListener('change', () => sendCommand(device, 'train', { throttle: device.throttle, running: device.running }));
  $('deviceDirection')?.addEventListener('change', event => sendCommand(device, 'train', { direction: event.target.value }));
  $('deviceRun')?.addEventListener('click', () => {
    const running = !device.running;
    sendCommand(device, 'train', { running, throttle: running && !device.throttle ? 25 : device.throttle });
  });
  $('deviceAspect')?.addEventListener('change', event => sendCommand(device, 'signal', event.target.value));
  $('deviceCrossing')?.addEventListener('click', () => sendCommand(device, 'crossing', !device.active));
  $('deviceSensor')?.addEventListener('click', () => sendCommand(device, 'sensor', !device.occupied));
}

async function sendCommand(device, command, value) {
  try {
    await controllerAdapter.command(device.controller, device, command, value);
    log(`${device.name} · ${command} command accepted by ${device.controller} (simulated).`);
    renderMap();
  } catch (error) { toast(error.message); }
}

function renderActivity() {
  const host = $('twinActivity');
  host.innerHTML = state.activity.length ? state.activity.map(item => `<div>${esc(item)}</div>`).join('') : '<span class="activity-empty">No recent activity.</span>';
}

function renderSelectionState() {
  renderMap();
}

function setTool(tool) {
  activeTool = tool;
  document.querySelectorAll('[data-twin-tool]').forEach(button => button.classList.toggle('active', button.dataset.twinTool === tool));
  $('cursorReadout').textContent = tool === 'select' ? 'SELECT / MOVE' : tool === 'remove' ? 'REMOVE' : `PLACE ${tool.toUpperCase()}`;
}

function svgPosition(event) {
  const svg = $('twinCanvas');
  const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function snap(value) { return Math.round(value / 24) * 24; }
function inBoard(x, y) { return x >= 60 && x <= 940 && y >= 70 && y <= 550; }

function createTrack(kind, point) {
  if (state.tracks.length >= 500) return toast('The layout limit is 500 track pieces.');
  state.tracks.push({ id: `T${state.nextId++}`, kind, x: snap(point.x), y: snap(point.y), rotation });
  selectedId = state.tracks.at(-1).id;
  persist(); renderMap(); log(`${kind} track added to the plan.`);
}

function createDevice(kind, point) {
  if (state.devices.length >= 250) return toast('The layout limit is 250 devices.');
  const defaults = {
    train: { name: `DCC locomotive ${state.devices.filter(item => item.kind === 'train').length + 1}`, controller: 'DCC-01', running: false, throttle: 0, direction: 'Forward', progress: 0 },
    signal: { name: `Signal S-${String(state.devices.filter(item => item.kind === 'signal').length + 1).padStart(2, '0')}`, controller: 'IO-02', aspect: 'Stop' },
    crossing: { name: `Crosswalk ${String(state.devices.filter(item => item.kind === 'crossing').length + 1).padStart(2, '0')}`, controller: 'IO-03', active: false },
    sensor: { name: `Track sensor ${String(state.devices.filter(item => item.kind === 'sensor').length + 1).padStart(2, '0')}`, controller: 'IO-02', occupied: false }
  }[kind];
  const device = { id: `D${state.nextId++}`, kind, x: snap(point.x), y: snap(point.y), rotation, ...defaults };
  state.devices.push(device); selectedId = device.id;
  persist(); renderMap(); log(`${device.name} placed · ${device.controller} simulated controller.`);
}

function removeSelected() {
  if (!selectedId) return;
  const trackIndex = state.tracks.findIndex(item => item.id === selectedId);
  const deviceIndex = state.devices.findIndex(item => item.id === selectedId);
  if (trackIndex >= 0) { const [item] = state.tracks.splice(trackIndex, 1); log(`${item.id} track piece removed.`); }
  if (deviceIndex >= 0) { const [item] = state.devices.splice(deviceIndex, 1); log(`${item.name} removed from the plan.`); }
  selectedId = null; persist(); renderMap();
}

function rotateSelected() {
  const item = [...state.tracks, ...state.devices].find(entity => entity.id === selectedId);
  if (!item) { rotation = (rotation + 90) % 360; toast(`New elements will be rotated ${rotation}°.`); return; }
  item.rotation = ((Number(item.rotation) || 0) + 90) % 360;
  persist(); renderMap();
}

function addAt(point) {
  if (!inBoard(point.x, point.y)) return toast('Place elements inside the module boundary.');
  if (activeTool === 'straight' || activeTool === 'curve' || activeTool === 'turnout') return createTrack(activeTool, point);
  if (['signal', 'train', 'crossing', 'sensor'].includes(activeTool)) return createDevice(activeTool, point);
}

function applyViewBox() {
  $('twinCanvas').setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
}

function fitView() {
  viewBox = { x: 0, y: 0, width: 1000, height: 620 };
  applyViewBox();
}

function bindCanvas() {
  const svg = $('twinCanvas');
  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const target = event.target.closest('[data-entity-id]');
    const point = svgPosition(event);
    if (activeTool === 'remove' && target) { selectedId = target.dataset.entityId; removeSelected(); return; }
    if (activeTool !== 'select') { addAt(point); return; }
    if (target) {
      selectedId = target.dataset.entityId;
      pointerAction = { kind: 'move', id: selectedId, x: point.x, y: point.y, moved: false };
      renderSelectionState();
    } else {
      selectedId = null;
      pointerAction = { kind: 'pan', clientX: event.clientX, clientY: event.clientY, moved: false };
      renderSelectionState();
    }
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    const point = svgPosition(event);
    $('cursorReadout').textContent = pointerAction ? activeTool === 'select' ? 'DRAG TO EDIT' : 'MOVING' : `${Math.round(point.x)}, ${Math.round(point.y)}`;
    if (!pointerAction) return;
    if (pointerAction.kind === 'move') {
      const entity = [...state.tracks, ...state.devices].find(item => item.id === pointerAction.id);
      if (!entity) return;
      const dx = point.x - pointerAction.x, dy = point.y - pointerAction.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) pointerAction.moved = true;
      if (pointerAction.moved) {
        entity.x = Math.max(60, Math.min(940, entity.x + dx));
        entity.y = Math.max(70, Math.min(550, entity.y + dy));
        pointerAction.x = point.x; pointerAction.y = point.y;
        renderMap();
      }
    } else {
      const dx = event.clientX - pointerAction.clientX, dy = event.clientY - pointerAction.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 1) pointerAction.moved = true;
      if (pointerAction.moved) {
        const bounds = svg.getBoundingClientRect();
        viewBox.x -= dx * viewBox.width / bounds.width;
        viewBox.y -= dy * viewBox.height / bounds.height;
        pointerAction.clientX = event.clientX; pointerAction.clientY = event.clientY;
        applyViewBox();
      }
    }
  });
  svg.addEventListener('pointerup', () => {
    if (pointerAction?.kind === 'move' && pointerAction.moved) { persist(); renderMap(); }
    pointerAction = null;
  });
  svg.addEventListener('pointercancel', () => { pointerAction = null; });
  svg.addEventListener('wheel', event => {
    event.preventDefault();
    const anchor = svgPosition(event), scale = event.deltaY < 0 ? .88 : 1.14;
    const width = Math.max(480, Math.min(1600, viewBox.width * scale));
    const height = width * 620 / 1000;
    const ratio = width / viewBox.width;
    viewBox.x = anchor.x - (anchor.x - viewBox.x) * ratio;
    viewBox.y = anchor.y - (anchor.y - viewBox.y) * ratio;
    viewBox.width = width; viewBox.height = height;
    applyViewBox();
  }, { passive: false });
  svg.addEventListener('contextmenu', event => event.preventDefault());
}

function renderAll() {
  renderMap(); renderActivity();
}

function exportLayout() {
  const file = { format: 'dark-territory-digital-twin', version: 1, tracks: state.tracks, devices: state.devices, controllers: state.controllers };
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'dark-territory-digital-twin.json'; anchor.click();
  URL.revokeObjectURL(url); toast('Twin layout exported.');
}

async function importLayout(file) {
  const data = JSON.parse(await file.text());
  if (data.format !== 'dark-territory-digital-twin' || !Array.isArray(data.tracks) || !Array.isArray(data.devices)) throw new Error('Choose a Digital Twin layout JSON file.');
  if (data.tracks.length > 500 || data.devices.length > 250) throw new Error('This layout exceeds the editor item limit.');
  const base = initialState();
  state.tracks = data.tracks.filter(item => ['straight', 'curve', 'turnout'].includes(item.kind)).map((item, index) => ({ id: String(item.id || `T${index + 1}`).slice(0, 16), kind: item.kind, x: Number(item.x) || 0, y: Number(item.y) || 0, rotation: Number(item.rotation) || 0, branch: item.branch !== false }));
  state.devices = data.devices.filter(item => ['train', 'signal', 'crossing', 'sensor'].includes(item.kind)).map((item, index) => ({ ...item, id: String(item.id || `D${index + 1}`).slice(0, 16), x: Number(item.x) || 0, y: Number(item.y) || 0, rotation: Number(item.rotation) || 0 }));
  state.controllers = base.controllers.map(controller => ({ ...controller, connected: data.controllers?.find(item => item.id === controller.id)?.connected !== false }));
  state.nextId = 1 + [...state.tracks, ...state.devices].reduce((max, item) => Math.max(max, Number(String(item.id).slice(1)) || 0), 0);
  state.activity = [];
  selectedId = null; persist(); renderAll(); log('Twin layout imported from a local JSON file.'); toast('Twin layout imported.');
}

document.querySelectorAll('[data-twin-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.twinTool)));
$('twinRotate').addEventListener('click', rotateSelected);
$('twinFit').addEventListener('click', fitView);
$('twinExport').addEventListener('click', exportLayout);
$('twinImport').addEventListener('click', () => $('twinFile').click());
$('twinFile').addEventListener('change', async () => {
  try { if ($('twinFile').files[0]) await importLayout($('twinFile').files[0]); }
  catch (error) { toast(error.message || 'Unable to import layout.'); }
  $('twinFile').value = '';
});
$('clearTwinActivity').addEventListener('click', () => { state.activity = []; persist(); renderActivity(); });
document.addEventListener('keydown', event => {
  if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    if (event.code === 'KeyR') rotateSelected();
    if (event.code === 'Delete' || event.code === 'Backspace') removeSelected();
    if (event.code === 'Escape') { selectedId = null; setTool('select'); renderMap(); }
  }
});

const trainRoute = [[260, 150], [740, 150], [740, 510], [260, 510], [260, 150]];
function advanceTrains(time) {
  if (time - trainFrame > 100) {
    trainFrame = time;
    let changed = false;
    for (const train of state.devices.filter(device => device.kind === 'train' && device.running && deviceOnline(device))) {
      train.progress = ((train.progress || 0) + Math.max(0.2, train.throttle / 100 * 2.8)) % 1680;
      const distance = train.progress;
      const lengths = [480, 360, 480, 360];
      let remaining = distance, segment = 0;
      while (segment < lengths.length - 1 && remaining >= lengths[segment]) { remaining -= lengths[segment++]; }
      const start = trainRoute[segment], end = trainRoute[segment + 1], portion = remaining / lengths[segment];
      train.x = start[0] + (end[0] - start[0]) * portion;
      train.y = start[1] + (end[1] - start[1]) * portion;
      train.rotation = segment === 0 ? 0 : segment === 1 ? 90 : segment === 2 ? 180 : 270;
      const group = $('twinDevices').querySelector(`[data-entity-id="${train.id}"]`);
      if (group) {
        group.setAttribute('transform', `translate(${train.x} ${train.y})`);
        group.querySelector(':scope > g')?.setAttribute('transform', `rotate(${train.rotation})`);
      }
      if (selectedId === train.id) {
        const ring = $('twinSelection').querySelector('.selection-ring');
        if (ring) { ring.setAttribute('cx', train.x); ring.setAttribute('cy', train.y); }
      }
      changed = true;
    }
    if (changed) persist();
  }
  requestAnimationFrame(advanceTrains);
}

bindCanvas();
renderAll();
setTool(activeTool);
persist();
requestAnimationFrame(advanceTrains);
