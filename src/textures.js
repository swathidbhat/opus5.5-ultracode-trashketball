// Procedural canvas textures. Everything in the game is generated at load time,
// so there are no image assets to fetch.
import * as THREE from 'three';

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(canvas, { repeat = [1, 1], srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Tileable 2D value noise; periods are lattice cells across one tile. */
export function valueNoise(rand, px, py = px) {
  const g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const x0 = ((xi % px) + px) % px;
    const y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px;
    const y1 = (y0 + 1) % py;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = g[y0 * px + x0];
    const b = g[y0 * px + x1];
    const c = g[y1 * px + x0];
    const d = g[y1 * px + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Tileable fractal noise over a W×H canvas. Returns fn(px, py) in [0, 1]. */
export function fractal(rand, W, H, cellsX, cellsY = cellsX, octaves = 4) {
  const layers = [];
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const cx = cellsX << o;
    const cy = cellsY << o;
    const amp = 0.5 ** o;
    layers.push({ n: valueNoise(rand, cx, cy), sx: cx / W, sy: cy / H, amp });
    norm += amp;
  }
  return (x, y) => {
    let s = 0;
    for (const l of layers) s += l.n(x * l.sx, y * l.sy) * l.amp;
    return s / norm;
  };
}

function fillPixels(canvas, fn) {
  const g = canvas.getContext('2d');
  const img = g.createImageData(canvas.width, canvas.height);
  const out = [0, 0, 0, 255];
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      out[3] = 255;
      fn(x, y, out);
      const i = (y * canvas.width + x) * 4;
      img.data[i] = out[0];
      img.data[i + 1] = out[1];
      img.data[i + 2] = out[2];
      img.data[i + 3] = out[3];
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- Level 1

export function carpetTextures(repeat) {
  const S = 512;
  const rand = rng(7);
  const mottle = fractal(rand, S, S, 6, 6, 4);
  const map = makeCanvas(S);
  const bump = makeCanvas(S);
  const grain = new Float32Array(S * S).map(() => rand());
  fillPixels(map, (x, y, o) => {
    const tx = (x % 4) - 1.5;
    const ty = (y % 4) - 1.5;
    const tuft = 1 - Math.min(1, (tx * tx + ty * ty) / 4.5);
    const k = 0.74 + 0.26 * mottle(x, y) + 0.2 * (grain[y * S + x] - 0.5) + 0.1 * tuft;
    o[0] = 36 * k;
    o[1] = 98 * k;
    o[2] = 68 * k;
  });
  fillPixels(bump, (x, y, o) => {
    const tx = (x % 4) - 1.5;
    const ty = (y % 4) - 1.5;
    const tuft = 1 - Math.min(1, (tx * tx + ty * ty) / 4.5);
    o[0] = o[1] = o[2] = 255 * (0.3 + 0.45 * tuft + 0.25 * grain[y * S + x]);
  });
  return { map: toTexture(map, { repeat }), bump: toTexture(bump, { repeat, srgb: false }) };
}

export function ceilingTiles(repeat) {
  const S = 512;
  const rand = rng(3);
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  g.fillStyle = '#eef0ec';
  g.fillRect(0, 0, S, S);
  // Fissured acoustic tile speckle.
  for (let i = 0; i < 5000; i++) {
    const a = 0.05 + rand() * 0.12;
    g.fillStyle = `rgba(90,96,92,${a})`;
    g.fillRect(rand() * S, rand() * S, 1 + rand() * 2.5, 1 + rand() * 1.2);
  }
  // T-bar grid: 2×2 tiles per texture.
  g.fillStyle = '#d4d8d4';
  for (let i = 0; i <= 2; i++) {
    const p = i * (S / 2);
    g.fillRect(p - 5, 0, 10, S);
    g.fillRect(0, p - 5, S, 10);
  }
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i <= 2; i++) {
    const p = i * (S / 2);
    g.fillRect(p + 5, 0, 3, S);
    g.fillRect(0, p + 5, S, 3);
  }
  return toTexture(c, { repeat });
}

export function paintedWall(base = [233, 236, 232], repeat = [1, 1], seed = 5) {
  const S = 256;
  const rand = rng(seed);
  const n = fractal(rand, S, S, 4, 4, 5);
  const c = fillPixels(makeCanvas(S), (x, y, o) => {
    const k = 0.965 + 0.05 * n(x, y);
    o[0] = base[0] * k;
    o[1] = base[1] * k;
    o[2] = base[2] * k;
  });
  return toTexture(c, { repeat });
}

export function feltTexture(base = [74, 112, 86], repeat = [1, 1]) {
  const S = 256;
  const rand = rng(21);
  const n = fractal(rand, S, S, 16, 16, 3);
  const c = fillPixels(makeCanvas(S), (x, y, o) => {
    const weave = ((x + y) % 3 === 0 ? 0.94 : 1) * ((x - y + 999) % 5 === 0 ? 0.96 : 1);
    const k = (0.86 + 0.2 * n(x, y) + 0.08 * (rand() - 0.5)) * weave;
    o[0] = base[0] * k;
    o[1] = base[1] * k;
    o[2] = base[2] * k;
  });
  return toTexture(c, { repeat });
}

/** Diamond wire lattice used as an alpha map for the office wastebasket. */
export function wireMeshAlpha(repeat) {
  const S = 128;
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff';
  g.lineWidth = 11;
  g.lineCap = 'square';
  for (const ox of [-S, 0, S]) {
    g.beginPath();
    g.moveTo(ox, 0);
    g.lineTo(ox + S, S);
    g.moveTo(ox + S, 0);
    g.lineTo(ox, S);
    g.stroke();
  }
  return toTexture(c, { repeat, srgb: false });
}

/** The MDR terminal: a grid of "scary numbers" that drift and swell. */
export function mdrScreen() {
  const W = 512;
  const H = 384;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rand = rng(11);
  const cols = 13;
  const rows = 8;
  const digits = Array.from({ length: cols * rows }, () => Math.floor(rand() * 10));
  const phase = Array.from({ length: cols * rows }, () => rand() * Math.PI * 2);
  const tex = toTexture(c, { wrap: false });

  function draw(t) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d2a44');
    bg.addColorStop(1, '#061626');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    g.strokeStyle = '#a7ecff';
    g.lineWidth = 3;
    g.strokeRect(16, 14, W - 32, 46);
    g.fillStyle = '#c8f5ff';
    g.font = '600 24px "IBM Plex Mono", ui-monospace, monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText('Cold Harbor', 30, 38);
    g.textAlign = 'right';
    g.fillText(`${Math.floor(62 + 30 * ((t * 0.01) % 1))}% Complete`, W - 70, 38);
    // Lumon globe mark.
    g.beginPath();
    g.arc(W - 42, 37, 13, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(W - 42, 37, 6, 13, 0, 0, Math.PI * 2);
    g.moveTo(W - 55, 37);
    g.lineTo(W - 29, 37);
    g.stroke();

    g.textAlign = 'center';
    const hot = { x: 4 + 4 * Math.sin(t * 0.21), y: 4 + 2.5 * Math.cos(t * 0.17) };
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const i = r * cols + q;
        const dist = Math.hypot(q - hot.x, r - hot.y);
        const swell = Math.max(0, 1 - dist / 2.6);
        const bob = Math.sin(t * 1.3 + phase[i]) * 2.5;
        const size = 22 + swell * 18;
        g.font = `500 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
        g.fillStyle = swell > 0.3 ? '#ffffff' : '#9fe6ff';
        g.fillText(String(digits[i]), 40 + q * 36, 92 + r * 30 + bob);
      }
    }

    g.fillStyle = '#a7ecff';
    g.strokeStyle = '#a7ecff';
    g.lineWidth = 2;
    g.font = '500 14px "IBM Plex Mono", ui-monospace, monospace';
    for (let k = 0; k < 5; k++) {
      const x = 22 + k * 96;
      g.strokeRect(x, 336, 84, 30);
      g.fillText(`0${k + 1}`, x + 42, 351);
      g.fillRect(x, 368, 84 * (0.2 + 0.7 * ((k * 0.37 + t * 0.004) % 1)), 6);
    }
    tex.needsUpdate = true;
  }
  draw(0);
  return { texture: tex, draw };
}

export function plaqueTexture(lines, { bg = '#1f3a33', fg = '#f1f5ef', w = 1024, h = 220, font = 'Georgia, serif', logo = true } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 4;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cx = logo ? w / 2 + 50 : w / 2;
  g.font = `600 ${Math.round(h * 0.3)}px ${font}`;
  if (g.letterSpacing !== undefined) g.letterSpacing = '6px';
  g.fillText(lines[0], cx, lines[1] ? h * 0.42 : h / 2);
  if (lines[1]) {
    g.font = `500 ${Math.round(h * 0.13)}px ${font}`;
    g.fillText(lines[1], cx, h * 0.72);
  }
  if (logo) {
    const lx = 120;
    const ly = h / 2;
    const R = h * 0.28;
    g.strokeStyle = fg;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(lx, ly, R, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(lx, ly, R * 0.45, R, 0, 0, Math.PI * 2);
    g.moveTo(lx - R, ly);
    g.lineTo(lx + R, ly);
    g.stroke();
  }
  return toTexture(c, { wrap: false });
}

/** A dark oil portrait of the company founder. */
export function founderPortrait() {
  const W = 400;
  const H = 520;
  const rand = rng(99);
  const n = fractal(rand, W, H, 5, 6, 5);
  const c = fillPixels(makeCanvas(W, H), (x, y, o) => {
    const vx = (x / W - 0.5) * 1.6;
    const vy = (y / H - 0.45) * 1.3;
    const vig = Math.max(0, 1 - (vx * vx + vy * vy));
    const k = 0.35 + 0.65 * vig;
    const m = n(x, y);
    o[0] = (52 + 40 * m) * k;
    o[1] = (46 + 30 * m) * k;
    o[2] = (30 + 18 * m) * k;
  });
  const g = c.getContext('2d');
  // Coat and shoulders.
  g.fillStyle = '#16120d';
  g.beginPath();
  g.moveTo(40, H);
  g.bezierCurveTo(60, 360, 130, 330, 200, 325);
  g.bezierCurveTo(270, 330, 340, 360, 360, H);
  g.fill();
  // Shirt and cravat.
  g.fillStyle = '#d8d0bd';
  g.beginPath();
  g.moveTo(170, 330);
  g.lineTo(200, 420);
  g.lineTo(230, 330);
  g.fill();
  g.fillStyle = '#3b2a1e';
  g.fillRect(190, 336, 20, 22);
  // Face.
  const face = g.createRadialGradient(185, 225, 10, 200, 240, 90);
  face.addColorStop(0, '#d9b594');
  face.addColorStop(1, '#8a6246');
  g.fillStyle = face;
  g.beginPath();
  g.ellipse(200, 240, 62, 82, 0, 0, Math.PI * 2);
  g.fill();
  // Silver hair and side whiskers.
  g.fillStyle = '#cfcac0';
  g.beginPath();
  g.ellipse(200, 172, 70, 36, 0, Math.PI, 0);
  g.fill();
  g.fillRect(136, 180, 16, 90);
  g.fillRect(248, 180, 16, 90);
  // Stern brow, eyes, mouth.
  g.fillStyle = '#3a2618';
  g.fillRect(166, 214, 26, 6);
  g.fillRect(208, 214, 26, 6);
  g.fillStyle = '#1d140e';
  g.beginPath();
  g.arc(180, 232, 5, 0, Math.PI * 2);
  g.arc(220, 232, 5, 0, Math.PI * 2);
  g.fill();
  g.fillRect(184, 286, 32, 4);
  // Varnish crackle.
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = rand() * W;
    const y = rand() * H;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 18, y + (rand() - 0.5) * 18);
    g.stroke();
  }
  return toTexture(c, { wrap: false });
}

// ---------------------------------------------------------------- Paper

export function paperTexture(lineColor = 'rgba(88,140,210,0.55)', tint = '#f7f6f0', seed = 1) {
  const S = 256;
  const rand = rng(seed);
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  g.fillStyle = tint;
  g.fillRect(0, 0, S, S);
  if (lineColor) {
    g.fillStyle = lineColor;
    for (let y = 18; y < S; y += 22) g.fillRect(0, y, S, 2);
    g.fillStyle = 'rgba(220,90,90,0.5)';
    g.fillRect(34, 0, 2, S);
  }
  // Scribbled handwriting.
  g.strokeStyle = 'rgba(40,45,60,0.45)';
  g.lineWidth = 1.4;
  for (let y = 14; y < S; y += 22) {
    let x = 44 + rand() * 10;
    while (x < S - 20 && rand() > 0.08) {
      const w = 6 + rand() * 18;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < w; k += 3) g.lineTo(x + k, y - 2 - rand() * 5);
      g.stroke();
      x += w + 4 + rand() * 4;
    }
  }
  return toTexture(c);
}

// ---------------------------------------------------------------- Level 2

/** Wide-plank oak (or teak for the deck). The tile covers `plankCount` planks. */
export function plankTexture({ S = 1024, plankCount = 8, base = [214, 180, 136], spread = 26, repeat = [1, 1], seed = 4, seam = 0.55 } = {}) {
  const rand = rng(seed);
  const fine = valueNoise(rand, 256, 6);
  const broad = valueNoise(rand, 24, 3);
  const pw = S / plankCount;
  const planks = [];
  for (let i = 0; i < plankCount; i++) {
    const joints = [];
    let y = rand() * S;
    const first = y;
    while (y < first + S) {
      joints.push(y % S);
      y += S * (0.45 + rand() * 0.5);
    }
    const tone = (rand() - 0.5) * 2;
    planks.push({ joints, tone, off: rand() * 1000 });
  }
  const c = fillPixels(makeCanvas(S), (x, y, o) => {
    const i = Math.floor(x / pw);
    const p = planks[i];
    const lx = x - i * pw;
    const edge = lx < 1.5 || lx > pw - 1.5 ? seam : 1;
    let jointShade = 1;
    for (const j of p.joints) if (Math.abs(y - j) < 1.2) jointShade = seam;
    const grain = fine(x * (256 / S), (y + p.off) * (6 / S));
    const wide = broad(x * (24 / S), (y + p.off) * (3 / S));
    const streak = Math.pow(Math.abs(Math.sin((x * 0.9 + wide * 40) * 0.35)), 8);
    const k = (1 + (p.tone * spread) / 255 + 0.13 * (grain - 0.5) + 0.08 * (wide - 0.5) - 0.06 * streak) * edge * jointShade;
    o[0] = base[0] * k;
    o[1] = base[1] * k;
    o[2] = base[2] * k;
  });
  return toTexture(c, { repeat });
}

export function marbleTexture() {
  const S = 512;
  const rand = rng(12);
  const n = fractal(rand, S, S, 3, 3, 6);
  const n2 = fractal(rand, S, S, 5, 5, 5);
  const c = fillPixels(makeCanvas(S), (x, y, o) => {
    const v = Math.abs(Math.sin((x * 0.011 + y * 0.018) * Math.PI + n(x, y) * 9));
    const vein = 1 - smooth(0, 0.07, v);
    const v2 = Math.abs(Math.sin((x * 0.02 - y * 0.008) * Math.PI + n2(x, y) * 12));
    const fine = 1 - smooth(0, 0.03, v2);
    const cloud = n2(x, y);
    const k = 243 - 16 * cloud - 90 * vein - 35 * fine;
    o[0] = k;
    o[1] = k - 1;
    o[2] = k - 3;
  });
  return toTexture(c, { wrap: false });
}

export function travertineTexture(repeat = [1, 1]) {
  const S = 512;
  const rand = rng(31);
  const band = valueNoise(rand, 4, 48);
  const n = fractal(rand, S, S, 6, 6, 4);
  const c = fillPixels(makeCanvas(S), (x, y, o) => {
    const b = band(x * (4 / S), y * (48 / S));
    const k = 0.9 + 0.1 * b + 0.06 * (n(x, y) - 0.5);
    o[0] = 226 * k;
    o[1] = 208 * k;
    o[2] = 182 * k;
  });
  const g = c.getContext('2d');
  for (let i = 0; i < 380; i++) {
    const x = rand() * S;
    const y = rand() * S;
    g.fillStyle = `rgba(120,96,70,${0.15 + rand() * 0.3})`;
    g.beginPath();
    g.ellipse(x, y, 1 + rand() * 6, 0.6 + rand() * 1.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c, { repeat });
}

/** Bouclé: dense tiny loops of yarn. Returns colour + bump. */
export function boucleTextures(base = [236, 229, 216], repeat = [1, 1]) {
  const S = 256;
  const rand = rng(8);
  const map = makeCanvas(S);
  const bump = makeCanvas(S);
  const gm = map.getContext('2d');
  const gb = bump.getContext('2d');
  gm.fillStyle = `rgb(${base.map((v) => v * 0.93).join(',')})`;
  gm.fillRect(0, 0, S, S);
  gb.fillStyle = '#555';
  gb.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 1.5 + rand() * 2.8;
    const k = 0.9 + rand() * 0.14;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      gm.strokeStyle = `rgb(${base.map((v) => Math.min(255, v * k)).join(',')})`;
      gm.lineWidth = 1.6;
      gm.beginPath();
      gm.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      gm.stroke();
      gb.strokeStyle = `rgba(255,255,255,${0.5 + rand() * 0.5})`;
      gb.lineWidth = 1.6;
      gb.beginPath();
      gb.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      gb.stroke();
    }
  }
  return { map: toTexture(map, { repeat }), bump: toTexture(bump, { repeat, srgb: false }) };
}

export function juteTexture() {
  const S = 1024;
  const rand = rng(17);
  const n = fractal(rand, S, S, 8, 8, 3);
  const border = 46;
  const c = fillPixels(makeCanvas(S), (x, y, o) => {
    const cell = 14;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const horiz = (cx + cy) % 2 === 0;
    const u = horiz ? y % cell : x % cell;
    const strand = 0.78 + 0.22 * Math.sin((u / cell) * Math.PI);
    const isBorder = x < border || y < border || x > S - border || y > S - border;
    const k = strand * (0.9 + 0.2 * n(x, y) + 0.06 * (rand() - 0.5));
    const base = isBorder ? [150, 120, 84] : [205, 180, 138];
    o[0] = base[0] * k;
    o[1] = base[1] * k;
    o[2] = base[2] * k;
  });
  return toTexture(c, { wrap: false });
}

/** Over-under basket weave for the woven wastebasket. Returns colour + bump. */
export function basketWeave(repeat = [3, 1.2]) {
  const S = 512;
  const rand = rng(23);
  const cell = 32;
  const map = makeCanvas(S);
  const bump = makeCanvas(S);
  const tones = Array.from({ length: (S / cell) * 2 }, () => 0.85 + rand() * 0.25);
  const n = fractal(rand, S, S, 16, 16, 3);
  fillPixels(map, (x, y, o) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const weftOnTop = (cx + cy) % 2 === 0;
    const u = weftOnTop ? (y % cell) / cell : (x % cell) / cell;
    const round = Math.sin(u * Math.PI);
    const tone = weftOnTop ? tones[cy] : tones[S / cell + cx];
    const k = (0.45 + 0.6 * round) * tone * (0.9 + 0.2 * n(x, y));
    o[0] = Math.min(255, 196 * k);
    o[1] = Math.min(255, 156 * k);
    o[2] = Math.min(255, 98 * k);
  });
  fillPixels(bump, (x, y, o) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const weftOnTop = (cx + cy) % 2 === 0;
    const u = weftOnTop ? (y % cell) / cell : (x % cell) / cell;
    o[0] = o[1] = o[2] = 255 * Math.sin(u * Math.PI);
  });
  return { map: toTexture(map, { repeat }), bump: toTexture(bump, { repeat, srgb: false }) };
}

/** Open rattan lattice for the pendant globe. Returns colour + alpha. */
export function rattanLattice(repeat = [6, 3]) {
  const S = 256;
  const map = makeCanvas(S);
  const alpha = makeCanvas(S);
  const gm = map.getContext('2d');
  const ga = alpha.getContext('2d');
  gm.fillStyle = '#b8894f';
  gm.fillRect(0, 0, S, S);
  ga.fillStyle = '#000';
  ga.fillRect(0, 0, S, S);
  const strokes = (g, color, w) => {
    g.strokeStyle = color;
    g.lineWidth = w;
    for (const ox of [-S, 0, S]) {
      g.beginPath();
      g.moveTo(ox, 0);
      g.lineTo(ox + S, S);
      g.moveTo(ox + S, 0);
      g.lineTo(ox, S);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, S / 2);
    g.lineTo(S, S / 2);
    g.stroke();
  };
  strokes(ga, '#fff', 26);
  strokes(gm, '#d3a868', 14);
  return { map: toTexture(map, { repeat }), alpha: toTexture(alpha, { repeat, srgb: false }) };
}

export function abstractArt() {
  const W = 768;
  const H = 576;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#efe5d6';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#c56b45';
  g.beginPath();
  g.moveTo(120, H);
  g.lineTo(120, 300);
  g.arc(250, 300, 130, Math.PI, 0);
  g.lineTo(380, H);
  g.fill();
  g.fillStyle = '#9fae93';
  g.beginPath();
  g.arc(500, 210, 120, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#23384f';
  g.beginPath();
  g.arc(610, H, 150, Math.PI, 0);
  g.fill();
  g.fillStyle = '#e2b872';
  g.beginPath();
  g.ellipse(360, 120, 70, 44, -0.3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1d1a17';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(60, 420);
  g.bezierCurveTo(260, 380, 420, 520, 720, 360);
  g.stroke();
  // Canvas weave.
  const rand = rng(5);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${rand() * 0.05})`;
    g.fillRect(rand() * W, rand() * H, 1, 1);
  }
  return toTexture(c, { wrap: false });
}

export function sandTexture(repeat) {
  const S = 512;
  const rand = rng(41);
  const n = fractal(rand, S, S, 8, 8, 4);
  const ripple = fractal(rand, S, S, 3, 3, 3);
  const c = fillPixels(makeCanvas(S), (x, y, o) => {
    const r = Math.sin(y * 0.12 + ripple(x, y) * 14) * 0.5 + 0.5;
    const k = 0.9 + 0.1 * n(x, y) + 0.05 * r + 0.1 * (rand() - 0.5);
    o[0] = 236 * k;
    o[1] = 214 * k;
    o[2] = 174 * k;
  });
  return toTexture(c, { repeat });
}

/** A palm frond: a midrib with leaflets, on a transparent background. */
export function frondTexture() {
  const W = 512;
  const H = 128;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const rand = rng(77);
  for (let i = 0; i < 70; i++) {
    const t = i / 70;
    const x = 12 + t * (W - 30);
    const len = (H / 2 - 4) * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)) * (0.85 + rand() * 0.15);
    const tone = 70 + rand() * 40;
    g.strokeStyle = `rgb(${tone * 0.55},${tone + 30},${tone * 0.42})`;
    g.lineWidth = 3.2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(x, H / 2);
      g.quadraticCurveTo(x + len * 0.35, H / 2 + s * len * 0.6, x + len * 0.55, H / 2 + s * len);
      g.stroke();
    }
  }
  g.strokeStyle = '#6f7a3a';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, H / 2);
  g.lineTo(W, H / 2);
  g.stroke();
  return toTexture(c, { wrap: false });
}

export function barkTexture() {
  const W = 64;
  const H = 256;
  const rand = rng(13);
  const c = fillPixels(makeCanvas(W, H), (x, y, o) => {
    const ring = (y % 16) / 16;
    const k = 0.7 + 0.3 * Math.sin(ring * Math.PI) + 0.1 * (rand() - 0.5);
    o[0] = 128 * k;
    o[1] = 104 * k;
    o[2] = 78 * k;
  });
  return toTexture(c, { repeat: [2, 4] });
}

export function flutedTexture(repeat = [1, 1]) {
  const W = 256;
  const H = 64;
  const c = fillPixels(makeCanvas(W, H), (x, y, o) => {
    const u = (x % 16) / 16;
    const k = 0.72 + 0.28 * Math.sin(u * Math.PI);
    o[0] = o[1] = o[2] = 255 * k;
  });
  return toTexture(c, { repeat, srgb: false });
}
