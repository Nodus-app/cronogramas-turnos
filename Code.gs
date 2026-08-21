// ============================================================
// CRONOGRAMAS DE TURNOS — Backend (Google Sheets + Apps Script)
// ============================================================
// Instalación:
// 1. Abrí el Google Sheet "Cronogramas Turnos - Base de Datos".
// 2. Extensiones -> Apps Script.
// 3. Borrá el contenido de Code.gs que aparece por defecto y pegá TODO
//    este archivo.
// 4. Implementar -> Nueva implementación -> Tipo: Aplicación web.
//    Ejecutar como: Yo. Quién tiene acceso: Cualquier usuario.
// 5. Autorizá los permisos que pida (es tu propio script leyendo tu
//    propio Sheet).
// 6. Copiá la URL que te da (".../exec") y pegala en app.js, en la
//    constante API_URL.
// ============================================================

var SHEETS = {
  usuarios: 'Usuarios',
  grupos: 'Grupos',
  integrantes: 'Integrantes',
  novedades: 'Novedades'
};

function doPost(e) {
  var out;
  try {
    var body = JSON.parse(e.postData.contents);
    out = handleAction(body.action, body.payload || {});
  } catch (err) {
    out = { ok: false, error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, msg: 'Cronogramas Turnos API activa' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleAction(action, p) {
  if (action === 'login') return login(p.email, p.clave);

  // Todas las demás acciones requieren credenciales válidas
  var user = authenticate(p.email, p.clave);
  if (!user) return { ok: false, error: 'No autorizado' };

  switch (action) {
    case 'getState': return getState(user);
    case 'saveGrupo': return requireSupervisor(user, function () { return saveGrupo(p.grupo); });
    case 'deleteGrupo': return requireSupervisor(user, function () { return deleteGrupo(p.id); });
    case 'saveIntegrante': return requireSupervisor(user, function () { return saveIntegrante(p.integrante, p.acceso); });
    case 'deleteIntegrante': return requireSupervisor(user, function () { return deleteIntegrante(p.id); });
    case 'saveNovedad': return saveNovedad(user, p.novedad);
    case 'deleteNovedad': return deleteNovedad(user, p.id);
    case 'resolverNovedad': return requireSupervisor(user, function () { return resolverNovedad(p.id, p.estado); });
    default: return { ok: false, error: 'Acción desconocida: ' + action };
  }
}

function requireSupervisor(user, fn) {
  if (user.rol !== 'supervisor') return { ok: false, error: 'Solo el supervisor puede hacer esto' };
  return fn();
}

// ── SHEET HELPERS ──────────────────────────────────────────────────────
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) { return ss_().getSheetByName(name); }

function normalizeCell_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}
function sanitizeForSheet_(v) {
  // Evita que Sheets auto-convierta strings tipo fecha (YYYY-MM-DD) a un valor Date
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return "'" + v;
  return v;
}

function readAll(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) continue; // fila sin id
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = normalizeCell_(values[i][j]);
    rows.push(obj);
  }
  return rows;
}
function findRowById(name, id) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1; // 1-indexado
  }
  return -1;
}
function appendRow(name, obj) {
  var sh = sheet_(name);
  var headers = sh.getDataRange().getValues()[0];
  var row = headers.map(function (h) { return sanitizeForSheet_(obj[h] !== undefined ? obj[h] : ''); });
  sh.appendRow(row);
}
function updateRow(name, rowIndex, obj) {
  var sh = sheet_(name);
  var headers = sh.getDataRange().getValues()[0];
  var row = headers.map(function (h) { return sanitizeForSheet_(obj[h] !== undefined ? obj[h] : ''); });
  sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
}
function deleteRow(name, rowIndex) {
  sheet_(name).deleteRow(rowIndex);
}
function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }

// ── AUTH ────────────────────────────────────────────────────────────────
function login(email, clave) {
  var user = authenticate(email, clave);
  if (!user) return { ok: false, error: 'Usuario o clave incorrectos' };
  return { ok: true, user: user };
}
function authenticate(email, clave) {
  if (!email || !clave) return null;
  var usuarios = readAll(SHEETS.usuarios);
  var u = usuarios.filter(function (x) {
    return String(x.email).toLowerCase() === String(email).toLowerCase() && String(x.clave) === String(clave);
  })[0];
  if (!u) return null;
  return { email: u.email, clave: u.clave, rol: u.rol, integranteId: u.integranteId || '', nombre: u.nombre || '' };
}

// ── STATE ───────────────────────────────────────────────────────────────
function getState(user) {
  if (user.rol === 'supervisor') {
    var accesos = readAll(SHEETS.usuarios)
      .filter(function (u) { return u.rol === 'empleado' && u.integranteId; })
      .map(function (u) { return { integranteId: u.integranteId, email: u.email }; });
    return {
      ok: true,
      rol: 'supervisor',
      grupos: readAll(SHEETS.grupos),
      integrantes: readAll(SHEETS.integrantes),
      novedades: readAll(SHEETS.novedades),
      accesos: accesos
    };
  }
  // empleado: solo su propio integrante + sus novedades
  var integrantes = readAll(SHEETS.integrantes).filter(function (i) { return i.id === user.integranteId; });
  var novedades = readAll(SHEETS.novedades).filter(function (n) { return n.integranteId === user.integranteId; });
  return { ok: true, rol: 'empleado', integrante: integrantes[0] || null, novedades: novedades, nombre: user.nombre };
}

