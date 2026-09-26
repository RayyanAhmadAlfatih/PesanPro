# Roadmap mentest fitur

# MASTER LIVE TEST PESANPRO

Saya pecah menjadi **18 Phase**. Jangan langsung mengerjakan semuanya sekaligus. Kerjakan per phase dan kirim hasilnya kepada saya.

## Phase L0 — Production/Deployment Sanity

| ID                                       | Test live                                | Expected                                 |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| L0-01                                    | Buka domain utama PesanPro               | HTTP 200, halaman normal                 |
| L0-02                                    | HTTPS                                    | Tidak ada mixed-content/error sertifikat |
| L0-03                                    | `/api/health/live`                       | Healthy/200                              |
| L0-04                                    | `/api/health/ready`                      | Ready/200 jika dependency sehat          |
| L0-05                                    | `/api/health`                            | Database/runtime dependency sehat        |
| L0-06                                    | Restart aplikasi                         | Aplikasi kembali normal                  |
| L0-07                                    | Restart worker                           | Worker heartbeat kembali                 |
| L0-08                                    | Restart socket/server WA                 | Existing session recovery sesuai desain  |
| L0-09                                    | Browser console dashboard                | Tidak ada error berulang                 |
| L0-10                                    | Network dashboard                        | Tidak ada request 500 yang abnormal      |
| L0-11                                    | Refresh beberapa dashboard page          | Tidak logout/random error                |
| L0-12                                    | Direct URL `/dashboard/...`              | Tidak menghasilkan 404 yang salah        |
| L0-13                                    | `/terms`                                 | Bisa dibuka                              |
| L0-14                                    | `/privacy`                               | Bisa dibuka                              |
| L0-15                                    | 404 URL acak                             | Custom 404 bekerja                       |
| L0-16                                    | Simulasikan error aman                   | Error boundary tidak blank-screen        |

**Gate:** kalau health/database/runtime gagal, jangan lanjut messaging.

---

# Phase L1 — Authentication & Account

Repository mempunyai Login, Register, Forgot Password, Reset Password, account status dan login rate-limit.

| ID                                      | Test                                    | Expected                                |
| --------------------------------------- | --------------------------------------- | --------------------------------------- |
| L1-01                                   | Register user valid                     | Akun dibuat                             |
| L1-02                                   | Nama <2 karakter                        | Ditolak                                 |
| L1-03                                   | Email invalid                           | Ditolak                                 |
| L1-04                                   | Password <10 karakter                   | Ditolak                                 |
| L1-05                                   | Password tanpa uppercase                | Ditolak                                 |
| L1-06                                   | Password tanpa lowercase                | Ditolak                                 |
| L1-07                                   | Password tanpa angka                    | Ditolak                                 |
| L1-08                                   | Confirm password berbeda                | Ditolak                                 |
| L1-09                                   | Register email existing                 | Ditolak aman                            |
| L1-10                                   | Login benar                             | Masuk dashboard                         |
| L1-11                                   | Login password salah                    | Ditolak                                 |
| L1-12                                   | Login email nonexistent                 | Ditolak tanpa bocorkan keberadaan akun  |
| L1-13                                   | 5+ login gagal cepat                    | Rate limit bekerja                      |
| L1-14                                   | Logout                                  | Session login invalid dan kembali login |
| L1-15                                   | Buka dashboard setelah logout           | Redirect login                          |
| L1-16                                   | Forgot password akun valid              | Request diterima                        |
| L1-17                                   | Forgot password email tidak dikenal     | Tidak membocorkan account enumeration   |
| L1-18                                   | Reset link valid                        | Password berhasil berubah               |
| L1-19                                   | Reset token digunakan 2×                | Kedua ditolak                           |
| L1-20                                   | Reset token expired                     | Ditolak                                 |
| L1-21                                   | Password lama setelah reset             | Tidak bisa login                        |
| L1-22                                   | Password baru                           | Bisa login                              |
| L1-23                                   | SUPERADMIN suspend USER-A               | Login USER-A ditolak                    |
| L1-24                                   | Reactivate USER-A                       | Login kembali berhasil                  |
| L1-25                                   | Disable registration di Settings        | Registrasi baru ditolak                 |
| L1-26                                   | Enable registration lagi                | Registrasi berfungsi                    |

---

# Phase L2 — RBAC dan Tenant Isolation **P0**

Ini salah satu gate terpenting.

