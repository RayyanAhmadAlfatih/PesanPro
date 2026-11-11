# Audit kompetitor PesanPro — 2026-11-11

Status: laporan riset. Bukan instruksi ubah kode.
Tanggal cek harga: **2026-11-11** (harga bisa berubah).
Repo PesanPro yang dibaca: `D:/00. rayyan/KingOfCoding/codingan-rayyan/PesanPro-Workbuddy`.
Path `~/workspace/PesanPro` tidak ada di mesin ini. Repo inilah yang dipakai.

---

## 0. Cara baca

Tiga status bukti, dipakai konsisten:

- **terverifikasi** — dibaca langsung di halaman situs / docs resmi, atau dibaca langsung di kode.
- **tidak ditemukan** — sudah dicari di halaman resmi, tidak ada.
- **belum dicek** — tidak dibaca pada audit ini. Tidak boleh ditafsir sebagai "tidak ada".

Kode `P1`–`P26` = bukti dari kode PesanPro. `W`, `F`, `S`, `K`, `G` = bukti dari situs eksternal. Daftar URL ada di §7.

Aturan yang dipakai:

- Klaim marketing tidak dianggap bukti produk. Kalau landing page dan FAQ bertentangan, keduanya ditulis.
- Harga hanya dari halaman harga resmi yang dibaca pada 2026-11-11.
- Artikel perbandingan pihak ketiga tidak dipakai sebagai fakta.

### Temuan pembuka: jangkar user ternyata terbalik

User memberi contoh: "semua gateway bisa custom text per form di Contact Form 7, PesanPro tidak bisa".

Dari kode dan docs resmi, kalimat itu **tidak terbukti**:

- PesanPro **sudah punya** custom pesan per form CF7. Tab "PesanPro" di editor tiap form, property `pesanpro_message`, placeholder `{{field:nama}}`, `{{all_fields}}`, `{{formTitle}}`, `{{formId}}`, `{{submissionId}}`, `{{submittedAt}}`, `{{site}}`. `P11`, `P12`. Commit `8a19f70 feat(cf7): pesan WhatsApp custom per form lewat tab PesanPro`.
- Fonnte justru **global**: plugin CF7-nya punya satu menu "fonnte" berisi "Pesan untuk Admin" dan "Pesan untuk User". Tidak ada pengaturan per form. `F2`.
- WANotifier: plugin resmi mendukung 9 form, tapi halaman wordpress.org **tidak menyatakan** custom message per form dan tidak memuat daftar placeholder. Status: **belum dicek / tidak dikonfirmasi**, bukan "pasti bisa". `G8`.
- Fonnte Elementor **per form**: ada field "Nama Form" + "Pesan User" + "Pesan Admin". `F4`.

Jadi CF7 per-form bukan gap PesanPro. Ini masuk daftar "sudah standar / lebih baik" (§5).

---

## 1. Riset per kompetitor: cara kerja dulu

### Wablas — Indonesia, QR + klaim Cloud API

Cara kerja: HTTP API gateway. Aplikasi kirim request, Wablas kirim ke WhatsApp, pesan masuk diteruskan lewat webhook. Ada dashboard, multi-agent inbox, dan rotator nomor. `W1`, `W3`.

Fitur yang terbaca: Auto Responder, Auto Reply, Live Chats, Multi Agents, Unlimited Labels, Working Hours, Whatsapp Rotator, Multiple Sender Broadcast, Message scheduling, Delay time setting for sending messages, Message Attributes (buttons/headers/footers), Webhooks, Sync Contacts Whatsapp, Sync Group Contacts Whatsapp, "Support Whatsapp API Cloud", Upload File API, integrasi LokusWP dan OpenSID. `W1`.

Catatan keras: "Support Whatsapp API Cloud — Sent message using official Whatsapp API" hanya ada di daftar fitur landing page. Tidak ada docs yang dibaca yang menjelaskan alurnya. `W3` hanya halaman indeks kosong. Status: **klaim marketing, alur produk belum dicek**.

Harga `W2`: Nano Rp22K/bulan (1.000 pesan), Lite 5.000 pesan, Small 10.000 pesan, Medium/Large/Enterprise "Unlimeted Messages". Batas perangkat per paket: **tidak ditemukan**.

Spintax: **tidak ditemukan** di `W1`, `W2`, `W3`. Format variabel: **tidak ditemukan**.
Plugin CF7 / Google Forms / Elementor: **tidak ditemukan** di `W1`; yang ada LokusWP dan OpenSID.

### Fonnte — Indonesia, unofficial QR

Judul situsnya sendiri: "Unofficial Whatsapp API Gateway Indonesia". `F1`.

Cara kerja: nomor biasa dihubungkan ke device di dashboard Fonnte, lalu kirim lewat `https://api.fonnte.com/send` dengan header `Authorization: <token>` dan payload `target` + `message`. `F5`. Webhook untuk balasan dinamis. `F1`.

Fitur `F1`: Single, Broadcast, Schedule, Variable, CSV, Follow Up, Random Delay, Random device, Attachment, Lokasi, WhatsApp Group, Pesan Berulang, Autoreply, Keyword Based, Pesan Default, Nama, Submission, Quick Reply, Template Pesan, Simpan Kontak, Grouping Kontak, Multics Agent, button/list/template JSON.

Penting: "Button (Deprecated)" ditulis eksplisit di `F1`. Jadi pesan interaktif di jalur QR sedang ditarik.

Integrasi `F1`: Google Form, Contact Form 7, Woocommerce, Elementor Form, Caldera Form, Formidable Form.

- CF7 `F2`: satu menu global "fonnte". Field: "Aktifkan Fonnte", "Nomor Whatsapp Admin", "Pesan untuk Admin", "Nama user", "Nomor Whatsapp User", "Pesan untuk User", plus opsi PDF. Pesan **global**, bukan per form.
- WooCommerce `F3`: "Pesan Order", "Pesan Notif H+ Belum Bayar", "Pesan Kirim Resi" — pesan beda per event.
- Elementor `F4`: "Nama Form", "Key Nomor Whatsapp", "Pesan User", "Nomor Admin", "Pesan Admin". Keyword = field ID form. Ini **per form**.
- Google Form `F5`: user menulis sendiri string `message` di Apps Script. Bisa kirim ke grup dengan `target` = group id. Ada `buttonJSON`, `templateJSON`, `listJSON`.

Harga `F1` (IDR, bulanan): Free Rp0 / 1.000 pesan; Lite Rp25.000 / 1.000; Regular Rp66.000 / 10.000 / 2 Multics Agents; Regular Pro Rp110.000 / 25.000 / 2 agents; Master Rp175.000 / **Unlimited pesan** / 4 agents. Paket "All Feature" Super/Advanced/Ultra tidak menampilkan angka harga — **tidak ditemukan**.

Spintax: **tidak ditemukan** di `F1`. Format variabel: `F1` hanya menulis "Support variable untuk personalisasi isi pesan", tanpa sintaks. `F5` memakai konkatenasi JavaScript (`"Hallo "+Nama`), bukan placeholder. Status sintaks: **tidak ditemukan**. Angka delay: **tidak ditemukan**.

### Starsender — Indonesia, jalur nomor biasa

Cara kerja: panel web (Starsender V3). User tambah "device"/nomor, pilih sender, pilih tujuan, tulis pesan, kirim. Ada REST API sendiri. `S1`, `S2`, `S7`.

