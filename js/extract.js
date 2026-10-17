/* extract.js — design extraction pipeline (background removal + bounding box + palette) */
const Extract = (() => {

  /** Load an image file into an HTMLImageElement */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
      img.src = url;
    });
  }

  /** Draw image to a canvas and return its pixel data */
  function toCanvas(img, maxDim = 1600) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, ctx, w, h };
  }

  /** Sample border pixels to estimate background color(s) */
  function estimateBackground(data, w, h) {
    const samples = [];
    const step = Math.max(1, Math.floor(w / 40));
    for (let x = 0; x < w; x += step) {
      samples.push(data[x * 4], data[x * 4 + 1], data[x * 4 + 2]);
      const yi = (h - 1) * w + x;
      samples.push(data[yi * 4], data[yi * 4 + 1], data[yi * 4 + 2]);
    }
    const stepY = Math.max(1, Math.floor(h / 40));
    for (let y = 0; y < h; y += stepY) {
      samples.push(data[y * w * 4], data[y * w * 4 + 1], data[y * w * 4 + 2]);
      const xi = (w - 1);
      samples.push(data[(y * w + xi) * 4], data[(y * w + xi) * 4 + 1], data[(y * w + xi) * 4 + 2]);
    }
    // cluster into a few background candidates by simple averaging of quantized colors
    const counts = new Map();
    for (let i = 0; i < samples.length; i += 3) {
      const key = `${samples[i] >> 4},${samples[i + 1] >> 4},${samples[i + 2] >> 4}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
        return top.map(([k]) => k.split(',').map(v => (parseInt(v, 10) * 16) + 8));
  }

  /** Flood-fill from borders to mark background pixels; returns Uint8Array mask (1 = background) */
  function backgroundMask(data, w, h, bgColors, tolerance = 40) {
    const mask = new Uint8Array(w * h);
    const stack = [];
    const isBg = (i) => {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      for (const [br, bg, bb] of bgColors) {
        const dr = r - br, dg = g - bg, db = b - bb;
        if (dr * dr + dg * dg + db * db < tolerance * tolerance) return true;
      }
      return false;
    };
    const push = (x, y) => {
      const i = y * w + x;
      if (!mask[i] && isBg(i)) { mask[i] = 1; stack.push(i); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i / w) | 0;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    return mask;
  }

  /** Find bounding box of non-background pixels */
  function boundingBox(mask, w, h) {
    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return { x: 0, y: 0, w, h };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  /** Extract dominant design colors (excluding background) */
  function palette(data, mask, w, h, count = 5) {
    const counts = new Map();
    for (let i = 0; i < w * h; i++) {
      if (mask[i]) continue;
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([k, n]) => ({
        rgb: k.split(',').map(v => parseInt(v, 10) * 32 + 16),
        count: n,
      }));
  }

  /**
     * Second pass: if the design sits on a solid-color garment, the first flood fill
     * leaves the fabric in. Sample the bbox border, find the dominant fabric color,
     * and flood-fill it away from the bbox edges so only the print remains.
     */
    function removeGarment(data, mask, w, h, bbox) {
      const counts = new Map();
      const border = [];
      const add = (x, y) => {
        const i = y * w + x;
        if (mask[i]) return;
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        border.push(i);
        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      };
      for (let x = bbox.x; x < bbox.x + bbox.w; x++) { add(x, bbox.y); add(x, bbox.y + bbox.h - 1); }
      for (let y = bbox.y; y < bbox.y + bbox.h; y++) { add(bbox.x, y); add(bbox.x + bbox.w - 1, y); }
      if (!border.length) return mask;
      const [topKey, topN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      // only act when the border is dominated by one color (solid fabric)
      if (topN / border.length < 0.5) return mask;
      const fabric = topKey.split(',').map(v => (parseInt(v, 10) * 16) + 8);

      const stack = [];
      const isFabric = (i) => {
        const dr = data[i * 4] - fabric[0], dg = data[i * 4 + 1] - fabric[1], db = data[i * 4 + 2] - fabric[2];
        return dr * dr + dg * dg + db * db < 45 * 45;
      };
      const push = (x, y) => {
        if (x < bbox.x || y < bbox.y || x >= bbox.x + bbox.w || y >= bbox.y + bbox.h) return;
        const i = y * w + x;
        if (!mask[i] && isFabric(i)) { mask[i] = 1; stack.push(i); }
      };
      for (let x = bbox.x; x < bbox.x + bbox.w; x++) { push(x, bbox.y); push(x, bbox.y + bbox.h - 1); }
      for (let y = bbox.y; y < bbox.y + bbox.h; y++) { push(bbox.x, y); push(bbox.x + bbox.w - 1, y); }
      while (stack.length) {
        const i = stack.pop();
        const x = i % w, y = (i / w) | 0;
        push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
      }
      return mask;
    }

    /**
     * Full extraction: returns { extracted: canvas (transparent bg), bbox, palette, source }
     */
    function run(img) {
      const { canvas, ctx, w, h } = toCanvas(img);
      const data = ctx.getImageData(0, 0, w, h).data;
      const bgColors = estimateBackground(data, w, h);
      let mask = backgroundMask(data, w, h, bgColors);
      let bbox = boundingBox(mask, w, h);
      mask = removeGarment(data, mask, w, h, bbox);
      bbox = boundingBox(mask, w, h);
      const pal = palette(data, mask, w, h);

    // Build extracted canvas with transparency
    const out = document.createElement('canvas');
    out.width = bbox.w; out.height = bbox.h;
    const octx = out.getContext('2d');
    const src = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
    const dst = octx.createImageData(bbox.w, bbox.h);
    for (let y = 0; y < bbox.h; y++) {
      for (let x = 0; x < bbox.w; x++) {
        const si = (y * bbox.w + x) * 4;
        const mi = (y + bbox.y) * w + (x + bbox.x);
        dst.data[si] = src.data[si];
        dst.data[si + 1] = src.data[si + 1];
        dst.data[si + 2] = src.data[si + 2];
        dst.data[si + 3] = mask[mi] ? 0 : 255;
      }
    }
    octx.putImageData(dst, 0, 0);

    return { extracted: out, bbox, palette: pal, source: canvas };
  }

  return { loadImage, run };
})();