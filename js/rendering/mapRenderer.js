import { getScale } from './colorScales.js';
import Store from '../core/store.js';

let plotlyDiv = null;
let svgOverlay = null;
let currentLayout = null;

export function initRenderer(plotDivId, svgOverlayId) {
  plotlyDiv = document.getElementById(plotDivId);
  svgOverlay = document.getElementById(svgOverlayId);
  window.addEventListener('resize', onResize);
}

// Build contour level spec from contourLevelSettings
function buildContourSpec(cs, cls, zMin, zMax) {
  if (cls.mode === 'manual' && cls.manualValues.trim()) {
    const vals = cls.manualValues.split(',')
      .map(s => parseFloat(s.trim()))
      .filter(v => !isNaN(v))
      .sort((a, b) => a - b);
    if (vals.length >= 2) {
      return { start: vals[0], end: vals[vals.length - 1], size: null, values: vals };
    }
  }
  if (cls.mode === 'interval' && cls.interval > 0) {
    const start = Math.ceil(zMin / cls.interval) * cls.interval;
    const end   = Math.floor(zMax / cls.interval) * cls.interval;
    return { start, end, size: cls.interval };
  }
  // auto
  const size = (zMax - zMin) / Math.max(2, cs.levels);
  return { start: zMin, end: zMax, size };
}