`S7` menulis "Whatsapp Clone — fitur ini digunakan untuk membuka website whatsapp jika anda ingin menggunakan web whatsapp", "Device — 1 akun bisa lebih dari 1 nomor whatsapp", dan testimoni "bisa menggunakan whatsapp biasa". Kata "QR" dan "API resmi Meta" **tidak ada** di halaman. Status jalur: nomor biasa / WhatsApp Web, label resmi **tidak ditemukan**.

Broadcast `S2`: tujuan bisa "Group/Kontak Starsender, Input Manual, **Group Whatsapp**". File: docx, xlsx, pdf, jpg, png, mp4. Opsi "Kirim Pesan Sekarang" / "Pesan Terjadwal". "Delay Interval ... dalam satuan **detik**". Variabel `{nama}`, `{var1}`, `{var2}`, `{var3}`. `S3` juga memuat `[[NAME]]`. `S4` memakai `[Nama]`, `[NIK]`, `[changed]`, `[old_value]`, `[value]`, `[Email]` untuk Google Spreadsheet. `S5` memakai `[Kode Toko]`, `[Nama Toko]`, `[Nomor FWT]` untuk Google Form.

`S6` (Feature Premium): Add on follow up otomatis, Chatbot AI di Grup Whatsapp, ChatGPT / Chat AI, Campaign, Customer Service, Chat Widget. `S7` menambah Smart AutoReply, Autoreply Group, Chat AI, Group Greeter, Management Jam Kerja.

Harga: **tidak ditemukan**. `S7` punya bagian "Ya Saya Mau Beli, Berapa Harganya?" tapi tidak mencantumkan angka. Halaman `/pricing`, `/beli`, `/harga`, `/paket`, `/paket-premium` semuanya `Page not found`. Angka "200an ribu/bulan" di testimoni merujuk kompetitor, bukan harga Starsender. Spintax: **tidak ditemukan**.

### KirimWA / Wagy / SocialNotify / DynamicWebLab — tidak layak dibandingkan

- `kirimwa.com` (`G19`): domain dijual HugeDomains. Bukan produk.
- `kirimwa.id` (`G20`): layanan pemendek URL / click-to-chat. Bukan gateway broadcast.
- `wagy.id`, `wagy.co.id` (`G21`): `fetch failed`. **belum dicek**.
- `socialnotify.com` (`G18`): "Socialnotify.com is for sale". Bukan produk.
- `dynamicweblab.com` (`G17`): tidak ada plugin notifikasi WhatsApp yang relevan. Yang ada "Chat Notifications for Telegram CF7" dan produk "WhatsApp Property Bot" di luar WordPress.

Semua ini ditulis **tidak ditemukan**, tidak diisi fitur karangan.

### kirimi.id — Indonesia, klaim resmi yang bertentangan dengan FAQ

`K1` menampilkan: AI Auto Reply, AI Agent, AI Content Generator, Broadcast Massal, Team Inbox, Chat Inbox, REST API, Webhook, OTP via WhatsApp, Multi Device, "WABA Coexistence", "Meta Tech Partner", "Kirimi Cloud API", "Safe Send". Contoh spintax asli:

```
{Halo|Hai} kak! ✨ Flash sale skincare {diskon|hemat} 30% berlaku sampai Minggu. {Buruan|Yuk} checkout sebelum kehabisan!
```

Tapi halaman yang sama menulis:

- "Scan QR Instan — Tambah device baru hanya dengan scan QR code."
- FAQ: "Kirimi menggunakan **protokol gateway independen** yang dirancang untuk kebutuhan bisnis skala menengah dan startup, menawarkan fleksibilitas lebih tinggi **dibanding API official** dengan harga yang jauh lebih terjangkau."
- FAQ: "Kami memiliki fitur 'Safe Send' dengan pengaturan delay cerdas dan rotasi pesan (spintax) untuk meminimalkan risiko [blokir]."

Ini contoh nyata aturan user: **jangan samakan marketing dengan produk**. Status: koneksi device = QR (`terverifikasi`); klaim "Cloud API/WABA/Meta Tech Partner" = klaim marketing, implementasi resmi Meta **belum dicek / bertentangan dengan FAQ**.

Harga `K1`: Lite Rp29.000/bulan (1 Device, 1 Akun WABA), Basic Rp49.000 (Maks 3 Device, 5 anggota tim, 3 Akun WABA), Pro Rp99.000 (Maks 10 Device, 20 anggota, 5 Akun WABA). Promo tahunan 8–12 Nov 2026: Lite Rp140rb, Basic Rp240rb, Pro Rp600rb. Batas pesan per bulan: **tidak ditemukan**.

### WATI — global, resmi Cloud API

`G1`, `G2`. Official WhatsApp API. Fitur: shared Team Inbox, Astra AI Agents, 100+ integrasi (WooCommerce, Shopify, HubSpot, Salesforce, Zapier), broadcast scheduling, template approval, chatbot flow, omnichannel (WhatsApp/Instagram/web chat), SOC 2 / ISO 27001.

Harga `G2` (rupiah, ditagih tahunan): Growth Rp740.000/bulan — "Official WhatsApp API", "15 ribu broadcast/bulan", 3 users. Pro Rp1.500.000 — "Broadcast tanpa batas", 5 users. Business Rp3.800.000 — "Broadcast tanpa batas", 5 users. "Biaya pesan template dikenakan secara terpisah."

Spintax: **tidak ditemukan**. Variabel: personalisasi lewat Meta template variables; format spesifik **belum dicek** di docs WATI.

### Twilio WhatsApp — global, resmi Cloud API

`G3`: WhatsApp Business API, Programmable Messaging, Conversations, Marketing Messages API, WhatsApp Flows, quick-reply buttons, AI-driven chatbots, pay-as-you-go.

`G4`: "$0.005 per message" (Twilio fee, inbound atau outbound), ditambah Meta template fees. "Utility and authentication messages start at $0.0034/message". "Pricing current as of September 2026". Template wajib untuk pesan yang dimulai bisnis; customer service window 24 jam.

Tidak ada paket langganan. Tidak ada QR. Broadcast = template Marketing ke banyak penerima. Spintax: **tidak ditemukan / tidak relevan** (Meta template sudah disetujui).

### UltraMsg — global, QR scan

`G5`: "Scan QR to authenticate your instance to send messages via your WhatsApp number". REST API, webhook, media/documents, tutorial "send message to WhatsApp Group", chatbot.

Harga: Monthly $39 / 30 hari, Annual $390 / 365 hari. "No cost per message". FAQ: "Ultramsg does not have a limit as to how many messages you can send." Free trial 3 hari. Batas device per paket: **tidak ditemukan**.

Spintax, variabel, delay, scheduling: **tidak ditemukan** di `G5`.

### WANotifier — global, resmi Cloud API

`G6`: Official WhatsApp API, Meta Tech Partner, contacts, AI agents, rule-based chatbots, drip campaigns, targeted campaigns, personalization with customer attributes, shared team inbox, REST API.

`G7`: Essentials $69/bulan (4.000 pesan, 1.000 kontak, 3 team members, 5 auto-replies), Advanced $119 (8.000 pesan, 10 members, 15 auto-replies), Premium $199 (12.000 pesan, unlimited members, unlimited auto-replies). "Import contacts using CSV or API", "Personalization with variables (aka merge tags)", "WordPress / Woocommerce integration".

`G12`: CSV import dengan column mapping ke contact fields; nomor wajib tanpa tanda `+`.
`G11`: format variabel `{{1}}`, `{{2}}`, `{{3}}` di Meta message template, lalu "Variable Mapping" ke first name / last name / phone / custom contact attributes / data fields dari trigger. Ada **Fallback Value** per variabel.
`G13`: Notifications = campaign. Dua jenis: Bulk Broadcast (Marketing template) dan Transactions/Integration/API (Utility template).
`G10`: kategori WhatsApp AI Agent, WhatsApp Flows, Shared Team Inbox, Drip sequences, Analytics.

