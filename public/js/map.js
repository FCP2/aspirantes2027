let map;
let layersById        = {};
let nombreMunicipioById = {};
let _selectedLayerId  = null;
let onMunicipioSelected = null;
let _mapTheme = "dark";

// Datos de todas las capas: id_municipio -> { total, verificados, confiabilidad_alta, partido_dominante }
let _capasData   = new Map();
let _baseCapasData = new Map();
let _coverageContextLabel = "";
let _currentLayer = "cobertura";

let municipioCountById = new Map(); // para tooltip
let _legendControl = null; // Leaflet control (evita el clip de overflow:hidden)
let _referenceLeaderLayer = null;
let _referenceLeaderRefreshBound = false;
let _referenceLabelsVisible = true;

// ── Init ──────────────────────────────────────────────────────────────────────

function setOnMunicipioSelected(fn) { onMunicipioSelected = fn; }

function initMap() {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  _mapTheme = mapEl.dataset.mapTheme === "dark" ? "dark" : "light";
  mapEl.classList.toggle("osm-dark-tiles", _mapTheme === "dark");
  map = L.map("map", { zoomControl: false, preferCanvas: true }).setView([19.35, -99.5], 8);
  if (!_referenceLeaderRefreshBound) {
    map.on("zoomend moveend resize", _renderReferenceLeaderLabels);
    _referenceLeaderRefreshBound = true;
  }

  // Proveedor sin API key. Puede sustituirse en runtime antes de cargar map.js.
  const tileUrl = window.MAP_TILE_URL
    || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  L.tileLayer(tileUrl, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19,
    updateWhenIdle: true,
    keepBuffer: 2
  }).addTo(map);

  L.control.zoom({ position: "bottomleft" }).addTo(map);
}

// ── Draw polygons ─────────────────────────────────────────────────────────────

function drawMunicipios(municipiosConPoligono) {
  _clearReferenceLeaderLabels();
  Object.values(layersById).forEach(l => { try { map.removeLayer(l); } catch(e){} });
  layersById        = {};
  nombreMunicipioById = {};
  _selectedLayerId  = null;

  const renderedLayers = [];
  municipiosConPoligono.forEach(m => {
    if (!m.wkt) return;
    let geo = null;
    try { geo = wellknown.parse(m.wkt); } catch (error) { console.warn(`Polígono inválido: ${m.nombre}`, error); }
    if (!geo) return;

    const layer = L.geoJSON(geo, {
      style: { color: _mapStrokeColor(), weight: 1.5, fillColor: _mapEmptyColor(), fillOpacity: 0.6 },
      onEachFeature: (f, l) => {
        f.properties = f.properties || {};
        f.properties.nombre      = m.nombre;
        f.properties.id_municipio = m.id_municipio;

        l.bindTooltip(m.nombre, { sticky: true, direction: "top", className: "tooltip-mun" });

        l.on("click", () => {
          if (typeof onMunicipioSelected === "function") onMunicipioSelected(m.id_municipio);
        });
      }
    }).addTo(map);

    nombreMunicipioById[m.id_municipio] = m.nombre;
    layersById[m.id_municipio] = layer;
    renderedLayers.push(layer);
  });

  if (renderedLayers.length) {
    try { map.fitBounds(L.featureGroup(renderedLayers).getBounds(), { padding: [24, 24] }); } catch(e) {}
  }

  window.mapReady = true;

  if (window._pendingHighlightMunicipiosById?.length) {
    window.highlightMunicipiosByIdList?.(window._pendingHighlightMunicipiosById, { dimOthers: true });
    window._pendingHighlightMunicipiosById = null;
  }
  if (window._pendingPersonaMunicipiosDetalle?.length) {
    window.highlightPersonaMunicipiosDetalle?.(window._pendingPersonaMunicipiosDetalle);
    window._pendingPersonaMunicipiosDetalle = null;
  }
}

// ── Layer data ────────────────────────────────────────────────────────────────

function setCapasMapa(dataArray) {
  _baseCapasData = _rowsToMap(dataArray);
  _coverageContextLabel = "";
  _setActiveCapasData(_baseCapasData);
}

function setFilteredCoverageData(dataArray, contextLabel = "") {
  _coverageContextLabel = String(contextLabel || "").trim();
  _currentLayer = "cobertura";
  _setActiveCapasData(_rowsToMap(dataArray));
}

function restoreBaseCapasMapa() {
  _coverageContextLabel = "";
  _setActiveCapasData(_baseCapasData);
}

function _rowsToMap(dataArray) {
  const result = new Map();
  (dataArray || []).forEach(row => {
    const id = Number(row.id_municipio);
    if (id) result.set(id, row);
  });
  return result;
}

function _setActiveCapasData(dataMap) {
  _capasData = new Map(dataMap || []);
  municipioCountById = new Map();

  _capasData.forEach((row, id) => {
    municipioCountById.set(id, Number(row.total || 0));
  });

  paintCurrentLayer();
  updateLayerLegend();
}

