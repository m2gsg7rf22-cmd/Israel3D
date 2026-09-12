// Fullscreen map & GPS pathfinder. The street grid is perfectly regular
// (intersections every BLOCK meters), so instead of a straight-line bearing
// we build a real road graph -- one node per intersection, edges along the
// streets connecting them -- and run A* over it. Tapping the map computes a
// turn-by-turn route from the player's nearest intersection to the tapped
// point; game.js walks the returned waypoint list one hop at a time via its
// gps-hud arrow, advancing to the next hop on arrival.
let canvas_, ctx_, tooltip_, world_, getters_, onWaypoint_;
let graph_ = null;

export function buildRoadGraph(cityHalf, block) {
  const coords = [];
  for (let v = -cityHalf; v <= cityHalf + 0.01; v += block) coords.push(Math.round(v));
  const nodes = [];
  const index = new Map();
  for (const x of coords) {
    for (const z of coords) {
      index.set(`${x},${z}`, nodes.length);
      nodes.push({ x, z, neighbors: [] });
    }
  }
  for (const x of coords) {
    for (const z of coords) {
      const id = index.get(`${x},${z}`);
      const right = index.get(`${x + block},${z}`);
      const down = index.get(`${x},${z + block}`);
      if (right !== undefined) { nodes[id].neighbors.push(right); nodes[right].neighbors.push(id); }
      if (down !== undefined) { nodes[id].neighbors.push(down); nodes[down].neighbors.push(id); }
    }
  }
  return { nodes, index, block, cityHalf };
}

function nearestNode(graph, x, z) {
  const clamp = (v) => Math.max(-graph.cityHalf, Math.min(graph.cityHalf, v));
  const nx = Math.round(clamp(x) / graph.block) * graph.block;
  const nz = Math.round(clamp(z) / graph.block) * graph.block;
  return graph.index.get(`${nx},${nz}`);
}

function aStar(graph, startId, goalId) {
  const { nodes } = graph;
  if (startId === undefined || goalId === undefined) return null;
  const goal = nodes[goalId];
  const h = (id) => Math.abs(nodes[id].x - goal.x) + Math.abs(nodes[id].z - goal.z);
  const open = new Set([startId]);
  const cameFrom = new Map();
  const gScore = new Map([[startId, 0]]);
  const fScore = new Map([[startId, h(startId)]]);
  while (open.size) {
    let current = null, bestF = Infinity;
    for (const id of open) { const f = fScore.get(id) ?? Infinity; if (f < bestF) { bestF = f; current = id; } }
    if (current === goalId) {
      const path = [current];
      while (cameFrom.has(current)) { current = cameFrom.get(current); path.unshift(current); }
      return path.map((id) => ({ x: nodes[id].x, z: nodes[id].z }));
    }
    open.delete(current);
    for (const nb of nodes[current].neighbors) {
      const tentative = gScore.get(current) + graph.block;
      if (tentative < (gScore.get(nb) ?? Infinity)) {
        cameFrom.set(nb, current);
        gScore.set(nb, tentative);
        fScore.set(nb, tentative + h(nb));
        open.add(nb);
      }
    }
  }
  return null;
}

// returns an ordered list of {x,z} hops from the player's current position to
// the exact destination point, or null if no route exists (shouldn't happen
// on a fully-connected grid, but a disconnected/blocked graph could produce one)
export function computeRoute(playerX, playerZ, destX, destZ) {
  if (!graph_) return null;
  const startId = nearestNode(graph_, playerX, playerZ);
  const goalId = nearestNode(graph_, destX, destZ);
  const path = aStar(graph_, startId, goalId);
  if (!path) return null;
  path.shift(); // player is already essentially at the start node
  const last = path[path.length - 1];
  if (!last || Math.hypot(last.x - destX, last.z - destZ) > 1) path.push({ x: destX, z: destZ });
  return path.length ? path : [{ x: destX, z: destZ }];
}

// finds the closest tappable point (POI or marker) to a map-space (x,z)
// click/hover, in world meters -- used for both the hover tooltip and to
// make clicking directly on a POI feel like it "picked" that point
function findNearestTappable(x, z, maxWorldDist) {
  let best = null, bestD = maxWorldDist;
  const pois = world_.pois || [];
  for (const p of pois) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) { bestD = d; best = { name: p.name, kind: p.kind, x: p.x, z: p.z }; }
  }
  for (const m of getters_.getMarkers()) {
    const d = Math.hypot(m.x - x, m.z - z);
    if (d < bestD) { bestD = d; best = { name: m.kind === 'taxi' ? 'תחנת מונית' : 'יעד', kind: m.kind, x: m.x, z: m.z }; }
  }
  return best;
}

