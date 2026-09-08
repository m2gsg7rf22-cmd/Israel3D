(() => {
  'use strict';

  // ============================================================
  // Constants — pseudo-3D road projection (classic "outrun style")
  // ============================================================
  const WIDTH = 1280;
  const HEIGHT = 720;
  const FIELD_OF_VIEW = 100;
  const CAMERA_HEIGHT = 1000;
  const CAMERA_DEPTH = 1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180);
  const SEGMENT_LENGTH = 200;
  const RUMBLE_LENGTH = 3;
  const ROAD_WIDTH = 2000;
  const LANES = 3;
  const DRAW_DISTANCE = 300;
  const FOG_DENSITY = 5;
  const TOTAL_LAPS = 3;
  const MAX_SPEED = SEGMENT_LENGTH / (1 / 60) * 0.62; // tuned top speed
  const ACCEL = MAX_SPEED / 2.2;
  const BRAKE = -MAX_SPEED;
  const DECEL = -MAX_SPEED / 4.2;
  const OFFROAD_DECEL = -MAX_SPEED / 2.1;
  const OFFROAD_LIMIT = MAX_SPEED / 3.2;
  const CENTRIFUGAL = 0.17;
  const STEER_RATE = 2.6;

  const COLORS = {
    sky: '#5ec8f5',
    light: { road: '#6b6b6b', grass: '#12a03a', rumble: '#e6e6e6', lane: '#e6e6e6' },
    dark: { road: '#666666', grass: '#0e8a30', rumble: '#c0362c', lane: null },
    start: { road: '#ffffff', grass: '#12a03a', rumble: '#ffffff' },
    finish: { road: '#111111', grass: '#12a03a', rumble: '#111111' },
  };

  // ============================================================
  // Canvas setup
  // ============================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const hudSpeed = document.getElementById('hud-speed');
  const hudLap = document.getElementById('hud-lap');
  const hudTime = document.getElementById('hud-time');
  const hudBest = document.getElementById('hud-best');

  const screenStart = document.getElementById('screen-start');
  const screenPause = document.getElementById('screen-pause');
  const screenGameOver = document.getElementById('screen-gameover');
  const btnStart = document.getElementById('btn-start');
  const btnRestart = document.getElementById('btn-restart');
  const btnRestartPause = document.getElementById('btn-restart-pause');
  const btnResume = document.getElementById('btn-resume');
  const btnPause = document.getElementById('btn-pause');
  const goTitle = document.getElementById('go-title');
  const goTime = document.getElementById('go-time');
  const goBest = document.getElementById('go-best');
  const goHits = document.getElementById('go-hits');

  const touchControls = document.getElementById('touch-controls');

  // ============================================================
  // Utility math
  // ============================================================
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function toRad(deg) { return deg * Math.PI / 180; }
  function increase(start, increment, max) {
    let result = start + increment;
    while (result >= max) result -= max;
    while (result < 0) result += max;
    return result;
  }
  function easeIn(a, b, p) { return a + (b - a) * Math.pow(p, 2); }
  function easeOut(a, b, p) { return a + (b - a) * (1 - Math.pow(1 - p, 2)); }
  function easeInOut(a, b, p) { return a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5); }
  function exponentialFog(distance, density) {
    return 1 / Math.pow(Math.E, (distance * distance * density));
  }
  function rumbleWidth(projectedRoadWidth, lanes) { return projectedRoadWidth / Math.max(6, 2 * lanes); }
  function laneMarkerWidth(projectedRoadWidth, lanes) { return projectedRoadWidth / Math.max(32, 8 * lanes); }
  function laneToX(lane) { return -0.8 + (lane / (LANES - 1)) * 1.6; }

  // ============================================================
  // Game state
  // ============================================================
  let segments = [];
  let trackLength = 0;
  let cars = [];
  let position = 0;
  let speed = 0;
  let playerX = 0;
  let lap = 1;
  let hits = 0;
  let elapsed = 0;
  let running = false;
  let paused = false;
  let finished = false;
  let hitFlash = 0;
  let hitCooldown = 0;
  let lastTime = null;
  let bestTime = loadBestTime();
  let steerInput = 0;
  let throttleInput = 0;

  const keys = { left: false, right: false, up: false, down: false };

  // ============================================================
  // Track building
  // ============================================================
  function addSegment(curve) {
    const n = segments.length;
    segments.push({
      index: n,
      curve: curve,
      p1: { world: { x: 0, y: 0, z: n * SEGMENT_LENGTH }, camera: {}, screen: {} },
      p2: { world: { x: 0, y: 0, z: (n + 1) * SEGMENT_LENGTH }, camera: {}, screen: {} },
      color: Math.floor(n / RUMBLE_LENGTH) % 2 ? COLORS.dark : COLORS.light,
      cars: [],
    });
  }

  function addRoad(enter, hold, leave, curve) {
    for (let i = 0; i < enter; i++) addSegment(easeIn(0, curve, i / enter));
    for (let i = 0; i < hold; i++) addSegment(curve);
    for (let i = 0; i < leave; i++) addSegment(easeInOut(curve, 0, i / leave));
  }

  const CURVE = { NONE: 0, EASY: 1.5, MEDIUM: 3, HARD: 4.5 };
  const LEN = { NONE: 0, SHORT: 25, MEDIUM: 50, LONG: 100 };

  function buildTrack() {
    segments = [];
    addRoad(LEN.SHORT, LEN.SHORT, LEN.SHORT, CURVE.NONE);
    addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, CURVE.EASY);
    addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, -CURVE.MEDIUM);
    addRoad(LEN.SHORT, LEN.LONG, LEN.SHORT, CURVE.NONE);
    addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, CURVE.HARD);
    addRoad(LEN.SHORT, LEN.MEDIUM, LEN.SHORT, -CURVE.EASY);
    addRoad(LEN.MEDIUM, LEN.LONG, LEN.MEDIUM, -CURVE.HARD);
    addRoad(LEN.SHORT, LEN.SHORT, LEN.SHORT, CURVE.NONE);
    addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, CURVE.MEDIUM);
    addRoad(LEN.SHORT, LEN.LONG, LEN.SHORT, -CURVE.MEDIUM);
    addRoad(LEN.MEDIUM, LEN.SHORT, LEN.MEDIUM, CURVE.EASY);
    addRoad(LEN.LONG, LEN.LONG, LEN.LONG, CURVE.NONE);

    // start / finish line coloring
    segments[findSegmentIndexAtZ(0)].color = COLORS.start;
    segments[segments.length - 1].color = COLORS.finish;

    trackLength = segments.length * SEGMENT_LENGTH;
  }

  function findSegmentIndexAtZ(z) {
    return Math.floor(z / SEGMENT_LENGTH) % segments.length;
  }

  function findSegment(z) {
    return segments[Math.floor(z / SEGMENT_LENGTH) % segments.length];
  }

  function placeTraffic() {
    cars = [];
    const carColors = ['#3fa9ff', '#ffd23f', '#ff5f5f', '#c586ff', '#3fffb0', '#ff9f43'];
    let n = 0;
    for (let i = 40; i < segments.length - 40; i += 14 + Math.floor(Math.random() * 12)) {
      n++;
      const laneCount = LANES;
      const skipLane = Math.floor(Math.random() * laneCount);
      const laneOptions = [];
      for (let l = 0; l < laneCount; l++) if (l !== skipLane) laneOptions.push(l);
      const lane = laneOptions[Math.floor(Math.random() * laneOptions.length)];
      const car = {
        offset: laneToX(lane) + (Math.random() * 0.14 - 0.07),
        z: i * SEGMENT_LENGTH,
        color: carColors[n % carColors.length],
        wiggle: Math.random() * 2 - 1,
      };
      segments[i % segments.length].cars.push(car);
      cars.push(car);
    }
  }

  // ============================================================
  // Projection
  // ============================================================
  function project(p, cameraX, cameraY, cameraZ, width, height, roadWidth) {
    p.camera.x = (p.world.x || 0) - cameraX;
    p.camera.y = (p.world.y || 0) - cameraY;
    p.camera.z = (p.world.z || 0) - cameraZ;
    p.screen.scale = CAMERA_DEPTH / p.camera.z;
    p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
    p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
    p.screen.w = Math.round(p.screen.scale * roadWidth * width / 2);
  }

  // ============================================================
  // Drawing helpers
  // ============================================================
  function polygon(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.55);
    grad.addColorStop(0, '#1c6fb0');
    grad.addColorStop(1, COLORS.sky);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT * 0.55);

    // parallax hills, offset by curve for subtle motion
    const baseSeg = findSegment(position);
    const offset = -baseSeg.curve * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(WIDTH * 0.15 + offset, HEIGHT * 0.16, 34, 0, Math.PI * 2);
    ctx.arc(WIDTH * 0.15 + 40 + offset, HEIGHT * 0.16, 26, 0, Math.PI * 2);
    ctx.arc(WIDTH * 0.15 - 40 + offset, HEIGHT * 0.16, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f3d63';
    for (let i = 0; i < 7; i++) {
      const hx = (i * 180 + offset * 3) % (WIDTH + 200) - 100;
      const hy = HEIGHT * 0.55;
      ctx.beginPath();
      ctx.moveTo(hx - 100, hy);
      ctx.lineTo(hx, hy - 70 - (i % 3) * 12);
      ctx.lineTo(hx + 100, hy);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawSegmentPoly(seg, x1, y1, w1, x2, y2, w2, fog) {
    const grassColor = seg.color.grass;
    const roadColor = seg.color.road;
    const rumbleColor = seg.color.rumble;
    const laneColor = seg.color.lane;

    ctx.fillStyle = grassColor;
    ctx.fillRect(0, y2, WIDTH, y1 - y2);

    const r1 = rumbleWidth(w1, LANES);
    const r2 = rumbleWidth(w2, LANES);
    polygon(x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, rumbleColor);
    polygon(x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, rumbleColor);
    polygon(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, roadColor);

    if (laneColor) {
      const l1 = laneMarkerWidth(w1, LANES);
      const l2 = laneMarkerWidth(w2, LANES);
      const laneW1 = w1 * 2 / LANES;
      const laneW2 = w2 * 2 / LANES;
      let lx1 = x1 - w1 + laneW1;
      let lx2 = x2 - w2 + laneW2;
      for (let lane = 1; lane < LANES; lane++) {
        polygon(lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2, laneColor);
        lx1 += laneW1;
        lx2 += laneW2;
      }
    }

    if (fog < 1) {
      ctx.fillStyle = `rgba(10,14,23,${1 - fog})`;
      ctx.fillRect(0, Math.min(y1, y2), WIDTH, Math.abs(y2 - y1));
    }
  }

  function drawCarSprite(x, y, scale, color, wiggle) {
    const w = clamp(160 * scale, 10, 240);
    const h = w * 0.62;
    const bob = Math.sin(elapsed * 6 + wiggle * 10) * (scale * 2);
    const cx = x;
    const cy = y - h * 0.5 - bob;

    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, y - 2, w * 0.42, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    const grad = ctx.createLinearGradient(cx, cy - h * 0.5, cx, cy + h * 0.5);
    grad.addColorStop(0, color);
    grad.addColorStop(1, shade(color, -40));
    ctx.fillStyle = grad;
    roundRect(cx - w * 0.42, cy - h * 0.42, w * 0.84, h * 0.72, w * 0.12);
    ctx.fill();

    // roof / rear window
    ctx.fillStyle = 'rgba(20,26,38,0.85)';
    roundRect(cx - w * 0.26, cy - h * 0.34, w * 0.52, h * 0.34, w * 0.08);
    ctx.fill();

    // tail lights
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(cx - w * 0.4, cy + h * 0.06, w * 0.1, h * 0.14);
    ctx.fillRect(cx + w * 0.3, cy + h * 0.06, w * 0.1, h * 0.14);

    // wheels
    ctx.fillStyle = '#151515';
    ctx.fillRect(cx - w * 0.48, cy + h * 0.18, w * 0.14, h * 0.16);
    ctx.fillRect(cx + w * 0.34, cy + h * 0.18, w * 0.14, h * 0.16);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shade(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00ff) + percent;
    let b = (num & 0x0000ff) + percent;
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
  }

  function drawPlayerCar(steerDir, offRoad) {
    const x = WIDTH / 2 + steerDir * 26;
    const y = HEIGHT - 46;
    const tilt = steerDir * 6;
    const bump = offRoad ? Math.sin(elapsed * 40) * 4 : 0;

    ctx.save();
    ctx.translate(x, y + bump);
    ctx.rotate(toRad(tilt));

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 58, 78, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(0, -70, 0, 60);
    grad.addColorStop(0, hitFlash > 0 ? '#ffffff' : '#ff5f5f');
    grad.addColorStop(1, hitFlash > 0 ? '#dddddd' : '#a01c1c');
    ctx.fillStyle = grad;
    roundRect(-70, -30, 140, 90, 20);
    ctx.fill();

    ctx.fillStyle = '#151515';
    ctx.fillRect(-84, -6, 20, 34);
    ctx.fillRect(64, -6, 20, 34);
    ctx.fillRect(-84, 34, 20, 34);
    ctx.fillRect(64, 34, 20, 34);

    ctx.fillStyle = 'rgba(20,26,38,0.9)';
    roundRect(-46, -20, 92, 40, 14);
    ctx.fill();

    ctx.fillStyle = '#ffe98a';
    ctx.fillRect(-64, 52, 22, 10);
    ctx.fillRect(42, 52, 22, 10);

    ctx.restore();
  }

  // ============================================================
  // Main render
  // ============================================================
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();

    const baseSegment = findSegment(position);
    const basePercent = (position % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerY = 0;
    let maxy = HEIGHT;

    let x = 0;
    let dx = -(baseSegment.curve * basePercent);

    const cameraX = playerX * ROAD_WIDTH;
    const cameraY = playerY + CAMERA_HEIGHT;

    const visibleCars = [];

    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const segment = segments[(baseSegment.index + n) % segments.length];
      const looped = segment.index < baseSegment.index;
      const segZOffset = looped ? trackLength : 0;
      const fog = exponentialFog(n / DRAW_DISTANCE, FOG_DENSITY);

      project(segment.p1, cameraX - x, cameraY, position - segZOffset, WIDTH, HEIGHT, ROAD_WIDTH);
      project(segment.p2, cameraX - x - dx, cameraY, position - segZOffset, WIDTH, HEIGHT, ROAD_WIDTH);

      x += dx;
      dx += segment.curve;

      segment.clip = maxy;

      if (segment.p1.camera.z <= CAMERA_DEPTH ||
          segment.p2.screen.y >= segment.p1.screen.y ||
          segment.p2.screen.y >= maxy) {
        continue;
      }

      drawSegmentPoly(
        segment,
        segment.p1.screen.x, segment.p1.screen.y, segment.p1.screen.w,
        segment.p2.screen.x, segment.p2.screen.y, segment.p2.screen.w,
        fog
      );

      maxy = segment.p2.screen.y;

      for (const car of segment.cars) {
        const carZ = car.z - segZOffset;
        const carRelZ = carZ - position;
        if (carRelZ < 0) continue;
        const carP = { world: { x: car.offset * ROAD_WIDTH, y: 0, z: carZ }, camera: {}, screen: {} };
        project(carP, cameraX - x, cameraY, position - segZOffset, WIDTH, HEIGHT, ROAD_WIDTH);
        if (carP.camera.z > CAMERA_DEPTH && carP.screen.y < segment.clip && carP.screen.y >= 0) {
          visibleCars.push({ p: carP, color: car.color, wiggle: car.wiggle, n });
        }
      }
    }

    // draw cars far-to-near (already appended far to near given loop order; reverse for painter's algo near-last)
    for (let i = visibleCars.length - 1; i >= 0; i--) {
      const c = visibleCars[i];
      drawCarSprite(c.p.screen.x, c.p.screen.y, c.p.screen.scale * ROAD_WIDTH / 1400, c.color, c.wiggle);
    }

    const offRoad = Math.abs(playerX) > 1;
    drawPlayerCar(steerInput, offRoad);

    if (hitFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${Math.min(0.35, hitFlash)})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  // ============================================================
  // Physics update
  // ============================================================
  function update(dt) {
    position = increase(position, dt * speed, trackLength);

    const playerSegment = findSegment(position);
    const speedPercent = speed / MAX_SPEED;
    const steerMag = dt * STEER_RATE * speedPercent;

    const keyboardSteer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const keyboardThrottle = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    steerInput = clamp(keyboardSteer + steerJoystick.value, -1, 1);
    throttleInput = clamp(keyboardThrottle + throttleJoystick.value, -1, 1);

    playerX += steerInput * steerMag;
    playerX -= steerMag * playerSegment.curve * CENTRIFUGAL;

    if (throttleInput > 0) speed += ACCEL * dt * throttleInput;
    else if (throttleInput < 0) speed += BRAKE * dt * -throttleInput;
    else speed += DECEL * dt;

    if ((playerX < -1 || playerX > 1) && speed > OFFROAD_LIMIT) {
      speed += OFFROAD_DECEL * dt;
    }

    playerX = clamp(playerX, -3, 3);
    speed = clamp(speed, 0, MAX_SPEED);

    // collisions with traffic near the player (guarded by a cooldown so a
    // single crash reads as one flash, not a stuck red screen while the
    // car and player are still overlapping)
    if (hitCooldown <= 0) {
      for (const car of cars) {
        const relZ = increase(car.z - position, 0, trackLength);
        const dist = Math.min(relZ, trackLength - relZ);
        if (dist < SEGMENT_LENGTH * 0.9) {
          const carHalfWidth = 0.14;
          if (Math.abs(playerX - car.offset) < carHalfWidth + 0.11) {
            hits++;
            speed *= 0.35;
            hitFlash = 0.4;
            hitCooldown = 0.8;
            playerX += playerX >= car.offset ? 0.25 : -0.25;
            break;
          }
        }
      }
    }

    if (hitCooldown > 0) hitCooldown = Math.max(0, hitCooldown - dt);
    if (hitFlash > 0) hitFlash = Math.max(0, hitFlash - dt);

    // lap counting: detect wrap of position back near 0 while moving forward
    const prevLapPos = update.prevPos === undefined ? position : update.prevPos;
    if (prevLapPos > trackLength * 0.7 && position < trackLength * 0.3) {
      lap++;
      if (lap > TOTAL_LAPS) {
        finishRace();
      }
    }
    update.prevPos = position;

    elapsed += dt;
  }

  // ============================================================
  // HUD
  // ============================================================
  function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t * 1000) % 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  function updateHud() {
    const kmh = Math.round((speed / MAX_SPEED) * 240);
    hudSpeed.textContent = kmh;
    hudLap.textContent = `${Math.min(lap, TOTAL_LAPS)} / ${TOTAL_LAPS}`;
    hudTime.textContent = formatTime(elapsed);
    hudBest.textContent = bestTime ? formatTime(bestTime) : '--:--.---';
  }

  // ============================================================
  // Best time persistence
  // ============================================================
  function loadBestTime() {
    try {
      const v = localStorage.getItem('israel3d_best_time');
      return v ? parseFloat(v) : null;
    } catch (e) { return null; }
  }
  function saveBestTime(t) {
    try { localStorage.setItem('israel3d_best_time', String(t)); } catch (e) { /* ignore */ }
  }

  // ============================================================
  // Game loop
  // ============================================================
  function loop(ts) {
    if (!running) return;
    if (lastTime === null) lastTime = ts;
    let dt = (ts - lastTime) / 1000;
    lastTime = ts;
    dt = Math.min(dt, 1 / 20);

    if (!paused && !finished) {
      update(dt);
    }
    render();
    updateHud();

    requestAnimationFrame(loop);
  }

  // ============================================================
  // State transitions
  // ============================================================
  function startRace() {
    buildTrack();
    placeTraffic();
    position = 0;
    speed = 0;
    playerX = 0;
    lap = 1;
    hits = 0;
    elapsed = 0;
    hitFlash = 0;
    hitCooldown = 0;
    paused = false;
    finished = false;
    running = true;
    lastTime = null;
    update.prevPos = 0;

    screenStart.classList.add('hidden');
    screenGameOver.classList.add('hidden');
    screenPause.classList.add('hidden');
    btnPause.classList.remove('hidden');

    requestAnimationFrame(loop);
  }

  function finishRace() {
    finished = true;
    running = false;
    btnPause.classList.add('hidden');

    const isNewBest = !bestTime || elapsed < bestTime;
    if (isNewBest) {
      bestTime = elapsed;
      saveBestTime(bestTime);
    }

    goTitle.textContent = isNewBest ? '🏆 שיא חדש!' : '🏁 סיימת את המרוץ!';
    goTime.textContent = formatTime(elapsed);
    goBest.textContent = formatTime(bestTime);
    goHits.textContent = String(hits);
    screenGameOver.classList.remove('hidden');
  }

  function togglePause() {
    if (!running || finished) return;
    paused = !paused;
    screenPause.classList.toggle('hidden', !paused);
    if (!paused) {
      lastTime = null;
      requestAnimationFrame(loop);
    }
  }

  // ============================================================
  // Input
  // ============================================================
  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': keys.left = true; break;
      case 'ArrowRight': case 'd': case 'D': keys.right = true; break;
      case 'ArrowUp': case 'w': case 'W': keys.up = true; break;
      case 'ArrowDown': case 's': case 'S': keys.down = true; break;
      case 'Escape': case 'p': case 'P': togglePause(); break;
      case ' ':
        if (!running && screenGameOver.classList.contains('hidden') && !screenStart.classList.contains('hidden')) startRace();
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': keys.left = false; break;
      case 'ArrowRight': case 'd': case 'D': keys.right = false; break;
      case 'ArrowUp': case 'w': case 'W': keys.up = false; break;
      case 'ArrowDown': case 's': case 'S': keys.down = false; break;
    }
  });

  function makeJoystick(rootEl, axis) {
    const base = rootEl.querySelector('.joystick-base');
    const knob = rootEl.querySelector('.joystick-knob');
    const maxR = (base.clientWidth - knob.clientWidth) / 2 || 33;
    let pointerId = null;
    let value = 0;

    function setKnob(dx, dy, animated) {
      knob.style.transition = animated ? 'transform 0.15s ease' : 'none';
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    function updateFromPoint(clientX, clientY) {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
      setKnob(dx, dy, false);
      value = clamp(axis === 'x' ? dx / maxR : -dy / maxR, -1, 1);
    }

    function release(e) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      pointerId = null;
      value = 0;
      setKnob(0, 0, true);
    }

    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointerId = e.pointerId;
      base.setPointerCapture(pointerId);
      updateFromPoint(e.clientX, e.clientY);
    });
    base.addEventListener('pointermove', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      e.preventDefault();
      updateFromPoint(e.clientX, e.clientY);
    });
    base.addEventListener('pointerup', release);
    base.addEventListener('pointercancel', release);

    return { get value() { return value; } };
  }

  const steerJoystick = makeJoystick(document.getElementById('joy-steer'), 'x');
  const throttleJoystick = makeJoystick(document.getElementById('joy-throttle'), 'y');

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    touchControls.classList.remove('hidden');
  }

  btnStart.addEventListener('click', startRace);
  btnRestart.addEventListener('click', startRace);
  btnRestartPause.addEventListener('click', () => { screenPause.classList.add('hidden'); startRace(); });
  btnResume.addEventListener('click', togglePause);
  btnPause.addEventListener('click', togglePause);

  // initial HUD paint
  hudBest.textContent = bestTime ? formatTime(bestTime) : '--:--.---';
  buildTrack();
  placeTraffic();
  render();
})();