Plugin WordPress `G8`: "WANotifier for Forms and Actions". Mendukung Contact Form 7, Gravity Forms, WPForms, Ninja Forms, Formidable Forms, Fluent Forms, SureForms, Forminator, WS Form. Juga trigger post/page publish, comment, user registration. FAQ: "Yes. All messages are sent through the official WhatsApp Business API via WANotifier. No unofficial methods or browser extensions are used." **Custom message per form: tidak dikonfirmasi** di halaman ini. Placeholder lengkap: **tidak ditemukan**; changelog hanya menyebut "WS Form merge tags", `tel*`, `phonefield`, custom meta field.

Plugin WooCommerce `G9`: "A separate trigger is available for each status." New order, COD/prepaid, Processing, Completed, Failed, Refunded, custom status, abandoned cart. Changelog menyebut merge tags dan "Billing full name" merge tag.

### Join.chat — plugin WordPress, bukan gateway broadcast

`G14`: tombol WhatsApp, AI-powered conversational assistants, Chat Funnels, segmentation, autopilot. `G15`: Premium 96€ (1 site/tahun), Premium Plus 180€/240€/480€ (1/5/20 site), AI Assistant 39€/bulan (2.000 responses/bulan), plugin gratis, webhook + lead capture di Premium Plus.

Broadcast massal, spintax, CSV: **tidak ditemukan**.

### WP WhatsApp Chat / Social Chat — plugin WordPress

`G16`: tombol chat, contact box, integrasi WooCommerce product/archive. Dynamic variables `{SITE_TITLE}`, `{SITE_URL}`, `{CURRENT_TITLE}`, `{PRODUCT_TITLE}`, `{ORDER_ID}`, `{CUSTOMER_NAME}`. Premium: AI chatbots, multiple WhatsApp numbers, WhatsApp group support, WooCommerce WhatsApp Payment Gateway.

CF7 / Google Forms / Elementor / custom pesan per event: **tidak ditemukan**.

### Sumber yang belum dicek menyeluruh

Forum/komunitas (Reddit, Stack Overflow, grup pengguna), deskripsi/langkah video YouTube, dan repositori GitHub/changelog kompetitor: **belum dicek** secara sistematis. Yang dibaca langsung adalah halaman resmi, docs resmi, halaman plugin wordpress.org, dan halaman harga resmi. Jangan tafsir "belum dicek" sebagai "tidak ada".

---

## 2. Tabel perbandingan

Baris = kompetitor + PesanPro. Kolom = poin yang diminta. Kode sumber ada di §7.

### 2A. Broadcast

| Produk | Spintax | Format variabel | Sumber data | Delay acak | Jadwal | Berulang | Media | Broadcast ke grup |
|---|---|---|---|---|---|---|---|---|
| **PesanPro** | **Ya** `{A\|B}`, nested, escape, max depth 5 / 10.000 kombinasi, deterministik SHA-256 `P1` | `{{name}}` (bebas nama), dilindungi dari parser spintax `P2` | `recipientData` inline + CSV 2 MB / 5.000 baris / 20 kolom / 19 kolom variabel `P3`,`P5`,`P6` | Ya. `delayMinMs` 2–60 dtk, `delayMaxMs` 2–120 dtk, hash deterministik per posisi `P3`,`P4` | Ya. Campaign `scheduledAt` + timezone `P8`; schedule `localDateTime` `P9` | Ya. `ONE_TIME` / `RECURRING` + cron + `missedRunPolicy` + `misfireGraceSeconds` `P9`,`P10` | Ya. `mediaId`, enum 8 tipe `P17` | **TIDAK.** `@g.us` → `GROUP_RECIPIENT_EXCLUDED` `P4` |
| Wablas | tidak ditemukan `W1` | tidak ditemukan `W1` | Sync Contacts Whatsapp, Sync Group Contacts `W1` | Ya, "Delay time setting", angka tidak ditemukan `W1` | Ya "Message scheduling" `W1` | tidak ditemukan | Ya, text/image/doc/video/audio + Upload File API `W1` | Ya, sinkron kontak grup; "Multiple Sender Broadcast" `W1` |
| Fonnte | tidak ditemukan `F1` | "Variable" ada, sintaks tidak ditemukan `F1` | CSV, Simpan Kontak, Grouping Kontak `F1` | Ya "Random Delay", angka tidak ditemukan `F1` | Ya "Schedule" `F1` | Ya "Pesan Berulang" `F1` | Ya "Support Attachment", Lokasi `F1` | **Ya**, "Kirim group" di semua paket; `target` = group id `F1`,`F5` |
| Starsender | tidak ditemukan `S7` | `{nama}`, `{var1..3}`, `[[NAME]]`, `[Nama]` `S2`,`S3`,`S4`,`S5` | Kontak Starsender, Input Manual, Google Spreadsheet `S2`,`S4` | Ya "Delay Interval" satuan detik `S2` | Ya "Pesan Terjadwal" `S2` | Campaign "pesan berseri" `S7` | docx, xlsx, pdf, jpg, png, mp4 `S2` | **Ya**, "Group Whatsapp" sebagai Tujuan Pesan `S2` |
| kirimi.id | **Ya** `{Halo\|Hai}`, dipakai "Safe Send" `K1` | "Sapa by name", sintaks tidak ditemukan `K1` | Unlimited Kontak `K1` | Ya, "Atur Jeda Kirim", contoh UI "Delay 30 detik" `K1` | Ya "Broadcast terjadwal" `K1` | Reminder & OTP `K1` | Ya "Multi Media" gambar/video/dokumen `K1` | tidak ditemukan `K1` |
| WATI | tidak ditemukan `G1` | Meta template variables, format belum dicek | 100+ integrasi, CRM `G1` | tidak ditemukan | Ya `G1`,`G2` | tidak ditemukan | Ya, template header media `G1` | tidak ditemukan |
| Twilio | tidak relevan, Meta template `G4` | Meta template variables `G4` | API / Conversations `G3` | tidak ditemukan | Marketing Messages API `G3` | tidak ditemukan | Ya `G3` | tidak ditemukan |
| UltraMsg | tidak ditemukan `G5` | tidak ditemukan `G5` | REST API `G5` | tidak ditemukan | tidak ditemukan | tidak ditemukan | Ya "Send Media / documents" `G5` | **Ya**, tutorial kirim ke grup `G5` |
| WANotifier | tidak ditemukan `G7` | `{{1}}`, `{{2}}` + Variable Mapping + Fallback `G11` | CSV column mapping, API, Contact Lists `G7`,`G12` | tidak ditemukan | Ya, Notifications/campaign `G13` | Ya, drip campaigns `G6`,`G10` | Ya, image template personalization `G13` | tidak ditemukan |
| Join.chat | tidak ditemukan `G14` | tidak ditemukan | Chat Funnels, lead `G14` | tidak ditemukan | tidak ditemukan | tidak ditemukan | tidak ditemukan | tidak ditemukan |
| WP WhatsApp Chat | tidak ditemukan `G16` | `{SITE_TITLE}`, `{ORDER_ID}`, `{CUSTOMER_NAME}`, dll `G16` | WooCommerce data `G16` | tidak ditemukan | tidak ditemukan | tidak ditemukan | tidak ditemukan | Group support (premium), bukan broadcast `G16` |

