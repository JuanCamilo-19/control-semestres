require('dotenv').config();
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONEXIÓN A MARIADB
// ==========================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'control_semestres',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(express.json());
app.use(express.static('public'));
app.use(multer().array());

// ==========================================
// FUNCIONES DE BACKUP (Adaptadas a SQL)
// ==========================================
const BACKUP_DIR = path.join(__dirname, 'backups_sql');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

async function crearBackupSQL(motivo = 'automático') {
  try {
    const fecha = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    const nombreArchivo = `backup_${fecha}.json`;
    const rutaBackup = path.join(BACKUP_DIR, nombreArchivo);
    
    const [estudiantes] = await pool.execute('SELECT * FROM estudiantes');
    const [semestres] = await pool.execute('SELECT * FROM semestres_cursados');
    const [materias] = await pool.execute('SELECT * FROM materias');
    
    const data = { estudiantes, semestres, materias };
    fs.writeFileSync(rutaBackup, JSON.stringify(data, null, 2));
    
    await pool.execute(
      'INSERT INTO backups_log (tipo, archivo_nombre) VALUES (?, ?)',
      [motivo === 'auto-save' ? 'Auto' : motivo, nombreArchivo]
    );
    
    console.log(`💾 Backup SQL creado: ${nombreArchivo}`);
    return nombreArchivo;
  } catch (err) {
    console.error('Error creando backup SQL:', err);
    return null;
  }
}

async function listarBackupsSQL() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          nombre: f,
          fecha: f.replace('backup_', '').replace('.json', '').replace('_', ' ').replace('-', '/'),
          tamaño: (stats.size / 1024).toFixed(2) + ' KB'
        };
      })
      .sort((a, b) => b.nombre.localeCompare(a.nombre));
  } catch (err) {
    console.error('Error listando backups:', err);
    return [];
  }
}

