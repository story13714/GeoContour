import Store from './store.js';
import { initDataGrid, loadFile, pasteCSV, downloadCSV } from '../data/dataGrid.js';
import { buildGrid, computeGradient } from '../interpolation/gridEngine.js';
import { computeStats, buildHistogram } from '../stats/descriptiveStats.js';
import { experimentalVariogram, fitVariogram } from '../interpolation/kriging.js';
import { crossValidate } from '../stats/crossValidation.js';
import { initRenderer, renderMap, exportPNG, exportSVG } from '../rendering/mapRenderer.js';
import { SCALE_NAMES, getScale } from '../rendering/colorScales.js';

// Expose computeGradient globally for mapRenderer
window._gridEngine = { computeGradient };

export async function initApp() {
  initDataGrid('data-table');
  initRenderer('map-canvas', 'svg-overlay');
  setupUI();
  buildColorScaleOptions();
  setupTabSwitching();
  await loadSampleData();
}

// TWD97 TM2 sample data (Taichung area, meters)
const SAMPLE_TWD97 = `X,Y,Value
218450,2680120,45.2
224310,2683560,38.7
230180,2687240,32.1
236050,2690830,28.4
241920,2694410,22.8
220640,2686790,51.3
226510,2690280,44.6
232380,2693860,37.9
238250,2697340,30.2
244120,2700920,18.5
222830,2693460,58.1
228700,2697000,50.4
234570,2700540,43.2
240440,2704020,35.6
246310,2707600,24.1
225020,2700130,62.7
230890,2703670,55.3
236760,2707250,47.8
242630,2710730,39.4
248500,2714310,27.9
227210,2706800,67.4
233080,2710340,60.1
238950,2713920,52.6
244820,2717400,44.3
250690,2720980,31.2
229400,2713470,70.8
235270,2717010,63.5
241140,2720590,56.2
247010,2724070,48.9
252880,2727650,35.7
221550,2689460,55.6
242800,2696340,33.4
258320,2683780,15.2
256140,2720540,22.4
219760,2710890,58.9
236200,2703260,48.3
244900,2711620,38.1
226900,2699840,61.2
248100,2694560,25.6
231650,2708430,64.8`;

// Taiwan groundwater lat/lon sample data
const SAMPLE_LATLON = `X,Y,Value
121.540,25.048,45.2
121.545,25.052,38.7
121.550,25.056,32.1
121.555,25.060,28.4
121.560,25.064,22.8
121.542,25.054,51.3
121.547,25.058,44.6
121.552,25.062,37.9
121.557,25.066,30.2
121.562,25.070,18.5
121.544,25.060,58.1
121.549,25.064,50.4
121.554,25.068,43.2
121.559,25.072,35.6
121.564,25.076,24.1
121.546,25.066,62.7
121.551,25.070,55.3
121.556,25.074,47.8
121.561,25.078,39.4
121.566,25.082,27.9
121.548,25.072,67.4
121.553,25.076,60.1
121.558,25.080,52.6
121.563,25.084,44.3
121.568,25.088,31.2
121.550,25.078,70.8
121.555,25.082,63.5
121.560,25.086,56.2
121.565,25.090,48.9
121.570,25.094,35.7
121.543,25.058,55.6
121.558,25.066,33.4
121.572,25.058,15.2
121.572,25.086,22.4
121.543,25.086,58.9
121.555,25.073,48.3
121.562,25.080,38.1
121.548,25.076,61.2
121.565,25.064,25.6
121.550,25.084,64.8`;

async function loadSampleData() {
  const res = await fetch('./assets/sample_data.csv');
  const text = await res.text();
  pasteCSV(text);
  await runInterpolation();
}