### 2B. Plugin WordPress, integrasi, custom pesan, placeholder

| Produk | CF7 | WooCommerce | Google Forms | Elementor / form lain | Custom per form / per event | Placeholder | Webhook / API |
|---|---|---|---|---|---|---|---|
| **PesanPro** | **Ya**, plugin ZIP v1.2.0 dari dashboard `P11`,`P12`,`P23` | Endpoint API `P14`, tanpa plugin WP | Apps Script `P13` + endpoint `P22` | tidak ditemukan | **CF7: ya**, per form `P11`. **Woo: tidak**, caller wajib kirim `message` lengkap `P14`. **Google Forms: tidak** di script bawaan, endpoint terima `message` opsional `P13`,`P22` | `{{field:key}}`, `{{all_fields}}`, `{{formTitle}}`, `{{formId}}`, `{{submissionId}}`, `{{submittedAt}}`, `{{site}}` `P11`; token mapping `{{message}}`, `{{field:key}}` `P15` | Ya. Webhook + API key hash/preview + idempotency + scope fail-closed `P17`,`P15` |
| Wablas | tidak ditemukan `W1` | "Store Platform" `W1`, plugin WP tidak ditemukan | tidak ditemukan | LokusWP, OpenSID `W1` | tidak ditemukan | "Message Attributes" (buttons/header/footer) `W1` | Ya `W1` |
| Fonnte | Ya, plugin addon, pesan **global** `F2` | Ya, plugin `F3` | Ya, Apps Script `F5` | Elementor `F4`, Caldera, Formidable `F1` | **Elementor: ya** ("Nama Form"). **Woo: ya** per event `F3`. **CF7: tidak** `F2` | Field ID form jadi keyword `F4`; header spreadsheet jadi keyword `F5`; `{{...}}` tidak dipakai | Ya `F1` |
| Starsender | tidak ditemukan | Integrasi Woocommerce Payment `S7` | Ya `S5` | tidak ditemukan | Google Form: placeholder di notifikasi `S5` | `[Kode Toko]`, `[Nama Toko]`, `[Nomor FWT]`, `[Nama]`, `[NIK]` `S4`,`S5` | Ya REST API + Webhook Group `S7` |
| kirimi.id | tidak ditemukan `K1` | tidak ditemukan `K1` | tidak ditemukan `K1` | tidak ditemukan `K1` | tidak ditemukan | tidak ditemukan | Ya REST API + webhook realtime `K1` |
| WANotifier | **Ya** `G8` | **Ya**, plugin terpisah `G9` | tidak ditemukan | Gravity, WPForms, Ninja, Formidable, Fluent, SureForms, Forminator, WS Form `G8` | **Woo: ya**, "A separate trigger is available for each status" `G9`. **Form: tidak dikonfirmasi** `G8` | `{{1}}`…`{{n}}` + mapping + fallback `G11`; changelog "merge tags" tanpa daftar `G8`,`G9` | Ya `G6`,`G10` |
| WATI | tidak ditemukan | Integrasi WooCommerce `G1` | tidak ditemukan | 100+ integrasi `G1` | tidak ditemukan | tidak ditemukan | Ya `G1` |
| Twilio | tidak ditemukan | tidak ditemukan | tidak ditemukan | tidak ditemukan | Meta template per use case `G4` | Meta template variables `G4` | Ya `G3` |
| UltraMsg | tidak ditemukan | tidak ditemukan | tidak ditemukan | tidak ditemukan | tidak ditemukan | tidak ditemukan | Ya REST + webhook `G5` |
| Join.chat | tidak ditemukan | Ya, tombol di produk Woo `G14` | tidak ditemukan | tidak ditemukan | tidak ditemukan | tidak ditemukan | Webhook di Premium Plus `G15` |
| WP WhatsApp Chat | tidak ditemukan | Ya `G16` | tidak ditemukan | tidak ditemukan | tidak ditemukan | `{SITE_TITLE}`, `{SITE_URL}`, `{CURRENT_TITLE}`, `{PRODUCT_TITLE}`, `{ORDER_ID}`, `{CUSTOMER_NAME}` `G16` | tidak ditemukan |

### 2C. Auto-reply

| Produk | Keyword | Beda balasan per keyword | AI | Fallback |
|---|---|---|---|---|
| **PesanPro** | Ya: `EXACT`, `CONTAINS`, `STARTS_WITH`, `REGEX` (safe regex) `P16` | Ya, aturan + `priority`, `triggerType`, jadwal, `cooldownSeconds`, rate limit, `maxChainDepth` `P16` | **Tidak ditemukan** di `src/lib/autoreply-service.ts`, `P16` | Ya, `FALLBACK` `P16` |
| Wablas | Ya "Auto Reply", "Auto Responder" `W1` | Ya, chatbot FAQ `W1` | tidak ditemukan | Closing Greetings `W1` |
| Fonnte | Ya "Keyword Based" `F1` | Ya `F1` | tidak ditemukan | "Pesan Default" `F1` |
| Starsender | Ya "Smart AutoReply", "Autoreply Group" `S7` | Ya `S7` | **Ya**, Chat AI / ChatGPT / Chatbot AI di Grup `S6`,`S7` | Management Jam Kerja `S7` |
| kirimi.id | Ya "Chatbot Flow" `K1` | Ya `K1` | **Ya**, AI Auto Reply / AI Agent / BYOK & Tool Calling `K1` | tidak ditemukan |
| WATI | Ya, chatbot flow `G1` | Ya `G1` | **Ya**, Astra AI Agents `G1` | handoff ke tim `G1` |
| Twilio | Ya `G3` | Ya `G3` | **Ya**, "AI-driven chatbots" `G3` | tidak ditemukan |
| UltraMsg | Ya, tutorial chatbot `G5` | Ya | tidak ditemukan | tidak ditemukan |
| WANotifier | Ya, rule-based chatbots `G6`,`G10` | Ya `G6` | **Ya**, kategori "WhatsApp AI Agent" `G10` | tidak ditemukan |
| Join.chat | Ya `G14` | Ya | **Ya**, AI Assistant `G14`,`G15` | autopilot `G14` |
| WP WhatsApp Chat | Ya (premium AI chatbot) `G16` | Ya | **Ya**, premium `G16` | tidak ditemukan |

### 2D. Cara kirim

| Produk | Jalur | Bukti | Catatan |
|---|---|---|---|
| **PesanPro** | Nomor biasa via QR / pairing code (Baileys) | `P25`, `src/app/api/sessions/[sessionId]/qr/route.ts`, `src/modules/whatsapp/auth/usePrismaAuthState.ts` | Greps `graph.facebook` / WABA / Cloud API di `src/` tidak menemukan implementasi. Cloud API resmi: **tidak ditemukan** |
| Wablas | QR device + klaim "Support Whatsapp API Cloud" | `W1` | Klaim resmi hanya di landing page. Alur **belum dicek** |
| Fonnte | Unofficial, nomor biasa | `F1` | Judul situs: "Unofficial Whatsapp API Gateway Indonesia" |
| Starsender | Nomor biasa / WhatsApp Web | `S7` | Kata "QR" dan "API resmi" tidak ada. Status: **tidak ditemukan** |
| kirimi.id | **Bertentangan** | `K1` | Marketing: "WABA Coexistence", "Meta Tech Partner", "Kirimi Cloud API". FAQ: "protokol gateway independen ... dibanding API official". Device: "Scan QR Instan" |
| WATI | Resmi, Official WhatsApp API | `G2` | Template message fee terpisah |
| Twilio | Resmi, WhatsApp Business API | `G3`,`G4` | Meta fee diteruskan |
| UltraMsg | QR scan | `G5` | "Scan QR to authenticate your instance" |
| WANotifier | Resmi, Official WhatsApp Business API / Meta Tech Partner | `G6`,`G8` | "No unofficial methods or browser extensions are used" |
| Join.chat / WP WhatsApp Chat | Bukan gateway kirim massal; tombol/chat widget | `G14`,`G16` | — |

