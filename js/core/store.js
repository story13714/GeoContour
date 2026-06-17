// Centralized state store with pub/sub
const Store = (() => {
  let state = {
    points: [],           // [{x, y, z, id}]
    grid: null,           // {values: [], xCoords: [], yCoords: [], nx, ny, min, max}
    layers: {
      contour:  { visible: true,  opacity: 0.85, colorScale: 'Jet',      levels: 15 },
      vectors:  { visible: false, opacity: 0.9,  density: 20,            scale: 1.0 },
      scatter:  { visible: true,  opacity: 1.0,  size: 8,                labels: true },
      tin:      { visible: false, opacity: 0.5 },
    },
    contourSettings: {
      levels: 15,
      autoRange: true,
      min: 0,
      max: 100,
      colorScale: 'Jet',
      reverse: false,
      lineWidth: 1,
      lineColor: '#333333',
      fillOpacity: 0.85,
      showLabels: true,
    },
    gridSettings: {
      method: 'idw',      // idw | kriging | triangulation | naturalneighbor
      nx: 100,
      ny: 100,
      power: 2,           // IDW power
      searchRadius: 0,    // 0 = auto
      minNeighbors: 3,
      maxNeighbors: 20,
      variogramModel: 'spherical',
      nugget: 0,
      sill: 1,
      range: 100,
      autoVariogram: true,
    },
    vectorSettings: {
      density: 20,
      scale: 1.5,
      color: '#ffffff',
      opacity: 0.85,
    },
    mapSettings: {
      title: '',
      xLabel: 'X 坐標',
      yLabel: 'Y 坐標',
      colorbarTitle: '數值',
      coordMode: 'xy',       // 'xy' | 'latlon'
    },
    contourLevelSettings: {
      mode: 'auto',          // 'auto' | 'interval' | 'manual'
      interval: 0,           // fixed interval (e.g. 10 → levels at 0,10,20,...)
      manualValues: '',      // comma-separated list e.g. "10,20,35,50,75"
    },
    stats: null,
    variogram: null,
    crossValidation: null,
    mapBounds: null,      // {xMin, xMax, yMin, yMax}
    activeTab: 'grid',    // grid | stats | variogram | crossval
    isComputing: false,
  };

  const listeners = {};

  function emit(event, data) {
    (listeners[event] || []).forEach(fn => fn(data));
    (listeners['*'] || []).forEach(fn => fn(event, data));
  }

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
    return () => { listeners[event] = listeners[event].filter(f => f !== fn); };
  }

  function get() { return state; }

  function set(partial, event) {
    state = deepMerge(state, partial);
    if (event) emit(event, state);
  }

  function setPoints(points) {
    state.points = points.map((p, i) => ({ ...p, id: p.id ?? i }));
    emit('pointsChanged', state.points);
  }

  function setGrid(grid) {
    state.grid = grid;
    emit('gridChanged', grid);
  }

  function setStats(stats) {
    state.stats = stats;
    emit('statsChanged', stats);
  }

  function setLayer(name, partial) {
    state.layers[name] = { ...state.layers[name], ...partial };
    emit('layerChanged', { name, layer: state.layers[name] });
  }

  function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  return { get, set, on, emit, setPoints, setGrid, setStats, setLayer };
})();

export default Store;