// Format a number as a degree string for lat/lon display
function fmtDeg(val, isLat) {
  const abs = Math.abs(val);
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${abs.toFixed(4)}°${dir}`;
}

export async function renderMap() {
  const state = Store.get();
  const { grid, points, layers, contourSettings: cs, vectorSettings,
          mapSettings: ms, contourLevelSettings: cls } = state;

  if (!grid || !plotlyDiv) return;

  const scale = getScale(cs.colorScale, cs.reverse);
  const zMin = cs.autoRange ? grid.min : cs.min;
  const zMax = cs.autoRange ? grid.max : cs.max;
  const plotlyScale = scale.map(([t, c]) => [t, c]);
  const mode     = ms.coordMode || 'xy';
  const isLatLon = mode === 'latlon';
  const isTWD97  = mode === 'twd97';

  const contourSpec = buildContourSpec(cs, cls, zMin, zMax);

  // Hover text per mode
  let xHover, yHover;
  if (isLatLon) {
    xHover = '經度: %{x:.5f}°';
    yHover = '緯度: %{y:.5f}°';
  } else if (isTWD97) {
    xHover = 'E: %{x:,.0f} m';
    yHover = 'N: %{y:,.0f} m';
  } else {
    xHover = `${ms.xLabel || 'X'}: %{x:.2f}`;
    yHover = `${ms.yLabel || 'Y'}: %{y:.2f}`;
  }

  const traces = [];

  // Filled contour trace
  if (layers.contour.visible) {
    const contourObj = {
      coloring: 'fill',
      showlines: true,
      showlabels: cs.showLabels,
      labelfont: { size: 10, color: '#fff' },
    };
    if (contourSpec.values) {
      contourObj.start = contourSpec.values[0];
      contourObj.end   = contourSpec.values[contourSpec.values.length - 1];
      contourObj.size  = (contourSpec.values[contourSpec.values.length - 1] - contourSpec.values[0]) / (contourSpec.values.length - 1);
    } else {
      contourObj.start = contourSpec.start;
      contourObj.end   = contourSpec.end;
      contourObj.size  = contourSpec.size;
    }

    traces.push({
      type: 'contour',
      z: grid.z,
      x: grid.gridX,
      y: grid.gridY,
      colorscale: plotlyScale,
      zmin: zMin,
      zmax: zMax,
      ncontours: cls.mode === 'auto' ? cs.levels : undefined,
      contours: contourObj,
      line: { width: cs.lineWidth, color: cs.lineColor, smoothing: 1.3 },
      opacity: layers.contour.opacity,
      colorbar: {
        title: { text: ms.colorbarTitle || '數值', font: { color: '#ccc', size: 12 } },
        tickfont: { color: '#ccc', size: 10 },
        outlinewidth: 0,
        thickness: 18,
        len: 0.75,
        x: 1.02,
      },
      showscale: true,
      hovertemplate: `${xHover}<br>${yHover}<br>值: %{z:.4f}<extra></extra>`,
      name: '濃度分布',
    });
  }

  // Scatter data points
  if (layers.scatter.visible && points.length > 0) {
    const xHov2 = isLatLon ? '經度: %{x:.5f}°' : isTWD97 ? 'E: %{x:,.0f} m' : `${ms.xLabel || 'X'}: %{x:.3f}`;
    const yHov2 = isLatLon ? '緯度: %{y:.5f}°' : isTWD97 ? 'N: %{y:,.0f} m' : `${ms.yLabel || 'Y'}: %{y:.3f}`;
    traces.push({
      type: 'scatter',
      mode: layers.scatter.labels ? 'markers+text' : 'markers',
      x: points.map(p => p.x),
      y: points.map(p => p.y),
      text: points.map(p => p.z.toFixed(2)),
      textposition: 'top center',
      textfont: { size: 9, color: '#ffe' },
      marker: {
        size: layers.scatter.size || 8,
        color: points.map(p => p.z),
        colorscale: plotlyScale,
        cmin: zMin, cmax: zMax,
        line: { width: 1.5, color: '#fff' },
        symbol: 'circle',
        opacity: layers.scatter.opacity,
      },
      hovertemplate: `${xHov2}<br>${yHov2}<br>值: %{text}<extra>資料點</extra>`,
      name: '資料點',
      showlegend: false,
    });
  }

  // Axis config per coordinate mode
  const xAxisCfg = isLatLon
    ? { title: { text: '經度 (Longitude)', font: { size: 13 } }, tickformat: '.4f', ticksuffix: '°E', nticks: 8 }
    : isTWD97
    ? { title: { text: ms.xLabel || '橫坐標 E (m)', font: { size: 13 } }, tickformat: ',.0f', separatethousands: true, nticks: 7 }
    : { title: { text: ms.xLabel || 'X 坐標', font: { size: 13 } }, nticks: 10 };

  const yAxisCfg = isLatLon
    ? { title: { text: '緯度 (Latitude)', font: { size: 13 } }, tickformat: '.4f', ticksuffix: '°N', nticks: 8 }
    : isTWD97
    ? { title: { text: ms.yLabel || '縱坐標 N (m)', font: { size: 13 } }, tickformat: ',.0f', separatethousands: true, nticks: 7 }
    : { title: { text: ms.yLabel || 'Y 坐標', font: { size: 13 } }, nticks: 10 };

  const titleText = ms.title ? ms.title : '';

  const layout = {
    paper_bgcolor: '#1a1a2e',
    plot_bgcolor: '#16213e',
    font: { color: '#cccccc', family: 'Arial, "Microsoft JhengHei", sans-serif' },
    title: titleText ? {
      text: titleText,
      font: { size: 16, color: '#e0e0f0' },
      x: 0.5,
      xanchor: 'center',
      pad: { t: 4 },
    } : undefined,
    xaxis: {
      ...xAxisCfg,
      gridcolor: '#2a2a4a',
      zerolinecolor: '#3a3a5a',
      color: '#aaaaaa',
      showgrid: true,
      range: [grid.xMin, grid.xMax],
    },
    yaxis: {
      ...yAxisCfg,
      gridcolor: '#2a2a4a',
      zerolinecolor: '#3a3a5a',
      color: '#aaaaaa',
      showgrid: true,
      range: [grid.yMin, grid.yMax],
    },
    margin: { l: isTWD97 ? 90 : 65, r: 85, t: titleText ? 55 : 30, b: isTWD97 ? 65 : 55 },
    hovermode: 'closest',
    dragmode: 'pan',
    showlegend: false,
    modebar: { bgcolor: 'rgba(0,0,0,0.5)', color: '#aaa', activecolor: '#4af' },
  };

  currentLayout = layout;

  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['toImage'],
    scrollZoom: true,
    displaylogo: false,
    modeBarButtonsToAdd: [{
      name: '匯出PNG',
      icon: Plotly.Icons.camera,
      click: () => exportPNG(),
    }],
  };

  await Plotly.react(plotlyDiv, traces, layout, config);

  syncSVGOverlay();

  if (layers.vectors.visible && grid) drawVectors();
  else clearVectors();

  if (layers.tin.visible) drawTIN();
  else { const g = svgOverlay?.querySelector('#tin-layer'); if (g) g.innerHTML = ''; }

  plotlyDiv.on('plotly_relayout', onPlotlyRelayout);
}

function syncSVGOverlay() {
  if (!svgOverlay || !plotlyDiv) return;
  const rect = plotlyDiv.getBoundingClientRect();
  const inner = plotlyDiv.querySelector('.nsewdrag');
  if (!inner) return;
  const ir = inner.getBoundingClientRect();
  svgOverlay.style.left   = (ir.left - rect.left) + 'px';
  svgOverlay.style.top    = (ir.top  - rect.top)  + 'px';
  svgOverlay.style.width  = ir.width  + 'px';
  svgOverlay.style.height = ir.height + 'px';
  svgOverlay.setAttribute('viewBox', `0 0 ${ir.width} ${ir.height}`);
}

function onPlotlyRelayout() {
  syncSVGOverlay();
  const state = Store.get();
  if (state.layers.vectors.visible) drawVectors();
  if (state.layers.tin.visible) drawTIN();
}

function onResize() {
  if (plotlyDiv && currentLayout) {
    Plotly.relayout(plotlyDiv, {});
    setTimeout(syncSVGOverlay, 100);
  }
}

function getPlotTransform() {
  if (!plotlyDiv) return null;
  const layout = plotlyDiv._fullLayout;
  if (!layout) return null;
  const xa = layout.xaxis, ya = layout.yaxis;
  if (!xa || !ya || !xa.range || !ya.range || !xa._length) return null;
  const plotW = xa._length, plotH = ya._length;
  const xRange = xa.range, yRange = ya.range;
  return {
    xToPixel: (x) => (x - xRange[0]) / (xRange[1] - xRange[0]) * plotW,
    yToPixel: (y) => plotH * (1 - (y - yRange[0]) / (yRange[1] - yRange[0])),
    xRange, yRange, plotW, plotH,
  };
}

function clearVectors() {
  const g = svgOverlay?.querySelector('#vector-layer');
  if (g) g.innerHTML = '';
}

function drawVectors() {
  const state = Store.get();
  const { grid, vectorSettings } = state;
  if (!grid || !svgOverlay) return;
  const transform = getPlotTransform();
  if (!transform) return;
  syncSVGOverlay();

  let g = svgOverlay.querySelector('#vector-layer');
  if (!g) {
    g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'vector-layer';
    svgOverlay.appendChild(g);
  }
  g.innerHTML = '';

  let defs = svgOverlay.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgOverlay.insertBefore(defs, svgOverlay.firstChild);
  }
  const color = vectorSettings.color || '#ffffff';
  const opacity = vectorSettings.opacity || 0.85;
  defs.innerHTML = `
    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
      <polygon points="0 0, 6 2, 0 4" fill="${color}" opacity="${opacity}"/>
    </marker>`;

  const density = vectorSettings.density || 20;
  const stepX = Math.max(1, Math.floor(grid.nx / density));
  const stepY = Math.max(1, Math.floor(grid.ny / density));

  const { computeGradient } = window._gridEngine || {};
  if (!computeGradient) return;
  const { gx, gy } = computeGradient(grid);

  let maxMag = 0;
  for (let j = 0; j < grid.ny; j += stepY)
    for (let i = 0; i < grid.nx; i += stepX) {
      const mag = Math.sqrt(gx[j][i] ** 2 + gy[j][i] ** 2);
      if (mag > maxMag) maxMag = mag;
    }
  if (maxMag === 0) return;

  const svgW = parseFloat(svgOverlay.style.width);
  const svgH = parseFloat(svgOverlay.style.height);
  const cellW = svgW / density, cellH = svgH / density;
  const maxLen = Math.min(cellW, cellH) * 0.8 * (vectorSettings.scale || 1.5);

  for (let j = stepY; j < grid.ny - stepY; j += stepY) {
    for (let i = stepX; i < grid.nx - stepX; i += stepX) {
      const wx = -gx[j][i], wy = -gy[j][i];
      const mag = Math.sqrt(wx * wx + wy * wy);
      if (mag < 1e-12) continue;
      const px = transform.xToPixel(grid.gridX[i]);
      const py = transform.yToPixel(grid.gridY[j]);
      const len = Math.max(4, (mag / maxMag) * maxLen);
      const ex = px + (wx / mag) * len;
      const ey = py - (wy / mag) * len;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', px.toFixed(1)); line.setAttribute('y1', py.toFixed(1));
      line.setAttribute('x2', ex.toFixed(1)); line.setAttribute('y2', ey.toFixed(1));
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-opacity', opacity);
      line.setAttribute('marker-end', 'url(#arrowhead)');
      g.appendChild(line);
    }
  }
}

function drawTIN() {
  const state = Store.get();
  const { points, layers } = state;
  if (!points.length || !svgOverlay) return;
  const transform = getPlotTransform();
  if (!transform) return;
  syncSVGOverlay();

  let g = svgOverlay.querySelector('#tin-layer');
  if (!g) {
    g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'tin-layer';
    svgOverlay.insertBefore(g, svgOverlay.querySelector('#vector-layer') || null);
  }
  g.innerHTML = '';

  if (!window._d3Delaunay || !window._triangulation?.buildTINPaths) return;
  const paths = window._triangulation.buildTINPaths(points, window._d3Delaunay);
  for (const p of paths) {
    const ax = transform.xToPixel(p.ax), ay = transform.yToPixel(p.ay);
    const bx = transform.xToPixel(p.bx), by = transform.yToPixel(p.by);
    const cx = transform.xToPixel(p.cx), cy = transform.yToPixel(p.cy);
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    el.setAttribute('points', `${ax},${ay} ${bx},${by} ${cx},${cy}`);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', '#ffaa00');
    el.setAttribute('stroke-width', '0.8');
    el.setAttribute('stroke-opacity', layers.tin.opacity || 0.5);
    g.appendChild(el);
  }
}

export function exportPNG(opts = {}) {
  if (!plotlyDiv) return;
  const state = Store.get();
  const title = state.mapSettings?.title || '污染濃度圖';
  const w = opts.width  || 1400;
  const h = opts.height || 900;
  Plotly.toImage(plotlyDiv, { format: 'png', scale: opts.scale || 2, width: w, height: h })
    .then(url => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || '污染濃度圖'}.png`;
      a.click();
    });
}

export function exportSVG() {
  if (!plotlyDiv) return;
  const state = Store.get();
  const title = state.mapSettings?.title || '污染濃度圖';
  Plotly.toImage(plotlyDiv, { format: 'svg' })
    .then(url => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || '污染濃度圖'}.svg`;
      a.click();
    });
}
