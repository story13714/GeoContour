// Inverse Distance Weighting interpolation
export function idw(points, gridX, gridY, power = 2, searchRadius = 0, minN = 3, maxN = 20) {
  const nx = gridX.length, ny = gridY.length;
  const grid = new Array(ny).fill(null).map(() => new Float64Array(nx));
  const EPS = 1e-10;

  // Build spatial index (grid cells)
  const xMin = Math.min(...gridX), xMax = Math.max(...gridX);
  const yMin = Math.min(...gridY), yMax = Math.max(...gridY);

  for (let j = 0; j < ny; j++) {
    const qy = gridY[j];
    for (let i = 0; i < nx; i++) {
      const qx = gridX[i];
      let candidates = points;

      // Spatial filter if search radius given
      if (searchRadius > 0) {
        candidates = points.filter(p => {
          const dx = p.x - qx, dy = p.y - qy;
          return dx * dx + dy * dy <= searchRadius * searchRadius;
        });
        if (candidates.length < minN) candidates = points;
      }

      // Sort by distance, take top maxN
      const dists = candidates.map(p => {
        const dx = p.x - qx, dy = p.y - qy;
        return { p, d2: dx * dx + dy * dy };
      }).sort((a, b) => a.d2 - b.d2).slice(0, maxN);

      let wSum = 0, vSum = 0;
      for (const { p, d2 } of dists) {
        if (d2 < EPS) { vSum = p.z; wSum = 1; break; }
        const w = 1.0 / Math.pow(d2, power / 2);
        wSum += w;
        vSum += w * p.z;
      }
      grid[j][i] = wSum > 0 ? vSum / wSum : NaN;
    }
  }
  return grid;
}