### 2E. Harga — cek 2026-11-11

| Produk | Termurah | Paket unlimited | Limit pesan | Limit perangkat |
|---|---|---|---|---|
| **PesanPro** | Starter **Rp20.000/bln**, Rp200.000/thn `P18` | Tidak ada `P18` | 3.000 / 12.000 / 40.000 per bulan `P18` | 1 / 3 / 5 `P18` |
| Wablas | Nano Rp22K/bln `W2` | Medium/Large/Enterprise "Unlimeted Messages" `W2` | 1.000 / 5.000 / 10.000 / unlimited `W2` | tidak ditemukan |
| Fonnte | **Free Rp0** `F1` | Master Rp175.000, Ultra (harga tidak tampil) `F1` | 1.000 / 10.000 / 25.000 / unlimited `F1` | "1 akun banyak device"; Multics Agent 0/2/2/4 `F1` |
| Starsender | **tidak ditemukan** `S7` | tidak ditemukan | tidak ditemukan | "1 akun bisa lebih dari 1 nomor" `S7` |
| kirimi.id | Lite Rp29.000/bln `K1` | tidak ditemukan | tidak ditemukan | 1 / 3 / 10 `K1` |
| WATI | Growth Rp740.000/bln (tagihan tahunan) `G2` | Pro & Business "Broadcast tanpa batas" `G2` | Growth 15 ribu broadcast/bln `G2` | 3 / 5 / 5 users (bukan device) `G2` |
| Twilio | Pay-as-you-go $0.005/pesan + Meta fee `G4` | tidak ada paket | tidak ada | tidak ada konsep device |
| UltraMsg | $39/bln, $390/thn `G5` | "No cost per message", "does not have a limit" `G5` | unlimited per FAQ `G5` | tidak ditemukan |
| WANotifier | Essentials $69/bln `G7` | tidak ditemukan | 4.000 / 8.000 / 12.000 `G7` | 1.000 kontak; 3/10/unlimited members `G7` |
| Join.chat | Plugin gratis; Premium 96€/thn `G15` | tidak ditemukan | AI Assistant 2.000 responses/bln `G15` | 1 / 5 / 20 site `G15` |

Catatan PesanPro: `docs/marketing/harga.md` berstatus `DRAF` dan menunggu deploy v0.2.0 `P18`. Tapi angkanya cocok dengan keputusan produk final di MEMORY.md (20/49/99rb, tanpa trial, tanpa lifetime). Jadi dipakai sebagai acuan, bukan sebagai bukti harga live. Harga live di situs **belum dicek** pada audit ini.

---

## 3. Daftar gap PesanPro — urut dari paling penting

Urutan memakai dua hal: berapa banyak kompetitor yang punya, dan seberapa terasa ke user.

### Gap 1 — Broadcast ke grup ditolak eksplisit

- **Yang standar:** broadcast boleh memilih grup sebagai tujuan.
- **Yang punya:** Fonnte `F1`,`F5`; Starsender `S2`; UltraMsg `G5`; Wablas `W1` (sync kontak grup); Starsender juga punya Autoreply Group `S7`.
- **Bukti:** https://fonnte.com/ · https://tutorial.starsender.id/docs/kirim-pesan-broadcast-manual/ · https://ultramsg.com/ · https://wablas.com/
- **Kondisi PesanPro sekarang:** `src/lib/broadcast-policy.ts` menandai `jid.endsWith("@g.us")` sebagai `SKIPPED` dengan `GROUP_RECIPIENT_EXCLUDED`, pesan "Groups are excluded from broadcasts" (`P4`). UI mengatakan "Duplikat otomatis dihapus dan grup dilewati" (`P7`). Ini bukan bug, ini keputusan kode yang eksplisit.
- **Status bukti:** terverifikasi (kode + 4 situs resmi).

### Gap 2 — Tidak ada template pesan per event WooCommerce, dan pesan Google Forms tidak bisa diatur dari form

- **Yang standar:** tiap event/status punya pesan sendiri. User atur di plugin, bukan di payload API.
- **Yang punya:** Fonnte WooCommerce `F3` ("Pesan Order", "Pesan Notif H+ Belum Bayar", "Pesan Kirim Resi"), WANotifier WooCommerce `G9` ("A separate trigger is available for each status"), Fonnte Google Form `F5` (string `message` ditulis di Apps Script), Starsender `S5` (placeholder per form).
- **Bukti:** https://fonnte.com/tutorial/plugin-woocommerce-whatsapp/ · https://wordpress.org/plugins/order-notifications-for-woocommerce/ · https://fonnte.com/tutorial/google-form-whatsapp/ · https://tutorial.starsender.id/docs/kirim-notifikasi-pesan-googleform/
- **Kondisi PesanPro sekarang:** `src/app/api/v1/integrations/woocommerce/route.ts` mewajibkan `message` string dari pemanggil; gateway tidak menyimpan template per `event` (`P14`). `integrations/google-forms/Code.gs` mengirim `responseId`, `formId`, `formTitle`, `submittedAt`, `respondentEmail`, `recipient`, `fields` — **tanpa** `message` (`P13`). Endpoint `/api/v1/integrations/google-forms` memang menerima `message` opsional, tapi fallback-nya `buildDefaultFormMessage` (`P22`,`P24`). Jadi script bawaan tidak bisa custom teks.
- **Status bukti:** terverifikasi.

### Gap 3 — Satu plugin WordPress hanya untuk CF7

- **Yang standar:** satu plugin, banyak trigger form.
- **Yang punya:** WANotifier `notifier` mendukung 9 form `G8`; Fonnte mendukung CF7, WooCommerce, Elementor, Caldera, Formidable, Google Form `F1`.
- **Bukti:** https://wordpress.org/plugins/notifier/ · https://fonnte.com/
- **Kondisi PesanPro sekarang:** hanya `integrations/wordpress/pesanpro-contact-form-7` (`P11`,`P23`). WooCommerce dan Google Forms lewat endpoint API / Apps Script, bukan plugin WP. Tidak ada dukungan Elementor, Gravity Forms, WPForms, Fluent Forms.
- **Status bukti:** terverifikasi.

### Gap 4 — Auto-reply hanya rule, tidak ada AI

- **Yang standar:** keyword rule sebagai dasar, AI sebagai pelengkap atau tipe aturan tersendiri.
- **Yang punya:** Starsender `S6`,`S7`; kirimi.id `K1`; WATI `G1`; WANotifier `G10`; Twilio `G3`; Join.chat `G14`.
- **Bukti:** https://tutorial.starsender.id/docs-category/feature-premium/ · https://kirimi.id/ · https://www.wati.io/ · https://help.wanotifier.com/ · https://www.twilio.com/whatsapp · https://join.chat/
- **Kondisi PesanPro sekarang:** `src/lib/autoreply-policy.ts` hanya `EXACT`, `CONTAINS`, `STARTS_WITH`, `REGEX`, `FALLBACK` (`P16`). Grep `openai|anthropic|llm|gemini|AI_` di `src/lib/autoreply-service.ts` → tanpa hasil. Tidak ada LLM.
- **Catatan penting:** keputusan rilis 9 Nov 2026 meminta fallback auto-reply dimatikan atau dipersingkat. Jadi AI jangan dipasang sebagai fallback default.
- **Status bukti:** terverifikasi.

