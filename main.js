import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext';

const canvas = document.getElementById('main');
const ctx = canvas.getContext('2d');
const video = document.getElementById('video');

const W = 1280;
const H = 720;
canvas.width = W;
canvas.height = H;

// Typography
const FONT_SIZE = 14;
const LINE_HEIGHT = 20;
const FONT = `${FONT_SIZE}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
const TEXT_COLOR = '#e8f5e9';
// Slight padding around the cat silhouette
const CAT_PAD_X = 6;
const CAT_PAD_Y = 4;

// Offscreen canvas for video pixel processing
const offscreen = document.createElement('canvas');
offscreen.width = W;
offscreen.height = H;
const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

let wagahaiText = '';
let prepared = null;
let animId = null;

// ---------- green-screen detection ----------
function isGreen(r, g, b) {
  // Chroma-key green: green channel dominant by a clear margin
  return g > 90 && (g - r) > 35 && (g - b) > 35;
}

// Build a Uint8Array mask: 1 = cat pixel, 0 = green/transparent
function buildCatMask(data) {
  const mask = new Uint8Array(W * H);
  for (let i = 0, j = 0; j < data.length; i++, j += 4) {
    if (!isGreen(data[j], data[j + 1], data[j + 2])) {
      mask[i] = 1;
    } else {
      data[j + 3] = 0; // punch out green → transparent
    }
  }
  return mask;
}

// ---------- obstacle / slot helpers ----------
function getBlockedIntervals(mask, lineTop, lineBottom) {
  const top = Math.max(0, lineTop - CAT_PAD_Y);
  const bottom = Math.min(H, lineBottom + CAT_PAD_Y);

  const intervals = [];
  let inBlock = false;
  let start = 0;

  for (let x = 0; x < W; x++) {
    let hasCat = false;
    for (let y = top; y < bottom && !hasCat; y++) {
      if (mask[y * W + x]) hasCat = true;
    }

    if (hasCat && !inBlock) {
      inBlock = true;
      start = Math.max(0, x - CAT_PAD_X);
    } else if (!hasCat && inBlock) {
      inBlock = false;
      intervals.push({ left: start, right: Math.min(W, x + CAT_PAD_X) });
    }
  }
  if (inBlock) intervals.push({ left: start, right: W });
  return intervals;
}

function carveSlots(blocked) {
  if (blocked.length === 0) return [{ left: 0, right: W }];

  // Sort and merge overlapping blocked intervals
  blocked.sort((a, b) => a.left - b.left);
  const merged = [{ ...blocked[0] }];
  for (let i = 1; i < blocked.length; i++) {
    const last = merged[merged.length - 1];
    if (blocked[i].left <= last.right) {
      if (blocked[i].right > last.right) last.right = blocked[i].right;
    } else {
      merged.push({ ...blocked[i] });
    }
  }

  // Carve free slots
  const slots = [];
  let cursor = 0;
  for (const b of merged) {
    if (b.left > cursor) slots.push({ left: cursor, right: b.left });
    cursor = b.right;
  }
  if (cursor < W) slots.push({ left: cursor, right: W });
  return slots;
}

// ---------- render loop ----------
let textCursor = { segmentIndex: 0, graphemeIndex: 0 };

function render() {
  if (!prepared || video.readyState < 2) {
    animId = requestAnimationFrame(render);
    return;
  }

  // 1. Pull current video frame into offscreen canvas
  offCtx.drawImage(video, 0, 0, W, H);
  const imageData = offCtx.getImageData(0, 0, W, H);
  const mask = buildCatMask(imageData.data);
  offCtx.putImageData(imageData, 0, 0); // green pixels now alpha=0

  // 2. Black background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // 3. Draw text flowing around cat silhouette
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';

  // Reset cursor each frame so text always starts from top
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };

  for (let y = LINE_HEIGHT; y <= H; y += LINE_HEIGHT) {
    const lineTop = y - LINE_HEIGHT;
    const lineBottom = y;

    const blocked = getBlockedIntervals(mask, lineTop, lineBottom);
    const slots = carveSlots(blocked);

    for (const slot of slots) {
      const slotW = slot.right - slot.left;
      if (slotW < 24) continue; // too narrow to bother

      let line = layoutNextLine(prepared, cursor, slotW);
      if (line === null) {
        // Text exhausted — loop back to start
        cursor = { segmentIndex: 0, graphemeIndex: 0 };
        line = layoutNextLine(prepared, cursor, slotW);
        if (!line) continue;
      }

      ctx.fillText(line.text, slot.left, y - 3);
      cursor = line.end;
    }
  }

  // 4. Draw the cat (transparent-green removed) on top
  ctx.drawImage(offscreen, 0, 0);

  animId = requestAnimationFrame(render);
}

// ---------- init ----------
async function init() {
  const resp = await fetch('/wagahai.txt');
  wagahaiText = await resp.text();

  // Wait for fonts
  await document.fonts.ready;

  prepared = prepareWithSegments(wagahaiText, FONT);

  video.addEventListener('canplay', () => {
    video.play().then(() => {
      animId = requestAnimationFrame(render);
    });
  }, { once: true });

  // If already ready
  if (video.readyState >= 3) {
    video.play().then(() => {
      animId = requestAnimationFrame(render);
    });
  }
}

init().catch(console.error);
