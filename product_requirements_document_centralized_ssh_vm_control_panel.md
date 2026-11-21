# Product Requirements Document (PRD)
**Nama Proyek:** Centralized SSH VM Control Panel (Working Title: *NexusSSH* / *VMDash*)  
**Versi:** 1.0 (MVP)  
**Tanggal:** 21 November 2026  
**Arsitektur Utama:** Agentless (Berbasis Protokol SSH & WebSocket)

---

## 1. Latar Belakang & Tujuan Produk
### 1.1 Latar Belakang
Mengelola banyak Virtual Machine (VM) yang tersebar di berbagai mesin fisik, penyedia *cloud*, maupun jaringan yang berbeda membutuhkan pengelolaan koneksi SSH secara manual satu per satu. Hal ini menyulitkan pemantauan kondisi *resource* secara menyeluruh, memperlambat tindakan pemeliharaan rutin, dan meningkatkan risiko kesalahan manajemen kredensial.

### 1.2 Tujuan Produk
Membangun aplikasi web terpusat (menyerupai antarmuka Proxmox VE) yang mampu menampung, memantau, dan mengendalikan seluruh VM dari berbagai lokasi hanya dengan memanfaatkan koneksi **SSH** tanpa perlu menginstal *agent* tambahan di sisi VM (*agentless*).

### 1.3 Target Pengguna
* System Administrator, DevOps Engineer, atau Developer individu yang mengelola infrastruktur multi-VM/multi-server secara mandiri.

---

## 2. Ruang Lingkup Fitur (Scope of Work)

### 2.1 Fitur Utama (MVP - Fase 1)
1. **Manajemen Node / VM (Inventory):**
   * Menambah, mengedit, mengelompokkan (*tagging/grouping*), dan menghapus daftar VM.
   * Menyimpan konfigurasi koneksi: Host/IP Address, Port SSH, Username, dan Metode Autentikasi (SSH Private Key atau Password).
   * Fitur *Connection Test* untuk memverifikasi status jangkauan SSH sebelum disimpan.
2. **Real-Time Resource Monitoring:**
   * Menampilkan status konektivitas setiap VM (`Online` / `Offline` / `Unreachable`).
   * Menampilkan metrik dasar secara berkala (interval 3–5 detik): Penggunaan CPU (%), Penggunaan RAM (Used/Total), Penggunaan Disk (/), Load Average, dan System Uptime.
   * Pengambilan data dilakukan melalui eksekusi perintah ringan berbasis SSH (membaca `/proc/stat`, `/proc/meminfo`, `df`, `uptime`).
3. **Interactive Web Console (Browser Terminal):**
   * Akses terminal interaktif (PTY) langsung di dalam *browser* menggunakan `xterm.js` yang terhubung melalui WebSocket ke sesi SSH backend.
   * Mendukung ukuran layar dinamis (*terminal resize*), *copy-paste*, dan warna ANSI standar.
4. **Power & Basic System Actions:**
   * Tombol aksi cepat pada setiap VM: **Reboot** dan **Shutdown** (dengan modal konfirmasi keamanan).
   * Eksekusi perintah cepat (*Quick Snippets/Macros*) yang dapat dikustomisasi (misal: `apt update`, `docker ps`, atau `systemctl restart nginx`).
5. **Keamanan & Autentikasi Dashboard:**
   * Halaman Login untuk mengakses *dashboard* utama.
   * Enkripsi kredensial (SSH Private Key & Password) di dalam database menggunakan algoritma **AES-256-GCM**.

### 2.2 Fitur Lanjutan (Fase 2 - Post-MVP)
* **Web SFTP File Manager:** Antarmuka untuk menjelajah direktori, mengunggah (*upload*), mengunduh (*download*), dan mengedit file konfigurasi langsung dari web.
* **Multi-Node Broadcast Command:** Menjalankan satu perintah yang sama ke beberapa VM yang dipilih secara bersamaan.
* **Alerting & Notifikasi:** Peringatan otomatis (via Telegram/Discord Webhook) jika VM berstatus `Offline` atau penggunaan CPU/RAM melewati ambang batas tertentu.
* **Audit Log:** Pencatatan riwayat siapa yang membuka terminal atau menjalankan perintah *reboot/shutdown* beserta *timestamp*-nya.

---

## 3. Arsitektur & Spesifikasi Teknis

### 3.1 Alur Komunikasi Sistem
```text
[Browser Client] 
   │  ▲
   │  └─── WebSocket (Terminal I/O & Live Metrics Stream)
   │  └─── REST API / HTTPS (CRUD Nodes, Auth, Power Actions)
   ▼
[Backend Orchestrator (Node.js / Go)]
   │  ▲
   │  └─── SSH Connection Pool & PTY Multiplexer (Port 22 / Custom)
   ▼
[Target VMs (Tersebar di berbagai Host/Cloud/VPN Mesh)]
```

