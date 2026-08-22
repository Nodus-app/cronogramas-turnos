// ── CONFIG ──────────────────────────────────────────────────────────────
// Pegá acá la URL de tu implementación de Apps Script (termina en /exec).
// Ver instrucciones en Code.gs / README.md.
var API_URL = 'https://script.google.com/macros/s/AKfycbxxVs1_eHaSUk1rbxryXb01BUuv5O2cJgW_LIKwMh3Cm2q_WeJ05Yc5t8f6kCT6VInb/exec';

var SESSION_KEY = 'crono_session';
var DOW = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── API ─────────────────────────────────────────────────────────────────
function apiConfigured(){ return API_URL && API_URL.indexOf('PASTE_') !== 0; }
function api(action, payload){
  payload = payload || {};
  var session = getSession();
  if(action !== 'login' && session){ payload.email = session.email; payload.clave = session.clave; }
  return fetch(API_URL, { method:'POST', body: JSON.stringify({action:action, payload:payload}) })
    .then(function(r){ return r.json(); });
}

// ── SESSION ─────────────────────────────────────────────────────────────
function getSession(){
  try{ return JSON.parse(localStorage.getItem(SESSION_KEY)); }catch(e){ return null; }
}
function setSession(user){ localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }

// ── LOGIN ───────────────────────────────────────────────────────────────
function doLogin(){
  var errBox = document.getElementById('lerr');
  errBox.style.display='none';
  if(!apiConfigured()){
    errBox.textContent = 'Todavía no se configuró la conexión con el backend (API_URL en app.js). Avisale a quien armó la app.';
    errBox.style.display='block';
    return;
  }
  var email=(document.getElementById('lu').value||'').trim();
  var clave=(document.getElementById('lp').value||'').trim();
  if(!email||!clave) return;
  var btn=document.getElementById('lbtn'); btn.disabled=true; btn.textContent='Ingresando...';
  api('login',{email:email,clave:clave}).then(function(res){
    btn.disabled=false; btn.textContent='Ingresar';
    if(res.ok){
      setSession(res.user);
      showApp();
    } else {
      errBox.textContent = res.error || 'Usuario o contraseña incorrectos';
      errBox.style.display='block';
    }
  }).catch(function(){
    btn.disabled=false; btn.textContent='Ingresar';
    errBox.textContent='No se pudo conectar con el servidor. Revisá tu conexión.';
    errBox.style.display='block';
  });
}
function doLogout(){
  clearSession();
  document.getElementById('app').style.display='none';
  document.getElementById('login-overlay').style.display='flex';
  document.getElementById('lu').value='';
  document.getElementById('lp').value='';
}
function checkSession(){
  var s = getSession();
  if(!s || !apiConfigured()) return;
  showApp();
}
function showApp(){
  document.getElementById('login-overlay').style.display='none';
  document.getElementById('app').style.display='block';
  initApp();
}

// ── APP INIT / ROLES ───────────────────────────────────────────────────
var STATE = null;
function initApp(){
  var s = getSession();
  document.getElementById('hdr-user').textContent = (s.nombre||s.email) + (s.rol==='supervisor'?' · Supervisor':'');
  document.querySelectorAll('.rol-supervisor').forEach(function(el){ el.style.display = s.rol==='supervisor' ? '' : 'none'; });
  document.querySelectorAll('.rol-empleado').forEach(function(el){ el.style.display = s.rol==='empleado' ? '' : 'none'; });
  var hoy = fmtISO(new Date());
  if(!document.getElementById('pan-desde').value) document.getElementById('pan-desde').value = hoy;
  loadState(true);
}
function loadState(isInitial){
  api('getState',{}).then(function(res){
    if(!res.ok){
      if(res.error==='No autorizado'){ doLogout(); }
      return;
    }
    STATE = res;
    var s = getSession();
    if(s.rol==='supervisor'){ refreshGrupoSelects(); refreshPanIntegranteSelect(); }
    if(isInitial){
      if(s.rol==='supervisor') goTab('panorama', document.querySelector('.tab.rol-supervisor'));
      else goTab('midiagrama', document.querySelector('.tab.rol-empleado'));
    } else {
      refreshCurrentView();
    }
  }).catch(function(){});
}
function refreshCurrentView(){
  if(STATE.grupos && currentGrupoId && !STATE.grupos.find(function(g){return g.id===currentGrupoId;})) currentGrupoId=null;
  if(document.getElementById('sec-panorama').classList.contains('on')) renderPanorama();
  if(document.getElementById('sec-grupos').classList.contains('on')) renderGrupos();
  if(document.getElementById('sec-vacaciones').classList.contains('on')) renderVacacionesTab();
  if(document.getElementById('sec-midiagrama').classList.contains('on')){ renderMiDiagrama(); renderMisNovedades(); }
}

// ── TABS ────────────────────────────────────────────────────────────────
function goTab(id,btn){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('on');});
  document.querySelectorAll('.sec').forEach(function(s){s.classList.remove('on');});
  if(btn) btn.classList.add('on');
  document.getElementById('sec-'+id).classList.add('on');
  if(id==='panorama') renderPanorama();
  if(id==='grupos') renderGrupos();
  if(id==='vacaciones') renderVacacionesTab();
  if(id==='midiagrama'){ renderMiDiagrama(); renderMisNovedades(); }
}

