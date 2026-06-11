const API = '/api';
const SEMESTRES_ESPERADOS = 10; // ⚙️ CAMBIA ESTO según tu universidad

// 🔍 Variables globales para búsqueda y filtros
let todosLosEstudiantes = [];
let filtroActual = {
  busqueda: '',
  progreso: '',
  orden: 'id-asc'
};
let materiaEditandoId = null;

// 🔢 Convierte 1→I, 2→II y normaliza el formato del periodo
function normalizarPeriodo(periodo) {
  if (!periodo || typeof periodo !== 'string') return periodo;
  const partes = periodo.trim().split('-');
  if (partes.length !== 2) return periodo;
  
  const anio = partes[0];
  let semestre = partes[1].toUpperCase();
  
  if (semestre === '1') semestre = 'I';
  else if (semestre === '2') semestre = 'II';
  
  return `${anio}-${semestre}`;
}

// 📊 Actualizar tarjetas de estadísticas 
function actualizarStats(est, sem, cred, prom) {
  const elEst = document.getElementById('statEstudiantes');
  const elSem = document.getElementById('statSemestres');
  const elCred = document.getElementById('statCreditos');
  const elProm = document.getElementById('statPromedio');
  
  if (elEst) elEst.textContent = est;
  if (elSem) elSem.textContent = sem;
  if (elCred) elCred.textContent = cred;
  if (elProm) elProm.textContent = prom + '%';
}

// 📊 Cargar datos desde MariaDB y preparar para filtrado
async function cargarDatos() {
  if (!document.getElementById('dataTable')) return;
  
  try {
    const res = await fetch(`${API}/estudiantes`);
    const data = await res.json();
    
    // Procesar y guardar todos los estudiantes con cálculos pre-hechos
    todosLosEstudiantes = data.map(est => {
      const sortedSem = [...est.semestres].sort((a, b) => {
        const [anioA, numA] = a.periodo.split('-');
        const [anioB, numB] = b.periodo.split('-');
        const semA = numA === 'I' ? 1 : 2;
        const semB = numB === 'I' ? 1 : 2;
        if (anioA !== anioB) return parseInt(anioA) - parseInt(anioB);
        return semA - semB;
      });
      
      const estadoKey = 'estado_semestre';
      const semestresAprobados = sortedSem.filter(s => s[estadoKey] === 'Aprobado' || s.estado === 'Aprobado').length;
      const creditosAprobados = sortedSem
        .filter(s => s[estadoKey] === 'Aprobado' || s.estado === 'Aprobado')
        .reduce((sum, s) => sum + (parseInt(s.creditos_matriculados || s.creditos) || 0), 0);
      
      const progreso = Math.min(100, Math.round((semestresAprobados / SEMESTRES_ESPERADOS) * 100));
      
      return {
        ...est,
        semestresAprobados,
        creditosAprobados,
        progreso,
        totalSemestres: est.semestres.length,
        _sortedSemestres: sortedSem
      };
    });
    
    filtrarEstudiantes();
    
  } catch (err) {
    console.error("Error cargando datos:", err);
    document.querySelector('#dataTable tbody').innerHTML = 
      '<tr><td colspan="7" style="text-align:center; padding:30px; color:#e53e3e;">Error al cargar datos de MariaDB</td></tr>';
  }
}

