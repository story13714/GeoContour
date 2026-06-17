// Delaunay triangulation + barycentric interpolation using d3-delaunay

export function triangulationInterp(points, gridX, gridY, d3Delaunay) {
  const nx = gridX.length, ny = gridY.length;
  const grid = new Array(ny).fill(null).map(() => new Float64Array(nx).fill(NaN));

  const coords = new Float64Array(points.length * 2);
  points.forEach((p, i) => { coords[2 * i] = p.x; coords[2 * i + 1] = p.y; });
  const delaunay = d3Delaunay.from(points, p => p.x, p => p.y);

  function barycentricInterp(ax, ay, bx, by, cx, cy, az, bz, cz, px, py) {
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) return (az + bz + cz) / 3;
    const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
    const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) return NaN;
    return l1 * az + l2 * bz + l3 * cz;
  }

  for (let j = 0; j < ny; j++) {
    const qy = gridY[j];
    for (let i = 0; i < nx; i++) {
      const qx = gridX[i];
      const tri = delaunay.find(qx, qy);
      if (tri < 0) { grid[j][i] = NaN; continue; }

      // Walk triangles to find containing triangle
      const tris = delaunay.triangles;
      const hull = delaunay.hull;
      let found = NaN;

      // Try neighborhood of found point
      const neighborStart = delaunay.inedges[tri];
      let e = neighborStart;
      do {
        const t0 = Math.floor(e / 3) * 3;
        const ia = tris[t0], ib = tris[t0 + 1], ic = tris[t0 + 2];
        const v = barycentricInterp(
          points[ia].x, points[ia].y,
          points[ib].x, points[ib].y,
          points[ic].x, points[ic].y,
          points[ia].z, points[ib].z, points[ic].z,
          qx, qy
        );
        if (!isNaN(v)) { found = v; break; }
        const nextEdge = e % 3 === 2 ? t0 : e + 1;
        const twin = delaunay.halfedges[nextEdge];
        e = twin === -1 ? neighborStart : twin;
      } while (e !== neighborStart && found !== found); // NaN check

      // Fallback: brute force nearest triangle
      if (isNaN(found)) {
        for (let t = 0; t < tris.length; t += 3) {
          const ia = tris[t], ib = tris[t + 1], ic = tris[t + 2];
          const v = barycentricInterp(
            points[ia].x, points[ia].y,
            points[ib].x, points[ib].y,
            points[ic].x, points[ic].y,
            points[ia].z, points[ib].z, points[ic].z,
            qx, qy
          );
          if (!isNaN(v)) { found = v; break; }
        }
      }
      grid[j][i] = found;
    }
  }
  return grid;
}

// Draw TIN (triangulation wireframe) as SVG paths
export function buildTINPaths(points, d3Delaunay) {
  const delaunay = d3Delaunay.from(points, p => p.x, p => p.y);
  const tris = delaunay.triangles;
  const paths = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = points[tris[t]], b = points[tris[t+1]], c = points[tris[t+2]];
    paths.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y });
  }
  return paths;
}