| ID                                           | Test                                         | Expected                                     |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| L2-01                                        | USER-A buka `/dashboard/users`               | Ditolak/redirect                             |
| L2-02                                        | USER-A buka `/dashboard/commercial`          | Ditolak                                      |
| L2-03                                        | USER-A buka `/dashboard/settings`            | Ditolak                                      |
| L2-04                                        | USER-A buka `/dashboard/system-monitor`      | Ditolak                                      |
| L2-05                                        | USER-A buka `/dashboard/notifications` admin | Ditolak                                      |
| L2-06                                        | Sidebar USER-A                               | Menu admin tidak muncul                      |
| L2-07                                        | SUPERADMIN                                   | Semua menu admin muncul                      |
| L2-08                                        | USER-A akses Session QA-B via URL            | 403/404, data tidak bocor                    |
| L2-09                                        | USER-A akses chat QA-B                       | Ditolak                                      |
| L2-10                                        | USER-A akses media USER-B                    | Ditolak                                      |
| L2-11                                        | USER-A akses MessageJob USER-B               | Ditolak                                      |
| L2-12                                        | USER-A access Broadcast USER-B               | Ditolak                                      |
| L2-13                                        | USER-A access Campaign USER-B                | Ditolak                                      |
| L2-14                                        | USER-A access Segment USER-B                 | Ditolak                                      |
| L2-15                                        | USER-A access Schedule USER-B                | Ditolak                                      |
| L2-16                                        | USER-A access AutoReply USER-B               | Ditolak                                      |
| L2-17                                        | USER-A access Webhook USER-B                 | Ditolak                                      |
| L2-18                                        | USER-A access IntegrationToken USER-B        | Ditolak                                      |
| L2-19                                        | USER-A access API key USER-B                 | Ditolak                                      |
| L2-20                                        | USER-A menebak ID resource USER-B            | Tidak ada IDOR/data leak                     |
| L2-21                                        | USER-B tetap normal setelah percobaan        | Tidak ada resource berubah                   |

**Semua L2 wajib PASS.** Satu cross-tenant IDOR saja saya anggap **P0 blocker**.

---

# Phase L3 — Dashboard & WhatsApp Session

PesanPro mendukung create session, custom ID, QR, pairing code, start/stop/restart/logout/delete serta status real-time.

| ID                                       | Test                                     | Expected                                 |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| L3-01                                    | Dashboard baru                           | Statistik benar                          |
| L3-02                                    | Create session nama valid                | Session dibuat                           |
| L3-03                                    | Custom session ID valid                  | Diterima                                 |
| L3-04                                    | ID duplicate                             | Ditolak                                  |
| L3-05                                    | ID karakter invalid                      | Tidak diterima                           |
| L3-06                                    | Session muncul dashboard                 | Ya                                       |
| L3-07                                    | Pilih Session dari navbar                | Cookie/current session berubah           |
| L3-08                                    | Buka session detail                      | Informasi benar                          |
| L3-09                                    | Start session                            | Status berubah                           |
| L3-10                                    | QR muncul                                | Valid                                    |
| L3-11                                    | Scan QR dari WhatsApp                    | CONNECTED                                |
| L3-12                                    | Connected As                             | Nomor/account benar                      |
| L3-13                                    | Socket update                            | Status berubah tanpa reload manual       |
| L3-14                                    | Pair by phone number                     | Pairing code muncul                      |
| L3-15                                    | Copy pairing code                        | Benar                                    |
| L3-16                                    | Pairing code digunakan                   | CONNECTED                                |
| L3-17                                    | Restart session                          | Reconnect normal                         |
| L3-18                                    | Stop session                             | STOPPED                                  |
| L3-19                                    | Start kembali                            | Bisa connect                             |
| L3-20                                    | Logout WhatsApp                          | Credential/session keluar                |
| L3-21                                    | Connect kembali                          | QR/pairing dapat digunakan               |
| L3-22                                    | Delete session                           | Session + auth data hilang sesuai desain |
| L3-23                                    | Reload setelah delete                    | Session tidak muncul lagi                |
| L3-24                                    | USER-A punya 2 session                   | Selector switching benar                 |
| L3-25                                    | Operation pada QA-A                      | Tidak salah terkirim melalui QA-B        |

---

# Phase L4 — Chat UI & WhatsApp Messaging

UI saat ini secara langsung mendukung chat list, search, new chat, text, reply, image/video/audio/document, download dan delete.

| ID                                  | Test                                | Expected                            |
| ----------------------------------- | ----------------------------------- | ----------------------------------- |
| L4-01                               | Receive chat inbound                | Muncul real-time                    |
| L4-02                               | Search chat                         | Hasil benar                         |
| L4-03                               | Start new chat `08...`              | Dinormalisasi ke `62...`            |
| L4-04                               | Start new chat `628...`             | Benar                               |
| L4-05                               | Send text                           | Masuk Message Queue                 |
| L4-06                               | Recipient menerima                  | Konten benar                        |
| L4-07                               | Delivery state                      | SENT→DELIVERED                      |
| L4-08                               | Recipient read                      | Status READ jika tersedia           |
| L4-09                               | Enter                               | Send                                |
| L4-10                               | Shift+Enter                         | New line                            |
| L4-11                               | Reply pesan inbound                 | Quote benar                         |
| L4-12                               | Reply pesan outbound                | Quote benar                         |
| L4-13                               | Esc saat reply                      | Cancel reply                        |
| L4-14                               | Upload image                        | Terkirim                            |
| L4-15                               | Upload video                        | Terkirim                            |
| L4-16                               | Upload audio                        | Terkirim                            |
| L4-17                               | Upload document                     | Terkirim                            |
| L4-18                               | Caption + media                     | Benar                               |
| L4-19                               | Download received image             | File benar                          |
| L4-20                               | Download video/audio/document       | File benar                          |
| L4-21                               | Delete message sesuai kemampuan WA  | State konsisten                     |
| L4-22                               | Scroll history panjang              | Pagination tidak duplikat           |
| L4-23                               | Message inbound saat scroll di atas | Badge/new-message handling benar    |
| L4-24                               | Chat list last message              | Update                              |
| L4-25                               | Multi-session chat                  | Tidak tercampur                     |