### Gap 5 — Tidak ada shared team inbox / multi-agent chat

- **Yang standar:** percakapan masuk bisa di-assign ke beberapa admin, dengan riwayat bersama.
- **Yang punya:** Wablas "Multi Agents" + "Live Chats" `W1`; WATI "Team Inbox" `G1`; WANotifier "Shared Team Inbox" `G10`; kirimi.id "Chat Inbox & Team Inbox" `K1`; Fonnte "Multics Agent" `F1`.
- **Bukti:** https://wablas.com/ · https://www.wati.io/ · https://help.wanotifier.com/ · https://kirimi.id/ · https://fonnte.com/
- **Kondisi PesanPro sekarang:** `src/app/dashboard/inbox/page.tsx` adalah daftar **notifikasi sistem** (`/api/notifications`, field `title/message/type/read`), bukan percakapan WhatsApp (`P20`). Tidak ada file `*chat*` atau `*conversation*` di `src/`. Sidebar tidak punya menu chat (`P19`). Tidak ada model assignment.
- **Status bukti:** terverifikasi.

### Gap 6 — Satu broadcast terkunci pada satu device

- **Yang standar:** broadcast bisa memakai beberapa nomor pengirim sekaligus, atau rotasi device.
- **Yang punya:** Wablas "Multiple Sender Broadcast" + "Whatsapp Rotator" `W1`; Fonnte "Random device" + "Management Device" `F1`.
- **Bukti:** https://wablas.com/ · https://fonnte.com/
- **Kondisi PesanPro sekarang:** `broadcastCreateSchema` punya satu `sessionId` wajib (`P3`); `createBroadcast` memakai `sessionId` itu untuk seluruh snapshot penerima (`P6`). Paket memang memberi 1/3/5 device `P18`, tapi tidak ada rotasi dalam satu job broadcast.
- **Status bukti:** terverifikasi.

### Gap 7 — Tidak ada pesan interaktif (button / list / poll / template)

- **Yang standar:** pesan bisa punya button, list, header, footer, atau quick-reply.
- **Yang punya:** Wablas "Message Attributes" `W1`; Fonnte `buttonJSON` / `listJSON` / `templateJSON` `F1`,`F5`; Twilio quick-reply buttons + WhatsApp Flows `G3`; WATI `G1`.
- **Bukti:** https://wablas.com/ · https://fonnte.com/tutorial/google-form-whatsapp/ · https://www.twilio.com/whatsapp
- **Kondisi PesanPro sekarang:** `enum MessageType` di `prisma/schema.prisma` hanya `TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT, STICKER, LOCATION, CONTACT` (`P17`). Grep `interactive|buttonsMessage|listMessage|pollMessage` di `src/` hanya menemukan `listMessageJobs` (nama fungsi, bukan fitur pesan).
- **Perhatian:** Fonnte menandai "Button (Deprecated)" `F1`. Di jalur QR fitur ini sedang ditarik. Di jalur Cloud API resmi, template interaktif justru wajib. Jadi gap ini nyata terutama kalau PesanPro masuk jalur resmi.
- **Status bukti:** terverifikasi.

### Gap 8 — Tidak ada paket unlimited pesan, tidak ada free tier

- **Yang standar:** ada tier atas dengan pesan unlimited, dan/atau tier gratis untuk coba.
- **Yang punya:** Wablas Medium/Large/Enterprise `W2`; Fonnte Master/Ultra + Free Rp0 `F1`; UltraMsg "No cost per message" `G5`; WATI Pro/Business `G2`; WANotifier free account `G8`; Join.chat plugin gratis `G15`.
- **Bukti:** https://wablas.com/pricing · https://fonnte.com/ · https://ultramsg.com/ · https://www.wati.io/pricing · https://join.chat/en/pricing/
- **Kondisi PesanPro sekarang:** 3.000 / 12.000 / 40.000 pesan per bulan, broadcast 50 / 200 / 500 per bulan, penerima 500 / 1.500 / 3.000 per broadcast `P18`. Tidak ada trial, tidak ada free plan, tidak ada diskon, tidak ada lifetime `P18`.
- **Catatan penting:** penghapusan trial adalah **keputusan pemilik** (migrasi 20261031, default `plan_pending`). Jangan diubah tanpa izin. Yang bisa ditiru di sini cukup tier unlimited, bukan trial.
- **Status bukti:** terverifikasi.

### Gap 9 — Tidak ada jalur resmi Cloud API

- **Yang standar:** gateway kelas atas menyediakan jalur Meta resmi, atau dua jalur sekaligus.
- **Yang punya:** WATI `G2`; Twilio `G3`; WANotifier `G6`,`G8`; Wablas mengklaim `W1`; kirimi.id mengklaim tapi FAQ-nya menyangkal `K1`.
- **Bukti:** https://www.wati.io/pricing · https://www.twilio.com/whatsapp · https://wordpress.org/plugins/notifier/ · https://wablas.com/ · https://kirimi.id/
- **Kondisi PesanPro sekarang:** QR / pairing code lewat Baileys (`P25`, `src/app/api/sessions/[sessionId]/qr/route.ts`). Tidak ada `graph.facebook.com`, WABA, atau Meta template di `src/`. Template Meta, customer service window 24 jam, dan approval template tidak ada.
- **Status bukti:** terverifikasi untuk ketiadaan di kode; klaim Wablas/kirimi.id sebagian **belum dicek**.

### Gap 10 — Model kontak/label/segment/campaign ada, tapi tidak bisa dipakai user

- **Yang standar:** buku kontak, label, segment, dan campaign dipakai untuk broadcast berulang.
- **Yang punya:** Wablas labels + sync kontak `W1`; Fonnte Simpan Kontak / Grouping Kontak / Follow Up `F1`; WANotifier Contact Lists + drip `G7`,`G12`,`G10`.
- **Bukti:** https://wablas.com/ · https://fonnte.com/ · https://wanotifier.com/pricing/ · https://help.wanotifier.com/en/article/bulk-import-contacts-using-csv-file-oe6cdy/
- **Kondisi PesanPro sekarang:** `prisma/schema.prisma` punya `model Contact`, `model Label`, `model Segment`, `model Campaign`, `model ScheduledMessage` (`P17`). Tapi `src/components/dashboard/sidebar-nav.tsx` hanya memuat Ringkasan, Perangkat & QR, Antrian Pesan, Kirim Massal, Jadwal Kirim, Balasan Otomatis, Token Integrasi, Kunci API, Webhook, dan menu akun/operasi — tidak ada Kontak, Label, Segment, Campaign (`P19`). Folder `src/app/dashboard` juga tidak punya direktori itu. Data penerima broadcast bersifat snapshot per job (`P6`).
- **Catatan penting:** ini tampak seperti fitur yang sengaja dipensiunkan dari UI, bukan bug. Perlakukan sebagai keputusan produk.
- **Status bukti:** terverifikasi (kode).

---

## 4. Rekomendasi tiru — per gap

Semua nama dan cara diambil dari kompetitor yang sudah dibaca. Bukan karangan.

