const API = '/api';

async function cargarDatos() {
  try {
    const res = await fetch(`${API}/estudiantes`);
    const data = await res.json();
    const tbody = document.querySelector('#dataTable tbody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No hay estudiantes registrados</td></tr>';
      return;
    }

    data.forEach(est => {
      // Ordenar semestres cronológicamente (2024-I, 2024-II, 2025-I...)
      const sortedSem = [...est.semestres].sort((a, b) => {
        const [anioA, numA] = a.periodo.split('-');
        const [anioB, numB] = b.periodo.split('-');
        const semA = numA === 'I' ? 1 : 2;
        const semB = numB === 'I' ? 1 : 2;
        
        if (anioA !== anioB) return parseInt(anioA) - parseInt(anioB);
        return semA - semB;
      });
      
      const semTags = sortedSem.map(s => `<span class="semestre-tag">${s.periodo} (${s.estado})</span>`).join('');
      const count = est.semestres.length;
      
      tbody.innerHTML += `
        <tr>
          <td><strong>${est.id}</strong></td>
          <td>${est.nombre}</td>
          <td>${est.carrera}</td>
          <td>
            <div style="margin-bottom:4px; font-size:0.8em; color:#666;">Total cursados: ${count}</div>
            ${semTags || '<span style="color:#999">Sin registros</span>'}
          </td>
          <td><button onclick="agregarSemestre('${est.id}')">➕ Agregar Semestre</button></td>
        </tr>`;
    });
  } catch (err) {
    console.error("Error cargando datos:", err);
  }
}

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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
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

async function agregarSemestre(id) {
  // 1. Buscar datos actuales
  const res = await fetch(`${API}/estudiantes`);
  const db = await res.json();
  const est = db.find(e => e.id === id);
  
  if (!est) return alert('Estudiante no encontrado');

  // 2. Pedir datos
  const periodo = prompt(`📅 Agregar semestre para ${est.nombre}\nActualmente tiene ${est.semestres.length}.\nEscribe el periodo (ej: 2024-I):`);
  if (!periodo) return;

  // 3. Preparar nuevo objeto con un semestre más
  const nuevoEstudiante = { ...est };
  nuevoEstudiante.semestres.push({ periodo, estado: 'Cursado', creditos: 0 });

  // 4. Enviar al servidor (que validará si es un salto ilegal)
  try {
    const updateRes = await fetch(`${API}/estudiantes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevoEstudiante)
    });
    const result = await updateRes.json();

    if (!updateRes.ok) throw new Error(result.error);

    cargarDatos();
  } catch (err) {
    alert('⛔ ' + err.message);
  }
}

async function exportarExcel() { window.open(`${API}/export`, '_blank'); }

async function importarExcel(input) {
  if (!input.files[0]) return;
  if (!confirm('⚠️ Esto borrará los datos actuales y los reemplazará con el Excel. ¿Continuar?')) {
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

cargarDatos();