// 🔍 Función principal de filtrado y ordenamiento
function filtrarEstudiantes() {
  filtroActual.busqueda = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  filtroActual.progreso = document.getElementById('filterProgreso')?.value || '';
  filtroActual.orden = document.getElementById('sortBy')?.value || 'id-asc';
  
  let estudiantesFiltrados = todosLosEstudiantes.filter(est => {
    const nombre = (est.nombre_completo || est.nombre || '').toLowerCase();
    const carrera = (est.carrera || '').toLowerCase();
    const id = (est.id || '').toLowerCase();
    
    if (filtroActual.busqueda) {
      const match = id.includes(filtroActual.busqueda) || 
                   nombre.includes(filtroActual.busqueda) || 
                   carrera.includes(filtroActual.busqueda);
      if (!match) return false;
    }
    
    if (filtroActual.progreso) {
      const sems = est.totalSemestres;
      switch(filtroActual.progreso) {
        case '0': if (sems !== 0) return false; break;
        case '1-2': if (sems < 1 || sems > 2) return false; break;
        case '3-5': if (sems < 3 || sems > 5) return false; break;
        case '6-8': if (sems < 6 || sems > 8) return false; break;
        case '9-10': if (sems < 9 || sems > 10) return false; break;
      }
    }
    
    return true;
  });
  
  estudiantesFiltrados.sort((a, b) => {
    const nombreA = (a.nombre_completo || a.nombre || '').toLowerCase();
    const nombreB = (b.nombre_completo || b.nombre || '').toLowerCase();
    
    switch(filtroActual.orden) {
      case 'id-asc': return a.id.localeCompare(b.id);
      case 'id-desc': return b.id.localeCompare(a.id);
      case 'nombre-asc': return nombreA.localeCompare(nombreB);
      case 'nombre-desc': return nombreB.localeCompare(nombreA);
      case 'progreso-asc': return a.progreso - b.progreso;
      case 'progreso-desc': return b.progreso - a.progreso;
      case 'semestres-asc': return a.totalSemestres - b.totalSemestres;
      case 'semestres-desc': return b.totalSemestres - a.totalSemestres;
      default: return 0;
    }
  });
  
  renderizarTabla(estudiantesFiltrados);
  
  const totalInfo = document.getElementById('totalMostrados');
  const totalGeneral = document.getElementById('totalEstudiantes');
  if (totalInfo) totalInfo.textContent = estudiantesFiltrados.length;
  if (totalGeneral) totalGeneral.textContent = todosLosEstudiantes.length;
}

// 📊 Renderizar tabla con estudiantes filtrados
function renderizarTabla(estudiantes) {
  const tbody = document.querySelector('#dataTable tbody');
  if (!tbody) return;
  
  if (estudiantes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#718096;">No se encontraron estudiantes que coincidan con los filtros</td></tr>';
    actualizarStats(0, 0, 0, 0);
    return;
  }
  
  let totalSemestresGlobal = 0;
  let totalCreditosAprobadosGlobal = 0;
  let sumaProgresos = 0;
  
  tbody.innerHTML = estudiantes.map(est => {
    const sortedSem = est._sortedSemestres || est.semestres;
    
    totalSemestresGlobal += est.totalSemestres;
    totalCreditosAprobadosGlobal += est.creditosAprobados;
    sumaProgresos += est.progreso;
    
    const semHTML = sortedSem.map((s) => {
      const creditos = s.creditos_matriculados || s.creditos || 0;
      const estado = s.estado_semestre || s.estado || 'En Curso';
      const estadoClass = estado.toLowerCase().replace(' ', '-');
      
      const materiasHTML = s.materias && s.materias.length > 0 ? `
        <div class="materias-container">
          ${s.materias.map(m => `
            <div class="materia-card">
              <div class="materia-info">
                <div class="materia-nombre">${m.nombre_materia} ${m.codigo_materia ? `(${m.codigo_materia})` : ''}</div>
                <div class="materia-detalles">
                  ${m.creditos_materia} cr. • ${m.tipo_materia || 'Obligatoria'}
                  ${m.docente ? `• ${m.docente}` : ''}
                  ${m.nota_final !== null ? `• Nota: ${m.nota_final}` : ''}
                </div>
              </div>
              <div class="materia-actions">
                <button class="btn-warning" onclick="editarMateria(${m.id_materia}, ${s.id_semestre}, '${est.id}')">✏️</button>
                <button class="btn-danger" onclick="eliminarMateria(${m.id_materia})">🗑️</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : '<p style="color:#999; font-size:0.85em; margin:5px 0;">Sin materias registradas</p>';
      
      return `
        <div class="semestre-card">
          <div class="semestre-header">
            <div class="semestre-info">
              <div class="semestre-periodo">${s.periodo}</div>
              <div class="semestre-detalles">${creditos} créditos • ${estado}</div>
            </div>
            <span class="semestre-estado estado-${estadoClass}">${estado}</span>
          </div>
          <div class="semestre-actions">
            <button class="btn-warning" onclick="abrirModal('${est.id}', ${s.id_semestre}, '${s.periodo}', ${creditos}, '${estado}')">✏️ Semestre</button>
            <button class="btn-secondary" onclick="abrirModalMateria(${s.id_semestre}, '${est.id}')">➕ Materia</button>
            <button class="btn-danger" onclick="eliminarSemestre('${est.id}', ${s.id_semestre})">🗑️</button>
          </div>
          <div class="semestre-materias">
            ${materiasHTML}
          </div>
        </div>`;
    }).join('') || '<span style="color:#999">Sin registros</span>';
    
    const nombreMostrar = est.nombre_completo || est.nombre || 'Sin nombre';
    
    return `
      <tr>
        <td><strong>${est.id}</strong></td>
        <td>${nombreMostrar}</td>
        <td>${est.carrera || 'N/A'}</td>
        <td>${semHTML}</td>
        <td><span class="total-creditos">${est.creditosAprobados} cr.</span></td>
        <td>
          <div class="progress-container">
            <div class="progress-bar" style="width: ${est.progreso}%"></div>
          </div>
          <div class="progress-text">${est.progreso}% (${est.semestresAprobados}/${SEMESTRES_ESPERADOS})</div>
        </td>
        <td>
          <button onclick="agregarSemestre('${est.id}')">➕ Semestre</button>
        </td>
      </tr>`;
  }).join('');
  
  const promedioAvance = estudiantes.length > 0 ? Math.round(sumaProgresos / estudiantes.length) : 0;
  actualizarStats(estudiantes.length, totalSemestresGlobal, totalCreditosAprobadosGlobal, promedioAvance);
}

