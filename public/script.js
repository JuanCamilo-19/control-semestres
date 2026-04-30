const API = '/api';

// Cargar y mostrar datos
async function cargarDatos() {
  try {
    const res = await fetch(`${API}/estudiantes`);
    const data = await res.json();
    const tbody = document.querySelector('#dataTable tbody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px;">No hay estudiantes registrados</td></tr>';
      return;
    }

    data.forEach(est => {
      // Ordenar semestres cronológicamente
      const sortedSem = [...est.semestres].sort((a, b) => {
        const [anioA, numA] = a.periodo.split('-');
        const [anioB, numB] = b.periodo.split('-');
        const semA = numA === 'I' ? 1 : 2;
        const semB = numB === 'I' ? 1 : 2;
        if (anioA !== anioB) return parseInt(anioA) - parseInt(anioB);
        return semA - semB;
      });
      
      // Calcular créditos aprobados
      const creditosAprobados = sortedSem
        .filter(s => s.estado === 'Aprobado')
        .reduce((sum, s) => sum + (parseInt(s.creditos) || 0), 0);
      
      // Generar HTML de semestres
      const semHTML = sortedSem.map((s, index) => `
        <div class="semestre-card">
          <div class="semestre-info">
            <div class="semestre-periodo">${s.periodo}</div>
            <div class="semestre-detalles">${s.creditos} créditos</div>
          </div>
          <span class="semestre-estado estado-${s.estado.toLowerCase().replace(' ', '-')}">${s.estado}</span>
          <div class="semestre-actions">
            <button class="btn-warning" onclick="abrirModal('${est.id}', ${index}, '${s.periodo}', ${s.creditos}, '${s.estado}')">✏️</button>
            <button class="btn-danger" onclick="eliminarSemestre('${est.id}', ${index})">🗑️</button>
          </div>
        </div>
      `).join('') || '<span style="color:#999">Sin registros</span>';
      
      tbody.innerHTML += `
        <tr>
          <td><strong>${est.id}</strong></td>
          <td>${est.nombre}</td>
          <td>${est.carrera}</td>
          <td>${semHTML}</td>
          <td><span class="total-creditos">${creditosAprobados} cr.</span></td>
          <td>
            <button onclick="agregarSemestre('${est.id}')">➕ Semestre</button>
          </td>
        </tr>`;
    });
  } catch (err) {
    console.error("Error cargando datos:", err);
    alert('❌ Error al cargar datos');
  }
}

// Guardar nuevo estudiante
document.getElementById('studentForm').addEventListener('submit', async e => {
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

// Agregar nuevo semestre (con validación cronológica)
async function agregarSemestre(id) {
  const res = await fetch(`${API}/estudiantes`);
  const db = await res.json();
  const est = db.find(e => e.id === id);
  
  if (!est) return alert('Estudiante no encontrado');

  const periodo = prompt(`📅 Agregar semestre para ${est.nombre}\nActualmente tiene ${est.semestres.length}.\nEscribe el periodo (ej: 2024-I):`);
  if (!periodo) return;

  const nuevoEstudiante = { ...est };
  nuevoEstudiante.semestres.push({ periodo, creditos: 18, estado: 'En curso' });

  try {
    const updateRes = await fetch(`${API}/estudiantes`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(nuevoEstudiante)
    });
    const result = await updateRes.json();

    if (!updateRes.ok) throw new Error(result.error);
    cargarDatos();
  } catch (err) {
    alert('⛔ ' + err.message);
  }
}

// Abrir modal para editar semestre
function abrirModal(studentId, index, periodo, creditos, estado) {
  document.getElementById('editStudentId').value = studentId;
  document.getElementById('editSemesterIndex').value = index;
  document.getElementById('editPeriodo').value = periodo;
  document.getElementById('editCreditos').value = creditos;
  document.getElementById('editEstado').value = estado;
  document.getElementById('editModal').style.display = 'block';
}

// Cerrar modal
function cerrarModal() {
  document.getElementById('editModal').style.display = 'none';
}

// Guardar edición de semestre
document.getElementById('editSemesterForm').addEventListener('submit', async e => {
  e.preventDefault();
  
  const studentId = document.getElementById('editStudentId').value;
  const index = document.getElementById('editSemesterIndex').value;
  const periodo = document.getElementById('editPeriodo').value;
  const creditos = parseInt(document.getElementById('editCreditos').value);
  const estado = document.getElementById('editEstado').value;
  
  try {
    const res = await fetch(`${API}/estudiantes/${studentId}/semestres/${index}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodo, creditos, estado })
    });
    const result = await res.json();
    
    if (!res.ok) throw new Error(result.error);
    
    cerrarModal();
    cargarDatos();
    alert('✅ Semestre actualizado');
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
});

// Eliminar semestre
async function eliminarSemestre(studentId, index) {
  if (!confirm('¿Estás seguro de eliminar este semestre?')) return;
  
  try {
    const res = await fetch(`${API}/estudiantes/${studentId}/semestres/${index}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    
    if (!res.ok) throw new Error(result.error);
    
    cargarDatos();
    alert('✅ Semestre eliminado');
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
}

// Exportar a Excel
async function exportarExcel() { 
  window.open(`${API}/export`, '_blank'); 
}

// Importar desde Excel
async function importarExcel(input) {
  if (!input.files[0]) return;
  if (!confirm('⚠️ Esto reemplazará todos los datos actuales. ¿Continuar?')) {
    input.value = '';
    return;
  }

  const form = new FormData();
  form.append('file', input.files[0]);
  
  try {
    const res = await fetch(`${API}/import`, { method: 'POST', body: form });
    const data = await res.json();
    alert('✅ ' + data.message);
    cargarDatos();
  } catch (err) {
    alert('❌ Error al importar');
  }
  input.value = '';
}

// Cerrar modal al hacer clic fuera
window.onclick = function(event) {
  const modal = document.getElementById('editModal');
  if (event.target === modal) cerrarModal();
}

// Cargar datos al iniciar
cargarDatos();