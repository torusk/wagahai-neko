import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext';

const canvas = document.getElementById('main');
const ctx = canvas.getContext('2d');
const video = document.getElementById('video');

const W = 1280;
const H = 720;
canvas.width = W;
canvas.height = H;

// ---- Layout constants ----
const FONT_SIZE     = 18;
const LINE_HEIGHT   = 26;
const MARGIN        = 28;
const HEADER_HEIGHT = 118;
const FONT = `${FONT_SIZE}px "Hiragino Mincho ProN", "Yu Mincho", "BIZ UDMincho Medium", serif`;

// ---- Cat scaling ----
const CAT_SCALE    = 1 / 3;
const BBOX_MARGIN  = 15; // source-space pixels added around cat bounding box

// ---- Colors ----
const TEXT_COLOR  = '#1a1204';
const TITLE_COLOR = '#0d0a04';
const RULE_COLOR  = '#ccc0b0';
const META_COLOR  = '#888070';

// ---- Obstacle padding around cat silhouette ----
const CAT_PAD_X = 8;
const CAT_PAD_Y = 5;

// ---- Full-resolution offscreen for video processing ----
const offscreen = document.createElement('canvas');
offscreen.width  = W;
offscreen.height = H;
const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

// ---- Green-screen removal + spill suppression + bounding box ----
function isGreen(r, g, b) {
  return g > 90 && (g - r) > 35 && (g - b) > 35;
}