function showTooltip(worldPt, text) {
  if (!tooltip_) return;
  const w = canvas_.clientWidth, h = canvas_.clientHeight;
  const scale = w / world_.citySize;
  const px = (worldPt.x + world_.cityHalf) * scale;
  const pz = (worldPt.z + world_.cityHalf) * (h / world_.citySize);
  tooltip_.textContent = text;
  tooltip_.style.left = px + 'px';
  tooltip_.style.top = pz + 'px';
  tooltip_.classList.remove('hidden');
}
function hideTooltip() {
  if (tooltip_) tooltip_.classList.add('hidden');
}

export function initMapGPS(panelEl, world, getters, onWaypoint) {
  canvas_ = panelEl.querySelector('#map-canvas');
  ctx_ = canvas_.getContext('2d');
  tooltip_ = panelEl.querySelector('#map-tooltip');
  world_ = world;
  getters_ = getters;
  onWaypoint_ = onWaypoint;
  graph_ = buildRoadGraph(world.cityHalf, world.block);

  const toWorld = (e) => {
    const rect = canvas_.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    return { x: px * world_.citySize - world_.cityHalf, z: py * world_.citySize - world_.cityHalf };
  };

  canvas_.addEventListener('pointermove', (e) => {
    const { x, z } = toWorld(e);
    const hit = findNearestTappable(x, z, world_.block * 0.4);
    if (hit) showTooltip(hit, hit.name);
    else hideTooltip();
  });
  canvas_.addEventListener('pointerleave', hideTooltip);

  canvas_.addEventListener('pointerdown', (e) => {
    const { x, z } = toWorld(e);
    const hit = findNearestTappable(x, z, world_.block * 0.4);
    if (hit) showTooltip(hit, hit.name);
    const player = getters_.getPlayer();
    const destX = hit ? hit.x : x, destZ = hit ? hit.z : z;
    const path = computeRoute(player.x, player.z, destX, destZ);
    onWaypoint_(path, { x: destX, z: destZ });
  });
}

export function renderMapGPS() {
  if (!ctx_) return;
  const w = canvas_.width, h = canvas_.height;
  const scale = w / world_.citySize;
  const toPx = (x, z) => ({ x: (x + world_.cityHalf) * scale, z: (z + world_.cityHalf) * scale });

  ctx_.fillStyle = '#141a26';
  ctx_.fillRect(0, 0, w, h);

  ctx_.fillStyle = 'rgba(255,255,255,0.07)';
  ctx_.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx_.lineWidth = 1;
  for (const b of world_.buildingAABBs) {
    const p1 = toPx(b.minX, b.minZ);
    ctx_.fillRect(p1.x, p1.z, (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
    ctx_.strokeRect(p1.x, p1.z, (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
  }

  for (const m of getters_.getMarkers()) {
    const p = toPx(m.x, m.z);
    ctx_.fillStyle = m.kind === 'taxi' ? '#43c6ff' : '#ffd23f';
    ctx_.beginPath();
    ctx_.arc(p.x, p.z, 5, 0, Math.PI * 2);
    ctx_.fill();
  }

  for (const poi of (world_.pois || [])) {
    const p = toPx(poi.x, poi.z);
    ctx_.fillStyle = '#ff8a3d';
    ctx_.strokeStyle = '#fff';
    ctx_.lineWidth = 1;
    ctx_.beginPath();
    ctx_.arc(p.x, p.z, 4.5, 0, Math.PI * 2);
    ctx_.fill();
    ctx_.stroke();
  }

  const path = getters_.getPath ? getters_.getPath() : null;
  if (path && path.length) {
    const player = getters_.getPlayer();
    ctx_.strokeStyle = '#ff5f5f';
    ctx_.lineWidth = 2.5;
    ctx_.beginPath();
    const p0 = toPx(player.x, player.z);
    ctx_.moveTo(p0.x, p0.z);
    for (const wp of path) { const p = toPx(wp.x, wp.z); ctx_.lineTo(p.x, p.z); }
    ctx_.stroke();
    const dest = toPx(path[path.length - 1].x, path[path.length - 1].z);
    ctx_.strokeStyle = '#ff5f5f';
    ctx_.beginPath();
    ctx_.arc(dest.x, dest.z, 9, 0, Math.PI * 2);
    ctx_.stroke();
  }

  const foot = getters_.getPlayer();
  const pf = toPx(foot.x, foot.z);
  ctx_.fillStyle = '#66bce5';
  ctx_.strokeStyle = '#fff';
  ctx_.lineWidth = 1.5;
  ctx_.beginPath();
  ctx_.arc(pf.x, pf.z, 6, 0, Math.PI * 2);
  ctx_.fill();
  ctx_.stroke();
}