// 💾 Guardar nuevo estudiante 
const studentForm = document.getElementById('studentForm');
if (studentForm) {
  studentForm.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      id: document.getElementById('id').value,
      nombre: document.getElementById('nombre').value,
      carrera: document.getElementById('carrera').value,
      semestres: []
    };
    
    try {
      const res = await fetch(`${API}/estudiantes`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      
      if (!res.ok) throw new Error(result.error);
      
      alert('✅ ' + result.message);
      cargarDatos();
      e.target.reset();
    } catch (err) {
      alert('❌ Error: ' + err.message);
    }
  });
}

// ➕ Agregar nuevo semestre (CON VALIDACIÓN CRONOLÓGICA)
async function agregarSemestre(id) {
  const periodoInput = prompt(`📅 Agregar semestre\nEscribe el periodo (ej: 2024-1, 2024-I, 2025-2):\n\n⚠️ Debe ser consecutivo al último registrado.`);
  if (!periodoInput) return;

  const periodo = normalizarPeriodo(periodoInput);
  
  const creditosInput = prompt(`💳 Créditos para ${periodo}:`, "18");
  if (creditosInput === null) return;
  
  const creditos = creditosInput.trim() === "" ? 18 : parseInt(creditosInput);
  if (isNaN(creditos) || creditos < 0) {
    alert('❌ Créditos inválidos. Debe ser un número mayor o igual a 0');
    return;
  }

  try {
    const res = await fetch(`${API}/estudiantes/${id}/semestres`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodo, creditos, estado: 'En Curso' })
    });
    const result = await res.json();
    
    if (!res.ok) throw new Error(result.error);
    cargarDatos();
  } catch (err) {
    alert('⛔ ' + err.message);
  }
}

// ✏️ Abrir modal para editar semestre
function abrirModal(studentId, idSemestre, periodo, creditos, estado) {
  document.getElementById('editStudentId').value = studentId;
  document.getElementById('editSemesterIndex').value = idSemestre;
  document.getElementById('editPeriodo').value = periodo;
  document.getElementById('editCreditos').value = creditos;
  document.getElementById('editEstado').value = estado;
  document.getElementById('editModal').style.display = 'block';
}

// ❌ Cerrar modal de edición
function cerrarModal() {
  const modal = document.getElementById('editModal');
  if (modal) modal.style.display = 'none';
}