---

# Phase L5 — Extended WhatsApp Operations / API

Source juga memiliki backend untuk operasi yang belum semuanya diekspos penuh di Chat UI.

| ID                          | Test                        | Expected                    |
| --------------------------- | --------------------------- | --------------------------- |
| L5-01                       | Check nomor WhatsApp        | Valid/invalid benar         |
| L5-02                       | Mark chat read              | Unread berubah              |
| L5-03                       | Archive chat                | Berhasil                    |
| L5-04                       | Unarchive                   | Berhasil                    |
| L5-05                       | Mute chat                   | Berhasil                    |
| L5-06                       | Unmute                      | Berhasil                    |
| L5-07                       | Pin chat                    | Berhasil                    |
| L5-08                       | Unpin                       | Berhasil                    |
| L5-09                       | Presence update             | Tidak error                 |
| L5-10                       | Profile picture lookup      | Benar                       |
| L5-11                       | Search message              | Hasil tepat                 |
| L5-12                       | React message               | Reaction diterima           |
| L5-13                       | Remove/change reaction      | State benar                 |
| L5-14                       | Star message                | Berhasil                    |
| L5-15                       | Unstar                      | Berhasil                    |
| L5-16                       | Forward message             | Konten diterima             |
| L5-17                       | Send contact card           | Kontak valid                |
| L5-18                       | Send location               | Lokasi valid                |
| L5-19                       | Send poll                   | Poll WhatsApp valid         |
| L5-20                       | Download media by messageId | Tenant-safe dan file valid  |

Nanti saat kita sampai L5, saya bisa buat **curl/Postman commands satu per satu** dari live domain Anda.

---

# Phase L6 — Durable Message Queue **P0/P1**

Status yang tersedia di source: `QUEUED`, `PROCESSING`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `CANCELLED`.

| ID                                     | Test                                   | Expected                               |
| -------------------------------------- | -------------------------------------- | -------------------------------------- |
| L6-01                                  | Send dari Chat                         | Job dibuat                             |
| L6-02                                  | QUEUED→PROCESSING                      | Normal                                 |
| L6-03                                  | PROCESSING→SENT                        | Normal                                 |
| L6-04                                  | SENT→DELIVERED                         | Normal                                 |
| L6-05                                  | DELIVERED→READ                         | Normal bila recipient membaca          |
| L6-06                                  | Stop worker saat job QUEUED            | Job tidak hilang                       |
| L6-07                                  | Start worker lagi                      | Job dilanjutkan                        |
| L6-08                                  | Restart app saat queue                 | Tidak duplicate                        |
| L6-09                                  | Disconnect WA saat processing          | Retry/failure aman                     |
| L6-10                                  | Reconnect WA                           | Retry sukses                           |
| L6-11                                  | Cancel QUEUED                          | CANCELLED dan tidak terkirim           |
| L6-12                                  | Cancel SENT                            | Ditolak                                |
| L6-13                                  | Paksa FAILED                           | Error tercatat                         |
| L6-14                                  | Retry FAILED                           | Job baru/attempt aman                  |
| L6-15                                  | Refresh halaman                        | State tetap dari DB                    |
| L6-16                                  | Double click send                      | Tidak menghasilkan duplicate abnormal  |
| L6-17                                  | Parallel 10 sends                      | Semua memiliki job sendiri             |
| L6-18                                  | Restart worker di tengah parallel send | Tidak loss/duplicate                   |

---

# Phase L7 — Labels & Contacts

| ID                              | Test                            | Expected                        |
| ------------------------------- | ------------------------------- | ------------------------------- |
| L7-01                           | Create label                    | Berhasil                        |
| L7-02                           | Pilih warna                     | Warna tersimpan                 |
| L7-03                           | Rename label                    | Berubah                         |
| L7-04                           | Ubah warna                      | Berubah                         |
| L7-05                           | Search contact                  | Benar                           |
| L7-06                           | Assign chat ke label            | Assignment muncul               |
| L7-07                           | Assign beberapa label ke chat   | Semua ada                       |
| L7-08                           | Filter/list chat by label       | Hasil benar                     |
| L7-09                           | Remove label dari chat          | Hilang                          |
| L7-10                           | Delete label                    | Assignment ikut dibersihkan     |
| L7-11                           | Assign label milik session lain | Ditolak                         |
| L7-12                           | USER-A gunakan label USER-B     | Ditolak                         |

---

# Phase L8 — Private Media & Media Manager **P0**

| ID                                    | Test                                  | Expected                              |
| ------------------------------------- | ------------------------------------- | ------------------------------------- |
| L8-01                                 | Receive image                         | Masuk media storage/list              |
| L8-02                                 | Receive video/audio/document          | Masuk                                 |
| L8-03                                 | Search media                          | Benar                                 |
| L8-04                                 | Filter type                           | Benar                                 |
| L8-05                                 | Preview                               | File benar                            |
| L8-06                                 | Download                              | File utuh                             |
| L8-07                                 | Bulk select                           | Benar                                 |
| L8-08                                 | Delete media                          | Record/file hilang sesuai desain      |
| L8-09                                 | Private media upload API              | Berhasil                              |
| L8-10                                 | Reuse mediaId untuk message           | Berhasil                              |
| L8-11                                 | Media USER-A oleh USER-B              | **403/404**                           |
| L8-12                                 | Tebak URL/file name media tenant lain | Tidak bocor                           |
| L8-13                                 | Deleted mediaId digunakan             | Ditolak aman                          |
| L8-14                                 | Invalid/oversize file                 | Ditolak                               |
| L8-15                                 | Restart app                           | Private media tetap dapat digunakan   |

