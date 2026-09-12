// Fullscreen map & GPS pathfinder. Draws the building footprints and mission
// markers on a 2D canvas and lets the player tap anywhere to drop a waypoint;
// game.js then tracks straight-line bearing/distance to it every frame via
// its own gps-hud widget. This is straight-line GPS, not turn-by-turn A*
// routing -- the city is a regular street grid, so a bearing arrow is enough
// to get someone there, and building real road-graph pathfinding was out of
// scope for this pass.
let canvas_, ctx_, world_, getters_, onWaypoint_;

export function initMapGPS(panelEl, world, getters, onWaypoint) {
  canvas_ = panelEl.querySelector('#map-canvas');
  ctx_ = canvas_.getContext('2d');
  world_ = world;
  getters_ = getters;
  onWaypoint_ = onWaypoint;

  canvas_.addEventListener('pointerdown', (e) => {
    const rect = canvas_.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const x = px * world_.citySize - world_.cityHalf;
    const z = py * world_.citySize - world_.cityHalf;
    onWaypoint_(x, z);
  });
}

export function renderMapGPS() {
  if (!ctx_) return;
  const w = canvas_.width, h = canvas_.height;
  const scale = w / world_.citySize;

  ctx_.fillStyle = '#141a26';
  ctx_.fillRect(0, 0, w, h);

  ctx_.fillStyle = 'rgba(255,255,255,0.07)';
  ctx_.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx_.lineWidth = 1;
  for (const b of world_.buildingAABBs) {
    const bx = (b.minX + world_.cityHalf) * scale, bz = (b.minZ + world_.cityHalf) * scale;
    const bw = (b.maxX - b.minX) * scale, bh = (b.maxZ - b.minZ) * scale;
    ctx_.fillRect(bx, bz, bw, bh);
    ctx_.strokeRect(bx, bz, bw, bh);
  }

  for (const m of getters_.getMarkers()) {
    ctx_.fillStyle = m.kind === 'taxi' ? '#43c6ff' : '#ffd23f';
    ctx_.beginPath();
    ctx_.arc((m.x + world_.cityHalf) * scale, (m.z + world_.cityHalf) * scale, 5, 0, Math.PI * 2);
    ctx_.fill();
  }

  const wp = getters_.getWaypoint();
  if (wp) {
    ctx_.strokeStyle = '#ff5f5f';
    ctx_.lineWidth = 2;
    ctx_.beginPath();
    ctx_.arc((wp.x + world_.cityHalf) * scale, (wp.z + world_.cityHalf) * scale, 9, 0, Math.PI * 2);
    ctx_.stroke();
  }

  const foot = getters_.getPlayer();
  ctx_.fillStyle = '#66bce5';
  ctx_.strokeStyle = '#fff';
  ctx_.lineWidth = 1.5;
  ctx_.beginPath();
  ctx_.arc((foot.x + world_.cityHalf) * scale, (foot.z + world_.cityHalf) * scale, 6, 0, Math.PI * 2);
  ctx_.fill();
  ctx_.stroke();
}
