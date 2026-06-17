import Store from '../core/store.js';
import { parseCSV, pointsToCSV } from './csvParser.js';

let tableEl = null;
let editingCell = null;

export function initDataGrid(containerId) {
  tableEl = document.getElementById(containerId);
  if (!tableEl) return;
  renderTable();
  Store.on('pointsChanged', () => renderTable());
}

export function renderTable() {
  const points = Store.get().points;
  tableEl.innerHTML = '';

  // Header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th class="row-num">#</th>
      <th>X</th>
      <th>Y</th>
      <th>值</th>
      <th class="col-del">✕</th>
    </tr>`;
  tableEl.appendChild(thead);

  const tbody = document.createElement('tbody');

  // Data rows
  points.forEach((p, idx) => {
    const tr = createRow(p, idx);
    tbody.appendChild(tr);
  });

  // Empty new row
  tbody.appendChild(createEmptyRow(points.length));
  tableEl.appendChild(tbody);
}

function createRow(p, idx) {
  const tr = document.createElement('tr');
  tr.dataset.idx = idx;
  tr.innerHTML = `
    <td class="row-num">${idx + 1}</td>
    <td class="cell" data-field="x">${fmt(p.x)}</td>
    <td class="cell" data-field="y">${fmt(p.y)}</td>
    <td class="cell" data-field="z">${fmt(p.z)}</td>
    <td class="col-del"><button class="del-btn" title="刪除此行">✕</button></td>
  `;

  tr.querySelectorAll('.cell').forEach(cell => {
    cell.setAttribute('contenteditable', 'true');
    cell.addEventListener('blur', () => onCellEdit(cell, idx));
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }
      if (e.key === 'Tab') { e.preventDefault(); moveCell(cell, e.shiftKey ? -1 : 1); }
    });
    cell.addEventListener('focus', () => selectAll(cell));
  });

  tr.querySelector('.del-btn').addEventListener('click', () => deleteRow(idx));
  return tr;
}

function createEmptyRow(idx) {
  const tr = document.createElement('tr');
  tr.className = 'new-row';
  tr.innerHTML = `
    <td class="row-num">*</td>
    <td class="cell" data-field="x" contenteditable="true"></td>
    <td class="cell" data-field="y" contenteditable="true"></td>
    <td class="cell" data-field="z" contenteditable="true"></td>
    <td class="col-del"></td>
  `;
  tr.querySelectorAll('.cell').forEach(cell => {
    cell.addEventListener('blur', () => onNewRowEdit(tr));
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }
    });
  });
  return tr;
}

function onCellEdit(cell, idx) {
  const field = cell.dataset.field;
  const val = parseFloat(cell.textContent);
  if (isNaN(val)) { cell.textContent = fmt(Store.get().points[idx]?.[field] ?? ''); return; }
  const points = Store.get().points.map((p, i) =>
    i === idx ? { ...p, [field]: val } : p
  );
  Store.setPoints(points);
  cell.textContent = fmt(val);
}

function onNewRowEdit(tr) {
  const xVal = parseFloat(tr.querySelector('[data-field="x"]').textContent);
  const yVal = parseFloat(tr.querySelector('[data-field="y"]').textContent);
  const zVal = parseFloat(tr.querySelector('[data-field="z"]').textContent);
  if (isNaN(xVal) || isNaN(yVal) || isNaN(zVal)) return;
  const points = [...Store.get().points, { x: xVal, y: yVal, z: zVal }];
  Store.setPoints(points);
}

function deleteRow(idx) {
  const points = Store.get().points.filter((_, i) => i !== idx);
  Store.setPoints(points);
}

function moveCell(cell, dir) {
  const cells = [...tableEl.querySelectorAll('.cell[contenteditable]')];
  const i = cells.indexOf(cell);
  const next = cells[i + dir];
  if (next) next.focus();
}

function selectAll(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function fmt(v) {
  if (v === undefined || v === null || v === '') return '';
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return Number.isInteger(n) ? n.toString() : n.toFixed(4).replace(/\.?0+$/, '');
}

// Paste CSV into grid
export function pasteCSV(text) {
  const { points } = parseCSV(text);
  if (points.length === 0) { alert('無法解析資料，請確認格式為 X,Y,值'); return; }
  Store.setPoints(points);
  showNotification(`已載入 ${points.length} 個資料點`);
}

// Load from file input
export function loadFile(file) {
  const reader = new FileReader();
  reader.onload = e => pasteCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
}

export function downloadCSV() {
  const csv = pointsToCSV(Store.get().points);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '資料點.csv'; a.click();
  URL.revokeObjectURL(url);
}

function showNotification(msg) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}