// Compatibilidad con analista.js que llama setMunicipioCoverageCounts
function setMunicipioCoverageCounts(countsMap) {
  const arr = [];
  if (countsMap instanceof Map) {
    countsMap.forEach((v, k) => arr.push({ id_municipio: k, total: v }));
  } else {
    Object.entries(countsMap || {}).forEach(([k, v]) => arr.push({ id_municipio: k, total: v }));
  }
  setCapasMapa(arr);
}

function switchMapLayer(layerName) {
  _currentLayer = layerName;
  // Cierra bubble de selección si hay una activa
  if (_selectedLayerId != null && layersById[_selectedLayerId]) {
    const prev = layersById[_selectedLayerId];
    prev.unbindTooltip();
    prev.bindTooltip(nombreMunicipioById[_selectedLayerId] || "", {
      sticky: true, direction: "top", className: "tooltip-mun"
    });
    _selectedLayerId = null;
  }
  paintCurrentLayer();
  updateLayerLegend();
}

// ── Pintar polígonos según capa activa ────────────────────────────────────────

function paintCurrentLayer() {
  Object.entries(layersById).forEach(([idStr, group]) => {
    const id   = Number(idStr);
    const data = _capasData.get(id) || {};
    const fill = _getLayerColor(_currentLayer, data);
    const fichaSinCaptura = _currentLayer === "fichas" && !data.tiene_informacion;
    const referenteLayer = _currentLayer === "referente" || _currentLayer === "referente_aspirantes";
    const referenteInactivo = referenteLayer && !data.referente_activo;
    const subreferenceLayer = _currentLayer === "subreferente";
    const subreferenceInactive = subreferenceLayer && !data.subreferente_activo;
    const style = { color: _mapStrokeColor(), weight: data.referente_activo || data.subreferente_activo ? 2 : 1.5, fillColor: fill, fillOpacity: referenteInactivo || subreferenceInactive ? 0.42 : (fichaSinCaptura ? 0.68 : (fill === _mapEmptyColor() ? 0.55 : 0.84)) };

    if (group?.setStyle)    group.setStyle(style);
    else if (group?.getLayers) group.getLayers().forEach(sl => sl?.setStyle?.(style));

    if (referenteLayer) {
      group.unbindTooltip();
    } else {
      group.unbindTooltip();
      const tooltipText=nombreMunicipioById[id] || "";
      group.bindTooltip(tooltipText, { sticky:true,direction:"top",className:"tooltip-mun" });
    }
  });

  if (_currentLayer === "referente") _renderReferenceLeaderLabels();
  else _clearReferenceLeaderLabels();
}

function _clearReferenceLeaderLabels() {
  if (_referenceLeaderLayer && map?.hasLayer(_referenceLeaderLayer)) {
    map.removeLayer(_referenceLeaderLayer);
  }
  _referenceLeaderLayer = null;
}

function setReferenceLabelsVisible(visible) {
  _referenceLabelsVisible = Boolean(visible);
  if (_currentLayer === "referente") _renderReferenceLeaderLabels();
}

function _renderReferenceLeaderLabels() {
  if (!map || _currentLayer !== "referente" || !_referenceLabelsVisible) {
    _clearReferenceLeaderLabels();
    return;
  }
  _clearReferenceLeaderLabels();

  const candidates = Object.entries(layersById)
    .map(([id, layer]) => ({ id: Number(id), layer, data: _capasData.get(Number(id)) || {} }))
    .filter(item => item.data.referente_activo && item.layer?.getBounds?.().isValid())
    .map(item => ({ ...item, anchor: item.layer.getBounds().getCenter(), name: nombreMunicipioById[item.id] || "" }))
    .sort((a, b) => a.anchor.lat - b.anchor.lat || a.anchor.lng - b.anchor.lng);

  if (!candidates.length) return;
  _referenceLeaderLayer = L.layerGroup().addTo(map);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = "700 8px Segoe UI, Arial, sans-serif";
  const occupied = [];
  const size = map.getSize();
  const directions = [
    [1, 0], [0, -1], [-1, 0], [0, 1],
    [1, -1], [-1, -1], [-1, 1], [1, 1]
  ];
  const radii = [42, 68, 94, 122, 152, 184];

  candidates.forEach(({ id, anchor, name, data }) => {
    const anchorPoint = map.latLngToContainerPoint(anchor);
    const width = Math.max(62, Math.min(150, Math.ceil(context.measureText(name).width + 14)));
    const height = 20;
    let best = null;
    let bestConflicts = Infinity;

    for (const radius of radii) {
      for (const [dx, dy] of directions) {
        const scale = dx && dy ? Math.SQRT1_2 : 1;
        const x = anchorPoint.x + dx * radius * scale;
        const y = anchorPoint.y + dy * radius * scale;
        const rect = { left: x - width / 2 - 3, right: x + width / 2 + 3, top: y - height / 2 - 3, bottom: y + height / 2 + 3 };

        if (rect.left < 3 || rect.right > size.x - 3 || rect.top < 3 || rect.bottom > size.y - 3) continue;
        const conflicts = occupied.filter(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top).length;
        if (!conflicts) {
          best = { x, y, rect };
          bestConflicts = 0;
          break;
        }
        if (conflicts < bestConflicts) {
          bestConflicts = conflicts;
          best = { x, y, rect };
        }
      }
      if (best && bestConflicts === 0) break;
    }

    if (!best) return;
    occupied.push(best.rect);

    const offsetX = best.x - anchorPoint.x;
    const offsetY = best.y - anchorPoint.y;
    const edgeX = Math.abs(offsetX) > Math.abs(offsetY) * (width / height)
      ? best.x - Math.sign(offsetX) * width / 2
      : best.x;
    const edgeY = edgeX === best.x
      ? best.y - Math.sign(offsetY || 1) * height / 2
      : best.y;
    const elbow = map.containerPointToLatLng([
      anchorPoint.x + (edgeX - anchorPoint.x) * .58,
      anchorPoint.y + (edgeY - anchorPoint.y) * .58
    ]);
    const labelPoint = map.containerPointToLatLng([best.x, best.y]);
    const labelEdge = map.containerPointToLatLng([edgeX, edgeY]);
    const color = data.referente_color || "#8f173d";

    L.polyline([anchor, elbow, labelEdge], {
      color,
      weight: 1.1,
      opacity: .88,
      interactive: false,
      className: "municipality-leader-line"
    }).addTo(_referenceLeaderLayer);

    L.marker(labelPoint, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: "municipality-leader-label-wrap",
        html: `<span class="municipality-leader-label" style="--leader-color:${color}">${_escapeMapHtml(name)}</span>`,
        iconSize: [width, height],
        iconAnchor: [width / 2, height / 2]
      })
    }).addTo(_referenceLeaderLayer);
  });
}