---

# Phase L9 — Broadcast

Implementasi terbaru repository mendukung CSV, variables, Spintax, durable queue, suppression dan pause/resume.

| ID                                                    | Test                                                  | Expected                                              |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| L9-01                                                 | Manual 2 nomor                                        | Broadcast dibuat                                      |
| L9-02                                                 | Duplicate nomor                                       | Otomatis dedupe                                       |
| L9-03                                                 | Group JID pada CSV                                    | Dilewati                                              |
| L9-04                                                 | Download CSV template                                 | File valid                                            |
| L9-05                                                 | Import CSV valid                                      | Recipient terdeteksi                                  |
| L9-06                                                 | Alias `phone`                                         | Terdeteksi                                            |
| L9-07                                                 | Alias `nomor_hp`                                      | Terdeteksi                                            |
| L9-08                                                 | CSV >2 MB                                             | Ditolak                                               |
| L9-09                                                 | \>5.000 rows                                          | Ditolak                                               |
| L9-10                                                 | \>20 columns                                          | Ditolak                                               |
| L9-11                                                 | Value >1000 chars                                     | Ditolak                                               |
| L9-12                                                 | `{{name}}`                                            | Dipersonalisasi per recipient                         |
| L9-13                                                 | `{{company}}`                                         | Benar                                                 |
| L9-14                                                 | Header `Invoice No`                                   | Menjadi `invoice_no`                                  |
| L9-15                                                 | Missing variable column                               | Create diblok                                         |
| L9-16                                                 | Spintax `{Halo|Hai}` preview                          | Valid                                                 |
| L9-17                                                 | Spintax + `{{name}}`                                  | Keduanya benar                                        |
| L9-18                                                 | CSV value `{Ayu|Budi}`                                | **Tidak dieksekusi sebagai Spintax**                  |
| L9-19                                                 | Delay min/max                                         | Sesuai rentang                                        |
| L9-20                                                 | Broadcast + mediaId                                   | Terkirim                                              |
| L9-21                                                 | Pause                                                 | Tidak enqueue baru                                    |
| L9-22                                                 | Resume                                                | Lanjut                                                |
| L9-23                                                 | Cancel                                                | Sisa recipient batal                                  |
| L9-24                                                 | Restart worker                                        | Broadcast lanjut tanpa duplicate                      |
| L9-25                                                 | Progress setelah refresh                              | Tetap benar                                           |
| L9-26                                                 | Manual suppression                                    | Recipient tidak terkirim                              |
| L9-27                                                 | Remove suppression                                    | Bisa menerima lagi                                    |
| L9-28                                                 | Recipient kirim `STOP`                                | Masuk suppression otomatis                            |
| L9-29                                                 | Recipient kirim `BERHENTI`                            | Masuk suppression                                     |
| L9-30                                                 | Opt-out setelah Broadcast dibuat tapi sebelum enqueue | **Tetap tidak terkirim**                              |
| L9-31                                                 | Duplicate create/idempotency                          | Tidak duplicate broadcast                             |
| L9-32                                                 | Cross-tenant Broadcast ID                             | Ditolak                                               |

---

# Phase L10 — Segment & Campaign

| ID                             | Test                           | Expected                       |
| ------------------------------ | ------------------------------ | ------------------------------ |
| L10-01                         | Segment berdasarkan source     | Preview benar                  |
| L10-02                         | Segment Contact Tag            | Benar                          |
| L10-03                         | Segment WhatsApp Label         | Benar                          |
| L10-04                         | Custom attribute `kota=...`    | Benar                          |
| L10-05                         | Consent UNKNOWN                | Benar                          |
| L10-06                         | Consent OPTED\_IN              | Benar                          |
| L10-07                         | Consent OPTED\_OUT             | Benar                          |
| L10-08                         | Kombinasi filter               | AND                            |
| L10-09                         | Save segment                   | Berhasil                       |
| L10-10                         | Edit segment                   | Version naik                   |
| L10-11                         | Delete unused segment          | Benar                          |
| L10-12                         | Create Campaign                | Berhasil                       |
| L10-13                         | Launch sekarang                | Recipient snapshot terkunci    |
| L10-14                         | Ubah segment setelah launch    | Campaign lama tidak berubah    |
| L10-15                         | requireOptIn aktif             | Opt-out dilewati               |
| L10-16                         | Campaign media                 | Berhasil                       |
| L10-17                         | Delay min/max                  | Benar                          |
| L10-18                         | Primary device disconnect      | Fallback sesuai policy         |
| L10-19                         | Fallback session               | Terkirim via device yang tepat |
| L10-20                         | Pause campaign                 | Berhenti aman                  |
| L10-21                         | Resume                         | Lanjut                         |
| L10-22                         | Cancel                         | Berhenti permanen              |
| L10-23                         | Schedule Campaign              | Berjalan pada waktunya         |
| L10-24                         | Timezone Asia/Jakarta          | Waktu benar                    |
| L10-25                         | Export campaign                | Data benar                     |
| L10-26                         | Restart worker                 | Campaign durable               |
| L10-27                         | Cross-tenant segment/campaign  | Ditolak                        |

