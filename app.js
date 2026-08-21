// ── CONFIG ──────────────────────────────────────────────────────────────
// Usuarios de acceso. Esto NO es seguridad real (es un archivo estático
// del lado del cliente) — es solo un candado para que no entre cualquiera.
// Para cambiar usuario/clave, editá este objeto y volvé a publicar.
var CONFIG = {
  users: {
    'admin': { pass: 'crono2026', name: 'Supervisor' }
  }
};
var STORE_KEY = 'cronoturnos_v1';
var DOW = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── STATE / PERSISTENCIA ───────────────────────────────────────────────
var STATE = null;
function loadState(){
  try{
    var raw = localStorage.getItem(STORE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return { grupos: [], integrantes: [], novedades: [] };
}
function saveState(){
  localStorage.setItem(STORE_KEY, JSON.stringify(STATE));
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

// ── LOGIN ───────────────────────────────────────────────────────────────
function doLogin(){
  var u=(document.getElementById('lu').value||'').trim().toLowerCase();
  var p=(document.getElementById('lp').value||'').trim();
  var usr=CONFIG.users[u];
  if(usr && p===usr.pass){
    localStorage.setItem('crono_session', JSON.stringify({u:u,name:usr.name}));
    document.getElementById('login-overlay').style.display='none';
    document.getElementById('app').style.display='block';
    initApp();
  } else {
    document.getElementById('lerr').style.display='block';
  }
}
function doLogout(){
  localStorage.removeItem('crono_session');
  document.getElementById('app').style.display='none';
  document.getElementById('login-overlay').style.display='flex';
  document.getElementById('lu').value='';
  document.getElementById('lp').value='';
}
function checkSession(){
  var raw=localStorage.getItem('crono_session');
  if(!raw) return;
  try{
    var s=JSON.parse(raw);
    document.getElementById('login-overlay').style.display='none';
    document.getElementById('app').style.display='block';
    initApp();
  }catch(e){}
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
}

function initApp(){
  STATE = loadState();
  var raw=localStorage.getItem('crono_session');
  if(raw){ try{ document.getElementById('hdr-user').textContent = JSON.parse(raw).name||''; }catch(e){} }
  var hoy = new Date();
  document.getElementById('pan-desde').value = fmtISO(hoy);
  renderPanorama();
  renderGrupos();
  renderVacacionesTab();
}

// ── FECHAS / PATRÓN ────────────────────────────────────────────────────
function fmtISO(d){
  var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function parseISO(s){
  var p=s.split('-'); return new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
}
function addDays(d,n){ var r=new Date(d); r.setDate(r.getDate()+n); return r; }
function diffDays(a,b){ return Math.round((a-b)/86400000); }

// Devuelve 'D' | 'N' | 'F' | 'V' | 'L' para un integrante en una fecha dada (ISO string)
function statusFor(integrante, iso){
  var nov = STATE.novedades.find(function(n){
    return n.integranteId===integrante.id && iso>=n.desde && iso<=n.hasta;
  });
  if(nov) return nov.tipo;

  if(!integrante.inicio) return 'F';
  var start = parseISO(integrante.inicio);
  var d = parseISO(iso);
  var dd = diffDays(d,start);
  var cycleLen = integrante.on + integrante.off;
  var cycleNum = Math.floor(dd/cycleLen);
  var offset = dd - cycleNum*cycleLen;
  if(offset < integrante.on){
    if(integrante.turno==='D') return 'D';
    if(integrante.turno==='N') return 'N';
    // ALT: alterna día/noche en cada ciclo de trabajo
    var parity = ((cycleNum % 2) + 2) % 2;
    return parity===0 ? 'D' : 'N';
  }
  return 'F';
}
function statusLabel(s){
  return {D:'Día',N:'Noche',F:'Franco',V:'Vacaciones',L:'Licencia/Médico'}[s]||s;
}
function patronLabel(integrante){
  var std = {14:{14:'14x14'},7:{7:'7x7',14:'7x14'}};
  var lbl = (std[integrante.on]&&std[integrante.on][integrante.off]) || (integrante.on+'x'+integrante.off);
  var turnoLbl = integrante.turno==='D'?'Día fijo':integrante.turno==='N'?'Noche fija':'Alterna D/N';
  return lbl+' · '+turnoLbl;
}

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
  if(currentGrupoId && !STATE.grupos.find(function(g){return g.id===currentGrupoId;})) currentGrupoId=null;
  renderIntegrantes();
}
function refreshGrupoSelects(){
  var panSel = document.getElementById('pan-grupo');
  var cur = panSel.value;
  panSel.innerHTML = '<option value="">Todos los grupos</option>'+
    STATE.grupos.map(function(g){return '<option value="'+g.id+'">'+escapeHtml(g.nombre)+'</option>';}).join('');
  panSel.value = cur;
}
function selectGrupo(id){
  currentGrupoId = id;
  renderGrupos();
}
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
    document.getElementById('grupo-color').value='#2dd4bf';
  }
  document.getElementById('modal-grupo').style.display='flex';
}
function saveGrupo(){
  var id = document.getElementById('grupo-id').value;
  var nombre = document.getElementById('grupo-nombre').value.trim();
  var color = document.getElementById('grupo-color').value;
  if(!nombre){ alert('Poné un nombre para el grupo'); return; }
  if(id){
    var g = STATE.grupos.find(function(x){return x.id===id;});
    g.nombre=nombre; g.color=color;
  } else {
    var newId = uid();
    STATE.grupos.push({id:newId, nombre:nombre, color:color});
    currentGrupoId = newId;
  }
  saveState();
  closeModal('modal-grupo');
  renderGrupos();
}
function deleteGrupo(id){
  var g = STATE.grupos.find(function(x){return x.id===id;});
  var n = STATE.integrantes.filter(function(i){return i.grupoId===id;}).length;
  if(!confirm('¿Eliminar el grupo "'+g.nombre+'"'+(n?' y sus '+n+' integrantes':'')+'? Esta acción no se puede deshacer.')) return;
  var memberIds = STATE.integrantes.filter(function(i){return i.grupoId===id;}).map(function(i){return i.id;});
  STATE.integrantes = STATE.integrantes.filter(function(i){return i.grupoId!==id;});
  STATE.novedades = STATE.novedades.filter(function(n){return memberIds.indexOf(n.integranteId)<0;});
  STATE.grupos = STATE.grupos.filter(function(x){return x.id!==id;});
  if(currentGrupoId===id) currentGrupoId=null;
  saveState();
  renderGrupos();
}

// ── INTEGRANTES ─────────────────────────────────────────────────────────
function renderIntegrantes(){
  var empty = document.getElementById('integrantes-empty');
  var tbl = document.getElementById('integrantes-tbl');
  var h = document.getElementById('integrantes-h');
  var btnAdd = document.getElementById('btn-add-integrante');
  if(!currentGrupoId){
    empty.style.display='block'; tbl.style.display='none';
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
    return '<tr><td>'+escapeHtml(i.nombre)+'</td>'+
      '<td>'+patronLabel(i).split(' · ')[0]+'</td>'+
      '<td>'+turnoLbl+'</td>'+
      '<td>'+(i.inicio?fmtFechaAR(i.inicio):'-')+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="icon-btn" title="Editar" onclick="openIntegranteModal(\''+i.id+'\')">✎</button>'+
        '<button class="icon-btn" title="Eliminar" onclick="deleteIntegrante(\''+i.id+'\')">🗑</button>'+
      '</td></tr>';
  }).join('');
}
function fmtFechaAR(iso){ var p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }

