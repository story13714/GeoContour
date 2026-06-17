// Robust CSV/TSV parser
export function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], points: [] };

  // Detect delimiter
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount   = (firstLine.match(/\t/g) || []).length;
  const spaceCount = (firstLine.match(/ +/g) || []).length;
  const delimiter  = tabCount > commaCount ? '\t' : commaCount > 0 ? ',' : /\s+/;

  function splitLine(line) {
    if (delimiter instanceof RegExp) return line.trim().split(delimiter);
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (!inQ && c === delimiter) { result.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    result.push(cur.trim());
    return result;
  }

  const headers = splitLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    if (vals.length < 2) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    rows.push(row);
  }

  // Auto-detect X/Y/Value columns
  const colNames = headers.map(h => h.toLowerCase().trim());
  const xIdx = colNames.findIndex(c => ['x', 'lon', 'longitude', 'east', 'easting'].includes(c));
  const yIdx = colNames.findIndex(c => ['y', 'lat', 'latitude', 'north', 'northing'].includes(c));
  const zIdx = colNames.findIndex(c => ['z', 'value', 'val', 'concentration', 'conc', 'head', 'level'].includes(c));

  const xi = xIdx >= 0 ? xIdx : 0;
  const yi = yIdx >= 0 ? yIdx : 1;
  const zi = zIdx >= 0 ? zIdx : 2;

  const points = rows.map((row, i) => {
    const vals = Object.values(row);
    const x = parseFloat(vals[xi]);
    const y = parseFloat(vals[yi]);
    const z = parseFloat(vals[zi]);
    if (isNaN(x) || isNaN(y) || isNaN(z)) return null;
    return { x, y, z, id: i };
  }).filter(Boolean);

  return { headers, rows, points, xCol: headers[xi], yCol: headers[yi], zCol: headers[zi] };
}

export function pointsToCSV(points) {
  const header = 'X,Y,Value\n';
  const rows = points.map(p => `${p.x},${p.y},${p.z}`).join('\n');
  return header + rows;
}