| Gap | Tiru siapa | Caranya, persis |
|---|---|---|
| 1 | **Starsender V3** (`S2`) | Tambah `Tujuan Pesan` dengan tiga nilai: `Kontak`, `Input Manual`, `Group Whatsapp`. Simpan `@g.us` sebagai target yang sah, bukan `SKIPPED`. Kalau mau hati-hati, tiru Fonnte `F5`: minta user mengetik group id secara eksplisit, jadi tidak ada grup yang terkirim tanpa sengaja. |
| 2 | **Fonnte WooCommerce** (`F3`) + **Fonnte Google Form** (`F5`) | Untuk Woo: simpan template per `event` (`order.created`, `order.paid`, dll) di sisi PesanPro, dengan 3 template bawaan ala "Pesan Order / Notif H+ Belum Bayar / Kirim Resi". Endpoint Tinggal terima `event` + `data`, bukan `message` lengkap. Untuk Google Forms: tambahkan field `message` di `Code.gs` yang bisa diedit user, atau tampilkan editor template per `formId`. |
| 3 | **WANotifier `notifier`** (`G8`) | Satu plugin WP, satu registry trigger per form plugin. Mulai dari Elementor Form karena Fonnte sudah membuktikan polanya (`F4`: "Nama Form" + "Pesan User" + "Pesan Admin"). Jangan buat plugin terpisah per form. |
| 4 | **Starsender Chat AI** (`S6`,`S7`) | Rule keyword tetap dipakai dulu. AI hanya jalan kalau tidak ada rule yang cocok, dan harus **opt-in per session**. Jangan jadikan default `FALLBACK`, sesuai keputusan rilis 9 Nov 2026. Kalau mau opsi lanjutan, tiru `K1` "BYOK & Tool Calling" supaya tidak bergantung vendor model. |
| 5 | **Wablas Multi Agents + Live Chats** (`W1`) | Model minimum: chat masuk → `assign` ke user → riwayat bersama. Tiru juga `G10` "Shared Team Inbox" untuk penamaan dan alur handoff. Ini butuh model data baru; minta izin pemilik sebelum mulai. |
| 6 | **Wablas Multiple Sender Broadcast** (`W1`) | Ubah `sessionId` menjadi daftar session, lalu `deterministicBroadcastDelay` (`P4`) yang sudah ada dipakai juga untuk memilih sender per posisi. Karena delay sudah deterministik, rotasinya otomatis reproducible dan aman di-restart. |
| 7 | **Wablas Message Attributes** (`W1`) | Tambah `buttons`, `header`, `footer` sebagai field opsional pada pesan. Sebelum implementasi, cek dulu status deprecated: Fonnte menandai "Button (Deprecated)" di jalur QR (`F1`). Kalau PesanPro tetap di jalur QR, prioritaskan `header`/`footer` dulu. |
| 8 | **Fonnte Master** (`F1`) | Tambah tier ke-4 di atas Pro dengan "Unlimited pesan/bulan", harga acuan Rp175.000. Tier gratis dan trial **jangan** ditambah tanpa izin pemilik. |
| 9 | **Wablas dual lane** (`W1`) | Wablas menaruh "Support Whatsapp API Cloud" sebagai fitur terpisah di samping jalur device. Tiru polanya: jalur QR tetap ada, jalur Cloud API jadi opsi koneksi kedua. Ini perubahan arsitektur besar; butuh keputusan pemilik. Sebelum mulai, verifikasi dulu apakah klaim Wablas dan kirimi.id benar-benar produk, karena FAQ kirimi.id menyangkal (`K1`). |
| 10 | **Fonnte Grouping Kontak** (`F1`) + **WANotifier Contact Lists** (`G12`) | Model Prisma sudah ada. Yang kurang hanya halaman kelola: import CSV dengan column mapping ke `Contact`, lalu pilih `Segment` sebagai sumber penerima broadcast. Tiru `G12` untuk alur mapping kolom, dan `F1` untuk "Grouping Kontak". |

---

## 5. Yang sudah standar — jangan diperbaiki

Ini setara atau lebih baik. Menyentuhnya hanya akan merusak.