function _mapStrokeColor() {
  return _mapTheme === "light" ? "#ffffff" : "#0f172a";
}

function _mapEmptyColor() {
  return _mapTheme === "light" ? "#cbd5e1" : "#374151";
}

function _isAspirantsMapContext() {
  return _currentLayer === "aspirantes"
    || _coverageContextLabel.toLocaleLowerCase("es-MX").includes("aspirantes");
}

function _getLayerColor(layer, data) {
  const total = Number(data.total || 0);
  const aspirantsContext = layer === "aspirantes"
    || (layer === "cobertura" && _coverageContextLabel.toLocaleLowerCase("es-MX").includes("aspirantes"));
  if (aspirantsContext) {
    if (total <= 0) return _mapEmptyColor();
    if (total <= 5) return "#ef4444";
    if (total <= 10) return "#fb923c";
    if (total <= 15) return "#facc15";
    return "#16a34a";
  }
  switch (layer) {
    case "fichas":        return data.tiene_informacion ? "#8f173d" : "#aeb6c1";
    case "referente":
    case "referente_aspirantes": return data.referente_activo ? (data.referente_color || "#a8174b") : "#c7cbd0";
    case "subreferente": return data.subreferente_activo ? (data.subreferente_color || "#8f173d") : "#c7cbd0";
    case "cobertura":     return _isAspirantsMapContext() ? _aspirantsColor(Number(data.total || 0)) : _coberturaColor(Number(data.total || 0));
    case "aspirantes":    return _aspirantesColor(Number(data.total || 0));
    case "verificacion":  return _verificacionColor(Number(data.total || 0), Number(data.verificados || 0));
    case "confiabilidad": return _confiabilidadColor(Number(data.total || 0), Number(data.confiabilidad_alta || 0));
    case "partido":       return _partyColor(data.partido_dominante);
    case "historial":     return data.history_total ? (data.history_color || _historyColor(Number(data.history_total || 0), Number(data.history_rank || 0))) : _mapEmptyColor();
    default:              return _mapEmptyColor();
  }
}

function _aspirantsColor(n) {
  if (n <= 0) return _mapEmptyColor();
  if (n <= 5) return "#ef4444";
  if (n <= 10) return "#fb923c";
  if (n <= 15) return "#facc15";
  return "#16a34a";
}

function _historyColor(total, rank) {
  if (!total) return _mapEmptyColor();
  if (rank >= 4) return "#7f1239";
  if (rank >= 3) return "#a51f4f";
  if (rank >= 2) return "#c35d78";
  return "#e4a7b7";
}

// Escala cobertura
function _coberturaColor(n) {
  if (n === 0)  return _mapEmptyColor();
  if (n <= 10)  return "#ef4444";
  if (n <= 20)  return "#fb923c";
  if (n <= 30)  return "#facc15";
  if (n <= 40)  return "#4ade80";
  return "#16a34a";
}

// Escala % verificados
function _verificacionColor(total, verificados) {
  if (!total) return _mapEmptyColor();
  const pct = (verificados / total) * 100;
  if (pct === 0)  return "#ef4444";
  if (pct <= 25)  return "#fb923c";
  if (pct <= 50)  return "#facc15";
  if (pct <= 75)  return "#4ade80";
  return "#16a34a";
}

// Escala % confiabilidad alta
function _confiabilidadColor(total, alta) {
  if (!total) return _mapEmptyColor();
  const pct = (alta / total) * 100;
  if (pct === 0)  return "#ef4444";
  if (pct <= 25)  return "#fb923c";
  if (pct <= 50)  return "#facc15";
  if (pct <= 75)  return "#4ade80";
  return "#16a34a";
}

