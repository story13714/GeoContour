// Descriptive statistics
export function computeStats(points) {
  if (!points || points.length === 0) return null;
  const vals = points.map(p => p.z).sort((a, b) => a - b);
  const n = vals.length;
  const sum = vals.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const std = Math.sqrt(variance);
  const min = vals[0], max = vals[n - 1];

  function percentile(arr, p) {
    const idx = (p / 100) * (arr.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  }

  const p25 = percentile(vals, 25);
  const median = percentile(vals, 50);
  const p75 = percentile(vals, 75);
  const p10 = percentile(vals, 10);
  const p90 = percentile(vals, 90);

  const skewness = n > 2
    ? (vals.reduce((s, v) => s + (v - mean) ** 3, 0) / n) / Math.pow(std, 3)
    : 0;
  const kurtosis = n > 3
    ? (vals.reduce((s, v) => s + (v - mean) ** 4, 0) / n) / Math.pow(variance, 2) - 3
    : 0;

  // Coefficient of variation
  const cv = mean !== 0 ? (std / mean) * 100 : 0;

  // Range statistics
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);

  return {
    n, sum, mean, variance, std, min, max,
    p10, p25, median, p75, p90,
    skewness, kurtosis, cv,
    xMin, xMax, yMin, yMax,
    iqr: p75 - p25,
  };
}

// Build histogram bins
export function buildHistogram(points, nbins = 15) {
  const vals = points.map(p => p.z);
  const min = Math.min(...vals), max = Math.max(...vals);
  const binSize = (max - min) / nbins || 1;
  const bins = Array.from({ length: nbins }, (_, i) => ({
    x0: min + i * binSize,
    x1: min + (i + 1) * binSize,
    count: 0,
  }));
  for (const v of vals) {
    const idx = Math.min(Math.floor((v - min) / binSize), nbins - 1);
    bins[idx].count++;
  }
  return bins;
}
