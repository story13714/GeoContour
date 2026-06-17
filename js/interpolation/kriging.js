// Ordinary Kriging with variogram fitting

// --- Variogram models ---
export function variogramValue(model, h, nugget, sill, range) {
  if (h <= 0) return 0;
  const c = sill - nugget;
  const r = range;
  switch (model) {
    case 'spherical':
      return h >= r ? sill : nugget + c * (1.5 * (h / r) - 0.5 * Math.pow(h / r, 3));
    case 'exponential':
      return nugget + c * (1 - Math.exp(-3 * h / r));
    case 'gaussian':
      return nugget + c * (1 - Math.exp(-3 * h * h / (r * r)));
    case 'linear':
      return nugget + (sill / r) * Math.min(h, r);
    default:
      return nugget + c * (1.5 * (h / r) - 0.5 * Math.pow(Math.min(h / r, 1), 3));
  }
}

// --- Experimental variogram computation ---
export function experimentalVariogram(points, nLags = 12) {
  const n = points.length;
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const h = Math.sqrt(dx * dx + dy * dy);
      const dz = points[i].z - points[j].z;
      pairs.push({ h, gamma: 0.5 * dz * dz });
    }
  }
  pairs.sort((a, b) => a.h - b.h);

  const maxH = pairs[Math.floor(pairs.length * 0.5)].h; // use 50% of max distance
  const lagSize = maxH / nLags;
  const bins = Array.from({ length: nLags }, (_, k) => ({
    h: (k + 0.5) * lagSize,
    count: 0,
    gammaSum: 0,
  }));

  for (const p of pairs) {
    const idx = Math.min(Math.floor(p.h / lagSize), nLags - 1);
    bins[idx].count++;
    bins[idx].gammaSum += p.gamma;
  }

  return bins
    .filter(b => b.count >= 2)
    .map(b => ({ h: b.h, gamma: b.gammaSum / b.count, count: b.count }));
}

// --- Nelder-Mead minimizer (simple, no deps) ---
function nelderMead(f, x0, opts = {}) {
  const maxIter = opts.maxIter || 1000;
  const tol = opts.tol || 1e-8;
  const n = x0.length;
  const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5;

  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const v = x0.slice();
    v[i] += (Math.abs(v[i]) > 1e-5 ? 0.05 * v[i] : 0.00025);
    simplex.push(v);
  }

  let fVals = simplex.map(v => f(v));

  for (let iter = 0; iter < maxIter; iter++) {
    const order = fVals.map((f, i) => i).sort((a, b) => fVals[a] - fVals[b]);
    simplex = order.map(i => simplex[i]);
    fVals = order.map(i => fVals[i]);

    if (Math.abs(fVals[fVals.length - 1] - fVals[0]) < tol) break;

    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < n; d++) centroid[d] += simplex[i][d] / n;
    }

    const xr = centroid.map((c, d) => c + alpha * (c - simplex[n][d]));
    const fr = f(xr);

    if (fr < fVals[0]) {
      const xe = centroid.map((c, d) => c + gamma * (xr[d] - c));
      const fe = f(xe);
      simplex[n] = fe < fr ? xe : xr;
      fVals[n] = fe < fr ? fe : fr;
    } else if (fr < fVals[n - 1]) {
      simplex[n] = xr; fVals[n] = fr;
    } else {
      const xc = centroid.map((c, d) => c + rho * (simplex[n][d] - c));
      const fc = f(xc);
      if (fc < fVals[n]) { simplex[n] = xc; fVals[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, d) => simplex[0][d] + sigma * (v - simplex[0][d]));
          fVals[i] = f(simplex[i]);
        }
      }
    }
  }
  return simplex[0];
}

// --- Fit variogram model to experimental data ---
export function fitVariogram(expVario, model = 'spherical') {
  const pts = expVario;
  if (pts.length < 3) return { nugget: 0, sill: 1, range: 100, model };

  const gammas = pts.map(p => p.gamma);
  const maxGamma = Math.max(...gammas);
  const maxH = pts[pts.length - 1].h;

  const cost = ([nugget, sill, range]) => {
    if (nugget < 0 || sill <= nugget || range <= 0) return 1e15;
    let sum = 0;
    for (const p of pts) {
      const gm = variogramValue(model, p.h, nugget, sill, range);
      const diff = gm - p.gamma;
      sum += p.count * diff * diff;
    }
    return sum;
  };

  const x0 = [0, maxGamma * 1.1, maxH * 0.4];
  const [nugget, sill, range] = nelderMead(cost, x0);
  const rmse = Math.sqrt(cost([nugget, sill, range]) / pts.length);

  return {
    model,
    nugget: Math.max(0, nugget),
    sill: Math.max(nugget + 0.01, sill),
    range: Math.max(1, range),
    rmse,
  };
}

// --- Gaussian elimination solver ---
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const piv = M[col][col];
    if (Math.abs(piv) < 1e-12) continue;
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / piv;
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i] || 1e-12;
  }
  return x;
}

// --- kNN spatial lookup (simple grid-based) ---
function kNearest(points, qx, qy, k) {
  return points
    .map(p => {
      const dx = p.x - qx, dy = p.y - qy;
      return { p, d2: dx * dx + dy * dy };
    })
    .sort((a, b) => a.d2 - b.d2)
    .slice(0, k)
    .map(e => e.p);
}

// --- Ordinary Kriging interpolation ---
export function kriging(points, gridX, gridY, params) {
  const { model = 'spherical', nugget = 0, sill = 1, range = 100, maxNeighbors = 16 } = params;
  const nx = gridX.length, ny = gridY.length;
  const grid = new Array(ny).fill(null).map(() => new Float64Array(nx));
  const variance = new Array(ny).fill(null).map(() => new Float64Array(nx));

  const gamma = (h) => variogramValue(model, h, nugget, sill, range);
  const cov = (h) => sill - gamma(h);

  for (let j = 0; j < ny; j++) {
    const qy = gridY[j];
    for (let i = 0; i < nx; i++) {
      const qx = gridX[i];
      const nbrs = kNearest(points, qx, qy, maxNeighbors);
      const k = nbrs.length;

      // Check exact hit
      if (nbrs[0]) {
        const dx = nbrs[0].x - qx, dy = nbrs[0].y - qy;
        if (dx * dx + dy * dy < 1e-10) { grid[j][i] = nbrs[0].z; continue; }
      }

      // Build covariance matrix (k+1 x k+1 with Lagrange)
      const C = Array.from({ length: k + 1 }, () => new Array(k + 1).fill(0));
      for (let a = 0; a < k; a++) {
        C[a][k] = C[k][a] = 1;
        for (let b = 0; b < k; b++) {
          if (a === b) { C[a][b] = cov(0); continue; }
          const dx = nbrs[a].x - nbrs[b].x, dy = nbrs[a].y - nbrs[b].y;
          C[a][b] = cov(Math.sqrt(dx * dx + dy * dy));
        }
      }
      C[k][k] = 0;

      // Right-hand side
      const c0 = new Array(k + 1).fill(0);
      c0[k] = 1;
      for (let a = 0; a < k; a++) {
        const dx = nbrs[a].x - qx, dy = nbrs[a].y - qy;
        c0[a] = cov(Math.sqrt(dx * dx + dy * dy));
      }

      const w = solveLinear(C, c0);
      let est = 0;
      for (let a = 0; a < k; a++) est += w[a] * nbrs[a].z;

      let kvar = cov(0) - w.reduce((s, wi, a) => s + wi * c0[a], 0);
      grid[j][i] = est;
      variance[j][i] = Math.max(0, kvar);
    }
  }
  return { grid, variance };
}