async function runInterpolation() {
  const state = Store.get();
  if (state.points.length < 3) {
    alert('請輸入至少 3 個資料點');
    return;
  }

  Store.set({ isComputing: true });
  setStatus('計算中...', 'running');

  try {
    const grid = await asyncBuildGrid(state.points, state.gridSettings);
    Store.setGrid(grid);
    Store.set({ mapBounds: { xMin: grid.xMin, xMax: grid.xMax, yMin: grid.yMin, yMax: grid.yMax } });

    if (grid.variogramResult) {
      Store.set({ variogram: grid.variogramResult });
      // Update kriging params from auto-fit
      const best = grid.variogramResult.best;
      document.getElementById('nugget').value = best.nugget.toFixed(4);
      document.getElementById('sill').value = best.sill.toFixed(4);
      document.getElementById('range').value = best.range.toFixed(2);
      Store.set({ gridSettings: { nugget: best.nugget, sill: best.sill, range: best.range, variogramModel: best.model } });
    }

    await renderMap();
    updateStats();
    setStatus(`插值完成 (${grid.method.toUpperCase()}, ${grid.nx}×${grid.ny})`, 'done');
  } catch (err) {
    setStatus('錯誤: ' + err.message, 'error');
    console.error(err);
  } finally {
    Store.set({ isComputing: false });
  }
}

function asyncBuildGrid(points, settings) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try { resolve(buildGrid(points, settings)); }
      catch (e) { reject(e); }
    }, 10);
  });
}

function updateStats() {
  const state = Store.get();
  const stats = computeStats(state.points);
  Store.setStats(stats);
  renderStatsPanel(stats);

  if (state.variogram) {
    renderVariogramPanel(state.variogram, state.points);
  }
}

function renderStatsPanel(stats) {
  if (!stats) return;
  const el = document.getElementById('stats-content');
  if (!el) return;
  el.innerHTML = `
    <table class="stats-table">
      <tbody>
        <tr><td>樣本數</td><td>${stats.n}</td></tr>
        <tr><td>最小值</td><td>${stats.min.toFixed(4)}</td></tr>
        <tr><td>最大值</td><td>${stats.max.toFixed(4)}</td></tr>
        <tr><td>平均值</td><td>${stats.mean.toFixed(4)}</td></tr>
        <tr><td>中位數</td><td>${stats.median.toFixed(4)}</td></tr>
        <tr><td>標準差</td><td>${stats.std.toFixed(4)}</td></tr>
        <tr><td>變異數</td><td>${stats.variance.toFixed(4)}</td></tr>
        <tr><td>變異係數 (%)</td><td>${stats.cv.toFixed(2)}</td></tr>
        <tr><td>偏態</td><td>${stats.skewness.toFixed(4)}</td></tr>
        <tr><td>峰度</td><td>${stats.kurtosis.toFixed(4)}</td></tr>
        <tr><td>P10</td><td>${stats.p10.toFixed(4)}</td></tr>
        <tr><td>P25 (Q1)</td><td>${stats.p25.toFixed(4)}</td></tr>
        <tr><td>P75 (Q3)</td><td>${stats.p75.toFixed(4)}</td></tr>
        <tr><td>P90</td><td>${stats.p90.toFixed(4)}</td></tr>
        <tr><td>IQR</td><td>${stats.iqr.toFixed(4)}</td></tr>
        <tr><td>X 範圍</td><td>${stats.xMin.toFixed(2)} ~ ${stats.xMax.toFixed(2)}</td></tr>
        <tr><td>Y 範圍</td><td>${stats.yMin.toFixed(2)} ~ ${stats.yMax.toFixed(2)}</td></tr>
      </tbody>
    </table>
  `;

  // Histogram chart
  renderHistogram(Store.get().points);
}

function renderHistogram(points) {
  const el = document.getElementById('histogram-chart');
  if (!el || !window.Plotly) return;
  const bins = buildHistogram(points, 15);
  const trace = {
    type: 'bar',
    x: bins.map(b => (b.x0 + b.x1) / 2),
    y: bins.map(b => b.count),
    marker: { color: '#4af', line: { color: '#1a1a2e', width: 1 } },
    name: '頻率',
  };
  Plotly.react(el, [trace], {
    paper_bgcolor: '#16213e', plot_bgcolor: '#16213e',
    font: { color: '#ccc', size: 10 },
    margin: { l: 35, r: 10, t: 15, b: 35 },
    xaxis: { title: '值', color: '#aaa', gridcolor: '#2a2a4a' },
    yaxis: { title: '頻次', color: '#aaa', gridcolor: '#2a2a4a' },
    bargap: 0.05,
    showlegend: false,
  }, { displayModeBar: false, responsive: true });
}