---

# Phase L11 — Scheduler

Scheduler mendukung `ONE_TIME`, recurring cron, timezone, media dan missed-run policy.

| ID                                         | Test                                       | Expected                                   |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| L11-01                                     | One-time + text                            | Dikirim tepat waktu                        |
| L11-02                                     | One-time + media                           | Dikirim                                    |
| L11-03                                     | Text + media                               | Benar                                      |
| L11-04                                     | Existing mediaId                           | Berhasil                                   |
| L11-05                                     | Local `Asia/Jakarta`                       | Waktu benar                                |
| L11-06                                     | Timezone lain                              | Conversion benar                           |
| L11-07                                     | Recurring cron                             | Berulang                                   |
| L11-08                                     | Edit schedule                              | Next run berubah                           |
| L11-09                                     | Cancel                                     | Tidak ada run berikut                      |
| L11-10                                     | Restart app sebelum waktunya               | Tetap terkirim                             |
| L11-11                                     | Worker mati melewati schedule + SEND\_LATE | Dikirim terlambat                          |
| L11-12                                     | Missed + SKIP                              | Occurrence dilewati                        |
| L11-13                                     | Missed + CANCEL                            | Schedule batal                             |
| L11-14                                     | Grace period boundary                      | Sesuai                                     |
| L11-15                                     | Invalid cron                               | Ditolak                                    |
| L11-16                                     | Invalid timezone                           | Ditolak                                    |
| L11-17                                     | Session disconnected                       | Failure/retry terkontrol                   |
| L11-18                                     | Cross-tenant schedule                      | Ditolak                                    |

---

# Phase L12 — Auto Reply

Terdapat `EXACT`, `CONTAINS`, `STARTS_WITH`, safe `REGEX`, `FALLBACK`; audience PRIVATE/GROUP/ALL; active schedule; priority; cooldown; rate limit; chain depth.

| ID                                     | Test                                   | Expected                               |
| -------------------------------------- | -------------------------------------- | -------------------------------------- |
| L12-01                                 | EXACT `halo`                           | Balasan tepat                          |
| L12-02                                 | `HALO` case behavior                   | Sesuai rule                            |
| L12-03                                 | CONTAINS                               | Match                                  |
| L12-04                                 | STARTS\_WITH                           | Match                                  |
| L12-05                                 | REGEX valid                            | Match                                  |
| L12-06                                 | Unsafe regex                           | Ditolak                                |
| L12-07                                 | FALLBACK                               | Hanya ketika rule lain tidak match     |
| L12-08                                 | Dua rule match                         | Priority menentukan                    |
| L12-09                                 | PRIVATE                                | Group tidak trigger                    |
| L12-10                                 | GROUP                                  | Private tidak trigger                  |
| L12-11                                 | ALL                                    | Keduanya                               |
| L12-12                                 | Rule disabled                          | Tidak trigger                          |
| L12-13                                 | Toggle enabled                         | Trigger lagi                           |
| L12-14                                 | Preview tanpa kirim                    | Menunjukkan rule yang benar            |
| L12-15                                 | Preview group                          | Audience diperhitungkan                |
| L12-16                                 | Active days                            | Di luar hari tidak kirim               |
| L12-17                                 | Active hours                           | Di luar jam tidak kirim                |
| L12-18                                 | Overnight time range jika didukung     | Benar                                  |
| L12-19                                 | Cooldown                               | Message kedua diblok sesuai waktu      |
| L12-20                                 | Rate limit                             | Limit bekerja                          |
| L12-21                                 | Max chain depth                        | Loop bot dicegah                       |
| L12-22                                 | Auto Reply mediaId                     | Media terkirim                         |
| L12-23                                 | Edit rule                              | Version naik                           |
| L12-24                                 | Delete rule                            | Tidak trigger lagi                     |
| L12-25                                 | Trigger log                            | Sender/text/status/reason/job tercatat |
| L12-26                                 | Restart worker                         | Cooldown/log tetap durable             |
| L12-27                                 | Cross-tenant rule                      | Ditolak                                |

---

# Phase L13 — Webhook Engine

Event yang tersedia di source:

`message.received`, `message.sent`, `message.status`, `connection.update`, `group.update`, `group.participant`, `contact.update`, `status.update`, `message.edited`, `message.deleted`, `schedule.status`, `broadcast.status`, `campaign.status`.

