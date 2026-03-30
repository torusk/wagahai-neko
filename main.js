import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext';

const canvas = document.getElementById('main');
const ctx = canvas.getContext('2d');
const video = document.getElementById('video');

const W = 1280;
const H = 720;
canvas.width = W;
canvas.height = H;

// ---- Layout constants ----
const FONT_SIZE = 14;
const LINE_HEIGHT = 21;
const MARGIN = 28;
const HEADER_HEIGHT = 118; // reserved for title + author + rule
const FONT = `${FONT_SIZE}px "Hiragino Mincho ProN", "Yu Mincho", "BIZ UDMincho Medium", serif`;

// ---- Colors ----
const TEXT_COLOR  = '#1a1204';
const TITLE_COLOR = '#0d0a04';
const RULE_COLOR  = '#c4b49a';
const META_COLOR  = '#7a6a55';

// ---- Cat silhouette padding ----
const CAT_PAD_X = 7;
const CAT_PAD_Y = 4;

// ---- Offscreen: video frame processing ----
const offscreen = document.createElement('canvas');
offscreen.width = W;
offscreen.height = H;
const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

// ---- Paper texture (generated once) ----
const paperCanvas = document.createElement('canvas');
paperCanvas.width = W;
paperCanvas.height = H;
generatePaperTexture();

function generatePaperTexture() {
  const pc = paperCanvas.getContext('2d');

  // Warm cream base
  pc.fillStyle = '#f4edd8';
  pc.fillRect(0, 0, W, H);

  // Subtle aged-paper gradient (slightly darker at edges)
  const vignette = pc.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.9);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.06)');
  pc.fillStyle = vignette;
  pc.fillRect(0, 0, W, H);

  // Fine grain noise (deterministic LCG so it never changes)
  const img = pc.getImageData(0, 0, W, H);
  const d = img.data;
  let s = 0xdeadbeef;
  const rnd = () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
  for (let i = 0; i < d.length; i += 4) {
    const v = (rnd() - 0.5) * 11;
    d[i]   = Math.min(255, Math.max(0, d[i]   + v));
    d[i+1] = Math.min(255, Math.max(0, d[i+1] + v * 0.88));
    d[i+2] = Math.min(255, Math.max(0, d[i+2] + v * 0.62));
  }
  pc.putImageData(img, 0, 0);
}

// ---- Strip inline furigana from Aozora-style text ----
// e.g. 吾輩わがはい → 吾輩, 見当けんとう → 見当
// Keep okurigana: single kanji + ≤2 hiragana (食べる, 泣いて, etc.)
function stripFurigana(text) {
  return text.replace(/([一-龯々]{1,4})([ぁ-ん]{2,8})/g, (_, kanji, hira) => {
    if (kanji.length === 1 && hira.length <= 2) return kanji + hira;
    return kanji;
  });
}

// ---- Green-screen helpers ----
function isGreen(r, g, b) {
  return g > 90 && (g - r) > 35 && (g - b) > 35;
}

function buildCatMask(data) {
  const mask = new Uint8Array(W * H);
  for (let i = 0, j = 0; j < data.length; i++, j += 4) {
    if (!isGreen(data[j], data[j + 1], data[j + 2])) {
      mask[i] = 1;
    } else {
      data[j + 3] = 0;
    }
  }
  return mask;
}

// ---- Obstacle / slot helpers ----
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
    if (hasCat && !inBlock)  { inBlock = true;  start = Math.max(0, x - CAT_PAD_X); }
    if (!hasCat && inBlock)  { inBlock = false; intervals.push({ left: start, right: Math.min(W, x + CAT_PAD_X) }); }
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

// ---- Header: title, author, rule ----
function drawHeader() {
  ctx.save();
  ctx.textBaseline = 'top';

  // Title
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = `bold 30px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  ctx.fillText('吾輩は猫である', MARGIN, 16);

  // Author
  ctx.fillStyle = META_COLOR;
  ctx.font = `17px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  ctx.fillText('夏目漱石', MARGIN, 56);

  // Horizontal rule
  ctx.strokeStyle = RULE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 84);
  ctx.lineTo(W - MARGIN, 84);
  ctx.stroke();

  // Chapter marker
  ctx.fillStyle = META_COLOR;
  ctx.font = `15px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  ctx.textAlign = 'center';
  ctx.fillText('一', W / 2, 94);
  ctx.textAlign = 'left';

  ctx.restore();
}

// ---- Main render loop ----
let prepared = null;

function render() {
  if (!prepared || video.readyState < 2) {
    requestAnimationFrame(render);
    return;
  }

  // Process video frame on offscreen canvas
  offCtx.drawImage(video, 0, 0, W, H);
  const imageData = offCtx.getImageData(0, 0, W, H);
  const mask = buildCatMask(imageData.data);
  offCtx.putImageData(imageData, 0, 0);

  // 1. Paper background
  ctx.drawImage(paperCanvas, 0, 0);

  // 2. Header (title / author / rule)
  drawHeader();

  // 3. Body text — flows around cat, starts below header
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  const lo = MARGIN;
  const hi = W - MARGIN;

  for (let y = HEADER_HEIGHT + LINE_HEIGHT; y <= H; y += LINE_HEIGHT) {
    const blocked = getBlockedIntervals(mask, y - LINE_HEIGHT, y);
    const slots   = carveSlots(blocked, lo, hi);

    for (const slot of slots) {
      const slotW = slot.right - slot.left;
      if (slotW < 24) continue;

      let line = layoutNextLine(prepared, cursor, slotW);
      if (line === null) {
        // Text exhausted — loop from beginning
        cursor = { segmentIndex: 0, graphemeIndex: 0 };
        line = layoutNextLine(prepared, cursor, slotW);
        if (!line) continue;
      }

      ctx.fillText(line.text, slot.left, y - 3);
      cursor = line.end;
    }
  }

  // 4. Cat on top of everything
  ctx.drawImage(offscreen, 0, 0);

  requestAnimationFrame(render);
}

// ---- Init ----
async function init() {
  const resp = await fetch('/wagahai.txt');
  const raw  = await resp.text();
  const text = stripFurigana(raw);

  await document.fonts.ready;
  prepared = prepareWithSegments(text, FONT);

  const startVideo = () => video.play().then(() => requestAnimationFrame(render));
  video.addEventListener('canplay', startVideo, { once: true });
  if (video.readyState >= 3) startVideo();
}

init().catch(console.error);
