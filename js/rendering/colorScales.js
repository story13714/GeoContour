// Color scale definitions for Plotly and D3
export const COLOR_SCALES = {
  Jet: [
    [0.0,  '#000080'], [0.1,  '#0000ff'], [0.2,  '#0080ff'],
    [0.35, '#00ffff'], [0.5,  '#80ff80'], [0.65, '#ffff00'],
    [0.8,  '#ff8000'], [0.9,  '#ff0000'], [1.0,  '#800000'],
  ],
  Viridis: [
    [0.0,  '#440154'], [0.13, '#482878'], [0.25, '#3e4989'],
    [0.38, '#31688e'], [0.5,  '#26828e'], [0.63, '#1f9e89'],
    [0.75, '#35b779'], [0.88, '#6ece58'], [1.0,  '#fde725'],
  ],
  RdYlGn: [
    [0.0,  '#d73027'], [0.25, '#fc8d59'], [0.5,  '#fee08b'],
    [0.75, '#d9ef8b'], [1.0,  '#1a9850'],
  ],
  BlueRed: [
    [0.0,  '#053061'], [0.25, '#2166ac'], [0.5,  '#f7f7f7'],
    [0.75, '#d6604d'], [1.0,  '#67001f'],
  ],
  Plasma: [
    [0.0,  '#0d0887'], [0.25, '#7e03a8'], [0.5,  '#cb4679'],
    [0.75, '#f89441'], [1.0,  '#f0f921'],
  ],
  YlOrRd: [
    [0.0,  '#ffffcc'], [0.25, '#fed976'], [0.5,  '#fd8d3c'],
    [0.75, '#e31a1c'], [1.0,  '#800026'],
  ],
  Blues: [
    [0.0,  '#f7fbff'], [0.25, '#c6dbef'], [0.5,  '#6baed6'],
    [0.75, '#2171b5'], [1.0,  '#08306b'],
  ],
  Greens: [
    [0.0,  '#f7fcf5'], [0.25, '#c7e9c0'], [0.5,  '#74c476'],
    [0.75, '#238b45'], [1.0,  '#00441b'],
  ],
  Greys: [
    [0.0,  '#ffffff'], [0.5,  '#969696'], [1.0,  '#000000'],
  ],
  Spectral: [
    [0.0,  '#9e0142'], [0.1,  '#d53e4f'], [0.2,  '#f46d43'],
    [0.3,  '#fdae61'], [0.4,  '#fee08b'], [0.5,  '#ffffbf'],
    [0.6,  '#e6f598'], [0.7,  '#abdda4'], [0.8,  '#66c2a5'],
    [0.9,  '#3288bd'], [1.0,  '#5e4fa2'],
  ],
  Rainbow: [
    [0.0,  '#6e40aa'], [0.16, '#4477ff'], [0.33, '#00d4aa'],
    [0.5,  '#00ff44'], [0.66, '#e4ff00'], [0.83, '#ff9500'],
    [1.0,  '#ff0000'],
  ],
  Thermal: [
    [0.0,  '#04001e'], [0.2,  '#2a0d68'], [0.4,  '#7d2f7e'],
    [0.6,  '#c9564e'], [0.8,  '#f9a749'], [1.0,  '#feffbb'],
  ],
};

export const SCALE_NAMES = Object.keys(COLOR_SCALES);

export function reverseScale(scale) {
  return scale.map(([t, c]) => [1 - t, c]).reverse();
}

export function getScale(name, reversed = false) {
  const scale = COLOR_SCALES[name] || COLOR_SCALES.Jet;
  return reversed ? reverseScale(scale) : scale;
}

// Interpolate a value in [0,1] to hex color using a scale
export function sampleColor(scale, t) {
  t = Math.max(0, Math.min(1, t));
  let lo = scale[0], hi = scale[scale.length - 1];
  for (let i = 1; i < scale.length; i++) {
    if (scale[i][0] >= t) { hi = scale[i]; lo = scale[i - 1]; break; }
  }
  const f = (hi[0] - lo[0]) > 0 ? (t - lo[0]) / (hi[0] - lo[0]) : 0;
  return lerpHex(lo[1], hi[1], f);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function lerpHex(a, b, t) {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  const r = Math.round(ra[0] + (rb[0] - ra[0]) * t);
  const g = Math.round(ra[1] + (rb[1] - ra[1]) * t);
  const bl = Math.round(ra[2] + (rb[2] - ra[2]) * t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${bl.toString(16).padStart(2,'0')}`;
}