// COLORES PARA MAPAS (Máximo contraste ante transparencias)
const _PARTY_COLORS = {
  "PAN": "#1976D2",          // Azul Rey (muy vivo para que no se apague)
  "PRI": "#FF1744",          // Rojo Neón / Carmín brillante (se despega totalmente del guinda)
  "PRD": "#FFF200",          // Amarillo Canario puro
  "PVEM": "#4CAF50",         // Verde Ecologista
  "VERDE": "#4CAF50",
  "VERDE (PVEM)": "#4CAF50",
  
  // 🔥 EL CAMBIO CLAVE: Pasamos al PT a su color Amarillo-Oro oficial.
  // Esto elimina un rojo del mapa y se diferencia perfectamente del PRD por ser más oscuro.
  "PT": "#FF9100",           
  
  // 🔥 MC ahora es un Naranja Eléctrico/Fluorescente para que no se confunda con el PT
  "MC": "#FF5722",           
  
  // 🔥 MORENA lo hacemos aún más oscuro (casi chocolate/guinda profundo) 
  // para que la transparencia no lo aclare demasiado
  "MORENA": "#3B0B14",       
  
  "NA": "#00BFA5",           // Turquesa brillante
  "NAEM": "#00BFA5",
  "ALIANZA": "#00BFA5",
  "ALIANZA (NA)": "#00BFA5"
};


function _partyColor(siglas) {
  if (!siglas) return _mapEmptyColor();
  return _PARTY_COLORS[String(siglas).toUpperCase().trim()] || "#AEB6C1";
}

// ── Panel "Cobertura Territorial" (solo capa cobertura) ──────────────────────

function updateLayerLegend() {
  // Elimina control anterior
  if (_legendControl) {
    try { map.removeControl(_legendControl); } catch(e) {}
    _legendControl = null;
  }

  // Solo se muestra en las capas con una leyenda categórica.
  if (_currentLayer !== "fichas" && _currentLayer !== "referente" && _currentLayer !== "referente_aspirantes" && _currentLayer !== "subreferente" && _currentLayer !== "cobertura" && _currentLayer !== "aspirantes" && _currentLayer !== "partido") return;

  const content = _currentLayer === "subreferente"
    ? _buildSubreferencePanel()
    : _currentLayer === "fichas" || _currentLayer === "referente" || _currentLayer === "referente_aspirantes"
    ? (_currentLayer === "fichas" ? _buildFichasPanel() : _buildReferencePanel())
    : (_currentLayer === "cobertura" || _currentLayer === "aspirantes" ? _buildPanelContent() : _buildPartidoPanel());
  if (!content) return;

  _legendControl = L.control({ position: "bottomright" });
  _legendControl.onAdd = function() {
    const div = L.DomUtil.create("div");
    const isLight = _mapTheme === "light";
    div.style.cssText = [
      isLight ? "background:rgba(255,255,255,0.94)" : "background:rgba(10,14,26,0.93)",
      isLight ? "border:1px solid rgba(15,23,42,0.12)" : "border:1px solid rgba(255,255,255,0.07)",
      "border-radius:14px",
      "padding:13px 15px",
      isLight ? "box-shadow:0 10px 28px rgba(15,23,42,.16)" : "box-shadow:0 8px 32px rgba(0,0,0,.65)",
      "font-size:12px", "line-height:1.4",
      "font-family:inherit",
      "min-width:210px", "max-width:240px",
      "pointer-events:none",
      isLight ? "color:#1f2937" : "color:#f1f5f9"
    ].join(";");
    div.innerHTML = content;
    return div;
  };
  _legendControl.addTo(map);
}

function _buildSubreferencePanel() {
  const rows = [..._capasData.values()];
  const selected = rows.filter(row => row.subreferente_activo);
  const first = selected[0];
  const aspirants = selected.reduce((total, row) => total + Number(row.total || 0), 0);
  const color = first?.subreferente_color || "#8f173d";
  const name = first?.subreferente_nombre || "Sin subreferente seleccionado";
  return `
    <div style="display:flex;align-items:center;gap:7px;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#775f39;margin-bottom:9px">
      <i class="bi bi-person-lines-fill" style="color:#8f173d"></i> Distribución por subreferente
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin:7px 0;color:#334155">
      <span style="width:12px;height:12px;border-radius:3px;background:${color};flex:0 0 12px"></span>
      <span style="flex:1;line-height:1.2">${_escapeMapHtml(name)}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;color:#64748b"><span style="flex:1">Municipios vinculados</span><strong>${selected.length}</strong></div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:5px;color:#64748b"><span style="flex:1">Aspirantes</span><strong>${aspirants}</strong></div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:7px;border-top:1px solid rgba(15,23,42,.10);color:#64748b"><span style="width:12px;height:12px;border-radius:3px;background:#c7cbd0"></span><span style="flex:1">Otros municipios</span><strong>${Math.max(0,rows.length-selected.length)}</strong></div>`;
}