// ── FECHAS / PATRÓN ────────────────────────────────────────────────────
function fmtISO(d){
  var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function parseISO(s){
  var p=String(s).split('-'); return new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
}
function addDays(d,n){ var r=new Date(d); r.setDate(r.getDate()+n); return r; }
function diffDays(a,b){ return Math.round((a-b)/86400000); }

function statusFor(integrante, iso, novedades){
  var nov = (novedades||[]).find(function(n){
    return n.integranteId===integrante.id && n.estado!=='rechazada' && iso>=n.desde && iso<=n.hasta;
  });
  if(nov) return nov.tipo;
  if(!integrante.inicio) return 'F';
  var start = parseISO(integrante.inicio);
  var d = parseISO(iso);
  var dd = diffDays(d,start);
  var cycleLen = Number(integrante.on) + Number(integrante.off);
  var cycleNum = Math.floor(dd/cycleLen);
  var offset = dd - cycleNum*cycleLen;
  if(offset < Number(integrante.on)){
    if(integrante.turno==='D') return 'D';
    if(integrante.turno==='N') return 'N';
    var parity = ((cycleNum % 2) + 2) % 2;
    return parity===0 ? 'D' : 'N';
  }
  return 'F';
}
function statusLabel(s){
  return {D:'Día',N:'Noche',F:'Franco',V:'Vacaciones',L:'Licencia/Médico'}[s]||s;
}
function patronLabel(integrante){
  var on=Number(integrante.on), off=Number(integrante.off);
  var std = {14:{14:'14x14'},7:{7:'7x7',14:'7x14'}};
  var lbl = (std[on]&&std[on][off]) || (on+'x'+off);
  var turnoLbl = integrante.turno==='D'?'Día fijo':integrante.turno==='N'?'Noche fija':'Alterna D/N';
  return lbl+' · '+turnoLbl;
}
function fmtFechaAR(iso){ var p=String(iso).split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }

// ── GRUPOS ──────────────────────────────────────────────────────────────
var currentGrupoId = null;

function renderGrupos(){
  var wrap = document.getElementById('grupos-list');
  if(!STATE.grupos.length){
    wrap.innerHTML = '<div class="empty">Todavía no creaste ningún grupo.</div>';
  } else {
    wrap.innerHTML = STATE.grupos.map(function(g){
      var n = STATE.integrantes.filter(function(i){return i.grupoId===g.id;}).length;
      var on = g.id===currentGrupoId ? ' on' : '';
      return '<div class="grupo-item'+on+'" onclick="selectGrupo(\''+g.id+'\')">'+
        '<span class="grupo-dot" style="background:'+g.color+'"></span>'+
        '<span class="grupo-name">'+escapeHtml(g.nombre)+'</span>'+
        '<span class="grupo-count">'+n+' integrante'+(n===1?'':'s')+'</span>'+
        '<span class="grupo-actions">'+
          '<button class="icon-btn" title="Editar" onclick="event.stopPropagation();openGrupoModal(\''+g.id+'\')">✎</button>'+
          '<button class="icon-btn" title="Eliminar" onclick="event.stopPropagation();deleteGrupo(\''+g.id+'\')">🗑</button>'+
        '</span></div>';
    }).join('');
  }
  refreshGrupoSelects();
  refreshPanIntegranteSelect();
  renderIntegrantes();
}
function refreshGrupoSelects(){
  var panSel = document.getElementById('pan-grupo');
  var cur = panSel.value;
  panSel.innerHTML = '<option value="">Todos los grupos</option>'+
    STATE.grupos.map(function(g){return '<option value="'+g.id+'">'+escapeHtml(g.nombre)+'</option>';}).join('');
  panSel.value = cur;
}
function selectGrupo(id){ currentGrupoId = id; renderGrupos(); }

function openGrupoModal(id){
  document.getElementById('grupo-id').value = id||'';
  if(id){
    var g = STATE.grupos.find(function(x){return x.id===id;});
    document.getElementById('grupo-modal-title').textContent='Editar grupo';
    document.getElementById('grupo-nombre').value=g.nombre;
    document.getElementById('grupo-color').value=g.color;
  } else {
    document.getElementById('grupo-modal-title').textContent='Nuevo grupo';
    document.getElementById('grupo-nombre').value='';
    document.getElementById('grupo-color').value='#F5DFA8';
  }
  document.getElementById('modal-grupo').style.display='flex';
}
function saveGrupo(){
  var id = document.getElementById('grupo-id').value;
  var nombre = document.getElementById('grupo-nombre').value.trim();
  var color = document.getElementById('grupo-color').value;
  if(!nombre){ alert('Poné un nombre para el grupo'); return; }
  api('saveGrupo',{grupo:{id:id||undefined, nombre:nombre, color:color}}).then(function(res){
    if(!res.ok){ alert(res.error||'No se pudo guardar'); return; }
    currentGrupoId = res.id;
    closeModal('modal-grupo');
    loadState();
  });
}
function deleteGrupo(id){
  var g = STATE.grupos.find(function(x){return x.id===id;});
  var n = STATE.integrantes.filter(function(i){return i.grupoId===id;}).length;
  if(!confirm('¿Eliminar el grupo "'+g.nombre+'"'+(n?' y sus '+n+' integrantes':'')+'? Esta acción no se puede deshacer.')) return;
  api('deleteGrupo',{id:id}).then(function(res){
    if(!res.ok){ alert(res.error||'No se pudo eliminar'); return; }
    if(currentGrupoId===id) currentGrupoId=null;
    loadState();
  });
}

// ── INTEGRANTES ─────────────────────────────────────────────────────────
function renderIntegrantes(){
  var empty = document.getElementById('integrantes-empty');
  var tbl = document.getElementById('integrantes-tbl');
  var h = document.getElementById('integrantes-h');
  var btnAdd = document.getElementById('btn-add-integrante');
  if(!currentGrupoId){
    empty.style.display='block'; tbl.style.display='none';
    empty.textContent='Seleccioná un grupo para ver o cargar sus integrantes.';
    h.textContent='Integrantes'; btnAdd.disabled=true;
    return;
  }
  var g = STATE.grupos.find(function(x){return x.id===currentGrupoId;});
  h.textContent = 'Integrantes — '+g.nombre;
  btnAdd.disabled=false;
  var miembros = STATE.integrantes.filter(function(i){return i.grupoId===currentGrupoId;});
  if(!miembros.length){
    empty.style.display='block'; tbl.style.display='none';
    empty.textContent='Este grupo todavía no tiene integrantes.';
    return;
  }
  empty.style.display='none'; tbl.style.display='table';
  document.getElementById('integrantes-tbody').innerHTML = miembros.map(function(i){
    var turnoLbl = i.turno==='D'?'Día':i.turno==='N'?'Noche':'Alterna';
    var acceso = (STATE.accesos||[]).find(function(a){return a.integranteId===i.id;});
    return '<tr><td>'+escapeHtml(i.nombre)+'</td>'+
      '<td>'+patronLabel(i).split(' · ')[0]+'</td>'+
      '<td>'+turnoLbl+'</td>'+
      '<td>'+(acceso?'<span class="badge badge-ok" title="'+escapeHtml(acceso.email)+'">Habilitado</span>':'<span class="badge">Sin acceso</span>')+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="icon-btn" title="Editar" onclick="openIntegranteModal(\''+i.id+'\')">✎</button>'+
        '<button class="icon-btn" title="Eliminar" onclick="deleteIntegrante(\''+i.id+'\')">🗑</button>'+
      '</td></tr>';
  }).join('');
}

function onPatronChange(){
  var v = document.getElementById('integrante-patron').value;
  document.getElementById('custom-dias-row').style.display = v==='custom' ? 'flex' : 'none';
}
function onAccesoChange(){
  document.getElementById('acceso-fields').style.display = document.getElementById('integrante-acceso').checked ? 'block' : 'none';
}
function generarClave(){
  var chars='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var out='';
  for(var i=0;i<8;i++) out+=chars[Math.floor(Math.random()*chars.length)];
  document.getElementById('integrante-acceso-clave').value=out;
}
function openIntegranteModal(id){
  document.getElementById('integrante-id').value = id||'';
  var stdSel = document.getElementById('integrante-patron');
  document.getElementById('integrante-acceso').checked=false;
  document.getElementById('integrante-acceso-email').value='';
  document.getElementById('integrante-acceso-clave').value='';
  onAccesoChange();
  if(id){
    var i = STATE.integrantes.find(function(x){return x.id===id;});
    document.getElementById('integrante-modal-title').textContent='Editar integrante';
    document.getElementById('integrante-nombre').value=i.nombre;
    var on=Number(i.on), off=Number(i.off);
    var std = (on===14&&off===14) ? '14x14' : (on===7&&off===7) ? '7x7' : (on===7&&off===14) ? '7x14' : 'custom';
    stdSel.value = std;
    document.getElementById('integrante-on').value=on;
    document.getElementById('integrante-off').value=off;
    document.getElementById('integrante-turno').value=i.turno;
    document.getElementById('integrante-inicio').value=i.inicio||'';
    var acceso = (STATE.accesos||[]).find(function(a){return a.integranteId===i.id;});
    if(acceso){
      document.getElementById('integrante-acceso').checked=true;
      document.getElementById('integrante-acceso-email').value=acceso.email;
      onAccesoChange();
    }
  } else {
    document.getElementById('integrante-modal-title').textContent='Nuevo integrante';
    document.getElementById('integrante-nombre').value='';
    stdSel.value='14x14';
    document.getElementById('integrante-on').value=14;
    document.getElementById('integrante-off').value=14;
    document.getElementById('integrante-turno').value='D';
    document.getElementById('integrante-inicio').value=fmtISO(new Date());
  }
  onPatronChange();
  document.getElementById('modal-integrante').style.display='flex';
}
function saveIntegrante(){
  var id = document.getElementById('integrante-id').value;
  var nombre = document.getElementById('integrante-nombre').value.trim();
  if(!nombre){ alert('Poné el nombre del integrante'); return; }
  var std = document.getElementById('integrante-patron').value;
  var on,off;
  if(std==='14x14'){on=14;off=14;}
  else if(std==='7x7'){on=7;off=7;}
  else if(std==='7x14'){on=7;off=14;}
  else { on=parseInt(document.getElementById('integrante-on').value)||1; off=parseInt(document.getElementById('integrante-off').value)||1; }
  var turno = document.getElementById('integrante-turno').value;
  var inicio = document.getElementById('integrante-inicio').value;
  if(!inicio){ alert('Poné la fecha de inicio de ciclo'); return; }
  var habilitar = document.getElementById('integrante-acceso').checked;
  var accesoEmail = document.getElementById('integrante-acceso-email').value.trim();
  var accesoClave = document.getElementById('integrante-acceso-clave').value.trim();
  if(habilitar && !accesoEmail){ alert('Poné un email de acceso para el integrante'); return; }
  var integrante = {id:id||undefined, grupoId:currentGrupoId, nombre:nombre, on:on, off:off, turno:turno, inicio:inicio};
  var acceso = habilitar ? {habilitar:true, email:accesoEmail, clave:accesoClave||undefined} : {habilitar:false};
  api('saveIntegrante',{integrante:integrante, acceso:acceso}).then(function(res){
    if(!res.ok){ alert(res.error||'No se pudo guardar'); return; }
    closeModal('modal-integrante');
    loadState();
  });
}
function deleteIntegrante(id){
  var i = STATE.integrantes.find(function(x){return x.id===id;});
  if(!confirm('¿Eliminar a "'+i.nombre+'"? Si tenía acceso habilitado, también se le quita.')) return;
  api('deleteIntegrante',{id:id}).then(function(res){
    if(!res.ok){ alert(res.error||'No se pudo eliminar'); return; }
    loadState();
  });
}

// ── MODALES GENÉRICO ────────────────────────────────────────────────────
function closeModal(id){ document.getElementById(id).style.display='none'; }

// ── CARGA MASIVA (CSV) ──────────────────────────────────────────────────
var CSV_HEADERS = ['Grupo','Nombre y Apellido','Patron (14x14/7x7/7x14/NxM)','Turno (D/N/ALT)','Fecha inicio ciclo (AAAA-MM-DD)','Email acceso (opcional)','Clave acceso (opcional)'];
function csvEscape(v){
  v = String(v==null?'':v);
  if(/[",\r\n]/.test(v)) return '"'+v.replace(/"/g,'""')+'"';
  return v;
}
function descargarPlantilla(){
  var ejemplo = ['SHELL','Juan Perez','14x14','D','2026-08-21','juan@empresa.com',''];
  var rows = [CSV_HEADERS, ejemplo];
  var csv = rows.map(function(r){ return r.map(csvEscape).join(','); }).join('\r\n');
  var blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'plantilla-integrantes.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function parseCSV(text){
  var rows = []; var row = []; var field=''; var inQuotes=false;
  for(var i=0;i<text.length;i++){
    var c = text[i];
    if(inQuotes){
      if(c === '"'){ if(text[i+1] === '"'){ field+='"'; i++; } else { inQuotes=false; } }
      else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\n' || c === '\r'){
        if(c === '\r' && text[i+1] === '\n') i++;
        row.push(field); field=''; rows.push(row); row=[];
      } else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows.filter(function(r){ return r.length>1 || (r[0]||'').trim()!==''; });
}
function parsePatronCSV(s){
  s = String(s||'').trim().toLowerCase();
  var std = {'14x14':[14,14],'7x7':[7,7],'7x14':[7,14]};
  if(std[s]) return std[s];
  var m = s.match(/^(\d+)\s*x\s*(\d+)$/);
  if(m) return [parseInt(m[1]), parseInt(m[2])];
  return null;
}
function parseTurnoCSV(s){
  s = String(s||'').trim().toUpperCase();
  return (s==='D'||s==='N'||s==='ALT') ? s : 'D';
}
function normalizeFechaCSV(s){
  s = String(s||'').trim();
  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)){
    var p = s.split('-'); return p[0]+'-'+p[1].padStart(2,'0')+'-'+p[2].padStart(2,'0');
  }
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
  return null;
}
var PALETA_GRUPOS = ['#F5DFA8','#E8A33D','#5C7FBF','#8B6FD1','#E1543F','#7BC496','#D18FD1','#6FA8BF'];
function importarCSV(ev){
  var file = ev.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(){
    procesarImportCSV(reader.result);
  };
  reader.readAsText(file);
}
function procesarImportCSV(text){
  var resBox = document.getElementById('import-resultado');
  var rows = parseCSV(text);
  if(rows.length < 2){
    resBox.innerHTML = '<div class="empty">El archivo no tiene filas para importar.</div>';
    document.getElementById('import-csv-file').value='';
    return;
  }
  var dataRows = rows.slice(1);
  var grupoCache = {};
  STATE.grupos.forEach(function(g){ grupoCache[g.nombre.trim().toLowerCase()] = g.id; });
  var creados=0, gruposCreados=0, errores=[], idx=0;

  function siguiente(){
    if(idx >= dataRows.length){ return terminar(); }
    var r = dataRows[idx]; var fila = idx+2; idx++;
    var grupoNombre = (r[0]||'').trim();
    var nombre = (r[1]||'').trim();
    if(!grupoNombre && !nombre) return siguiente();
    if(!grupoNombre || !nombre){ errores.push('Fila '+fila+': falta grupo o nombre'); return siguiente(); }
    resBox.innerHTML = '<div class="empty">Importando fila '+fila+' de '+(dataRows.length+1)+'...</div>';

    var patron = parsePatronCSV(r[2]);
    if(!patron){ errores.push('Fila '+fila+': patrón inválido ("'+(r[2]||'')+'")'); return siguiente(); }
    var turno = parseTurnoCSV(r[3]);
    var inicio = normalizeFechaCSV(r[4]);
    if(!inicio){ errores.push('Fila '+fila+': fecha inválida ("'+(r[4]||'')+'"), usá AAAA-MM-DD'); return siguiente(); }
    var accesoEmail = (r[5]||'').trim();
    var accesoClave = (r[6]||'').trim();

    function conGrupo(grupoId){
      var integrante = {grupoId:grupoId, nombre:nombre, on:patron[0], off:patron[1], turno:turno, inicio:inicio};
      var acceso = accesoEmail ? {habilitar:true, email:accesoEmail, clave:accesoClave||undefined} : undefined;
      api('saveIntegrante',{integrante:integrante, acceso:acceso}).then(function(iRes){
        if(!iRes.ok) errores.push('Fila '+fila+': '+(iRes.error||'no se pudo guardar'));
        else creados++;
        siguiente();
      });
    }

    var grupoId = grupoCache[grupoNombre.toLowerCase()];
    if(grupoId){ conGrupo(grupoId); }
    else {
      var color = PALETA_GRUPOS[gruposCreados % PALETA_GRUPOS.length];
      api('saveGrupo',{grupo:{nombre:grupoNombre, color:color}}).then(function(gRes){
        if(!gRes.ok){ errores.push('Fila '+fila+': no se pudo crear el grupo "'+grupoNombre+'"'); return siguiente(); }
        grupoCache[grupoNombre.toLowerCase()] = gRes.id; gruposCreados++;
        conGrupo(gRes.id);
      });
    }
  }
  function terminar(){
    document.getElementById('import-csv-file').value='';
    loadState();
    resBox.innerHTML = '<div class="empty">Importados '+creados+' integrante'+(creados===1?'':'s')+
      (gruposCreados?' ('+gruposCreados+' grupo'+(gruposCreados===1?'':'s')+' nuevo'+(gruposCreados===1?'':'s')+')':'')+'.'+
      (errores.length? '<br><br><strong>Errores:</strong><br>'+errores.map(escapeHtml).join('<br>') : '')+'</div>';
  }
  siguiente();
}

// ── PANORAMA GENERAL (supervisor) ──────────────────────────────────────
function setPanHoy(){
  document.getElementById('pan-desde').value = fmtISO(new Date());
  renderPanorama();
}
function buildMatrixHtml(filas, fechas, novedades){
  var hoyIso = fmtISO(new Date());
  var monthCells = []; var i=0;
  while(i<fechas.length){
    var m = fechas[i].getMonth(), y=fechas[i].getFullYear(); var span=0;
    while(i<fechas.length && fechas[i].getMonth()===m && fechas[i].getFullYear()===y){ span++; i++; }
    monthCells.push('<th class="month-row" colspan="'+span+'">'+MESES[m]+' '+y+'</th>');
  }
  var dayHeaderCells = fechas.map(function(d){
    var isToday = fmtISO(d)===hoyIso;
    return '<th class="daycol'+(isToday?' today':'')+'"><span class="dow">'+DOW[d.getDay()]+'</span>'+d.getDate()+'</th>';
  }).join('');
  var body = filas.map(function(row){
    var cells = fechas.map(function(d){
      var iso = fmtISO(d);
      var s = statusFor(row.integrante, iso, novedades);
      var isToday = iso===hoyIso;
      return '<td class="daycell daycell-'+s+(isToday?' today':'')+'" title="'+escapeHtml(row.integrante.nombre)+' — '+fmtFechaAR(iso)+': '+statusLabel(s)+'"></td>';
    }).join('');
    return '<tr><td class="namecell">'+escapeHtml(row.label)+'<span class="sub">'+patronLabel(row.integrante)+'</span></td>'+cells+'</tr>';
  }).join('');
  return '<table class="matrix"><thead>'+
    '<tr><th class="corner"></th>'+monthCells.join('')+'</tr>'+
    '<tr><th class="corner">Integrante</th>'+dayHeaderCells+'</tr>'+
    '</thead><tbody>'+body+'</tbody></table>';
}
function buildMatrixHtmlVertical(cols, fechas, novedades){
  var hoyIso = fmtISO(new Date());
  var headerCells = cols.map(function(c){
    return '<th class="namecol">'+escapeHtml(c.label)+'<span class="sub">'+patronLabel(c.integrante)+'</span></th>';
  }).join('');
  var body = ''; var prevKey = null;
  fechas.forEach(function(d){
    var iso = fmtISO(d);
    var monthKey = d.getFullYear()+'-'+d.getMonth();
    if(monthKey !== prevKey){
      body += '<tr class="month-sep"><td colspan="'+(cols.length+1)+'">'+MESES[d.getMonth()]+' '+d.getFullYear()+'</td></tr>';
      prevKey = monthKey;
    }
    var isToday = iso===hoyIso;
    var cells = cols.map(function(c){
      var s = statusFor(c.integrante, iso, novedades);
      return '<td class="daycell daycell-'+s+(isToday?' today':'')+'" title="'+escapeHtml(c.integrante.nombre)+' — '+fmtFechaAR(iso)+': '+statusLabel(s)+'"></td>';
    }).join('');
    body += '<tr><td class="datecell'+(isToday?' today':'')+'"><span class="dow">'+DOW[d.getDay()]+'</span>'+d.getDate()+'</td>'+cells+'</tr>';
  });
  return '<table class="matrix-v"><thead><tr><th class="corner">Fecha</th>'+headerCells+'</tr></thead><tbody>'+body+'</tbody></table>';
}
function onPanGrupoChange(){
  refreshPanIntegranteSelect();
  renderPanorama();
}
function refreshPanIntegranteSelect(){
  var grupoFiltro = document.getElementById('pan-grupo').value;
  var sel = document.getElementById('pan-integrante');
  var cur = sel.value;
  var miembros = STATE.integrantes.filter(function(i){ return !grupoFiltro || i.grupoId===grupoFiltro; });
  sel.innerHTML = '<option value="">Todos</option>'+
    miembros.map(function(i){ return '<option value="'+i.id+'">'+escapeHtml(i.nombre)+'</option>'; }).join('');
  if(miembros.find(function(i){return i.id===cur;})) sel.value = cur; else sel.value='';
}
function renderPanorama(){
  if(!STATE || !STATE.grupos) return;
  var wrap = document.getElementById('pan-wrap');
  var emptyBox = document.getElementById('pan-empty');
  if(!STATE.grupos.length || !STATE.integrantes.length){
    emptyBox.style.display='block'; wrap.innerHTML=''; return;
  }
  emptyBox.style.display='none';
  var grupoFiltro = document.getElementById('pan-grupo').value;
  var integranteFiltro = document.getElementById('pan-integrante').value;
  var desdeStr = document.getElementById('pan-desde').value || fmtISO(new Date());
  var dias = parseInt(document.getElementById('pan-dias').value)||31;
  var desde = parseISO(desdeStr);
  var fechas = []; for(var k=0;k<dias;k++) fechas.push(addDays(desde,k));
  var grupos = grupoFiltro ? STATE.grupos.filter(function(g){return g.id===grupoFiltro;}) : STATE.grupos;

  var html = '';
  grupos.forEach(function(g){
    var miembros = STATE.integrantes.filter(function(i){
      return i.grupoId===g.id && (!integranteFiltro || i.id===integranteFiltro);
    });
    if(!miembros.length) return;
    var cols = miembros.map(function(m){ return {integrante:m, label:m.nombre}; });
    html += '<div style="margin-top:14px;font-weight:700;color:var(--accent2)">'+escapeHtml(g.nombre)+'</div>';
    html += buildMatrixHtmlVertical(cols, fechas, STATE.novedades);
  });
  wrap.innerHTML = html;
}

// ── VACACIONES Y COBERTURA (supervisor) ────────────────────────────────
function renderVacacionesTab(){
  if(!STATE || !STATE.grupos) return;
  var sel = document.getElementById('vac-persona');
  var cur = sel.value;
  var opts = STATE.grupos.map(function(g){
    var miembros = STATE.integrantes.filter(function(i){return i.grupoId===g.id;});
    if(!miembros.length) return '';
    return '<optgroup label="'+escapeHtml(g.nombre)+'">'+
      miembros.map(function(m){return '<option value="'+m.id+'">'+escapeHtml(m.nombre)+'</option>';}).join('')+
      '</optgroup>';
  }).join('');
  sel.innerHTML = opts || '<option value="">Sin integrantes cargados</option>';
  sel.value = cur;
  renderPendientes();
  renderNovedadesTable();
}
function renderPendientes(){
  var wrap = document.getElementById('pendientes-wrap');
  var pendientes = STATE.novedades.filter(function(n){return n.estado==='pendiente';});
  if(!pendientes.length){ wrap.innerHTML='<div class="empty">Sin solicitudes pendientes</div>'; return; }
  wrap.innerHTML = pendientes.map(function(n){
    var m = STATE.integrantes.find(function(i){return i.id===n.integranteId;});
    return '<div class="cov-card partial">'+
      '<div><div class="cov-name">'+(m?escapeHtml(m.nombre):'(?)')+' — '+(n.tipo==='V'?'Vacaciones':'Licencia/Médico')+'</div>'+
      '<div class="cov-meta">'+fmtFechaAR(n.desde)+' al '+fmtFechaAR(n.hasta)+'</div></div>'+
      '<div style="display:flex;gap:6px">'+
        '<button class="btn btn-sm" onclick="resolverNovedad(\''+n.id+'\',\'aprobada\')">Aprobar</button>'+
        '<button class="btn-ghost btn-sm" onclick="resolverNovedad(\''+n.id+'\',\'rechazada\')">Rechazar</button>'+
      '</div></div>';
  }).join('');
}
function resolverNovedad(id, estado){
  api('resolverNovedad',{id:id, estado:estado}).then(function(res){
    if(!res.ok){ alert(res.error||'No se pudo actualizar'); return; }
    loadState();
  });
}
function renderNovedadesTable(){
  var tbody = document.getElementById('novedades-tbody');
  if(!STATE.novedades.length){
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Sin novedades cargadas</td></tr>';
    return;
  }
  var rows = STATE.novedades.slice().sort(function(a,b){return a.desde<b.desde?1:-1;});
  tbody.innerHTML = rows.map(function(n){
    var m = STATE.integrantes.find(function(i){return i.id===n.integranteId;});
    return '<tr><td>'+(m?escapeHtml(m.nombre):'(eliminado)')+'</td>'+
      '<td>'+(n.tipo==='V'?'Vacaciones':'Licencia/Médico')+'</td>'+
      '<td>'+fmtFechaAR(n.desde)+'</td><td>'+fmtFechaAR(n.hasta)+'</td>'+
      '<td>'+estadoBadge(n.estado)+'</td>'+
      '<td><button class="icon-btn" title="Eliminar" onclick="deleteNovedad(\''+n.id+'\')">🗑</button></td></tr>';
  }).join('');
}
function estadoBadge(estado){
  if(estado==='pendiente') return '<span class="badge badge-warn">Pendiente</span>';
  if(estado==='rechazada') return '<span class="badge badge-bad">Rechazada</span>';
  return '<span class="badge badge-ok">Aprobada</span>';
}
function deleteNovedad(id){
  api('deleteNovedad',{id:id}).then(function(res){
    if(!res.ok){ alert(res.error||'No se pudo eliminar'); return; }
    loadState();
  });
}
function buscarCobertura(){
  var personaId = document.getElementById('vac-persona').value;
  var desde = document.getElementById('vac-desde').value;
  var hasta = document.getElementById('vac-hasta').value;
  var tipo = document.getElementById('vac-tipo').value;
  var resBox = document.getElementById('vac-resultado');
  if(!personaId){ resBox.innerHTML='<div class="empty">Elegí un integrante.</div>'; return; }
  if(!desde || !hasta || hasta<desde){ resBox.innerHTML='<div class="empty">Elegí un rango de fechas válido.</div>'; return; }

  var persona = STATE.integrantes.find(function(i){return i.id===personaId;});
  api('saveNovedad',{novedad:{integranteId:personaId, tipo:tipo, desde:desde, hasta:hasta, estado:'aprobada'}}).then(function(res){
    if(!res.ok){ resBox.innerHTML='<div class="empty">'+(res.error||'No se pudo guardar')+'</div>'; return; }
    loadState();
    mostrarCobertura(persona, desde, hasta);
  });
}
function mostrarCobertura(persona, desde, hasta){
  var resBox = document.getElementById('vac-resultado');
  var isos=[]; var d=parseISO(desde); var end=parseISO(hasta);
  while(d<=end){ isos.push(fmtISO(d)); d=addDays(d,1); }

  var candidatos = STATE.integrantes.filter(function(i){return i.id!==persona.id;});
  var mismoGrupo = candidatos.filter(function(i){return i.grupoId===persona.grupoId;});
  var pool = mismoGrupo.length ? mismoGrupo : candidatos;

  var evaluados = pool.map(function(i){
    var libres = 0;
    isos.forEach(function(iso){ if(statusFor(i,iso,STATE.novedades)==='F') libres++; });
    return {integrante:i, libres:libres, total:isos.length, pct: isos.length? (libres/isos.length*100) : 0};
  }).filter(function(e){return e.libres>0;});
  evaluados.sort(function(a,b){return b.pct-a.pct;});
  evaluados = evaluados.slice(0,8);

  if(!evaluados.length){
    resBox.innerHTML = '<div class="empty">No se encontró personal con francos disponibles en ese rango'+(mismoGrupo.length?' dentro del mismo grupo':'')+'.</div>';
    return;
  }
  resBox.innerHTML = '<div style="margin-top:10px;font-size:.78rem;color:var(--txt3)">'+
    'Cobertura sugerida para '+escapeHtml(persona.nombre)+' ('+fmtFechaAR(desde)+' al '+fmtFechaAR(hasta)+', '+isos.length+' días)'+
    (mismoGrupo.length?'':' — sin otros integrantes en su grupo, se muestran de todos los grupos')+
    '</div>'+
    evaluados.map(function(e){
      var full = e.libres===e.total;
      return '<div class="cov-card '+(full?'full':'partial')+'">'+
        '<div><div class="cov-name">'+escapeHtml(e.integrante.nombre)+'</div>'+
        '<div class="cov-meta">'+patronLabel(e.integrante)+' · libre '+e.libres+' de '+e.total+' días</div></div>'+
        '<div class="cov-pct '+(full?'full':'partial')+'">'+Math.round(e.pct)+'%</div></div>';
    }).join('');
}

// ── MI DIAGRAMA (empleado) ─────────────────────────────────────────────
function renderMiDiagrama(){
  if(!STATE || STATE.rol!=='empleado') return;
  var wrap = document.getElementById('mid-wrap');
  document.getElementById('mid-titulo').textContent = 'Mi diagrama — '+(STATE.nombre||'');
  if(!STATE.integrante){
    wrap.innerHTML = '<div class="empty">No se encontró tu diagrama. Avisale a tu supervisor.</div>';
    return;
  }
  var desde = addDays(new Date(),-7);
  var fechas = []; for(var k=0;k<45;k++) fechas.push(addDays(desde,k));
  var filas = [{integrante:STATE.integrante, label:STATE.integrante.nombre}];
  wrap.innerHTML = buildMatrixHtml(filas, fechas, STATE.novedades);
}
function renderMisNovedades(){
  if(!STATE || STATE.rol!=='empleado') return;
  var tbody = document.getElementById('mid-novedades-tbody');
  if(!STATE.novedades.length){ tbody.innerHTML='<tr><td colspan="4" class="empty">Todavía no pediste nada</td></tr>'; return; }
  var rows = STATE.novedades.slice().sort(function(a,b){return a.desde<b.desde?1:-1;});
  tbody.innerHTML = rows.map(function(n){
    return '<tr><td>'+(n.tipo==='V'?'Vacaciones':'Licencia/Médico')+'</td>'+
      '<td>'+fmtFechaAR(n.desde)+'</td><td>'+fmtFechaAR(n.hasta)+'</td><td>'+estadoBadge(n.estado)+'</td></tr>';
  }).join('');
}
function pedirNovedad(){
  var msg = document.getElementById('mid-msg');
  var desde = document.getElementById('mid-desde').value;
  var hasta = document.getElementById('mid-hasta').value;
  var tipo = document.getElementById('mid-tipo').value;
  if(!desde||!hasta||hasta<desde){ msg.innerHTML='<div class="empty">Elegí un rango de fechas válido.</div>'; return; }
  api('saveNovedad',{novedad:{integranteId:STATE.integrante.id, tipo:tipo, desde:desde, hasta:hasta}}).then(function(res){
    if(!res.ok){ msg.innerHTML='<div class="empty">'+(res.error||'No se pudo enviar')+'</div>'; return; }
    msg.innerHTML='<div class="empty">Pedido enviado, queda pendiente de aprobación.</div>';
    loadState();
  });
}

// ── UTIL ────────────────────────────────────────────────────────────────
function escapeHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── INSTALAR COMO APP (PWA) ─────────────────────────────────────────────
var deferredInstallPrompt = null;
function isIos(){ return /iphone|ipad|ipod/i.test(window.navigator.userAgent); }
function isStandalone(){ return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone===true; }
window.addEventListener('beforeinstallprompt', function(e){
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});
function showInstallBanner(){
  if(isStandalone() || localStorage.getItem('crono_install_dismissed')==='1') return;
  if(!deferredInstallPrompt && !isIos()) return;
  document.getElementById('install-banner').style.display='flex';
}
function dismissInstallBanner(){
  localStorage.setItem('crono_install_dismissed','1');
  document.getElementById('install-banner').style.display='none';
}
function handleInstallClick(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(function(){ deferredInstallPrompt=null; dismissInstallBanner(); });
  } else if(isIos()){
    document.getElementById('ios-install-modal').style.display='flex';
  }
}
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){ navigator.serviceWorker.register('service-worker.js').catch(function(){}); });
}

// ── TEMAS ───────────────────────────────────────────────────────────────
var TEMAS = ['hueso','pizarra','bosque','medianoche'];
function setTheme(t){
  if(TEMAS.indexOf(t)===-1) t='hueso';
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem('crono-theme', t); }catch(e){}
  ['theme-picker','theme-picker-login'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.value = t;
  });
  var meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
}
function initTheme(){
  var saved = 'hueso';
  try{ saved = localStorage.getItem('crono-theme') || 'hueso'; }catch(e){}
  setTheme(saved);
}

// ── BOOT ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  initTheme();
  checkSession();
  if(isIos()) showInstallBanner();
});
var lpEl = document.getElementById('lp');
if(lpEl) lpEl.addEventListener('keydown', function(e){ if(e.key==='Enter') doLogin(); });