function onPatronChange(){
  var v = document.getElementById('integrante-patron').value;
  var row = document.getElementById('custom-dias-row');
  row.style.display = v==='custom' ? 'flex' : 'none';
}
function openIntegranteModal(id){
  document.getElementById('integrante-id').value = id||'';
  var stdSel = document.getElementById('integrante-patron');
  if(id){
    var i = STATE.integrantes.find(function(x){return x.id===id;});
    document.getElementById('integrante-modal-title').textContent='Editar integrante';
    document.getElementById('integrante-nombre').value=i.nombre;
    var std = (i.on===14&&i.off===14) ? '14x14' : (i.on===7&&i.off===7) ? '7x7' : (i.on===7&&i.off===14) ? '7x14' : 'custom';
    stdSel.value = std;
    document.getElementById('integrante-on').value=i.on;
    document.getElementById('integrante-off').value=i.off;
    document.getElementById('integrante-turno').value=i.turno;
    document.getElementById('integrante-inicio').value=i.inicio||'';
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
  if(id){
    var i = STATE.integrantes.find(function(x){return x.id===id;});
    i.nombre=nombre; i.on=on; i.off=off; i.turno=turno; i.inicio=inicio;
  } else {
    STATE.integrantes.push({id:uid(), grupoId:currentGrupoId, nombre:nombre, on:on, off:off, turno:turno, inicio:inicio});
  }
  saveState();
  closeModal('modal-integrante');
  renderGrupos();
}
function deleteIntegrante(id){
  var i = STATE.integrantes.find(function(x){return x.id===id;});
  if(!confirm('¿Eliminar a "'+i.nombre+'"?')) return;
  STATE.integrantes = STATE.integrantes.filter(function(x){return x.id!==id;});
  STATE.novedades = STATE.novedades.filter(function(n){return n.integranteId!==id;});
  saveState();
  renderGrupos();
}

// ── MODALES GENÉRICO ────────────────────────────────────────────────────
function closeModal(id){ document.getElementById(id).style.display='none'; }

// ── PANORAMA GENERAL ───────────────────────────────────────────────────
function setPanHoy(){
  document.getElementById('pan-desde').value = fmtISO(new Date());
  renderPanorama();
}
function renderPanorama(){
  var wrap = document.getElementById('pan-wrap');
  var emptyBox = document.getElementById('pan-empty');
  if(!STATE.grupos.length || !STATE.integrantes.length){
    emptyBox.style.display='block'; wrap.innerHTML=''; return;
  }
  emptyBox.style.display='none';

  var grupoFiltro = document.getElementById('pan-grupo').value;
  var desdeStr = document.getElementById('pan-desde').value || fmtISO(new Date());
  var dias = parseInt(document.getElementById('pan-dias').value)||31;
  var desde = parseISO(desdeStr);
  var fechas = [];
  for(var k=0;k<dias;k++) fechas.push(addDays(desde,k));
  var isosArr = fechas.map(fmtISO);
  var hoyIso = fmtISO(new Date());

  var grupos = grupoFiltro ? STATE.grupos.filter(function(g){return g.id===grupoFiltro;}) : STATE.grupos;

  // fila de meses
  var monthCells = [];
  var i=0;
  while(i<fechas.length){
    var m = fechas[i].getMonth(), y=fechas[i].getFullYear();
    var span=0;
    while(i<fechas.length && fechas[i].getMonth()===m && fechas[i].getFullYear()===y){ span++; i++; }
    monthCells.push('<th class="month-row" colspan="'+span+'">'+MESES[m]+' '+y+'</th>');
  }

  var dayHeaderCells = fechas.map(function(d){
    var isToday = fmtISO(d)===hoyIso;
    return '<th class="daycol'+(isToday?' today':'')+'"><span class="dow">'+DOW[d.getDay()]+'</span>'+d.getDate()+'</th>';
  }).join('');

  var bodyRows = '';
  grupos.forEach(function(g){
    var miembros = STATE.integrantes.filter(function(i){return i.grupoId===g.id;});
    if(!miembros.length) return;
    bodyRows += '<tr class="group-sep"><td colspan="'+(fechas.length+1)+'">'+escapeHtml(g.nombre)+'</td></tr>';
    miembros.forEach(function(m){
      var cells = isosArr.map(function(iso){
        var s = statusFor(m,iso);
        var isToday = iso===hoyIso;
        return '<td class="daycell daycell-'+s+(isToday?' today':'')+'" title="'+escapeHtml(m.nombre)+' — '+fmtFechaAR(iso)+': '+statusLabel(s)+'"></td>';
      }).join('');
      bodyRows += '<tr><td class="namecell">'+escapeHtml(m.nombre)+'<span class="sub">'+patronLabel(m)+'</span></td>'+cells+'</tr>';
    });
  });

  var html = '<table class="matrix"><thead>'+
    '<tr><th class="corner"></th>'+monthCells.join('')+'</tr>'+
    '<tr><th class="corner">Integrante</th>'+dayHeaderCells+'</tr>'+
    '</thead><tbody>'+bodyRows+'</tbody></table>';
  wrap.innerHTML = html;
}

// ── VACACIONES Y COBERTURA ─────────────────────────────────────────────
function renderVacacionesTab(){
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
  renderNovedadesTable();
}
function renderNovedadesTable(){
  var tbody = document.getElementById('novedades-tbody');
  if(!STATE.novedades.length){
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Sin novedades cargadas</td></tr>';
    return;
  }
  var rows = STATE.novedades.slice().sort(function(a,b){return a.desde<b.desde?1:-1;});
  tbody.innerHTML = rows.map(function(n){
    var m = STATE.integrantes.find(function(i){return i.id===n.integranteId;});
    return '<tr><td>'+(m?escapeHtml(m.nombre):'(eliminado)')+'</td>'+
      '<td>'+(n.tipo==='V'?'Vacaciones':'Licencia/Médico')+'</td>'+
      '<td>'+fmtFechaAR(n.desde)+'</td><td>'+fmtFechaAR(n.hasta)+'</td>'+
      '<td><button class="icon-btn" title="Eliminar" onclick="deleteNovedad(\''+n.id+'\')">🗑</button></td></tr>';
  }).join('');
}
function deleteNovedad(id){
  STATE.novedades = STATE.novedades.filter(function(n){return n.id!==id;});
  saveState();
  renderVacacionesTab();
  renderPanorama();
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
  // guarda/actualiza la novedad
  STATE.novedades.push({id:uid(), integranteId:personaId, tipo:tipo, desde:desde, hasta:hasta});
  saveState();
  renderNovedadesTable();
  renderPanorama();

  var isos=[]; var d=parseISO(desde); var end=parseISO(hasta);
  while(d<=end){ isos.push(fmtISO(d)); d=addDays(d,1); }

  var candidatos = STATE.integrantes.filter(function(i){return i.id!==personaId;});
  // prioriza mismo grupo, mismo tipo de turno (D/N) que la persona de licencia
  var mismoGrupo = candidatos.filter(function(i){return i.grupoId===persona.grupoId;});
  var pool = mismoGrupo.length ? mismoGrupo : candidatos;

  var evaluados = pool.map(function(i){
    var libres = 0;
    isos.forEach(function(iso){ if(statusFor(i,iso)==='F') libres++; });
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

// ── EXPORT / IMPORT ─────────────────────────────────────────────────────
function exportData(){
  var blob = new Blob([JSON.stringify(STATE,null,2)], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'cronogramas-turnos-backup-'+fmtISO(new Date())+'.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function importData(ev){
  var file = ev.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(){
    try{
      var data = JSON.parse(reader.result);
      if(!data.grupos || !data.integrantes) throw new Error('formato inválido');
      if(!confirm('Esto reemplaza todos los datos actuales por los del archivo importado. ¿Continuar?')) return;
      STATE = { grupos:data.grupos||[], integrantes:data.integrantes||[], novedades:data.novedades||[] };
      saveState();
      currentGrupoId = null;
      renderGrupos(); renderPanorama(); renderVacacionesTab();
      alert('Datos importados correctamente.');
    }catch(e){
      alert('No se pudo importar el archivo: '+e.message);
    }
  };
  reader.readAsText(file);
  ev.target.value='';
}

// ── UTIL ────────────────────────────────────────────────────────────────
function escapeHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── BOOT ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', checkSession);
document.getElementById('lp') && document.getElementById('lp').addEventListener('keydown', function(e){ if(e.key==='Enter') doLogin(); });
