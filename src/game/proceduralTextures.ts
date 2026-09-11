import * as THREE from "three";

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  return { c, ctx };
}

export function makeAsphaltTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = "#2b2e33";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    const v = Math.random() * 30 - 15;
    ctx.fillStyle = `rgba(${20 + v},${20 + v},${22 + v},0.5)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function makeRoadLaneTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(512);
  ctx.fillStyle = "#2b2e33";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#e8d97a";
  ctx.lineWidth = 6;
  ctx.setLineDash([40, 30]);
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.stroke();
  ctx.strokeStyle = "#f2f2f2";
  ctx.setLineDash([]);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(20, 512);
  ctx.moveTo(492, 0);
  ctx.lineTo(492, 512);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function makeCrosswalkTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = "#2b2e33";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#e6e6e6";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(i * 42 + 6, 0, 24, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function makeBrickTexture(tint = "#8a5a44"): THREE.CanvasTexture {
  const { c, ctx } = canvas(128);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  const rowH = 16;
  for (let y = 0; y < 128; y += rowH) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
    const offset = (y / rowH) % 2 === 0 ? 0 : 16;
    for (let x = -16; x < 128; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + offset, y);
      ctx.lineTo(x + offset, y + rowH);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function makeCobblestoneTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(128);
  ctx.fillStyle = "#6b6b6b";
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) {
    for (let x = 0; x < 128; x += 16) {
      const shade = 90 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(x + 1, y + 1, 14, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function makeConcreteTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(128);
  ctx.fillStyle = "#9a9a95";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 800; i++) {
    const v = Math.random() * 20 - 10;
    ctx.fillStyle = `rgba(${140 + v},${140 + v},${135 + v},0.4)`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