| ID                                           | Test                                         | Expected                                     |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| L13-01                                       | Create endpoint HTTPS                        | Berhasil                                     |
| L13-02                                       | Create tanpa event                           | Ditolak                                      |
| L13-03                                       | Secret auto-generated                        | Tampil **sekali**                            |
| L13-04                                       | Custom secret                                | Bisa digunakan                               |
| L13-05                                       | Test webhook                                 | Receiver menerima                            |
| L13-06                                       | Signature verification                       | Valid                                        |
| L13-07                                       | Payload message.received                     | Benar                                        |
| L13-08                                       | message.sent                                 | Benar                                        |
| L13-09                                       | message.status                               | Benar                                        |
| L13-10                                       | connection.update                            | Benar                                        |
| L13-11                                       | group.update                                 | Benar                                        |
| L13-12                                       | group.participant                            | Benar                                        |
| L13-13                                       | contact.update                               | Benar                                        |
| L13-14                                       | status.update                                | Benar                                        |
| L13-15                                       | message.edited                               | Benar                                        |
| L13-16                                       | message.deleted                              | Benar                                        |
| L13-17                                       | schedule.status                              | Benar                                        |
| L13-18                                       | broadcast.status                             | Benar                                        |
| L13-19                                       | campaign.status                              | Benar                                        |
| L13-20                                       | Endpoint HTTP 500                            | Delivery FAILED/retry                        |
| L13-21                                       | Endpoint timeout                             | Retry aman                                   |
| L13-22                                       | Logs                                         | Payload, response, headers, latency terlihat |
| L13-23                                       | Replay failed delivery                       | Delivery baru dibuat                         |
| L13-24                                       | Replay success                               | Tidak mengubah log original                  |
| L13-25                                       | Disable webhook                              | Event berhenti                               |
| L13-26                                       | Enable kembali                               | Event masuk                                  |
| L13-27                                       | Edit URL/events                              | Efektif                                      |
| L13-28                                       | Rotate secret                                | New secret bekerja                           |
| L13-29                                       | Previous signature transition                | Sesuai 24h design                            |
| L13-30                                       | Delete                                       | Tidak menerima lagi                          |
| L13-31                                       | Restart webhook worker                       | Outbox tidak hilang/duplicate abnormal       |
| L13-32                                       | Cross-tenant webhook                         | Ditolak                                      |

---

# Phase L14 — Developer API & API Keys **P0**

Billing UI menunjukkan scope:

`device:read/write`, `message:read/send`, `media:read/write`, `schedule:read/write`, `broadcast:read/write`, `campaign:read/write`, `autoreply:read/write`, `webhook:read/write`.

| ID                                  | Test                                | Expected                            |
| ----------------------------------- | ----------------------------------- | ----------------------------------- |
| L14-01                              | Create key                          | Secret tampil sekali                |
| L14-02                              | Reload                              | Full secret tidak bisa dilihat lagi |
| L14-03                              | API tanpa key                       | 401                                 |
| L14-04                              | Invalid key                         | 401                                 |
| L14-05                              | Valid key                           | Berhasil                            |
| L14-06                              | `message:read` key mencoba send     | 403                                 |
| L14-07                              | `message:send`                      | Send allowed                        |
| L14-08                              | Media read/write boundary           | Benar                               |
| L14-09                              | Schedule scopes                     | Benar                               |
| L14-10                              | Broadcast scopes                    | Benar                               |
| L14-11                              | Campaign scopes                     | Benar                               |
| L14-12                              | AutoReply scopes                    | Benar                               |
| L14-13                              | Webhook scopes                      | Benar                               |
| L14-14                              | Expired key                         | Ditolak                             |
| L14-15                              | Revoke key                          | Langsung invalid                    |
| L14-16                              | Rotate key                          | Old secret invalid                  |
| L14-17                              | New rotated key                     | Valid                               |
| L14-18                              | IP allowlist correct IP             | Allowed                             |
| L14-19                              | IP allowlist wrong IP               | Denied                              |
| L14-20                              | IPv6 allowlist                      | Benar                               |
| L14-21                              | Idempotency key text message sama   | Satu logical job                    |
| L14-22                              | Idempotency key + payload berbeda   | Conflict/ditolak                    |
| L14-23                              | Duplicate HTTP retry                | Tidak duplicate WA                  |
| L14-24                              | USER-A key → USER-B session         | Ditolak                             |
| L14-25                              | USER-A key → USER-B media           | Ditolak                             |
| L14-26                              | USER-A key → USER-B job             | Ditolak                             |
| L14-27                              | Concurrent requests                 | Quota atomic                        |
| L14-28                              | Rate limit                          | Terukur dan tidak bypass mudah      |
| L14-29                              | lastUsedAt                          | Update                              |
| L14-30                              | Audit penggunaan credential         | Ada bila dirancang                  |

Endpoint v1 yang harus tersentuh minimal mencakup `messages`, `media`, `schedules`, `broadcasts`, `segments`, `campaigns`, `autoreplies`, `suppressions`, `contact-tags`, `contacts/profile` dan integration tokens.

---

# Phase L15 — Google Forms, CF7, WordPress/WooCommerce Integrations

Repository memang sudah memiliki connector Google Forms dan plugin Contact Form 7.

### Google Forms