async function restaurarBackupSQL(nombreArchivo) {
  try {
    const ruta = path.join(BACKUP_DIR, nombreArchivo);
    if (!fs.existsSync(ruta)) return false;
    
    const data = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    
    await crearBackupSQL('Pre-Restore');
    
    await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
    await pool.execute('TRUNCATE TABLE materias');
    await pool.execute('TRUNCATE TABLE semestres_cursados');
    await pool.execute('TRUNCATE TABLE estudiantes');
    await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    for (const est of data.estudiantes) {
      await pool.execute(
        'INSERT INTO estudiantes (id, nombre_completo, carrera, fecha_ingreso, estado_actual) VALUES (?, ?, ?, ?, ?)',
        [est.id, est.nombre_completo, est.carrera, est.fecha_ingreso, est.estado_actual]
      );
    }
    
    for (const sem of data.semestres) {
      await pool.execute(
        'INSERT INTO semestres_cursados (id_semestre, estudiante_id, periodo, creditos_matriculados, creditos_aprobados, promedio_semestral, estado_semestre) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sem.id_semestre, sem.estudiante_id, sem.periodo, sem.creditos_matriculados, sem.creditos_aprobados, sem.promedio_semestral, sem.estado_semestre]
      );
    }
    
    // ✅ RESTAURACIÓN DE MATERIAS CON LOS NUEVOS CAMPOS
    for (const mat of data.materias) {
      await pool.execute(
        `INSERT INTO materias (
          id_materia, semestre_id, nombre_materia, codigo_materia, grupo, docente,
          modalidad, horario, semestre_plan, creditos_materia, tipo_materia,
          orden, nota_final, estado_materia
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mat.id_materia, mat.semestre_id, mat.nombre_materia, mat.codigo_materia || null,
          mat.grupo || null, mat.docente || null, mat.modalidad || 'Presencial',
          mat.horario || null, mat.semestre_plan || null, mat.creditos_materia,
          mat.tipo_materia || 'Obligatoria', mat.orden || 0,
          mat.nota_final || null, mat.estado_materia || 'En Curso'
        ]
      );
    }
    
    console.log(`🔄 Restaurado desde: ${nombreArchivo}`);
    return true;
  } catch (err) {
    console.error('Error restaurando backup:', err);
    return false;
  }
}

async function limpiarBackupsAntiguosSQL(maxBackups = 10) {
  try {
    const backups = await listarBackupsSQL();
    if (backups.length <= maxBackups) return;
    
    const aBorrar = backups.slice(maxBackups);
    aBorrar.forEach(b => {
      fs.unlinkSync(path.join(BACKUP_DIR, b.nombre));
      console.log(`🗑️ Eliminado backup antiguo: ${b.nombre}`);
    });
  } catch (err) {
    console.error('Error limpiando backups:', err);
  }
}

// ==========================================
// RUTAS API - MARIADB
// ==========================================

// 📊 Obtener todos los estudiantes con semestres y materias
app.get('/api/estudiantes', async (req, res) => {
  try {
    const [estudiantes] = await pool.execute('SELECT * FROM estudiantes ORDER BY id');
    
    for (let est of estudiantes) {
      const [semestres] = await pool.execute(
        'SELECT * FROM semestres_cursados WHERE estudiante_id = ? ORDER BY periodo', 
        [est.id]
      );
      
      for (let sem of semestres) {
        const [materias] = await pool.execute(
          'SELECT * FROM materias WHERE semestre_id = ? ORDER BY orden, nombre_materia', 
          [sem.id_semestre]
        );
        sem.materias = materias;
      }
      est.semestres = semestres;
    }
    
    res.json(estudiantes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar datos de MariaDB' });
  }
});

// 💾 Ruta: Crear backup manual
app.post('/api/backup/crear', async (req, res) => {
  try {
    const archivo = await crearBackupSQL('manual');
    if (!archivo) throw new Error('No se pudo crear el archivo');
    await limpiarBackupsAntiguosSQL(10);
    res.json({ success: true, message: `Backup creado: ${archivo}` });
  } catch (err) {
    console.error('Error creando backup:', err);
    res.status(500).json({ error: 'No se pudo crear el backup' });
  }
});

// 💾 Ruta: Listar backups disponibles
app.get('/api/backup/lista', async (req, res) => {
  const backups = await listarBackupsSQL();
  res.json(backups);
});

// 💾 Ruta: Restaurar desde backup
app.post('/api/backup/restaurar', async (req, res) => {
  const { archivo } = req.body;
  if (!archivo) return res.status(400).json({ error: 'Nombre de archivo requerido' });
  
  try {
    const exito = await restaurarBackupSQL(archivo);
    if (!exito) return res.status(404).json({ error: 'Backup no encontrado' });
    
    res.json({ success: true, message: `Datos restaurados desde: ${archivo}` });
  } catch (err) {
    console.error('Error restaurando backup:', err);
    res.status(500).json({ error: 'No se pudo restaurar el backup' });
  }
});

// 📤 Exportar a Excel desde MariaDB
app.get('/api/export', async (req, res) => {
  try {
    const [estudiantes] = await pool.execute('SELECT id as id, nombre_completo as nombre, carrera FROM estudiantes');
    const ws = XLSX.utils.json_to_sheet(estudiantes);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estudiantes');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename=estudiantes_mariadb.xlsx');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Error exportando desde MariaDB' });
  }
});

// 📥 Importar desde Excel
app.post('/api/import', async (req, res) => {
  const file = req.files[0];
  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const sheet = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]);
  
  try {
    await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
    await pool.execute('TRUNCATE TABLE materias');
    await pool.execute('TRUNCATE TABLE semestres_cursados');
    await pool.execute('TRUNCATE TABLE estudiantes');
    await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    for (const row of data) {
      if (row.id && row.nombre) {
        await pool.execute(
          'INSERT INTO estudiantes (id, nombre_completo, carrera) VALUES (?, ?, ?)',
          [row.id, row.nombre, row.carrera || '']
        );
      }
    }
    
    await crearBackupSQL('post-import');
    res.json({ success: true, message: `${data.length} registros importados.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error importando datos' });
  }
});

// 💾 Guardar (Crear) Estudiante
app.post('/api/estudiantes', async (req, res) => {
  const { id, nombre, carrera } = req.body;
  
  if (!id || !nombre) {
    return res.status(400).json({ error: 'ID y nombre son obligatorios' });
  }

  try {
    const [existing] = await pool.execute('SELECT id FROM estudiantes WHERE id = ?', [id]);
    
    if (existing.length > 0) {
      return res.status(400).json({ 
        error: `⛔ Error: El ID '${id}' ya está registrado para otro estudiante.` 
      });
    }
    
    await pool.execute(
      'INSERT INTO estudiantes (id, nombre_completo, carrera) VALUES (?, ?, ?)',
      [id, nombre, carrera]
    );
    
    await crearBackupSQL('auto-save');
    res.json({ success: true, message: 'Estudiante creado correctamente en MariaDB' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en la base de datos MariaDB' });
  }
});

// ✏️ Editar un semestre específico
app.put('/api/estudiantes/:id/semestres/:idSemestre', async (req, res) => {
  const { id, idSemestre } = req.params;
  const { periodo, creditos, estado } = req.body;

  try {
    const [sem] = await pool.execute(
      'SELECT id_semestre FROM semestres_cursados WHERE id_semestre = ? AND estudiante_id = ?',
      [idSemestre, id]
    );
    if (sem.length === 0) return res.status(404).json({ error: 'Semestre no encontrado' });

    await pool.execute(
      'UPDATE semestres_cursados SET periodo = ?, creditos_matriculados = ?, estado_semestre = ? WHERE id_semestre = ?',
      [periodo, creditos, estado, idSemestre]
    );

    await crearBackupSQL('auto-save');
    res.json({ success: true, message: 'Semestre actualizado en MariaDB' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error actualizando semestre' });
  }
});

// 🗑️ Eliminar un semestre específico
app.delete('/api/estudiantes/:id/semestres/:idSemestre', async (req, res) => {
  const { id, idSemestre } = req.params;

  try {
    const [sem] = await pool.execute(
      'SELECT id_semestre FROM semestres_cursados WHERE id_semestre = ? AND estudiante_id = ?',
      [idSemestre, id]
    );
    if (sem.length === 0) return res.status(404).json({ error: 'Semestre no encontrado' });

    await pool.execute('DELETE FROM semestres_cursados WHERE id_semestre = ?', [idSemestre]);
    
    await crearBackupSQL('auto-save');
    res.json({ success: true, message: 'Semestre eliminado de MariaDB' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error eliminando semestre' });
  }
});

// ➕ Agregar semestre a estudiante existente (CON VALIDACIÓN CRONOLÓGICA)
app.post('/api/estudiantes/:id/semestres', async (req, res) => {
  const { id } = req.params;
  let { periodo, creditos, estado } = req.body;

  const partes = periodo.trim().split('-');
  if (partes.length === 2) {
    let sem = partes[1].toUpperCase();
    if (sem === '1') sem = 'I';
    else if (sem === '2') sem = 'II';
    periodo = `${partes[0]}-${sem}`;
  }

  try {
    const [existing] = await pool.execute('SELECT id FROM estudiantes WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Estudiante no encontrado' });

    const [ultimos] = await pool.execute(
      `SELECT periodo FROM semestres_cursados 
       WHERE estudiante_id = ? 
       ORDER BY periodo DESC LIMIT 1`,
      [id]
    );

    if (ultimos.length > 0) {
      const ultimoPeriodo = ultimos[0].periodo;
      
      const [anioUlt, numUlt] = ultimoPeriodo.split('-');
      const numSemUlt = numUlt === 'I' ? 1 : 2;
      
      let anioSiguiente = parseInt(anioUlt);
      let numSemSiguiente = numSemUlt + 1;
      
      if (numSemSiguiente > 2) {
        numSemSiguiente = 1;
        anioSiguiente++;
      }
      
      const periodoEsperado = `${anioSiguiente}-${numSemSiguiente === 1 ? 'I' : 'II'}`;
      
      if (periodo !== periodoEsperado) {
        return res.status(400).json({ 
          error: `⛔ Semestre inválido: Después de ${ultimoPeriodo} debe seguir ${periodoEsperado}, no ${periodo}` 
        });
      }
    }

    await pool.execute(
      'INSERT INTO semestres_cursados (estudiante_id, periodo, creditos_matriculados, estado_semestre) VALUES (?, ?, ?, ?)',
      [id, periodo, creditos || 0, estado || 'En Curso']
    );

    await crearBackupSQL('auto-save');
    res.json({ success: true, message: 'Semestre agregado correctamente' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error agregando semestre' });
  }
});

// ==========================================
// 🆕 RUTAS PARA GESTIÓN DE MATERIAS
// ==========================================

// ➕ Crear materia en un semestre
app.post('/api/estudiantes/:id/semestres/:idSemestre/materias', async (req, res) => {
  const { idSemestre } = req.params;
  const { 
    nombre_materia, codigo_materia, creditos_materia, tipo_materia,
    grupo, docente, modalidad, horario, semestre_plan, orden
  } = req.body;

  try {
    const [sem] = await pool.execute(
      'SELECT id_semestre FROM semestres_cursados WHERE id_semestre = ?', 
      [idSemestre]
    );
    if (sem.length === 0) return res.status(404).json({ error: 'Semestre no encontrado' });

    await pool.execute(
      `INSERT INTO materias (
        semestre_id, nombre_materia, codigo_materia, creditos_materia, 
        tipo_materia, grupo, docente, modalidad, horario, semestre_plan, orden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idSemestre, nombre_materia, codigo_materia || null, creditos_materia,
        tipo_materia || 'Obligatoria', grupo || null, docente || null, 
        modalidad || 'Presencial', horario || null, semestre_plan || null, orden || 0
      ]
    );

    await crearBackupSQL('auto-save');
    res.json({ success: true, message: 'Materia agregada correctamente' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al agregar materia' });
  }
});

// 📚 Obtener una materia específica por ID
app.get('/api/materias/:idMateria', async (req, res) => {
  const { idMateria } = req.params;
  
  try {
    const [materias] = await pool.execute(
      'SELECT * FROM materias WHERE id_materia = ?',
      [idMateria]
    );
    
    if (materias.length === 0) {
      return res.status(404).json({ error: 'Materia no encontrada' });
    }
    
    res.json(materias[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener materia' });
  }
});

// 📚 Obtener todas las materias de un semestre
app.get('/api/semestres/:idSemestre/materias', async (req, res) => {
  const { idSemestre } = req.params;
  
  try {
    const [materias] = await pool.execute(
      'SELECT * FROM materias WHERE semestre_id = ? ORDER BY orden, nombre_materia',
      [idSemestre]
    );
    res.json(materias);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener materias' });
  }
});

// ✏️ Editar materia
app.put('/api/materias/:idMateria', async (req, res) => {
  const { idMateria } = req.params;
  const { 
    nombre_materia, codigo_materia, creditos_materia, tipo_materia,
    grupo, docente, modalidad, horario, semestre_plan, orden,
    nota_final, estado_materia 
  } = req.body;

  try {
    await pool.execute(
      `UPDATE materias SET 
        nombre_materia = ?, codigo_materia = ?, creditos_materia = ?,
        tipo_materia = ?, grupo = ?, docente = ?, modalidad = ?,
        horario = ?, semestre_plan = ?, orden = ?, nota_final = ?,
        estado_materia = ?
      WHERE id_materia = ?`,
      [
        nombre_materia, codigo_materia || null, creditos_materia,
        tipo_materia || 'Obligatoria', grupo || null, docente || null,
        modalidad || 'Presencial', horario || null, semestre_plan || null,
        orden || 0, nota_final || null, estado_materia || 'En Curso',
        idMateria
      ]
    );

    await crearBackupSQL('auto-save');
    res.json({ success: true, message: 'Materia actualizada correctamente' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar materia' });
  }
});

// 🗑️ Eliminar materia
app.delete('/api/materias/:idMateria', async (req, res) => {
  const { idMateria } = req.params;

  try {
    const [mat] = await pool.execute(
      'SELECT id_materia FROM materias WHERE id_materia = ?',
      [idMateria]
    );
    
    if (mat.length === 0) {
      return res.status(404).json({ error: 'Materia no encontrada' });
    }

    await pool.execute('DELETE FROM materias WHERE id_materia = ?', [idMateria]);
    
    await crearBackupSQL('auto-save');
    res.json({ success: true, message: 'Materia eliminada correctamente' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar materia' });
  }
});

// 🚀 Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📁 Conectado a MariaDB: ${process.env.DB_NAME || 'control_semestres'}`);
  console.log(`💾 Backups SQL en: ${BACKUP_DIR}`);
});