function _buildReferencePanel() {
  const rows = [..._capasData.values()];
  const selected = rows.filter(row => row.referente_activo);
  const references = new Map();
  selected.forEach(row => (row.referentes_activos || []).forEach(reference => {
    if (!references.has(reference.key)) references.set(reference.key, { ...reference, municipios: 0 });
    references.get(reference.key).municipios += 1;
  }));
  const legendRows = [...references.values()].map(reference => `
    <div style="display:flex;align-items:center;gap:8px;margin:6px 0;color:#334155">
      <span style="width:12px;height:12px;border-radius:3px;background:${reference.color};flex:0 0 12px"></span>
      <span style="flex:1;line-height:1.2">${_escapeMapHtml(reference.nombre)}</span>
      <strong>${reference.municipios}</strong>
    </div>`).join("");
  const overlaps = selected.filter(row => (row.referentes_activos || []).length > 1).length;
  return `
    <div style="display:flex;align-items:center;gap:7px;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#775f39;margin-bottom:9px">
      <i class="bi bi-layers-fill" style="color:#8f173d"></i> Subcapas por referente
    </div>
    ${legendRows || '<div style="color:#64748b">Selecciona uno o varios referentes.</div>'}
    <div style="border-top:1px solid rgba(15,23,42,.10);margin:8px 0"></div>
    <div style="display:flex;align-items:center;gap:8px;color:#64748b"><span style="flex:1">Municipios con varios referentes</span><strong>${overlaps}</strong></div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:5px;color:#64748b"><span style="width:12px;height:12px;border-radius:3px;background:#c7cbd0"></span><span style="flex:1">Sin subcapa seleccionada</span><strong>${rows.length-selected.length}</strong></div>`;
}

function _buildFichasPanel() {
  const rows = [..._capasData.values()];
  const available = rows.filter(row => row.tiene_informacion).length;
  const pending = rows.length - available;
  return `
    <div style="display:flex;align-items:center;gap:7px;font-weight:800;font-size:10px;
                text-transform:uppercase;letter-spacing:.08em;color:#775f39;margin-bottom:10px">
      <i class="bi bi-file-earmark-text-fill" style="color:#8f173d"></i>
      Fichas municipales
    </div>
    <div style="display:flex;align-items:center;gap:9px;margin:7px 0;color:#334155">
      <span style="width:12px;height:12px;border-radius:3px;background:#8f173d"></span>
      <span style="flex:1;font-weight:650">Con información</span><strong>${available}</strong>
    </div>
    <div style="display:flex;align-items:center;gap:9px;margin:7px 0;color:#64748b">
      <span style="width:12px;height:12px;border-radius:3px;background:#d4d9e0"></span>
      <span style="flex:1;font-weight:650">Sin captura</span><strong>${pending}</strong>
    </div>`;
}

function _buildPanelContent() {
  const textColor = _mapTheme === "light" ? "#334155" : "#cbd5e1";
  const mutedColor = _mapTheme === "light" ? "#64748b" : "#94a3b8";
  const dividerColor = _mapTheme === "light" ? "rgba(15,23,42,.10)" : "rgba(255,255,255,.06)";
  const ROW = (color, label, stat) =>
    `<div style="display:flex;align-items:center;gap:9px;margin:5px 0">
      <span style="width:11px;height:11px;border-radius:3px;background:${color};
                   display:inline-block;flex-shrink:0;
                   box-shadow:0 0 0 1px rgba(255,255,255,.12)"></span>
      <span style="color:${textColor};font-weight:500;flex:1">${label}</span>
      <span style="color:${mutedColor};font-size:11px;white-space:nowrap">${stat}</span>
    </div>`;

  const contextTitle = _isAspirantsMapContext()
    ? "Aspirantes 2027"
    : _coverageContextLabel
      ? `Presencia: ${_escapeMapHtml(_coverageContextLabel)}`
      : "Cobertura Territorial";

  const HEADER =
    `<div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:10px;
                 text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:10px">
      <i class="bi bi-bar-chart-fill" style="font-size:11px;color:#8b2136"></i>
      ${contextTitle}
    </div>`;

  const DIVIDER = `<div style="border-top:1px solid ${dividerColor};margin:8px 0"></div>`;

  // ── Sin datos: muestra solo la escala de colores ──────────────────────────
  if (!_capasData.size) {
    if (_isAspirantsMapContext()) {
      const aspirantBins = [
        [_mapEmptyColor(), "Sin registros", ""],
        ["#ef4444", "1 – 5", ""],
        ["#fb923c", "6 – 10", ""],
        ["#facc15", "11 – 15", ""],
        ["#16a34a", "16+", ""]
      ];
      return HEADER + aspirantBins.map(([c, l, s]) => ROW(c, l, s)).join("");
    }
    const staticBins = [
      [_mapEmptyColor(), "Sin registros", ""],
      ["#ef4444", "1 – 10",        ""],
      ["#fb923c", "11 – 20",       ""],
      ["#facc15", "21 – 30",       ""],
      ["#4ade80", "31 – 40",       ""],
      ["#16a34a", "41+",           ""],
    ];
    return HEADER + staticBins.map(([c, l, s]) => ROW(c, l, s)).join("");
  }

  // ── Con datos: muestra conteos reales ─────────────────────────────────────
  const stats = _computeLayerStats();
  if (!stats) return null;

  const rows = stats.bins.map(b => ROW(b.color, b.label, b.stat)).join("");
  const footer = stats.footer
    ? `<div style="color:${mutedColor};font-size:11px;text-align:right">${stats.footer}</div>`
    : "";

  return HEADER + rows + (footer ? DIVIDER + footer : "");
}