1. **Spintax.** PesanPro punya parser sendiri: nested, escape `{}|\`, batas 4.096 karakter / depth 5 / 500 node / 10.000 kombinasi, dan pemilihan deterministik `sha256(seed:recipientKey:path)` (`P1`). Dari semua kompetitor yang dibaca, spintax hanya **terverifikasi** di kirimi.id `K1`. Di Wablas, Fonnte, Starsender, WATI, WANotifier, UltraMsg: **tidak ditemukan**. Jadi ini bukan gap, ini keunggulan.
2. **Variabel + spintax tidak saling merusak.** `protectBroadcastVariables` melindungi token `{{...}}` sebelum parse spintax, dan nilai yang hilang memicu `INVALID_BROADCAST_TEMPLATE`, bukan pesan setengah jadi (`P2`). Kompetitor tidak mendokumentasikan perilaku ini.
3. **Format variabel.** `{{name}}` bebas nama (`P2`). Starsender hanya `{nama}` + `{var1..3}` (`S2`), WANotifier memakai angka `{{1}}` yang harus di-mapping (`G11`). PesanPro lebih mudah dibaca.
4. **CSV import.** 2 MB, comma/semicolon, UTF-8, 5.000 penerima, 20 kolom, 19 kolom personalisasi, 20+ alias header nomor, duplikat dan grup dibuang (`P5`). `P7` menampilkan preview spintax ke user. Kompetitor tidak ada yang mendokumentasikan batas dan preview sejelas ini.
5. **Jadwal dan pesan berulang.** `ONE_TIME` / `RECURRING`, cron, timezone, `missedRunPolicy` (`SEND_LATE`/`SKIP`/`CANCEL`), `misfireGraceSeconds` 0–86.400 (`P9`,`P10`), plus `Campaign.scheduledAt` + timezone (`P8`). Fonnte cuma menulis "Pesan Berulang" (`F1`), Starsender cuma "Pesan Terjadwal" (`S2`). PesanPro lebih lengkap.
6. **Delay.** Rentang dan batasnya jelas: 2–60 dtk / 2–120 dtk (`P3`), minimum per paket 5/3/2 dtk (`P18`). Deterministik berdasarkan seed + posisi (`P4`), jadi tahan restart dan bisa diaudit. Kompetitor hanya menulis "delay"/"Random Delay" tanpa angka (`W1`,`F1`,`S2`,`K1`).
7. **Custom pesan per form CF7.** Sudah ada (`P11`,`P12`), lengkap dengan `{{all_fields}}`, `{{field:key}}`, dan konteks form. Fonnte CF7 justru global (`F2`), WANotifier tidak mendokumentasikannya (`G8`). Ini kebalikan dari jangkar user.
8. **Distribusi plugin.** ZIP dibangun dan disajikan gateway (`P23`, endpoint `/api/admin/plugin/wordpress`). Fonnte menyuruh user unduh dari Google Drive (`F2`,`F4`). PesanPro lebih rapi.
9. **Keamanan integrasi.** API key disimpan hash + preview, `scopes`, `ipAllowlist`, rotasi; webhook secret terenkripsi dengan versi sebelumnya untuk rotasi; `idempotencyKey` + `requestHash` di `MessageJob` (`P17`); scope policy fail-closed `src/lib/api-scope-policy.ts`; `Message.content` tidak pernah ditulis, baris hanya metadata. Tidak ada docs kompetitor yang dibaca yang mendokumentasikan setara ini. Ini pembeda, bukan kekurangan.
10. **Harga termurah di kelas berbayar Indonesia.** Rp20.000 < Wablas Rp22K < Fonnte Rp25.000 < kirimi.id Rp29.000 (`P18`,`W2`,`F1`,`K1`). Catatan: Fonnte punya Rp0, jadi PesanPro bukan yang termurah secara absolut.
11. **Media.** 8 tipe pesan + `mediaId` privat + batas unggah 50/75/100 MB (`P17`,`P18`). Setara dengan `W1`,`F1`,`S2`,`G5`.

---

## 6. Batas audit — yang tidak boleh disimpulkan

- Harga **live** di situs PesanPro tidak dicek. Yang dipakai adalah `docs/marketing/harga.md` berstatus `DRAF` `P18`, dicocokkan dengan keputusan produk di MEMORY.md. Sebelum dipakai untuk materi marketing, cek halaman `/pricing` produksi.
- Starsender: harga resmi **tidak ditemukan**. Jangan isi dari testimoni.
- Wablas dan Fonnte: sintaks variabel dan spintax **tidak ditemukan** di halaman resmi yang dibaca. Mungkin ada di docs berbayar / video. Statusnya bukan "tidak ada".
- kirimi.id: klaim "Meta Tech Partner / WABA Coexistence / Kirimi Cloud API" bertentangan dengan FAQ "protokol gateway independen" di halaman yang sama `K1`. Jangan pakai klaim itu sebagai bukti jalur resmi.
- WANotifier: custom message per form **tidak dikonfirmasi** `G8`. Jangan ditulis "semua gateway bisa".
- Forum, komunitas, YouTube, GitHub, changelog kompetitor: **belum dicek** menyeluruh.
- KirimWA, Wagy, SocialNotify, DynamicWebLab: produk tidak ditemukan / tidak relevan. Tidak masuk hitungan "kompetitor punya".
- Semua temuan "tidak ada di PesanPro" berarti **tidak ditemukan di repo pada 2026-11-11**, bukan mustahil secara teknis.

---

## 7. Daftar sumber

### Kode PesanPro (bukan URL, path repo)

| Kode | Path |
|---|---|
| P1 | `src/lib/spintax.ts` |
| P2 | `src/lib/broadcast-template.ts` |
| P3 | `src/lib/broadcast-input.ts` |
| P4 | `src/lib/broadcast-policy.ts` |
| P5 | `src/lib/broadcast-csv.ts` |
| P6 | `src/lib/broadcast-service.ts` |
| P7 | `src/app/dashboard/broadcast/page.tsx` |
| P8 | `src/lib/campaign-service.ts` |
| P9 | `src/lib/schedule-service.ts` |
| P10 | `src/lib/schedule-input.ts` |
| P11 | `integrations/wordpress/pesanpro-contact-form-7/includes/class-pesanpro-cf7-form-message.php` |
| P12 | `integrations/wordpress/pesanpro-contact-form-7/includes/class-pesanpro-cf7-plugin.php` |
| P13 | `integrations/google-forms/Code.gs` |
| P14 | `src/app/api/v1/integrations/woocommerce/route.ts` |
| P15 | `src/lib/integration-contract.ts` |
| P16 | `src/lib/autoreply-policy.ts`, `src/lib/autoreply-service.ts` |
| P17 | `prisma/schema.prisma` |
| P18 | `docs/marketing/harga.md` |
| P19 | `src/components/dashboard/sidebar-nav.tsx` |
| P20 | `src/app/dashboard/inbox/page.tsx` |
| P21 | `src/app/api/v1/integrations/contact-form-7/route.ts` |
| P22 | `src/app/api/v1/integrations/google-forms/route.ts` |
| P23 | `src/lib/wordpress-plugin-zip.ts` |
| P24 | `src/lib/form-integration.ts` |
| P25 | `docs/panduan/01-memulai-umkm.md`, `docs/panduan/05-api-developer.md`, `src/app/api/sessions/[sessionId]/qr/route.ts`, `src/modules/whatsapp/auth/usePrismaAuthState.ts` |
| P26 | `integrations/wordpress/pesanpro-contact-form-7/pesanpro-contact-form-7.php` (Version 1.2.0) |

### Wablas

- W1 — Wablas, beranda fitur: https://wablas.com/
- W2 — Wablas, harga: https://wablas.com/pricing
- W3 — Wablas Developers, indeks API: https://wablas.com/documentation/api

### Fonnte

- F1 — Fonnte, beranda + fitur + harga: https://fonnte.com/
- F2 — Fonnte, Plugin Autoresponder Form Whatsapp (CF7): https://fonnte.com/tutorial/plugin-autoresponder-form-whatsapp/
- F3 — Fonnte, plugin WooCommerce: https://fonnte.com/tutorial/plugin-woocommerce-whatsapp/
- F4 — Fonnte, Elementor Form: https://fonnte.com/tutorial/elementor-form-whatsapp/
- F5 — Fonnte, Google Form: https://fonnte.com/tutorial/google-form-whatsapp/

### Starsender

- S1 — Docs Starsender V3, indeks: https://tutorial.starsender.id/docs
- S2 — Kirim Pesan Broadcast Manual: https://tutorial.starsender.id/docs/kirim-pesan-broadcast-manual/
- S3 — Variable Dalam Pesan: https://tutorial.starsender.id/docs/variable-dalam-pesan/
- S4 — Kirim Pesan Melalui Google Spreadsheet: https://tutorial.starsender.id/docs/kirim-pesan-melalui-google-spreadsheet/
- S5 — Kirim Notifikasi Pesan Googleform: https://tutorial.starsender.id/docs/kirim-notifikasi-pesan-googleform/
- S6 — Feature Premium: https://tutorial.starsender.id/docs-category/feature-premium/
- S7 — STARSENDER.ID, beranda: https://starsender.id/

### kirimi.id

- K1 — Kirimi, beranda + harga + FAQ: https://kirimi.id/

### Global / Cloud API

- G1 — WATI, beranda: https://www.wati.io/
- G2 — WATI, harga: https://www.wati.io/pricing
- G3 — Twilio WhatsApp: https://www.twilio.com/whatsapp
- G4 — Twilio WhatsApp Messaging Pricing: https://www.twilio.com/en-us/whatsapp/pricing
- G5 — UltraMsg, beranda + harga + FAQ: https://ultramsg.com/
- G6 — WANotifier, beranda: https://wanotifier.com/
- G7 — WANotifier, harga: https://wanotifier.com/pricing/
- G8 — WordPress.org, WANotifier for Forms and Actions: https://wordpress.org/plugins/notifier/
- G9 — WordPress.org, Order & Abandoned Cart Notifications for WooCommerce: https://wordpress.org/plugins/order-notifications-for-woocommerce/
- G10 — WANotifier Helpdesk, indeks kategori: https://help.wanotifier.com/
- G11 — WANotifier Helpdesk, Personalize & Send Messages Using Template Variables: https://help.wanotifier.com/en/article/personalize-send-messages-using-template-variables-7rm0c0/
- G12 — WANotifier Helpdesk, Bulk Import Contacts Using CSV File: https://help.wanotifier.com/en/article/bulk-import-contacts-using-csv-file-oe6cdy/
- G13 — WANotifier Helpdesk, Notifications (aka Campaigns): https://help.wanotifier.com/en/category/notifications-aka-campaigns-57oe77/
- G14 — Join.chat, beranda: https://join.chat
- G15 — Join.chat, harga: https://join.chat/en/pricing/
- G16 — WordPress.org, WP WhatsApp Chat / Social Chat: https://wordpress.org/plugins/wp-whatsapp-chat/
- G17 — DynamicWebLab: https://dynamicweblab.com/
- G18 — SocialNotify: https://socialnotify.com/ (domain dijual)
- G19 — kirimwa.com: https://kirimwa.com/ (domain dijual)
- G20 — kirimwa.id: https://kirimwa.id/ (URL shortener)
- G21 — wagy.id / wagy.co.id: fetch failed, **belum dicek**