function renderVariogramPanel(vario, points) {
  const el = document.getElementById('variogram-chart');
  if (!el || !window.Plotly || !vario) return;

  const { experimental, best } = vario;
  const hMax = experimental[experimental.length - 1]?.h || 100;
  const hVals = Array.from({ length: 50 }, (_, i) => (i + 1) * hMax / 50);

  const { variogramValue } = window._kriging || {};
  if (!variogramValue) return;

  const colors = { spherical: '#4af', exponential: '#fa4', gaussian: '#4f8' };
  const traces = [];

  // Experimental variogram
  traces.push({
    type: 'scatter', mode: 'markers',
    x: experimental.map(p => p.h),
    y: experimental.map(p => p.gamma),
    text: experimental.map(p => `N=${p.count}`),
    marker: { color: '#fff', size: 6, symbol: 'circle' },
    name: '實驗半變異函數',
  });

  // Model fits
  for (const fit of vario.fits) {
    traces.push({
      type: 'scatter', mode: 'lines',
      x: hVals,
      y: hVals.map(h => variogramValue(fit.model, h, fit.nugget, fit.sill, fit.range)),
      line: { color: colors[fit.model] || '#ccc', width: fit.model === best.model ? 3 : 1.5,
              dash: fit.model === best.model ? 'solid' : 'dash' },
      name: `${fit.model} (RMSE=${fit.rmse.toFixed(3)})`,
    });
  }

  Plotly.react(el, traces, {
    paper_bgcolor: '#16213e', plot_bgcolor: '#16213e',
    font: { color: '#ccc', size: 10 },
    margin: { l: 45, r: 10, t: 15, b: 40 },
    xaxis: { title: '距離 h', color: '#aaa', gridcolor: '#2a2a4a' },
    yaxis: { title: 'γ(h)', color: '#aaa', gridcolor: '#2a2a4a' },
    legend: { font: { color: '#ccc', size: 9 }, bgcolor: 'rgba(0,0,0,0.5)' },
    showlegend: true,
  }, { displayModeBar: false, responsive: true });

  // Variogram params display
  const paramsEl = document.getElementById('variogram-params');
  if (paramsEl) {
    paramsEl.innerHTML = `
      <div class="vario-info">
        <span class="vario-best">最佳模型: <strong>${best.model}</strong></span>
        <span>Nugget: ${best.nugget.toFixed(4)}</span>
        <span>Sill: ${best.sill.toFixed(4)}</span>
        <span>Range: ${best.range.toFixed(2)}</span>
        <span>RMSE: ${best.rmse.toFixed(4)}</span>
      </div>
    `;
  }
}

async function runCrossValidation() {
  const state = Store.get();
  if (state.points.length < 4) { alert('需要至少 4 個點'); return; }
  setStatus('執行交叉驗證...', 'running');
  try {
    const cv = await new Promise((res, rej) => setTimeout(() => {
      try { res(crossValidate(state.points, state.gridSettings)); } catch (e) { rej(e); }
    }, 10));
    renderCVPanel(cv);
    setStatus('交叉驗證完成', 'done');
  } catch (e) { setStatus('錯誤: ' + e.message, 'error'); }
}

function renderCVPanel(cv) {
  const el = document.getElementById('cv-content');
  if (!el) return;
  el.innerHTML = `
    <table class="stats-table">
      <tbody>
        <tr><td>樣本數 (n)</td><td>${cv.n}</td></tr>
        <tr><td>平均誤差 (ME)</td><td>${cv.me.toFixed(4)}</td></tr>
        <tr><td>平均絕對誤差 (MAE)</td><td>${cv.mae.toFixed(4)}</td></tr>
        <tr><td>均方根誤差 (RMSE)</td><td>${cv.rmse.toFixed(4)}</td></tr>
        <tr><td>決定係數 (R²)</td><td>${cv.r2.toFixed(4)}</td></tr>
      </tbody>
    </table>
  `;

  // Scatter plot: predicted vs actual
  const cvChartEl = document.getElementById('cv-chart');
  if (!cvChartEl || !window.Plotly) return;
  const actuals = cv.errors.map(e => e.actual);
  const predicted = cv.errors.map(e => e.predicted);
  const minV = Math.min(...actuals, ...predicted);
  const maxV = Math.max(...actuals, ...predicted);

  Plotly.react(cvChartEl, [
    {
      type: 'scatter', mode: 'markers',
      x: actuals, y: predicted,
      marker: { color: '#4af', size: 6, opacity: 0.8 },
      name: '資料點',
    },
    {
      type: 'scatter', mode: 'lines',
      x: [minV, maxV], y: [minV, maxV],
      line: { color: '#f84', dash: 'dash', width: 1.5 },
      name: '1:1',
    },
  ], {
    paper_bgcolor: '#16213e', plot_bgcolor: '#16213e',
    font: { color: '#ccc', size: 10 },
    margin: { l: 45, r: 10, t: 15, b: 40 },
    xaxis: { title: '實測值', color: '#aaa', gridcolor: '#2a2a4a' },
    yaxis: { title: '預測值', color: '#aaa', gridcolor: '#2a2a4a', scaleanchor: 'x' },
    showlegend: false,
  }, { displayModeBar: false, responsive: true });
}

