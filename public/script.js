const API = '/api';

async function cargarDatos() {
  const res = await fetch(`${API}/estudiantes`);
  const data = await res.json();
  const tbody = document.querySelector('#dataTable tbody');
  tbody.innerHTML = '';
  data.forEach(est => {
    const semTags = est.semestres.map(s => `<span class="semestre-tag">${s.periodo} (${s.estado})</span>`).join('');
    tbody.innerHTML += `
      <tr>
        <td>${est.id}</td><td>${est.nombre}</td><td>${est.carrera}</td>
        <td>${semTags || 'Sin registros'}</td>
        <td><button onclick="agregarSemestre('${est.id}')">➕ Semestre</button></td>
      </tr>`;
  });
}

document.getElementById('studentForm').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    id: document.getElementById('id').value,
    nombre: document.getElementById('nombre').value,
    carrera: document.getElementById('carrera').value,
    semestres: []
  };
  await fetch(`${API}/estudiantes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  cargarDatos();
  e.target.reset();
});

async function agregarSemestre(id) {
  const periodo = prompt('Ejemplo: 2024-I, 2025-II:');
  if (!periodo) return;
  const db = await fetch(`${API}/estudiantes`).then(r => r.json());
  const est = db.find(e => e.id === id);
  est.semestres.push({ periodo, estado: 'Cursado', creditos: 0 });
  await fetch(`${API}/estudiantes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(est)
  });
  cargarDatos();
}

async function exportarExcel() { window.open(`${API}/export`, '_blank'); }

async function importarExcel(input) {
  if (!input.files[0]) return;
  const form = new FormData();
  form.append('file', input.files[0]);
  const res = await fetch(`${API}/import`, { method: 'POST', body: form });
  const data = await res.json();
  alert(data.message);
  cargarDatos();
  input.value = '';
}

cargarDatos();