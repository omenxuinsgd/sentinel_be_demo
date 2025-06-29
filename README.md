# 🧬 Modern Biometric Fingerprint System (Python + Node.js)

A complete full-stack system for fingerprint enrollment, identification, and verification using a hybrid Python–Node.js architecture.

## 🧩 System Architecture

```
+----------------+            +------------------+          +-----------------------+
|  Web Frontend  |  <----->   |   Node.js Proxy  |  <-----> | Python Fingerprint Agent |
+----------------+  WebSocket/REST         REST           WebSocket/REST
```

* **Frontend**: Web app for real-time interactions
* **Node.js**: Manages database (SQLite), routes, and acts as a proxy between frontend and Python
* **Python Agent**: Interfaces with fingerprint scanner and performs live capture & 1\:N matching

---

## 📦 Requirements

### Node.js Server

```bash
npm install
```

### Python Agent

Ensure you are using **32-bit Python** to load fingerprint DLLs. Install dependencies:

```bash
pip install flask flask-socketio eventlet numpy opencv-python requests
```

---

## 🚀 Quick Start

### 1. Start Python Agent (in `python-agent.py`)

```bash
python app.py
```

### 2. Start Node.js Server (in `server.js`)

```bash
node server.js
```

---

## 🧠 API Endpoints (Node.js)

### Enrollment

* `POST /api/start_enrollment`: Triggers Python agent to start 3-step fingerprint enrollment
* `POST /api/save_enrollment`: Save enrollment (name + idNumber) to SQLite database

### Identification

* `POST /api/identify`: Perform 1\:N identification with Python agent
* `GET /api/get-all-templates`: Get combined templates for matching

### Device & Configuration

* `POST /api/init-device`: Initialize fingerprint hardware via Python
* `POST /api/config`: Set threshold, timeout, fog removal, etc.
* `GET /api/device-status`: Get current state of Python agent

---

## 🗄️ SQLite Database

### Tables

#### `users_and_templates`

| Column     | Type    | Description                           |
| ---------- | ------- | ------------------------------------- |
| id         | INTEGER | Primary Key                           |
| id\_number | TEXT    | Unique user ID                        |
| name       | TEXT    | User name                             |
| fmr\_\*    | BLOB    | Fingerprint templates for each finger |

#### `fingerprint_images`

| Column  | Type | Description                                   |
| ------- | ---- | --------------------------------------------- |
| img\_\* | BLOB | Raw fingerprint image data for slap & fingers |

---

## 🔁 Realtime Communication

Using **Socket.IO**, events like:

* `live_preview`: Real-time fingerprint preview (Base64 JPEG)
* `capture_result`: Result after capturing
* `enrollment_step`: Guides user through multi-step enrollment
* `identification_result`: 1\:N result

---

---

## 📌 Notes

* Ensure the DLLs are in the same folder as Python script
* This project is tested with Windows + 32-bit Python + ZAZ/GALS fingerprint scanner

---

## ✨ Roadmap / Enhancements

* ✅ Realtime streaming with Socket.IO
* ✅ 1\:N matching with templates from DB
* 🚧 Frontend Admin Panel
* 🚧 Template Export to ISO19794-2/ANSI

---

## 🤝 Credits

Built by blending hardware integration (HFSecurity bio600 SDK), modern web stack (Node.js + SQLite), and real-time interfaces (Socket.IO).

---

## 🧪 Demo Video & Screenshots

*(To be added)* Not Found

---

## 📬 License

MIT or closed source depending on your organization. Ask for license clarification if unsure.

---
