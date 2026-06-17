import { idw } from './idw.js';
import { kriging, experimentalVariogram, fitVariogram } from './kriging.js';
import { triangulationInterp } from './triangulation.js';

export function buildGrid(points, settings) {
  if (!points || points.length < 3) throw new Error('需要至少 3 個資料點');

  const { nx = 100, ny = 100, method = 'idw' } = settings;

  // Bounding box with 5% padding
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.05 || 1;
  const yPad = (yMax - yMin) * 0.05 || 1;
  const x0 = xMin - xPad, x1 = xMax + xPad;
  const y0 = yMin - yPad, y1 = yMax + yPad;

  // Generate grid coordinates
  const gridX = Array.from({ length: nx }, (_, i) => x0 + (x1 - x0) * i / (nx - 1));
  const gridY = Array.from({ length: ny }, (_, j) => y0 + (y1 - y0) * j / (ny - 1));

  let gridValues, variance = null, variogramResult = null;

  if (method === 'idw') {
    gridValues = idw(points, gridX, gridY,
      settings.power || 2,
      settings.searchRadius || 0,
      settings.minNeighbors || 3,
      settings.maxNeighbors || 20
    );

  } else if (method === 'kriging') {
    let { nugget, sill, range, variogramModel } = settings;

    if (settings.autoVariogram !== false) {
      const expVario = experimentalVariogram(points, 12);
      const models = ['spherical', 'exponential', 'gaussian'];
      const fits = models.map(m => fitVariogram(expVario, m));
      const best = fits.reduce((a, b) => (a.rmse < b.rmse ? a : b));
      variogramResult = { experimental: expVario, fits, best };
      nugget = best.nugget; sill = best.sill; range = best.range;
      variogramModel = best.model;
    }

    const result = kriging(points, gridX, gridY, {
      model: variogramModel || 'spherical',
      nugget: nugget || 0,
      sill: sill || Math.max(...points.map(p => p.z)),
      range: range || (x1 - x0) / 3,
      maxNeighbors: settings.maxNeighbors || 16,
    });
    gridValues = result.grid;
    variance = result.variance;

  } else if (method === 'triangulation') {
    const d3Delaunay = window._d3Delaunay;
    if (!d3Delaunay) throw new Error('d3-delaunay 尚未載入');
    gridValues = triangulationInterp(points, gridX, gridY, d3Delaunay);

  } else if (method === 'naturalneighbor') {
    // Natural neighbor: use IDW with power=1 as approximation for now
    gridValues = idw(points, gridX, gridY, 1, 0, 3, 8);

  } else {
    throw new Error(`未知的插值方法: ${method}`);
  }

  // Flatten and compute stats
  const flat = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      if (!isNaN(gridValues[j][i])) flat.push(gridValues[j][i]);

  const min = Math.min(...flat);
  const max = Math.max(...flat);

  // Convert to Plotly format (z[row][col] where row=y, col=x)
  const z = gridValues.map(row => Array.from(row));

  return {
    z, gridX, gridY, nx, ny,
    xMin: x0, xMax: x1, yMin: y0, yMax: y1,
    min, max,
    variance,
    variogramResult,
    method,
  };
}

export function computeGradient(grid) {
  const ny = grid.z.length, nx = grid.z[0].length;
  const dx = (grid.xMax - grid.xMin) / (nx - 1);
  const dy = (grid.yMax - grid.yMin) / (ny - 1);
  const gx = [], gy = [];

  for (let j = 0; j < ny; j++) {
    gx.push(new Float64Array(nx));
    gy.push(new Float64Array(nx));
    for (let i = 0; i < nx; i++) {
      const im = Math.max(0, i - 1), ip = Math.min(nx - 1, i + 1);
      const jm = Math.max(0, j - 1), jp = Math.min(ny - 1, j + 1);
      gx[j][i] = (grid.z[j][ip] - grid.z[j][im]) / ((ip - im) * dx);
      gy[j][i] = (grid.z[jp][i] - grid.z[jm][i]) / ((jp - jm) * dy);
    }
  }
  return { gx, gy };
}
