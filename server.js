const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'data', 'estudiantes.json');

app.use(express.json());
app.use(express.static('public'));
app.use(multer().array()); 

// Inicializar DB
if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify([]), 'utf8');
}

const readDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');

// 📤 Exportar a Excel
app.get('/api/export', (req, res) => {
  const data = readDB();
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Estudiantes');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=estudiantes.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// 📥 Importar desde Excel
app.post('/api/import', (req, res) => {
  const file = req.files[0];
  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const sheet = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]);
  
  const valid = data.filter(d => d.id && d.nombre);
  writeDB(valid);
  res.json({ success: true, message: `${valid.length} registros importados.` });
});

// 📊 Obtener todos
app.get('/api/estudiantes', (req, res) => res.json(readDB()));

// 💾 Guardar o Actualizar con VALIDACIÓN CRONOLÓGICA
app.post('/api/estudiantes', (req, res) => {
  let db = readDB();
  const { id, nombre, carrera, semestres } = req.body;

  if (!id || !nombre) {
    return res.status(400).json({ error: 'ID y nombre son obligatorios' });
  }

  const index = db.findIndex(e => e.id === id);
  
  // Si es estudiante nuevo
  if (index === -1) {
    db.push({ id, nombre, carrera, semestres: semestres || [] });
    writeDB(db);
    return res.json({ success: true, message: 'Estudiante creado correctamente' });
  }

  // Si está actualizando semestres
  if (semestres) {
    const existingSemesters = db[index].semestres || [];
    const newSemesters = semestres || [];
    
    // Si están agregando un nuevo semestre
    if (newSemesters.length > existingSemesters.length) {
      const nuevoPeriodo = newSemesters[newSemesters.length - 1].periodo;
      
      
      
      const periodosOrdenados = [...existingSemesters].map(s => s.periodo).sort();
      const ultimoPeriodo = periodosOrdenados.length > 0 ? periodosOrdenados[periodosOrdenados.length - 1] : null;
      
      
      
      if (ultimoPeriodo) {
        const [anioUlt, numUlt] = ultimoPeriodo.split('-');
        const [anioNuevo, numNuevo] = nuevoPeriodo.split('-');
        
        const numSemUlt = numUlt === 'I' ? 1 : 2;
        
        let anioEsperado = parseInt(anioUlt);
        let semEsperado = numSemUlt + 1;
        
        if (semEsperado > 2) {
          semEsperado = 1;
          anioEsperado++;
        }
        
        const siguienteValido = `${anioEsperado}-${semEsperado === 1 ? 'I' : 'II'}`;
        
        if (nuevoPeriodo !== siguienteValido) {
          return res.status(400).json({ 
            error: `⛔ Semestre inválido: Después de ${ultimoPeriodo} debe seguir ${siguienteValido}, no ${nuevoPeriodo}` 
          });
        }
      }
    }
    
    db[index] = { id, nombre, carrera, semestres: newSemesters };
    writeDB(db);
    return res.json({ success: true, message: 'Estudiante actualizado correctamente' });
  }

  res.status(400).json({ error: 'No hay datos para actualizar' });
});
// ✏️ Editar un semestre específico
app.put('/api/estudiantes/:id/semestres/:indice', (req, res) => {
  let db = readDB();
  const { id, indice } = req.params;
  const { periodo, creditos, estado } = req.body;
  
  const index = db.findIndex(e => e.id === id);
  if (index === -1) return res.status(404).json({ error: 'Estudiante no encontrado' });
  
  const semIndex = parseInt(indice);
  if (isNaN(semIndex) || semIndex < 0 || semIndex >= db[index].semestres.length) {
    return res.status(400).json({ error: 'Índice de semestre inválido' });
  }
  
  db[index].semestres[semIndex] = { 
    periodo: periodo || db[index].semestres[semIndex].periodo,
    creditos: creditos !== undefined ? creditos : db[index].semestres[semIndex].creditos,
    estado: estado || db[index].semestres[semIndex].estado
  };
  
  writeDB(db);
  res.json({ success: true, message: 'Semestre actualizado' });
});

// 🗑️ Eliminar un semestre específico
app.delete('/api/estudiantes/:id/semestres/:indice', (req, res) => {
  let db = readDB();
  const { id, indice } = req.params;
  
  const index = db.findIndex(e => e.id === id);
  if (index === -1) return res.status(404).json({ error: 'Estudiante no encontrado' });
  
  const semIndex = parseInt(indice);
  if (isNaN(semIndex) || semIndex < 0 || semIndex >= db[index].semestres.length) {
    return res.status(400).json({ error: 'Índice de semestre inválido' });
  }
  
  db[index].semestres.splice(semIndex, 1);
  writeDB(db);
  res.json({ success: true, message: 'Semestre eliminado' });
});
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));