// 💾 Guardar edición de semestre
const editSemesterForm = document.getElementById('editSemesterForm');
if (editSemesterForm) {
  editSemesterForm.addEventListener('submit', async e => {
    e.preventDefault();
    
    const studentId = document.getElementById('editStudentId').value;
    const idSemestre = document.getElementById('editSemesterIndex').value;
    const periodo = document.getElementById('editPeriodo').value;
    const creditos = parseInt(document.getElementById('editCreditos').value);
    const estado = document.getElementById('editEstado').value;
    
    try {
      const res = await fetch(`${API}/estudiantes/${studentId}/semestres/${idSemestre}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo, creditos, estado })
      });
      const result = await res.json();
      
      if (!res.ok) throw new Error(result.error);
      
      cerrarModal();
      cargarDatos();
      alert('✅ Semestre actualizado en MariaDB');
    } catch (err) {
      alert('❌ Error: ' + err.message);
    }
  });
}

// 🗑️ Eliminar semestre
async function eliminarSemestre(studentId, idSemestre) {
  if (!confirm('¿Estás seguro de eliminar este semestre?')) return;
  
  try {
    const res = await fetch(`${API}/estudiantes/${studentId}/semestres/${idSemestre}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    
    if (!res.ok) throw new Error(result.error);
    
    cargarDatos();
    alert('✅ Semestre eliminado de MariaDB');
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

// 📤 Exportar a Excel
async function exportarExcel() { 
  window.open(`${API}/export`, '_blank'); 
}

// 📥 Importar desde Excel
const importFile = document.getElementById('importFile');
if (importFile) {
  importFile.addEventListener('change', async function(e) {
    if (!e.target.files[0]) return;
    if (!confirm('⚠️ Esto reemplazará todos los datos actuales. ¿Continuar?')) {
      e.target.value = '';
      return;
    }

    const form = new FormData();
    form.append('file', e.target.files[0]);
    
    try {
      const res = await fetch(`${API}/import`, { method: 'POST', body: form });
      const data = await res.json();
      alert('✅ ' + data.message);
      cargarDatos();
    } catch (err) {
      alert('❌ Error al importar');
    }
    e.target.value = '';
  });
}

// ============================================
// 💾 FUNCIONES DE BACKUP
// ============================================

async function crearBackupManual() {
  try {
    const res = await fetch(`${API}/backup/crear`, { method: 'POST' });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error);
    
    alert('✅ ' + data.message);
    cargarBackups();
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

async function cargarBackups() {
  const backupList = document.getElementById('backupList');
  if (!backupList) return;
  
  try {
    const res = await fetch(`${API}/backup/lista`);
    const backups = await res.json();
    
    if (backups.length === 0) {
      backupList.innerHTML = '<p style="color:#718096; font-style:italic; text-align:center; padding:20px;">No hay backups aún</p>';
      return;
    }
    
    backupList.innerHTML = backups.map(b => `
      <div class="backup-item">
        <div class="backup-info">
          <div class="backup-name">${b.nombre}</div>
          <div class="backup-meta">📅 ${b.fecha} • 💾 ${b.tamaño}</div>
        </div>
        <div class="backup-actions">
          <button class="btn-warning" onclick="abrirRestoreModal('${b.nombre}')">🔄 Restaurar</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error cargando backups:', err);
    backupList.innerHTML = '<p style="color:#e53e3e; text-align:center; padding:20px;">Error al cargar backups</p>';
  }
}

function abrirRestoreModal(nombreArchivo) {
  const modal = document.getElementById('restoreModal');
  if (!modal) return;
  
  document.getElementById('restoreFileName').textContent = nombreArchivo;
  document.getElementById('restoreFileNameInput').value = nombreArchivo;
  modal.style.display = 'block';
}

function cerrarRestoreModal() {
  const modal = document.getElementById('restoreModal');
  if (modal) modal.style.display = 'none';
}

async function confirmarRestauracion() {
  const archivo = document.getElementById('restoreFileNameInput').value;
  
  try {
    const res = await fetch(`${API}/backup/restaurar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivo })
    });
    const data = await res.json();
    
    cerrarRestoreModal();
    
    if (!res.ok) throw new Error(data.error);
    
    alert('✅ ' + data.message + '\n\nLa página se recargará para aplicar los cambios.');
    location.reload();
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

// ============================================
// 🆕 FUNCIONES PARA GESTIÓN DE MATERIAS
// ============================================

// ➕ Abrir modal para agregar materia
function abrirModalMateria(idSemestre, idEstudiante) {
  materiaEditandoId = null; // ✅ IMPORTANTE: Resetear variable
  document.getElementById('materiaId').value = ''; // ✅ Limpiar ID oculto
  document.getElementById('materiaIdSemestre').value = idSemestre;
  document.getElementById('materiaIdEstudiante').value = idEstudiante;
  document.getElementById('materiaForm').reset();
  document.getElementById('modalMateria').style.display = 'block';
}

// ❌ Cerrar modal de materia
function cerrarModalMateria() {
  document.getElementById('modalMateria').style.display = 'none';
  materiaEditandoId = null; // ✅ Resetear variable al cerrar
}

// 💾 Guardar materia (crear o editar)
document.getElementById('materiaForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  
  const idMateria = document.getElementById('materiaId')?.value;
  const idSemestre = document.getElementById('materiaIdSemestre').value;
  const idEstudiante = document.getElementById('materiaIdEstudiante').value;
  
  const payload = {
    nombre_materia: document.getElementById('materiaNombre').value,
    codigo_materia: document.getElementById('materiaCodigo').value,
    creditos_materia: parseInt(document.getElementById('materiaCreditos').value),
    tipo_materia: document.getElementById('materiaTipo').value,
    grupo: document.getElementById('materiaGrupo').value,
    docente: document.getElementById('materiaDocente').value,
    modalidad: document.getElementById('materiaModalidad').value,
    horario: document.getElementById('materiaHorario').value,
    semestre_plan: parseInt(document.getElementById('materiaSemestrePlan').value) || null,
    orden: parseInt(document.getElementById('materiaOrden').value) || 0,
    nota_final: parseFloat(document.getElementById('materiaNota').value) || null,
    estado_materia: document.getElementById('materiaEstado').value
  };

  try {
    let url, method;
    
    if (idMateria) {
      url = `${API}/materias/${idMateria}`;
      method = 'PUT';
    } else {
      url = `${API}/estudiantes/${idEstudiante}/semestres/${idSemestre}/materias`;
      method = 'POST';
    }

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    
    if (!res.ok) throw new Error(result.error);
    
    cerrarModalMateria();
    cargarDatos();
    alert(idMateria ? '✅ Materia actualizada' : '✅ Materia agregada');
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
});

// ✏️ Editar materia existente
async function editarMateria(idMateria, idSemestre, idEstudiante) {
  try {
    const res = await fetch(`${API}/materias/${idMateria}`);
    if (!res.ok) throw new Error('Error al cargar materia');
    
    const materia = await res.json();
    
    materiaEditandoId = idMateria; // ✅ Marcar que estamos editando
    document.getElementById('materiaId').value = materia.id_materia;
    document.getElementById('materiaIdSemestre').value = materia.semestre_id;
    document.getElementById('materiaIdEstudiante').value = idEstudiante;
    document.getElementById('materiaNombre').value = materia.nombre_materia;
    document.getElementById('materiaCodigo').value = materia.codigo_materia || '';
    document.getElementById('materiaCreditos').value = materia.creditos_materia;
    document.getElementById('materiaTipo').value = materia.tipo_materia || 'Obligatoria';
    document.getElementById('materiaGrupo').value = materia.grupo || '';
    document.getElementById('materiaDocente').value = materia.docente || '';
    document.getElementById('materiaModalidad').value = materia.modalidad || 'Presencial';
    document.getElementById('materiaHorario').value = materia.horario || '';
    document.getElementById('materiaSemestrePlan').value = materia.semestre_plan || '';
    document.getElementById('materiaOrden').value = materia.orden || 0;
    document.getElementById('materiaNota').value = materia.nota_final || '';
    document.getElementById('materiaEstado').value = materia.estado_materia || 'En Curso';
    
    document.getElementById('modalMateria').style.display = 'block';
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

// 🗑️ Eliminar materia
async function eliminarMateria(idMateria) {
  if (!confirm('¿Estás seguro de eliminar esta materia?')) return;
  
  try {
    const res = await fetch(`${API}/materias/${idMateria}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    
    if (!res.ok) throw new Error(result.error);
    
    cargarDatos();
    alert('✅ Materia eliminada');
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

// ============================================
// 🔄 EVENTOS GLOBALES
// ============================================

window.onclick = function(event) {
  const editModal = document.getElementById('editModal');
  const restoreModal = document.getElementById('restoreModal');
  const modalMateria = document.getElementById('modalMateria');
  
  if (editModal && event.target === editModal) cerrarModal();
  if (restoreModal && event.target === restoreModal) cerrarRestoreModal();
  if (modalMateria && event.target === modalMateria) cerrarModalMateria(); // ✅ Cerrar modal de materia al hacer clic fuera
}

// 🚀 Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  cargarDatos();
  cargarBackups();
});