// ── GRUPOS ──────────────────────────────────────────────────────────────
function saveGrupo(g) {
  if (!g.id) { g.id = uid_(); appendRow(SHEETS.grupos, g); }
  else {
    var idx = findRowById(SHEETS.grupos, g.id);
    if (idx < 0) appendRow(SHEETS.grupos, g); else updateRow(SHEETS.grupos, idx, g);
  }
  return { ok: true, id: g.id };
}
function deleteGrupo(id) {
  var idx = findRowById(SHEETS.grupos, id);
  if (idx > 0) deleteRow(SHEETS.grupos, idx);
  // borra en cascada integrantes del grupo y sus novedades + accesos
  var integrantes = readAll(SHEETS.integrantes).filter(function (i) { return i.grupoId === id; });
  integrantes.forEach(function (i) { deleteIntegrante(i.id); });
  return { ok: true };
}

// ── INTEGRANTES ─────────────────────────────────────────────────────────
function saveIntegrante(i, acceso) {
  if (!i.id) { i.id = uid_(); appendRow(SHEETS.integrantes, i); }
  else {
    var idx = findRowById(SHEETS.integrantes, i.id);
    if (idx < 0) appendRow(SHEETS.integrantes, i); else updateRow(SHEETS.integrantes, idx, i);
  }
  if (acceso && acceso.habilitar) {
    upsertUsuarioEmpleado(i.id, i.nombre, acceso.email, acceso.clave);
  } else if (acceso && acceso.habilitar === false) {
    removeUsuarioEmpleado(i.id);
  }
  return { ok: true, id: i.id };
}
function deleteIntegrante(id) {
  var idx = findRowById(SHEETS.integrantes, id);
  if (idx > 0) deleteRow(SHEETS.integrantes, idx);
  var novedades = readAll(SHEETS.novedades).filter(function (n) { return n.integranteId === id; });
  novedades.forEach(function (n) {
    var ni = findRowById(SHEETS.novedades, n.id);
    if (ni > 0) deleteRow(SHEETS.novedades, ni);
  });
  removeUsuarioEmpleado(id);
  return { ok: true };
}
function upsertUsuarioEmpleado(integranteId, nombre, email, clave) {
  var usuarios = readAll(SHEETS.usuarios);
  var existente = usuarios.filter(function (u) { return u.integranteId === integranteId; })[0];
  var row = { email: email, clave: clave || (existente ? existente.clave : uid_()), rol: 'empleado', integranteId: integranteId, nombre: nombre };
  var sh = sheet_(SHEETS.usuarios);
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][3] === integranteId) { // columna integranteId
      updateRow(SHEETS.usuarios, i + 1, row);
      return;
    }
  }
  appendRow(SHEETS.usuarios, row);
}
function removeUsuarioEmpleado(integranteId) {
  var sh = sheet_(SHEETS.usuarios);
  var values = sh.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][3] === integranteId) deleteRow(SHEETS.usuarios, i + 1);
  }
}

// ── NOVEDADES (vacaciones / licencias) ─────────────────────────────────
function saveNovedad(user, n) {
  // el empleado solo puede crear/pedir novedades para sí mismo, quedan "pendiente"
  if (user.rol === 'empleado') {
    if (n.integranteId !== user.integranteId) return { ok: false, error: 'No autorizado' };
    n.estado = 'pendiente';
    n.creadoPor = user.nombre || user.email;
  } else {
    n.estado = n.estado || 'aprobada';
    n.creadoPor = n.creadoPor || (user.nombre || user.email);
  }
  if (!n.id) { n.id = uid_(); appendRow(SHEETS.novedades, n); }
  else {
    var idx = findRowById(SHEETS.novedades, n.id);
    if (idx < 0) appendRow(SHEETS.novedades, n); else updateRow(SHEETS.novedades, idx, n);
  }
  return { ok: true, id: n.id };
}
function deleteNovedad(user, id) {
  var idx = findRowById(SHEETS.novedades, id);
  if (idx < 0) return { ok: false, error: 'No existe' };
  if (user.rol === 'empleado') {
    var row = readAll(SHEETS.novedades).filter(function (n) { return n.id === id; })[0];
    if (!row || row.integranteId !== user.integranteId) return { ok: false, error: 'No autorizado' };
  }
  deleteRow(SHEETS.novedades, idx);
  return { ok: true };
}
function resolverNovedad(id, estado) {
  var idx = findRowById(SHEETS.novedades, id);
  if (idx < 0) return { ok: false, error: 'No existe' };
  var sh = sheet_(SHEETS.novedades);
  var headers = sh.getDataRange().getValues()[0];
  var estadoCol = headers.indexOf('estado') + 1;
  sh.getRange(idx, estadoCol).setValue(estado);
  return { ok: true };
}