function setupUI() {
  // Run button
  document.getElementById('btn-run')?.addEventListener('click', runInterpolation);

  // Export buttons
  document.getElementById('btn-export-png')?.addEventListener('click', exportPNG);
  document.getElementById('btn-export-svg')?.addEventListener('click', exportSVG);
  document.getElementById('btn-export-csv')?.addEventListener('click', downloadCSV);

  // Load file
  document.getElementById('file-input')?.addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) { loadFile(f); e.target.value = ''; }
  });

  // Paste CSV text
  document.getElementById('btn-paste')?.addEventListener('click', () => {
    document.getElementById('paste-modal').style.display = 'flex';
  });
  document.getElementById('btn-paste-confirm')?.addEventListener('click', () => {
    const txt = document.getElementById('paste-textarea').value;
    pasteCSV(txt);
    document.getElementById('paste-modal').style.display = 'none';
  });
  document.getElementById('btn-paste-cancel')?.addEventListener('click', () => {
    document.getElementById('paste-modal').style.display = 'none';
  });

  // Sample data
  document.getElementById('btn-sample')?.addEventListener('click', loadSampleData);

  // Helper: switch coordinate mode and update labels
  function setCoordMode(mode) {
    const LABELS = {
      xy:     ['X 坐標',          'Y 坐標'],
      twd97:  ['橫坐標 E (m)',    '縱坐標 N (m)'],
      latlon: ['經度 (Longitude)', '緯度 (Latitude)'],
    };
    const [xl, yl] = LABELS[mode] || LABELS.xy;
    const modeEl = document.getElementById('coord-mode');
    if (modeEl) modeEl.value = mode;
    Store.set({ mapSettings: { coordMode: mode, xLabel: xl, yLabel: yl } });
    const xLabelEl = document.getElementById('x-label');
    const yLabelEl = document.getElementById('y-label');
    if (xLabelEl) xLabelEl.value = xl;
    if (yLabelEl) yLabelEl.value = yl;
  }

  // Sample TWD97 data
  document.getElementById('btn-sample-twd97')?.addEventListener('click', () => {
    setCoordMode('twd97');
    pasteCSV(SAMPLE_TWD97);
    runInterpolation();
  });

  // Sample lat/lon data
  document.getElementById('btn-sample-latlon')?.addEventListener('click', () => {
    setCoordMode('latlon');
    pasteCSV(SAMPLE_LATLON);
    runInterpolation();
  });

  // Cross-validation
  document.getElementById('btn-crossval')?.addEventListener('click', runCrossValidation);

  // Grid settings change
  document.getElementById('interp-method')?.addEventListener('change', e => {
    Store.set({ gridSettings: { method: e.target.value } });
    updateMethodUI(e.target.value);
  });
  document.getElementById('grid-nx')?.addEventListener('change', e =>
    Store.set({ gridSettings: { nx: parseInt(e.target.value) } }));
  document.getElementById('grid-ny')?.addEventListener('change', e =>
    Store.set({ gridSettings: { ny: parseInt(e.target.value) } }));
  document.getElementById('idw-power')?.addEventListener('input', e => {
    document.getElementById('idw-power-val').textContent = e.target.value;
    Store.set({ gridSettings: { power: parseFloat(e.target.value) } });
  });
  document.getElementById('max-neighbors')?.addEventListener('change', e =>
    Store.set({ gridSettings: { maxNeighbors: parseInt(e.target.value) } }));
  document.getElementById('auto-variogram')?.addEventListener('change', e =>
    Store.set({ gridSettings: { autoVariogram: e.target.checked } }));
  document.getElementById('variogram-model')?.addEventListener('change', e =>
    Store.set({ gridSettings: { variogramModel: e.target.value } }));
  ['nugget','sill','range'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e =>
      Store.set({ gridSettings: { [id]: parseFloat(e.target.value) } }));
  });

  // Contour settings
  document.getElementById('contour-levels')?.addEventListener('input', e => {
    document.getElementById('contour-levels-val').textContent = e.target.value;
    Store.set({ contourSettings: { levels: parseInt(e.target.value) } });
  });
  document.getElementById('color-scale')?.addEventListener('change', e =>
    Store.set({ contourSettings: { colorScale: e.target.value } }));
  document.getElementById('color-reverse')?.addEventListener('change', e =>
    Store.set({ contourSettings: { reverse: e.target.checked } }));
  document.getElementById('fill-opacity')?.addEventListener('input', e => {
    document.getElementById('fill-opacity-val').textContent = e.target.value;
    Store.set({ contourSettings: { fillOpacity: parseFloat(e.target.value) } });
    Store.set({ layers: { contour: { opacity: parseFloat(e.target.value) } } });
  });
  document.getElementById('contour-auto-range')?.addEventListener('change', e =>
    Store.set({ contourSettings: { autoRange: e.target.checked } }));
  document.getElementById('contour-min')?.addEventListener('change', e =>
    Store.set({ contourSettings: { min: parseFloat(e.target.value) } }));
  document.getElementById('contour-max')?.addEventListener('change', e =>
    Store.set({ contourSettings: { max: parseFloat(e.target.value) } }));
  document.getElementById('show-labels')?.addEventListener('change', e =>
    Store.set({ contourSettings: { showLabels: e.target.checked } }));
  document.getElementById('line-width')?.addEventListener('change', e =>
    Store.set({ contourSettings: { lineWidth: parseFloat(e.target.value) } }));

  // === Map settings ===
  const triggerRender = () => { clearTimeout(window._renderTO); window._renderTO = setTimeout(() => renderMap(), 100); };

  document.getElementById('map-title')?.addEventListener('input', e => {
    Store.set({ mapSettings: { title: e.target.value } });
    triggerRender();
  });
  document.getElementById('x-label')?.addEventListener('input', e => {
    Store.set({ mapSettings: { xLabel: e.target.value } });
    triggerRender();
  });
  document.getElementById('y-label')?.addEventListener('input', e => {
    Store.set({ mapSettings: { yLabel: e.target.value } });
    triggerRender();
  });
  document.getElementById('colorbar-title')?.addEventListener('input', e => {
    Store.set({ mapSettings: { colorbarTitle: e.target.value || '數值' } });
    triggerRender();
  });

  document.getElementById('coord-mode')?.addEventListener('change', e => {
    setCoordMode(e.target.value);
    triggerRender();
  });

  // === Contour level mode ===
  function updateLevelModeUI(mode) {
    document.getElementById('level-interval-row')?.style && (
      document.getElementById('level-interval-row').style.display = mode === 'interval' ? '' : 'none'
    );
    document.getElementById('level-manual-row')?.style && (
      document.getElementById('level-manual-row').style.display = mode === 'manual' ? '' : 'none'
    );
    document.getElementById('level-auto-row')?.style && (
      document.getElementById('level-auto-row').style.display = mode === 'auto' ? '' : 'none'
    );
  }
  document.getElementById('level-mode')?.addEventListener('change', e => {
    Store.set({ contourLevelSettings: { mode: e.target.value } });
    updateLevelModeUI(e.target.value);
    triggerRender();
  });
  document.getElementById('level-interval')?.addEventListener('change', e => {
    Store.set({ contourLevelSettings: { interval: parseFloat(e.target.value) || 0 } });
    triggerRender();
  });
  document.getElementById('level-manual-values')?.addEventListener('change', e => {
    Store.set({ contourLevelSettings: { manualValues: e.target.value } });
    triggerRender();
  });

  // === Export settings ===
  document.getElementById('btn-export-png-adv')?.addEventListener('click', () => {
    const w = parseInt(document.getElementById('export-width')?.value || '1400');
    const h = parseInt(document.getElementById('export-height')?.value || '900');
    const s = parseFloat(document.getElementById('export-scale')?.value || '2');
    exportPNG({ width: w, height: h, scale: s });
  });

  // Layer manager
  ['contour','vectors','scatter','tin'].forEach(name => {
    const cb = document.getElementById(`layer-${name}`);
    if (cb) cb.addEventListener('change', e => {
      Store.setLayer(name, { visible: e.target.checked });
      renderMap();
    });
    const op = document.getElementById(`opacity-${name}`);
    if (op) op.addEventListener('input', e => {
      document.getElementById(`opacity-${name}-val`).textContent = e.target.value;
      Store.setLayer(name, { opacity: parseFloat(e.target.value) });
    });
  });

  // Vector settings
  document.getElementById('vector-density')?.addEventListener('input', e => {
    document.getElementById('vector-density-val').textContent = e.target.value;
    Store.set({ vectorSettings: { density: parseInt(e.target.value) } });
    renderMap();
  });
  document.getElementById('vector-scale')?.addEventListener('input', e => {
    document.getElementById('vector-scale-val').textContent = e.target.value;
    Store.set({ vectorSettings: { scale: parseFloat(e.target.value) } });
  });
  document.getElementById('vector-color')?.addEventListener('change', e =>
    Store.set({ vectorSettings: { color: e.target.value } }));

  // Panel resizer
  setupResizer();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runInterpolation();
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); downloadCSV(); }
  });
}

