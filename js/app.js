/* app.js — UI orchestration */
(() => {
  const $ = (id) => document.getElementById(id);

  const uploadSection = $('upload-section');
  const processSection = $('process-section');
  const resultsSection = $('results-section');
  const dropzone = $('dropzone');
  const fileInput = $('file-input');
  const progressBar = $('progress-bar');
  const status = $('status');

  let state = {
    extracted: null,
    palette: [],
    variations: [],
    selected: 0,
    res: 4096,
  };

  // ---- upload handlers ----
  $('browse-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
  ['dragenter', 'dragover'].forEach(ev =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  function setStep(id, cls) {
    const el = $(id);
    el.classList.remove('active', 'done');
    if (cls) el.classList.add(cls);
  }
  function progress(pct) { progressBar.style.width = pct + '%'; }

  async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      status.textContent = 'Please upload an image file (PNG, JPG, WEBP).';
      return;
    }
    uploadSection.classList.add('hidden');
    processSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    progress(5);
    setStep('step-analyze', 'active');

    try {
      const img = await Extract.loadImage(file);
      await tick(300);
      progress(20);
      setStep('step-analyze', 'done');
      setStep('step-extract', 'active');

      const result = Extract.run(img);
      state.extracted = result.extracted;
      state.palette = result.palette;
      await tick(300);
      progress(50);
      setStep('step-extract', 'done');
      setStep('step-generate', 'active');

      state.variations = Generate.variations(result.extracted, result.palette, 4, 1024);
      state.selected = 0;
      await tick(300);
      progress(85);
      setStep('step-generate', 'done');
      setStep('step-ready', 'active');

      renderResults(result);
      progress(100);
      await tick(400);
      setStep('step-ready', 'done');
      status.textContent = 'Pick a variation and a resolution, then download your PNG.';
    } catch (err) {
      status.textContent = 'Something went wrong: ' + err.message;
      uploadSection.classList.remove('hidden');
      processSection.classList.add('hidden');
    }
  }

  function tick(ms) { return new Promise(r => setTimeout(r, ms)); }

  function renderResults(result) {
    resultsSection.classList.remove('hidden');

    // original preview (cropped to bbox)
    const oc = $('original-canvas');
    const bb = result.bbox;
    oc.width = bb.w; oc.height = bb.h;
    oc.getContext('2d').drawImage(result.source, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);

    // extracted preview
    const ec = $('extracted-canvas');
    ec.width = result.extracted.width; ec.height = result.extracted.height;
    ec.getContext('2d').drawImage(result.extracted, 0, 0);

    // variations
    const wrap = $('variations');
    wrap.innerHTML = '';
    state.variations.forEach((canvas, i) => {
      const thumb = document.createElement('canvas');
      thumb.width = 180; thumb.height = 180;
      const tctx = thumb.getContext('2d');
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(canvas, 0, 0, 180, 180);
      if (i === state.selected) thumb.classList.add('selected');
      thumb.addEventListener('click', () => {
        state.selected = i;
        wrap.querySelectorAll('canvas').forEach(c => c.classList.remove('selected'));
        thumb.classList.add('selected');
        $('download-btn').disabled = false;
      });
      wrap.appendChild(thumb);
    });

    $('download-btn').disabled = false;
  }

  // ---- resolution buttons ----
  document.querySelectorAll('.btn.res').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn.res').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.res = parseInt(btn.dataset.res, 10);
    });
  });
  document.querySelector('.btn.res[data-res="4096"]').classList.add('active');

  // ---- download ----
  $('download-btn').addEventListener('click', async () => {
    const src = state.variations[state.selected];
    if (!src) return;
    status.textContent = `Rendering ${state.res}px PNG…`;
    await tick(50);
    const big = Generate.upscale(src, state.res);
    big.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `designforge-${state.res}k-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      status.textContent = `Downloaded ${big.width}×${big.height} PNG.`;
    }, 'image/png');
  });
})();