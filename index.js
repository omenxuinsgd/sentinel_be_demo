// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const http = require('http');
const { Server } = require("socket.io");
const { io: SocketIOClient } = require("socket.io-client");
// --- PERUBAHAN: Impor library SQLite ---
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
// ------------------------------------

// Konfigurasi
const PORT = 3000;
const PYTHON_AGENT_URL = 'http://127.0.0.1:5000';
const TIMEOUT = 30000;
const DB_FILE = './fingerprint_database.sqlite'; // File database akan dibuat di sini

// --- PERUBAHAN: Fungsi untuk inisialisasi database SQLite ---
let db;
async function initializeDatabase() {
    try {
        db = await open({
            filename: DB_FILE,
            driver: sqlite3.Database
        });

        console.log('Terhubung ke database SQLite.');

        // Aktifkan foreign keys
        await db.run('PRAGMA foreign_keys = ON;');

        // Buat tabel jika belum ada
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users_and_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_number TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                enrollment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                fmr_right_thumb BLOB,
                fmr_right_index BLOB,
                fmr_right_middle BLOB,
                fmr_right_ring BLOB,
                fmr_right_little BLOB,
                fmr_left_thumb BLOB,
                fmr_left_index BLOB,
                fmr_left_middle BLOB,
                fmr_left_ring BLOB,
                fmr_left_little BLOB
            );

            CREATE TABLE IF NOT EXISTS fingerprint_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                img_slap_right_four BLOB,
                img_slap_left_four BLOB,
                img_slap_two_thumbs BLOB,
                img_right_thumb BLOB,
                img_right_index BLOB,
                img_right_middle BLOB,
                img_right_ring BLOB,
                img_right_little BLOB,
                img_left_thumb BLOB,
                img_left_index BLOB,
                img_left_middle BLOB,
                img_left_ring BLOB,
                img_left_little BLOB,
                FOREIGN KEY (user_id) REFERENCES users_and_templates(id) ON DELETE CASCADE
            );
        `);
        console.log('Tabel database sudah siap.');
    } catch (err) {
        console.error('Gagal menginisialisasi database SQLite:', err);
        process.exit(1); // Keluar jika database gagal diinisialisasi
    }
}
// -----------------------------------------------------------

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

const handlePythonAgentError = (error) => {
    if (error.code === 'ECONNREFUSED') {
        return { success: false, message: 'Layanan sidik jari Python tidak berjalan.' };
    }
    return { success: false, message: error.response?.data?.message || 'Terjadi kesalahan pada agen Python.' };
};

// =============================================
// API ENDPOINTS (HTTP)
// =============================================
app.post('/api/start_enrollment', async (req, res) => {
    try {
        console.log("BACKEND: [API /start_enrollment] Meneruskan permintaan ke agen Python...");
        const response = await axios.post(`${PYTHON_AGENT_URL}/api/start_enrollment`);
        res.json(response.data);
    } catch (error) {
        console.error("BACKEND: [API /start_enrollment] Gagal saat memulai enrollment di agen:", error.message);
        res.status(500).json(handlePythonAgentError(error));
    }
});

app.post('/api/save_enrollment', async (req, res) => {
    const { name, idNumber } = req.body;
    console.log(`BACKEND: [API /save_enrollment] Menerima permintaan untuk ID: ${idNumber}, Nama: ${name}`);

    if (!name || !idNumber) {
        return res.status(400).json({ success: false, message: "Nama dan Nomor ID diperlukan." });
    }

    try {
        console.log("BACKEND: [API /save_enrollment] Langkah 1: Mengambil data enrollment dari agen Python...");
        const agentResponse = await axios.get(`${PYTHON_AGENT_URL}/api/get_enrollment_data`, { timeout: TIMEOUT });
        const { templates_base64, images_base64 } = agentResponse.data;
        console.log("BACKEND: [API /save_enrollment] Data berhasil diterima dari agen.");

        if (!templates_base64 || Object.keys(templates_base64).length < 10 || !images_base64 || Object.keys(images_base64).length < 13) {
            return res.status(500).json({ success: false, message: "Data yang diterima dari agen tidak lengkap." });
        }

        await db.run('BEGIN TRANSACTION');

        const userSql = `INSERT INTO users_and_templates (id_number, name) VALUES (?, ?)`;
        const userResult = await db.run(userSql, [idNumber, name]);
        const userId = userResult.lastID;

        for (const [columnName, templateBase64] of Object.entries(templates_base64)) {
            const templateBuffer = Buffer.from(templateBase64, 'base64');
            const updateTemplateSql = `UPDATE users_and_templates SET ${columnName} = ? WHERE id = ?`;
            await db.run(updateTemplateSql, [templateBuffer, userId]);
        }

        await db.run('INSERT INTO fingerprint_images (user_id) VALUES (?)', [userId]);
        
        for (const [columnName, imageBase64] of Object.entries(images_base64)) {
            const imageBuffer = Buffer.from(imageBase64, 'base64');
            const updateImageSql = `UPDATE fingerprint_images SET ${columnName} = ? WHERE user_id = ?`;
            await db.run(updateImageSql, [imageBuffer, userId]);
        }

        await db.run('COMMIT');
        
        res.json({ success: true, message: `Data untuk ${name} berhasil disimpan dengan ID: ${userId}` });

    } catch (error) {
        console.error("ENROLLMENT DB ERROR:", error);
        await db.run('ROLLBACK');
        
        if (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE')) {
            return res.status(409).json({ success: false, message: `Nomor ID ${idNumber} sudah terdaftar.` });
        }
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menyimpan data.' });
    }
});

app.get('/api/get-all-templates', async (req, res) => {
    console.log("BACKEND: [API /get-all-templates] Menerima permintaan untuk mengambil semua template...");
    try {
        const query = `
            SELECT
                id,
                id_number,
                name,
                fmr_right_thumb, fmr_right_index, fmr_right_middle, fmr_right_ring, fmr_right_little,
                fmr_left_thumb, fmr_left_index, fmr_left_middle, fmr_left_ring, fmr_left_little
            FROM users_and_templates
        `;
        const rows = await db.all(query);

        if (!rows || rows.length === 0) {
            return res.json({ success: true, data: [] });
        }

        console.log(`BACKEND: [API /get-all-templates] Menemukan ${rows.length} pengguna di database.`);
        
        const allTemplates = rows.map(user => {
            const fmrColumns = [
                user.fmr_right_thumb, user.fmr_right_index, user.fmr_right_middle, user.fmr_right_ring, user.fmr_right_little,
                user.fmr_left_thumb, user.fmr_left_index, user.fmr_left_middle, user.fmr_left_ring, user.fmr_left_little
            ];

            const validTemplates = fmrColumns.filter(t => t !== null && t instanceof Buffer);
            const combinedTemplate = Buffer.concat(validTemplates);
            
            return {
                user_id: user.id,
                id_number: user.id_number,
                name: user.name,
                combined_template_base64: combinedTemplate.toString('base64') 
            };
        });

        console.log("BACKEND: [API /get-all-templates] Berhasil memproses dan akan mengirimkan data template.");
        res.json({ success: true, data: allTemplates });

    } catch (error) {
        console.error("GET ALL TEMPLATES DB ERROR:", error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data template dari database.' });
    }
});

app.post('/api/init-device', async (req, res) => {
  try {
    const response = await axios.post(`${PYTHON_AGENT_URL}/api/init`, {}, { timeout: TIMEOUT });
    res.json(response.data);
  } catch (error) {
    res.status(503).json(handlePythonAgentError(error));
  }
});

app.post('/api/create_template', async (req, res) => {
    const requestData = req.body;
    if (!requestData || !requestData.template_no || !requestData.capture_type) {
        return res.status(400).json({ success: false, message: "Data tidak lengkap" });
    }
    try {
        const response = await axios.post(`${PYTHON_AGENT_URL}/api/create_template`, requestData, { timeout: TIMEOUT });
        res.json(response.data);
    } catch (error) {
        res.status(500).json(handlePythonAgentError(error));
    }
});

app.post('/api/match_templates', async (req, res) => {
  try {
    const response = await axios.post(`${PYTHON_AGENT_URL}/api/match_templates`, {}, { timeout: TIMEOUT });
    res.json(response.data);
  } catch (error) {
    res.status(500).json(handlePythonAgentError(error));
  }
});

app.get('/api/device-status', async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_AGENT_URL}/api/status`, { timeout: TIMEOUT });
    res.json(response.data);
  } catch (error) {
    res.status(500).json(handlePythonAgentError(error));
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const response = await axios.post(`${PYTHON_AGENT_URL}/api/config`, req.body, { timeout: TIMEOUT });
    res.json(response.data);
  } catch (error) {
    res.status(500).json(handlePythonAgentError(error));
  }
});

app.post('/api/identify', async (req, res) => {
    try {
        const response = await axios.post(`${PYTHON_AGENT_URL}/api/identify`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json(handlePythonAgentError(error));
    }
});

// =============================================
// LOGIKA PROXY WEBSOCKET
// =============================================
const agentSocket = SocketIOClient(PYTHON_AGENT_URL);
agentSocket.on('connect', () => console.log('Proxy Terhubung ke Agen Python.'));
const forwardEvents = ['live_preview', 'enrollment_step', 'capture_result', 'identification_result', 'identification_step']; 
forwardEvents.forEach(eventName => {
    agentSocket.on(eventName, (data) => io.emit(eventName, data));
});
io.on('connection', (socket) => console.log(`Klien terhubung: ${socket.id}`));

// =============================================
// PENANGANAN ERROR & STARTUP SERVER
// =============================================
app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Kesalahan Internal Server' });
});

initializeDatabase().then(() => {
    server.listen(PORT, () => {
      console.log(`Server dengan koneksi DB SQLite berjalan di http://localhost:${PORT}`);
    });
});