| ID                                      | Test                                    | Expected                                |
| --------------------------------------- | --------------------------------------- | --------------------------------------- |
| L15-G01                                 | Create `GOOGLE_FORMS` integration token | `ppint_...` tampil sekali               |
| L15-G02                                 | Token terikat ke session milik tenant   | Benar                                   |
| L15-G03                                 | Script Properties configuration check   | PASS                                    |
| L15-G04                                 | Submit Google Form                      | Pesan WA masuk queue                    |
| L15-G05                                 | Dynamic recipient field                 | Nomor benar                             |
| L15-G06                                 | Static recipient                        | Nomor fixed benar                       |
| L15-G07                                 | Message field mapping                   | Konten benar                            |
| L15-G08                                 | Replay same submission                  | Tidak duplicate                         |
| L15-G09                                 | Temporary 500                           | Connector retry                         |
| L15-G10                                 | Invalid token                           | Ditolak                                 |
| L15-G11                                 | Revoked token                           | Ditolak                                 |
| L15-G12                                 | Token USER-A + session USER-B           | Tidak dapat dibuat/digunakan            |

### Contact Form 7

| ID                                   | Test                                 | Expected                             |
| ------------------------------------ | ------------------------------------ | ------------------------------------ |
| L15-C01                              | Install plugin connector             | Tidak fatal error                    |
| L15-C02                              | Configure HTTPS endpoint             | Valid                                |
| L15-C03                              | Configure token server-side          | Tidak terekspos browser              |
| L15-C04                              | Submit CF7                           | Queue local dibuat                   |
| L15-C05                              | WA MessageJob PesanPro dibuat        | Ya                                   |
| L15-C06                              | Same CF7 submission hook 2×          | Tidak duplicate                      |
| L15-C07                              | PesanPro offline sementara           | Local queue retry                    |
| L15-C08                              | PesanPro online kembali              | Queue terkirim                       |
| L15-C09                              | Worker/cron overlap                  | Tidak double-send                    |
| L15-C10                              | Stale PROCESSING > recovery interval | Recover                              |
| L15-C11                              | Site Health                          | Configuration check benar            |
| L15-C12                              | Retention cleanup                    | Old queue/log dibersihkan            |

Kemudian kita test route integration **WordPress** dan **WooCommerce** juga apabila memang akan dipublikasikan sebagai fitur resmi produk.

---

# Phase L16 — Billing, Plans & Commercial

| ID                                    | Test                                  | Expected                              |
| ------------------------------------- | ------------------------------------- | ------------------------------------- |
| L16-01                                | USER lihat current plan               | Benar                                 |
| L16-02                                | Entitlements                          | Sesuai plan                           |
| L16-03                                | Usage consumed                        | Bertambah sesuai penggunaan           |
| L16-04                                | Limit tercapai                        | Operasi berikutnya ditolak            |
| L16-05                                | Unlimited plan                        | Commercial quota unlimited            |
| L16-06                                | Trial                                 | End date benar                        |
| L16-07                                | Grace period                          | Behaviour benar                       |
| L16-08                                | List plan                             | Benar                                 |
| L16-09                                | Submit payment proof HTTPS            | PENDING                               |
| L16-10                                | Invalid proof URL                     | Ditolak                               |
| L16-11                                | SUPERADMIN lihat submission           | Ya                                    |
| L16-12                                | Approve tanpa note jika note required | Ditolak                               |
| L16-13                                | Approve + note                        | APPROVED                              |
| L16-14                                | Reject                                | REJECTED                              |
| L16-15                                | Approval tidak auto-assign plan       | Sesuai desain                         |
| L16-16                                | SUPERADMIN assign subscription        | Aktif                                 |
| L16-17                                | Change plan                           | Entitlement berubah                   |
| L16-18                                | Entitlement override enable           | Efektif                               |
| L16-19                                | Override disable                      | Efektif                               |
| L16-20                                | Override limit                        | Efektif                               |
| L16-21                                | Expiring override                     | Kembali plan default                  |
| L16-22                                | Set default plan                      | Benar                                 |
| L16-23                                | Disable plan                          | Tidak ditawarkan ke user              |

---

# Phase L17 — Users, Settings, Notifications & Operations

| ID                                  | Test                                | Expected                            |
| ----------------------------------- | ----------------------------------- | ----------------------------------- |
| L17-01                              | SUPERADMIN list users               | Berhasil                            |
| L17-02                              | Edit name/email                     | Berubah                             |
| L17-03                              | Change password admin-side          | Password baru aktif                 |
| L17-04                              | USER→SUPERADMIN                     | Role berubah                        |
| L17-05                              | SUPERADMIN→USER                     | Permission berubah                  |
| L17-06                              | Suspend                             | User kehilangan akses               |
| L17-07                              | Reactivate                          | Pulih                               |
| L17-08                              | Delete user                         | Sesuai dependency policy            |
| L17-09                              | Change app name                     | Sidebar/title berubah               |
| L17-10                              | Change timezone                     | Scheduler menggunakan timezone baru |
| L17-11                              | Logo URL                            | Branding benar                      |
| L17-12                              | Favicon URL                         | Benar                               |
| L17-13                              | Send notification to one user       | Hanya target menerima               |
| L17-14                              | Broadcast notification              | Semua target menerima               |
| L17-15                              | Realtime toast/socket               | Muncul tanpa refresh                |
| L17-16                              | Inbox unread                        | Counter benar                       |
| L17-17                              | Mark one read                       | Berubah                             |
| L17-18                              | Mark all read                       | Semua berubah                       |
| L17-19                              | Delete notification                 | Hilang                              |
| L17-20                              | Notification href                   | Navigasi benar                      |
| L17-21                              | System Monitor runtime heartbeat    | Semua worker terlihat               |
| L17-22                              | MySQL latency                       | Muncul                              |
| L17-23                              | Private storage                     | Sehat                               |
| L17-24                              | CPU/memory/disk                     | Data realistis                      |
| L17-25                              | Queue stats                         | Cocok dengan queue                  |
| L17-26                              | Buat kondisi warning aman           | Operational alert muncul            |
| L17-27                              | Acknowledge                         | Status berubah                      |
| L17-28                              | Resolve                             | Hilang dari active alerts           |
| L17-29                              | Audit login/logout                  | Ada                                 |
| L17-30                              | Audit privileged actions            | Ada                                 |

