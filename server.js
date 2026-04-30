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
app.use(multer().array()); // Para recibir archivos Excel

// Inicializar base de datos si no existe
if (!fs.existsSync(DB_PATH)) {
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
  
  // Validación básica
  const valid = data.filter(d => d.id && d.nombre);
  writeDB(valid);
  res.json({ success: true, message: `${valid.length} registros importados.` });
});

// 📊 Obtener todos
app.get('/api/estudiantes', (req, res) => res.json(readDB()));

// 💾 Guardar/Actualizar estudiante
app.post('/api/estudiantes', (req, res) => {
  let db = readDB();
  const { id, nombre, carrera, semestres = [] } = req.body;
  if (!id || !nombre) return res.status(400).json({ error: 'ID y nombre son obligatorios' });

  const index = db.findIndex(e => e.id === id);
  const record = { id, nombre, carrera, semestres: Array.isArray(semestres) ? semestres : [] };
  
  if (index === -1) db.push(record);
  else db[index] = record;

  writeDB(db);
  res.json({ success: true, message: 'Guardado correctamente' });
});

app.listen(PORT, () => console.log(`✅ App corriendo en http://localhost:${PORT}`));