function processFrame(data) {
  const catMask = new Uint8Array(W * H);
  let minX = W, minY = H, maxX = -1, maxY = -1;

  for (let i = 0, j = 0; j < data.length; i++, j += 4) {
    const r = data[j], g = data[j + 1], b = data[j + 2];

    if (isGreen(r, g, b)) {
      data[j + 3] = 0; // punch out green → transparent
    } else {
      catMask[i] = 1;

      // Green spill suppression on fringe pixels
      const spill = g - Math.max(r, b);
      if (spill > 5) data[j + 1] = Math.round(Math.max(r, b) + spill * 0.15);

      // Track cat bounding box
      const x = i % W;
      const y = (i / W) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return { catMask, bbox: null }; // no cat found

  // Expand bounding box by a margin and clamp to canvas
  const bx = Math.max(0, minX - BBOX_MARGIN);
  const by = Math.max(0, minY - BBOX_MARGIN);
  const bbox = {
    x: bx,
    y: by,
    w: Math.min(W, maxX + BBOX_MARGIN + 1) - bx,
    h: Math.min(H, maxY + BBOX_MARGIN + 1) - by,
  };

  return { catMask, bbox };
}

// ---- Build a sparse obstacle mask sized to the main canvas ----
// Maps each pixel in the scaled destination rect back to source catMask.
function buildScaledMask(catMask, bbox, destX, destY, destW, destH) {
  const mask   = new Uint8Array(W * H);
  const scaleX = bbox.w / destW;
  const scaleY = bbox.h / destH;
  const x0 = Math.max(0, destX),  x1 = Math.min(W, destX + destW);
  const y0 = Math.max(0, destY),  y1 = Math.min(H, destY + destH);

  for (let my = y0; my < y1; my++) {
    const srcY = Math.round(bbox.y + (my - destY) * scaleY);
    if (srcY < 0 || srcY >= H) continue;
    for (let mx = x0; mx < x1; mx++) {
      const srcX = Math.round(bbox.x + (mx - destX) * scaleX);
      if (srcX >= 0 && srcX < W) {
        mask[my * W + mx] = catMask[srcY * W + srcX];
      }
    }
  }
  return mask;
}

// ---- Obstacle / text-slot helpers ----
function getBlockedIntervals(mask, lineTop, lineBottom) {
  const top    = Math.max(0, lineTop    - CAT_PAD_Y);
  const bottom = Math.min(H, lineBottom + CAT_PAD_Y);
  const intervals = [];
  let inBlock = false, start = 0;

  for (let x = 0; x < W; x++) {
    let hasCat = false;
    for (let y = top; y < bottom && !hasCat; y++) {
      if (mask[y * W + x]) hasCat = true;
    }
    if  (hasCat && !inBlock) { inBlock = true;  start = Math.max(0, x - CAT_PAD_X); }
    if (!hasCat &&  inBlock) { inBlock = false; intervals.push({ left: start, right: Math.min(W, x + CAT_PAD_X) }); }
  }
  if (inBlock) intervals.push({ left: start, right: W });
  return intervals;
}

function carveSlots(blocked, lo, hi) {
  if (blocked.length === 0) return [{ left: lo, right: hi }];

  const clipped = blocked
    .map(b => ({ left: Math.max(b.left, lo), right: Math.min(b.right, hi) }))
    .filter(b => b.left < b.right)
    .sort((a, b) => a.left - b.left);

  if (clipped.length === 0) return [{ left: lo, right: hi }];

  const merged = [{ ...clipped[0] }];
  for (let i = 1; i < clipped.length; i++) {
    const last = merged[merged.length - 1];
    if (clipped[i].left <= last.right) last.right = Math.max(last.right, clipped[i].right);
    else merged.push({ ...clipped[i] });
  }

  const slots = [];
  let cur = lo;
  for (const b of merged) {
    if (b.left > cur) slots.push({ left: cur, right: b.left });
    cur = b.right;
  }
  if (cur < hi) slots.push({ left: cur, right: hi });
  return slots;
}

// ---- Strip inline furigana ----
// e.g. 吾輩わがはい → 吾輩、見当けんとう → 見当
// Keep okurigana: single kanji + ≤2 hiragana (食べる, 泣いて …)
function stripFurigana(text) {
  return text.replace(/([一-龯々]{1,4})([ぁ-ん]{2,8})/g, (_, kanji, hira) => {
    if (kanji.length === 1 && hira.length <= 2) return kanji + hira;
    return kanji;
  });
}

// ---- Aozora Bunko-style header ----
function drawHeader() {
  ctx.save();
  ctx.textBaseline = 'top';

  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `bold 30px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  ctx.fillText('吾輩は猫である', MARGIN, 16);

  ctx.fillStyle = META_COLOR;
  ctx.font = `17px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  ctx.fillText('夏目漱石', MARGIN, 56);

  ctx.strokeStyle = RULE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 84);
  ctx.lineTo(W - MARGIN, 84);
  ctx.stroke();

  ctx.fillStyle = META_COLOR;
  ctx.font = `15px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  ctx.textAlign = 'center';
  ctx.fillText('一', W / 2, 94);
  ctx.textAlign = 'left';

  ctx.restore();
}

// ---- Render loop ----
let prepared = null;

function render() {
  if (!prepared || video.readyState < 2) {
    requestAnimationFrame(render);
    return;
  }

  // 1. Process full-res video frame on offscreen canvas
  offCtx.drawImage(video, 0, 0, W, H);
  const imageData = offCtx.getImageData(0, 0, W, H);
  const { catMask, bbox } = processFrame(imageData.data);
  offCtx.putImageData(imageData, 0, 0); // green pixels are now transparent

  // 2. Compute destination rect for the 1/3-scaled cat
  let mask, destX = 0, destY = 0, destW = 0, destH = 0;
  if (bbox) {
    destW = Math.round(bbox.w * CAT_SCALE);
    destH = Math.round(bbox.h * CAT_SCALE);
    // Keep the cat's center at the same canvas position as in the original video
    destX = Math.round(bbox.x + bbox.w / 2 - destW / 2);
    destY = Math.round(bbox.y + bbox.h / 2 - destH / 2);
    destX = Math.max(0, Math.min(W - destW, destX));
    destY = Math.max(0, Math.min(H - destH, destY));
    mask = buildScaledMask(catMask, bbox, destX, destY, destW, destH);
  } else {
    mask = new Uint8Array(W * H);
  }

  // 3. White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 4. Header
  drawHeader();

  // 5. Body text — flows around the scaled cat silhouette
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  let cursor = { segmentIndex: 0, graphemeIndex: 0 };

  for (let y = HEADER_HEIGHT + LINE_HEIGHT; y <= H; y += LINE_HEIGHT) {
    const blocked = getBlockedIntervals(mask, y - LINE_HEIGHT, y);
    const slots   = carveSlots(blocked, MARGIN, W - MARGIN);

    for (const slot of slots) {
      const slotW = slot.right - slot.left;
      if (slotW < 24) continue;

      let line = layoutNextLine(prepared, cursor, slotW);
      if (line === null) {
        cursor = { segmentIndex: 0, graphemeIndex: 0 };
        line = layoutNextLine(prepared, cursor, slotW);
        if (!line) continue;
      }

      ctx.fillText(line.text, slot.left, y - 3);
      cursor = line.end;
    }
  }

  // 6. Draw scaled cat (bbox region → 1/3 size) on top of text
  if (bbox) {
    ctx.drawImage(offscreen, bbox.x, bbox.y, bbox.w, bbox.h, destX, destY, destW, destH);
  }

  requestAnimationFrame(render);
}

// ---- Init ----
async function init() {
  const resp = await fetch('/wagahai.txt');
  const raw  = await resp.text();
  const text = raw;

  await document.fonts.ready;
  prepared = prepareWithSegments(text, FONT);

  const startVideo = () => video.play().then(() => requestAnimationFrame(render));
  video.addEventListener('canplay', startVideo, { once: true });
  if (video.readyState >= 3) startVideo();
}

init().catch(console.error);