---

# Phase L18 — Resilience / Production Gate **WAJIB**

Ini phase terakhir sebelum kita mengatakan PesanPro siap public production.

| ID                                             | Test                                           | Expected                                       |
| ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| L18-01                                         | Restart Next.js dengan queue berisi pesan      | Tidak loss                                     |
| L18-02                                         | Restart message worker                         | Tidak duplicate                                |
| L18-03                                         | Restart schedule worker                        | Schedule tetap durable                         |
| L18-04                                         | Restart campaign/broadcast worker              | Lanjut aman                                    |
| L18-05                                         | Restart webhook worker                         | Delivery lanjut                                |
| L18-06                                         | Restart WA worker                              | Sessions recover                               |
| L18-07                                         | Kill process saat MessageJob PROCESSING        | Stale lease recover                            |
| L18-08                                         | Kill integration processor saat PROCESSING     | Stale recovery                                 |
| L18-09                                         | Database disconnect pendek                     | App fail gracefully                            |
| L18-10                                         | DB reconnect                                   | Worker recover                                 |
| L18-11                                         | Disk/storage temporary error                   | Tidak corrupt                                  |
| L18-12                                         | Backup database                                | Berhasil                                       |
| L18-13                                         | Restore backup di environment test             | Data usable                                    |
| L18-14                                         | Restore session/config                         | Sesuai security design                         |
| L18-15                                         | Queue backlog 100 controlled test jobs         | Tidak crash                                    |
| L18-16                                         | Concurrent quota boundary                      | Tidak overshoot                                |
| L18-17                                         | Same idempotency request parallel              | Satu logical operation                         |
| L18-18                                         | Webhook receiver down → up                     | Retry/recovery                                 |
| L18-19                                         | WA disconnected → reconnect                    | Job handling benar                             |
| L18-20                                         | Tenant isolation regression seluruh resource   | PASS                                           |
| L18-21                                         | Scan response/log untuk token/password/API key | Tidak bocor                                    |
| L18-22                                         | `.env`/secret tidak public                     | Tidak bisa diakses                             |
| L18-23                                         | Stack trace production                         | Tidak bocor ke browser                         |
| L18-24                                         | Responsive mobile dashboard                    | Tidak ada blocking UI                          |
| L18-25                                         | Chrome desktop/mobile                          | Critical flow normal                           |
| L18-26                                         | Long session penggunaan realtime               | Socket stabil                                  |

---

## Kriteria release

Saya baru akan menyebut **production-ready dari sisi live QA** setelah:

**semua P0 PASS**, seluruh tenant-isolation PASS, Auth PASS, Session/WA PASS, Message Queue durability PASS, Media IDOR PASS, Broadcast/Campaign/Scheduler/Auto Reply PASS, Webhook replay/retry PASS, API auth/scope/idempotency PASS, integrasi yang dipasarkan PASS, restart/recovery PASS, serta backup/restore drill PASS.

Source audit di repository sendiri juga sudah mencatat bahwa production-like E2E, controlled restart with queued work, backup/restore, webhook retry/replay, rate/quota concurrency, tenant-isolation regression, dan secret/log scanning masih merupakan release gate. Jadi live test di atas memang tahap penting berikutnya.

## Cara kirim report ke saya

Tidak usah mengerjakan 200-an pemeriksaan ini sekaligus. **Mulai sekarang dari Phase L0 → L1 → L2.** Untuk setiap test cukup kirim seperti:

```
L0-01 PASS
Bukti: https://pesanpro...

L0-03 PASS
Response:
{ ... }

L1-13 PASS
Percobaan 1–5: invalid credentials
Percobaan 6: blocked/rate limited

L2-08 FAIL
USER-A membuka session milik USER-B:
URL: ...
HTTP: 200
Response: ...
```

Screenshot juga boleh. Untuk kasus Network/API, **status HTTP + response body** lebih berguna daripada screenshot saja. Jangan kirim password, API secret, webhook secret, reset token, cookie/session token, atau credential WhatsApp secara utuh—sensor bagian rahasianya.

### Kita mulai

**Batch pertama yang saya ingin Anda jalankan adalah L0-01 sampai L0-16.** Setelah Anda kirim hasilnya, saya akan langsung klasifikasikan **PASS / FAIL / NEEDS EVIDENCE**, dan kalau ada FAIL kita selesaikan dulu sampai RETEST PASS sebelum pindah ke L1.

