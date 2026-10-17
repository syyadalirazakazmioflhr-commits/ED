/* generate.js — creates new copyright-safe variations from the extracted design */
const Generate = (() => {

  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  /** Shift hue / saturation / lightness of the design while keeping its structure */
  function recolor(srcCanvas, hueShift, satMul = 1, lightMul = 1) {
    const out = document.createElement('canvas');
    out.width = srcCanvas.width; out.height = srcCanvas.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0);
    const img = ctx.getImageData(0, 0, out.width, out.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      const [r, g, b] = hslToRgb((h + hueShift + 1) % 1, Math.min(1, s * satMul), Math.min(1, l * lightMul));
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }

  /** Draw a procedural background (gradients / shapes) using the design palette */
  function proceduralBackground(size, palette, style) {
    const bg = document.createElement('canvas');
    bg.width = size; bg.height = size;
    const ctx = bg.getContext('2d');
    const cols = palette.length ? palette.map(p => `rgb(${p.rgb.join(',')})`) : ['#6c5ce7', '#00cec9'];

    if (style === 'gradient') {
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, cols[0]);
      g.addColorStop(1, cols[1 % cols.length]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    } else if (style === 'rays') {
          ctx.save();
          ctx.fillStyle = cols[0];
          ctx.fillRect(0, 0, size, size);
          ctx.translate(size / 2, size / 2);
          const n = 12 + Math.floor(Math.random() * 12);
          for (let i = 0; i < n; i++) {
            ctx.rotate((Math.PI * 2) / n);
            ctx.fillStyle = cols[(i % (cols.length - 1)) + 1];
            ctx.globalAlpha = 0.25;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, size, -0.08, 0.08);
            ctx.fill();
          }
          ctx.restore();
        } else if (style === 'dots') {
      ctx.fillStyle = cols[0];
      ctx.fillRect(0, 0, size, size);
      const step = size / 10;
      for (let y = step / 2; y < size; y += step) {
        for (let x = step / 2; x < size; x += step) {
          ctx.fillStyle = pick(cols.slice(1).length ? cols.slice(1) : cols);
          ctx.globalAlpha = rand(0.2, 0.5);
          ctx.beginPath();
          ctx.arc(x, y, rand(step * 0.1, step * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    } else { // transparent
      ctx.clearRect(0, 0, size, size);
    }
    return bg;
  }

  /**
   * Build one variation: recolor + transform + optional procedural background.
   * Returns a square canvas of `size` px with the design centered.
   */
  function variation(srcCanvas, palette, size = 1024) {
    const hueShift = pick([0.08, 0.15, -0.1, 0.5, 0.33, -0.25]);
    const recolored = recolor(srcCanvas, hueShift, rand(0.9, 1.3), rand(0.95, 1.1));

    const bgStyle = pick(['transparent', 'gradient', 'rays', 'dots']);
    const out = proceduralBackground(size, palette, bgStyle);
    const ctx = out.getContext('2d');

    // scale design to ~70% of canvas, preserving aspect
    const scale = Math.min((size * 0.7) / recolored.width, (size * 0.7) / recolored.height);
    const dw = recolored.width * scale;
    const dh = recolored.height * scale;

    ctx.save();
    ctx.translate(size / 2, size / 2);
    const flip = Math.random() < 0.35;
    if (flip) ctx.scale(-1, 1);
    const rot = pick([0, 0, Math.PI / 2, -Math.PI / 2]);
    ctx.rotate(rot);
    ctx.drawImage(recolored, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    return out;
  }

  /** Generate N variations */
  function variations(srcCanvas, palette, n = 4, size = 1024) {
    const list = [];
    for (let i = 0; i < n; i++) list.push(variation(srcCanvas, palette, size));
    return list;
  }

  /** Upscale a canvas to target size with high-quality smoothing (for 2K/4K/8K export) */
  function upscale(canvas, target) {
    const src = canvas.width >= canvas.height ? canvas.width : canvas.height;
    const scale = target / src;
    const out = document.createElement('canvas');
    out.width = Math.round(canvas.width * scale);
    out.height = Math.round(canvas.height * scale);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // progressive upscale for better quality
    let cur = canvas;
    let steps = 0;
    while (cur.width * 2 <= out.width && steps < 4) {
      const tmp = document.createElement('canvas');
      tmp.width = cur.width * 2; tmp.height = cur.height * 2;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(cur, 0, 0, tmp.width, tmp.height);
      cur = tmp;
      steps++;
    }
    ctx.drawImage(cur, 0, 0, out.width, out.height);
    return out;
  }

  return { variations, upscale };
})();