function buildColorScaleOptions() {
  const sel = document.getElementById('color-scale');
  if (!sel) return;
  SCALE_NAMES.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    if (name === 'Jet') opt.selected = true;
    sel.appendChild(opt);
  });
}

function setupTabSwitching() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
    });
  });

  document.querySelectorAll('.bottom-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.bottom-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.bottom-tab-panel').forEach(p => p.classList.toggle('active', p.id === `btab-${tab}`));
    });
  });
}

function updateMethodUI(method) {
  const idwGroup = document.getElementById('idw-params');
  const krigingGroup = document.getElementById('kriging-params');
  if (idwGroup) idwGroup.style.display = method === 'idw' ? '' : 'none';
  if (krigingGroup) krigingGroup.style.display = method === 'kriging' ? '' : 'none';
}

function setupResizer() {
  const leftPanel = document.getElementById('left-panel');
  const resizer = document.getElementById('resizer-left');
  if (!leftPanel || !resizer) return;

  let dragging = false, startX = 0, startW = 0;
  resizer.addEventListener('mousedown', e => {
    dragging = true; startX = e.clientX; startW = leftPanel.offsetWidth;
    document.body.style.cursor = 'col-resize';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.max(180, Math.min(500, startW + (e.clientX - startX)));
    leftPanel.style.width = newW + 'px';
  });
  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.cursor = '';
  });

  const mainArea = document.getElementById('main-area');
  const resizerH = document.getElementById('resizer-bottom');
  if (!mainArea || !resizerH) return;
  const bottomArea = document.getElementById('bottom-area');
  let dragH = false, startY = 0, startBottomH = 0;
  resizerH.addEventListener('mousedown', e => {
    dragH = true; startY = e.clientY;
    startBottomH = bottomArea ? bottomArea.offsetHeight : 240;
    document.body.style.cursor = 'row-resize';
  });
  document.addEventListener('mousemove', e => {
    if (!dragH) return;
    const delta = startY - e.clientY; // drag up → bigger bottom panel
    const newBottomH = Math.max(120, Math.min(500, startBottomH + delta));
    if (bottomArea) bottomArea.style.height = newBottomH + 'px';
  });
  document.addEventListener('mouseup', () => { dragH = false; document.body.style.cursor = ''; });
}

function setStatus(msg, type = 'idle') {
  const el = document.getElementById('status-bar');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-bar status-' + type;
}
