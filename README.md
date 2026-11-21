# NexusSSH (VMDash) - Centralized Agentless SSH VM Control Panel

NexusSSH adalah platform kontrol dan pemantauan terpusat untuk Virtual Machine (VM) berbasis web dengan tampilan modern bergaya **Proxmox VE**. Beroperasi secara **agentless** murni menggunakan protokol SSH dan WebSocket tanpa perlu menginstal *daemon* tambahan di sisi VM.

---

## 🌟 Fitur Utama (MVP Telah Terimplementasi)

1. **Inventory & Pengelompokan VM (Node Management)**
   - Tambah, edit, kelompokkan (*tagging/grouping*), dan hapus VM.
   - Mendukung autentikasi **SSH Password** maupun **SSH Private Key** (upload file `.pem`/`id_rsa` atau tempel langsung).
   - Fitur **Live Connection Test** dengan visualisasi latensi dan deteksi OS VM.

2. **Real-Time Agentless Monitoring**
   - Polling latar belakang non-blocking setiap 4 detik melalui *command* SSH ringan (`/proc/stat`, `/proc/meminfo`, `df -P /`, `uptime`, `loadavg`).
   - Indikator status real-time (*Online*, *Offline*, *Unreachable*).
   - Visualisasi grafis penggunaan **CPU (%)**, **RAM (Used/Total)**, **Disk Storage**, **Load Average**, dan **Uptime**.
   - Streaming metrik langsung ke browser melalui WebSocket tanpa perlu me-refresh halaman.

3. **Interactive Web Console (Browser Terminal)**
   - Terminal interaktif penuh berbasis `@xterm/xterm` yang terhubung via WebSocket ke sesi SSH PTY backend.
   - Mendukung perintah interaktif (`htop`, `vim`, `nano`, `docker logs -f`).
   - Mendukung *copy-paste*, ukuran layar dinamis (*auto-fit & resize*), dan warna ANSI standar.

4. **Power & System Actions**
   - Aksi cepat sistem: **Reboot** dan **Shutdown** dengan modal konfirmasi keamanan.
   - **Quick Snippets & Macros**: Eksekusi perintah cepat yang dapat dikustomisasi (misal: Docker status, proses pemakan CPU/RAM, system info).

5. **Keamanan & Enkripsi Standar Industri**
   - Seluruh kredensial SSH (Password & Private Key) disimpan dalam database terenkripsi menggunakan algoritma **AES-256-GCM**.
   - Sistem login dashboard berbasis token JWT.
   - Sesi WebSocket terminal divalidasi dengan token otentikasi.

---

## 🏗️ Tech Stack

- **Backend**: Node.js + TypeScript + Express + WebSocket (`ws`) + `ssh2` + `node:sqlite` (SQLite bawaan, zero external DB dependencies).
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Lucide Icons + `@xterm/xterm`.
- **Enkripsi**: Native Node `crypto` (AES-256-GCM dengan 32-byte Master Key dan dynamic IV/Auth-Tag).

---

## 🚀 Panduan Menjalankan

### Cara 1: Menggunakan Node.js Langsung

1. **Build Frontend & Backend:**
   ```bash
   npm run build
   ```

2. **Jalankan Aplikasi:**
   ```bash
   npm start
   ```

3. **Buka di Browser:**
   Akses `http://localhost:3001`
   - Pada pembukaan pertama, Anda akan diarahkan ke halaman pembuatan akun Administrator awal.

---

### Cara 2: Menjalankan Mode Development

```bash
# Terminal 1 - Backend Dev Server
cd server
npm run dev

# Terminal 2 - Frontend Vite Dev Server
cd client
npm run dev
```
Akses Vite frontend di `http://localhost:5173` (otomatis mem-proxy request API dan WebSocket ke backend di port 3001).

---

### Cara 3: Menggunakan Docker / Docker Compose

```bash
docker compose up -d --build
```
Aplikasi akan berjalan di port `3001` dan data disimpan secara persisten di folder `./data`.

---

## ⚙️ Variabel Lingkungan (`.env`)

| Variabel | Deskripsi | Default |
|---|---|---|
| `PORT` | Port server web & API | `3001` |
| `JWT_SECRET` | Secret key untuk penandatanganan JWT | *Generated String* |
| `ENCRYPTION_KEY` | 64-karakter hex (32-byte) untuk master key AES-256-GCM | *Fallback Key* |
| `DATA_DIR` | Direktori penyimpanan database SQLite | `../data` |
