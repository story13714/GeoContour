import { idw } from '../interpolation/idw.js';
import { kriging } from '../interpolation/kriging.js';

// Leave-one-out cross validation
export function crossValidate(points, settings) {
  if (points.length < 4) throw new Error('交叉驗證需要至少 4 個點');

  const errors = [];
  for (let i = 0; i < points.length; i++) {
    const train = points.filter((_, j) => j !== i);
    const test = points[i];

    let pred;
    if (settings.method === 'kriging') {
      const res = kriging(train, [test.x], [test.y], {
        model: settings.variogramModel || 'spherical',
        nugget: settings.nugget || 0,
        sill: settings.sill || 1,
        range: settings.range || 100,
        maxNeighbors: Math.min(16, train.length),
      });
      pred = res.grid[0][0];
    } else {
      const g = idw(train, [test.x], [test.y],
        settings.power || 2,
        settings.searchRadius || 0,
        1,
        Math.min(settings.maxNeighbors || 20, train.length)
      );
      pred = g[0][0];
    }

    if (!isNaN(pred)) {
      errors.push({ actual: test.z, predicted: pred, residual: test.z - pred, x: test.x, y: test.y });
    }
  }

  if (errors.length === 0) throw new Error('交叉驗證無法完成');

  const residuals = errors.map(e => e.residual);
  const n = residuals.length;
  const me = residuals.reduce((s, r) => s + r, 0) / n;
  const mae = residuals.reduce((s, r) => s + Math.abs(r), 0) / n;
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);

  const actuals = errors.map(e => e.actual);
  const meanActual = actuals.reduce((s, v) => s + v, 0) / n;
  const ssTot = actuals.reduce((s, v) => s + (v - meanActual) ** 2, 0);
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { errors, me, mae, rmse, r2, n };
}