### 3.2 Rekomendasi Tech Stack
* **Frontend:** React / Next.js + TypeScript, Tailwind CSS, `@xterm/xterm` (Terminal Emulator), Lucide Icons.
* **Backend:** Node.js (Fastify/Express + library `ssh2` + `ws`) **atau** Go (Fiber/Gin + `golang.org/x/crypto/ssh` + `gorilla/websocket`).
* **Database:** PostgreSQL atau SQLite (cukup untuk penggunaan *single-user* atau tim kecil).
* **Lapisan Jaringan (Opsional namun Direkomendasikan):** Tailscale atau WireGuard untuk menyatukan VM yang berada di balik NAT/jaringan lokal berbeda tanpa membuka port SSH ke publik.

### 3.3 Skema Database (Ringkasan)
1. **`users`**: `id`, `username`, `password_hash`, `created_at`
2. **`nodes` (Daftar VM)**:
   * `id` (UUID)
   * `name` (String - Nama alias VM, misal: `prod-db-01`)
   * `group_name` (String - Kategori/lokasi, misal: `AWS`, `HomeLab`, `Proxmox-Node1`)
   * `host` (String - IP Publik / IP Private VPN / Domain)
   * `port` (Integer - Default: `22`)
   * `username` (String - Default: `root` atau user non-root)
   * `auth_type` (Enum: `key`, `password`)
   * `encrypted_credential` (Text - Private key atau password terenkripsi)
   * `iv_tag` (String - Initialization Vector & Auth Tag untuk dekripsi AES-256-GCM)
   * `created_at`, `updated_at`
3. **`snippets` (Perintah Cepat)**: `id`, `title`, `command`, `description`

---

## 4. Kebutuhan Non-Fungsional (Non-Functional Requirements)

| Kategori | Persyaratan |
| :--- | :--- |
| **Keamanan (Security)** | 1. *Master Encryption Key* wajib disimpan di *environment variable* server, terpisah dari database.<br>2. Sesi WebSocket terminal wajib memvalidasi token autentikasi (JWT/Session) sebelum membuka koneksi SSH.<br>3. Mendukung konfigurasi `sudo NOPASSWD` terbatas untuk perintah manajemen daya. |
| **Performa (Performance)** | 1. Latensi ketikan pada Web Console maksimal `< 100ms` di atas latensi jaringan SSH asli.<br>2. Pengambilan metrik VM berjalan secara asinkron (*non-blocking*) dengan *timeout* maksimal 3 detik per VM agar satu VM yang *offline* tidak menghambat pemantauan VM lainnya. |
| **Kompatibilitas OS** | Mendukung target VM berbasis distribusi Linux umum (Ubuntu, Debian, CentOS/RHEL, Alpine) yang memiliki utilitas standar `/proc` dan POSIX shell (`/bin/sh` atau `/bin/bash`). |

---

## 5. Rencana Pengerjaan (Roadmap)

* **Minggu 1: Pondasi Backend & Web Terminal (PoC)**
  * Setup proyek Backend & Frontend.
  * Implementasi endpoint WebSocket yang menjembatani `xterm.js` dengan sesi SSH PTY ke satu VM hardcode.
* **Minggu 2: Manajemen Inventory & Enkripsi**
  * Setup database dan modul enkripsi kredensial SSH.
  * Pembuatan UI CRUD untuk menambah dan mengelola daftar VM serta fitur *Test Connection*.
* **Minggu 3: Monitoring & Power Controls**
  * Pembuatan *background worker* di backend untuk mengambil metrik CPU/RAM/Disk dari seluruh VM aktif.
  * Tampilan *dashboard* kartu/tabel ala Proxmox beserta tombol *Reboot*, *Shutdown*, dan *Quick Snippets*.
* **Minggu 4: Hardening & Deployment**
  * Penambahan sistem login dashboard, *rate limiting*, dan pengujian skenario VM *timeout/offline*.
  * Packaging aplikasi menggunakan Docker (`docker-compose`) agar mudah di-*deploy*.

---

## 6. Kriteria Keberhasilan (Acceptance Criteria)
1. Pengguna dapat menambahkan minimal 5 VM dari lokasi jaringan berbeda ke dalam satu *dashboard*.
2. Pengguna dapat melihat status hidup/mati serta penggunaan CPU dan RAM seluruh VM dalam satu layar tanpa perlu *refresh* halaman secara manual.
3. Pengguna dapat membuka konsol terminal VM langsung dari *browser*, menjalankan perintah interaktif (seperti `htop`, `vim`, atau `docker logs -f`), dan menutup sesi dengan bersih tanpa meninggalkan proses *zombie* di backend.