function _escapeMapHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function _buildPartidoPanel() {
  if (!_capasData.size) return null;
  const textColor = _mapTheme === "light" ? "#334155" : "#cbd5e1";
  const strongColor = _mapTheme === "light" ? "#0f172a" : "#e2e8f0";
  const mutedColor = _mapTheme === "light" ? "#64748b" : "#475569";
  const dividerColor = _mapTheme === "light" ? "rgba(15,23,42,.10)" : "rgba(255,255,255,.06)";

  const all = [..._capasData.values()];

  // Agrupa municipios por partido dominante
  const freq = new Map();
  all.forEach(d => {
    const k = d.partido_dominante
      ? String(d.partido_dominante).toUpperCase().trim()
      : "__SIN__";
    const current = freq.get(k) || { count: 0 };
    current.count += 1;
    freq.set(k,current);
  });

  const sorted = [...freq.entries()].sort((a, b) => b[1].count - a[1].count);
  const conPartido = all.filter(d => d.partido_dominante).length;
  const totalMun   = all.length;

  const ROW = (color, label, count, pct) =>
    `<div style="display:flex;align-items:center;gap:8px;margin:5px 0">
      <span style="width:11px;height:11px;border-radius:3px;background:${color};display:inline-block;flex-shrink:0;box-shadow:0 0 0 1px rgba(15,23,42,.1)"></span>
      <span style="color:${textColor};font-weight:600;flex:1;font-size:12px">${_escapeMapHtml(label)}</span>
      <span style="color:${strongColor};font-weight:700;font-size:13px;min-width:22px;text-align:right">${count}</span>
      <span style="color:${mutedColor};font-size:10px;min-width:32px;text-align:right">${pct}%</span>
    </div>`;

  const rows = sorted.map(([siglas, data]) => {
    const {count} = data;
    const label = siglas === "__SIN__" ? "Sin partido" : siglas;
    const color = siglas === "__SIN__" ? _mapEmptyColor() : _partyColor(siglas);
    const pct   = totalMun ? Math.round(count / totalMun * 100) : 0;
    return ROW(color, label, count, pct);
  }).join("");

  return `
    <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:10px;
                text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:10px">
      <i class="bi bi-flag-fill" style="font-size:11px;color:#8b2136"></i>
      Partido Dominante
    </div>
    ${rows}
    <div style="border-top:1px solid ${dividerColor};margin:8px 0"></div>
    <div style="color:${mutedColor};font-size:11px;text-align:right">
      ${conPartido} de ${totalMun} municipios con partido
    </div>
  `;
}

function _computeLayerStats() {
  if (!_capasData.size) return null;

  const all      = [..._capasData.values()];
  const totalMun = all.length;
  const totalAct = all.reduce((s, d) => s + Number(d.total || 0), 0);

  let tiers;
  if (_isAspirantsMapContext()) {
    tiers = [
      { label: "Sin registros", color: _mapEmptyColor(), test: n => n === 0 },
      { label: "1 – 5", color: "#ef4444", test: n => n >= 1 && n <= 5 },
      { label: "6 – 10", color: "#fb923c", test: n => n >= 6 && n <= 10 },
      { label: "11 – 15", color: "#facc15", test: n => n >= 11 && n <= 15 },
      { label: "16+", color: "#16a34a", test: n => n >= 16 }
    ];
  } else {
   tiers = [
    { label: "Sin registros", color: _mapEmptyColor(), test: n => n === 0 },
    { label: "1 – 10",        color: "#ef4444", test: n => n >= 1  && n <= 10 },
    { label: "11 – 20",       color: "#fb923c", test: n => n >= 11 && n <= 20 },
    { label: "21 – 30",       color: "#facc15", test: n => n >= 21 && n <= 30 },
    { label: "31 – 40",       color: "#4ade80", test: n => n >= 31 && n <= 40 },
     { label: "41+",           color: "#16a34a", test: n => n >= 41 },
   ];
  }

  const bins = tiers.map(t => {
    const items  = all.filter(d => t.test(Number(d.total || 0)));
    const act    = items.reduce((s, d) => s + Number(d.total || 0), 0);
    const munTxt = `${items.length} mun.`;
    const actTxt = act > 0 ? ` · ${act} act.` : "";
    return { label: t.label, color: t.color, stat: munTxt + actTxt };
  });

  return {
    bins,
    footer: `${totalMun} municipios · ${totalAct.toLocaleString("es-MX")} actores`
  };
}

// ── applyCoverageStyle (reset + repintar) ─────────────────────────────────────

function applyCoverageStyle() {
  // Cierra bubble de selección si hay una activa
  if (_selectedLayerId != null && layersById[_selectedLayerId]) {
    const prev = layersById[_selectedLayerId];
    prev.unbindTooltip();
    prev.bindTooltip(nombreMunicipioById[_selectedLayerId] || "", {
      sticky: true, direction: "top", className: "tooltip-mun"
    });
  }
  _selectedLayerId = null;
  paintCurrentLayer();
}

function resetMapCoverageView() {
  applyCoverageStyle();
  map.setView([19.35, -99.5], 8);
}

// ── Resaltar municipio seleccionado ───────────────────────────────────────────

function resaltarMunicipioById(id) {
  applyCoverageStyle();

  const layer = layersById[id];
  if (!layer) return;

  _selectedLayerId = id;
  layer.setStyle({ color: "#5a0f22", fillColor: "#8b2136", fillOpacity: 0.75, weight: 3 });

  const total  = municipioCountById.get(Number(id)) ?? 0;
  const nombre = nombreMunicipioById[id] || "";
  const municipioData = _capasData.get(Number(id)) || {};
  const fichaDisponible = Boolean(municipioData.tiene_informacion);
  const partyName = municipioData.partido_nombre || municipioData.partido_dominante || "SIN PARTIDO";
  const hasParty = Boolean(municipioData.partido_nombre || municipioData.partido_dominante);
  const partyColor = hasParty ? (_partyColor(partyName) || "#64748B") : "#64748B";
  const isAspirantsLayer = _isAspirantsMapContext() || _currentLayer === "referente_aspirantes" || _currentLayer === "subreferente";
  let headerTitle = "COBERTURA TERRITORIAL";
  let headerColor = "#8f173d";
  let headerIcon = "bi-geo-alt-fill";
  let metricLabel = "ACTORES EN TOTAL";
  let metricValue = total;
  let metricState = "";

  if (_currentLayer === "partido") {
    headerTitle = partyName;
    headerColor = partyColor;
    headerIcon = "bi-flag-fill";
    metricLabel = "ASPIRANTES EN TOTAL";
    metricValue = Number(municipioData.total_aspirantes || 0);
  } else if (_currentLayer === "referente") {
    const activeReferences = municipioData.referentes_activos || [];
    headerTitle = activeReferences.length > 1
      ? `${activeReferences.length} REFERENTES`
      : municipioData.referente_nombre || "REFERENTE";
    headerColor = municipioData.referente_color || "#a8174b";
    headerIcon = "bi-diagram-3-fill";
    metricLabel = municipioData.referente_activo ? "VINCULACIÓN" : "ESTADO";
    metricValue = municipioData.referente_activo ? String(activeReferences.length || 1) : "SIN VÍNCULO";
    metricState = municipioData.referente_activo ? "is-status" : "is-status is-pending";
  } else if (_currentLayer === "fichas") {
    headerTitle = "FICHA MUNICIPAL";
    headerColor = "#8f173d";
    headerIcon = "bi-file-earmark-text-fill";
    metricLabel = "ESTADO DE LA FICHA";
    metricValue = fichaDisponible ? "DISPONIBLE" : "SIN CAPTURA";
    metricState = fichaDisponible ? "is-status" : "is-status is-pending";
  } else if (_currentLayer === "subreferente") {
    headerTitle = municipioData.subreferente_nombre || "SUBREFERENTE";
    headerColor = municipioData.subreferente_color || "#8f173d";
    headerIcon = "bi-person-lines-fill";
    metricLabel = "ASPIRANTES VINCULADOS";
    metricValue = municipioData.subreferente_activo ? Number(municipioData.total || 0) : "SIN VÍNCULO";
    metricState = municipioData.subreferente_activo ? "" : "is-status is-pending";
  } else if (isAspirantsLayer) {
    headerTitle = "ASPIRANTES 2027";
    headerColor = _currentLayer === "referente_aspirantes"
      ? (municipioData.referente_color || "#a8174b")
      : _aspirantsColor(total);
    headerIcon = "bi-people-fill";
    metricLabel = "ASPIRANTES EN TOTAL";
    metricValue = total;
  }

  const popupContent = `
    <div class="map-detail-popup">
      <div class="map-detail-popup-header" style="--popup-header-color:${headerColor}">
        <i class="bi ${headerIcon}"></i>
        <span>${_escapeMapHtml(headerTitle)}</span>
      </div>
      <div class="map-detail-popup-body">
        <strong class="map-detail-popup-municipality">${_escapeMapHtml(nombre)}</strong>
        ${(_currentLayer === "referente" || _currentLayer === "referente_aspirantes") && (municipioData.referentes_activos || []).length > 1
          ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0">${municipioData.referentes_activos.map(reference => `<span style="padding:3px 6px;border-radius:999px;background:${_escapeMapHtml(reference.color)};color:#fff;font-size:9px">${_escapeMapHtml(reference.nombre)}</span>`).join("")}</div>`
          : ""}
        <div class="map-detail-popup-metric ${metricState}">
          <span>${_escapeMapHtml(metricLabel)}</span>
          <strong>${_escapeMapHtml(metricValue)}</strong>
        </div>
      </div>
    </div>`;

  layer.unbindTooltip();
  layer.bindTooltip(popupContent, {
    permanent:true,
    direction:"center",
    className:"tooltip-mun map-detail-popup-tooltip"
  })
  .openTooltip();

  map.fitBounds(layer.getBounds(), { padding: [40, 40] });
}

// ── Highlight helpers ─────────────────────────────────────────────────────────

function resetMunicipiosHighlight() { applyCoverageStyle(); }

function highlightMunicipiosByIdList(ids, { dimOthers = true } = {}) {
  const set = new Set((ids || []).map(n => Number(n)).filter(Boolean));

  Object.entries(layersById).forEach(([idStr, group]) => {
    const id  = Number(idStr);
    const data = _capasData.get(id) || {};
    const base = _getLayerColor(_currentLayer, data);
    const hit  = set.has(id);
    if (!group) return;

    group.setStyle(
      hit
        ? { color: "#0f172a", weight: 2.2, fillColor: base, fillOpacity: 0.82 }
        : dimOthers
          ? { color: "#334155", weight: 0.8, fillColor: base, fillOpacity: 0.12 }
          : { color: "#0f172a", weight: 2.2, fillColor: base, fillOpacity: 0.82 }
    );
  });
}

function highlightPersonaMunicipiosDetalle(rows = []) {
  if (!Array.isArray(rows) || !rows.length) { resetMunicipiosHighlight(); return; }

  const ids = new Set(rows.map(r => Number(r.id_municipio)).filter(Boolean));

  Object.entries(layersById).forEach(([idStr, group]) => {
    const id = Number(idStr);
    if (!group) return;
    const hit       = ids.has(id);
    const item      = rows.find(r => Number(r.id_municipio) === id);
    const principal = !!item?.es_principal;

    if (!hit) {
      group.setStyle({ weight: 0.8, color: "#334155", fillOpacity: 0.08 });
      return;
    }
    group.setStyle(
      principal
        ? { color: "#1d4ed8", weight: 3, fillColor: "#2563eb", fillOpacity: 0.75 }
        : { color: "#2563eb", weight: 2, fillColor: "#60a5fa", fillOpacity: 0.55 }
    );
  });

  const selected = Object.entries(layersById)
    .filter(([idStr]) => ids.has(Number(idStr)))
    .map(([, g]) => g).filter(Boolean);

  if (selected.length && map) {
    try { map.fitBounds(L.featureGroup(selected).getBounds(), { padding: [30, 30] }); }
    catch(e) {}
  }
}

let actorFocusIds = new Set();

function clearActorFocusOnMap({ restoreCoverage = true } = {}) {
  actorFocusIds = new Set();
  if (restoreCoverage) applyCoverageStyle();
}

function paintActorMunicipiosOnMap(rows = [], opts = {}) {
  const {
    fit = true, dimOthers = true,
    principalStyle = { color: "#1d4ed8", weight: 3, fillColor: "#2563eb", fillOpacity: 0.75 },
    secondaryStyle = { color: "#2563eb", weight: 2, fillColor: "#60a5fa", fillOpacity: 0.55 }
  } = opts;

  if (!Array.isArray(rows) || !rows.length) {
    clearActorFocusOnMap({ restoreCoverage: true });
    return { painted: 0, ids: [] };
  }

  const normalized = rows
    .map(r => ({ id_municipio: Number(r.id_municipio), es_principal: !!r.es_principal }))
    .filter(r => Number.isFinite(r.id_municipio) && r.id_municipio > 0);

  if (!normalized.length) { clearActorFocusOnMap({ restoreCoverage: true }); return { painted: 0, ids: [] }; }

  actorFocusIds = new Set(normalized.map(r => r.id_municipio));

  Object.entries(layersById).forEach(([idStr, group]) => {
    const id  = Number(idStr);
    if (!group) return;
    const hit  = actorFocusIds.has(id);
    const item = normalized.find(r => r.id_municipio === id);

    if (!hit) {
      if (dimOthers) {
        const data = _capasData.get(id) || {};
        group.setStyle({ color: "#334155", weight: 0.8,
          fillColor: _getLayerColor(_currentLayer, data), fillOpacity: 0.10 });
      }
      return;
    }
    group.setStyle(item?.es_principal ? principalStyle : secondaryStyle);
  });

  const selected = Object.entries(layersById)
    .filter(([idStr]) => actorFocusIds.has(Number(idStr)))
    .map(([, g]) => g).filter(Boolean);

  if (fit && selected.length && map) {
    try { map.fitBounds(L.featureGroup(selected).getBounds(), { padding: [30, 30] }); }
    catch(e) {}
  }
  return { painted: selected.length, ids: [...actorFocusIds] };
}

// ── Exports ───────────────────────────────────────────────────────────────────

window.initMap                           = initMap;
window.drawMunicipios                    = drawMunicipios;
window.setOnMunicipioSelected            = setOnMunicipioSelected;
window.setCapasMapa                      = setCapasMapa;
window.setFilteredCoverageData           = setFilteredCoverageData;
window.restoreBaseCapasMapa              = restoreBaseCapasMapa;
window.setMunicipioCoverageCounts        = setMunicipioCoverageCounts;
window.switchMapLayer                    = switchMapLayer;
window.setReferenceLabelsVisible         = setReferenceLabelsVisible;
window.resaltarMunicipioById             = resaltarMunicipioById;
window.resetMunicipiosHighlight          = resetMunicipiosHighlight;
window.highlightMunicipiosByIdList       = highlightMunicipiosByIdList;
window.highlightPersonaMunicipiosDetalle = highlightPersonaMunicipiosDetalle;
window.paintActorMunicipiosOnMap         = paintActorMunicipiosOnMap;
window.clearActorFocusOnMap              = clearActorFocusOnMap;
window.resetMapCoverageView              = resetMapCoverageView;
