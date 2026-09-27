# PesanPro Design System

## Theme

**Style:** Warm • Compact • Human • Operational

**ENERGY:** 1/3. Data and actions stay calm; color marks operational meaning.

**RHYTHM:** 1/3. Spacing is compact and regular for frequent dashboard use.

**MOTION:** 1/3. Motion is limited to progress, loading, and state transitions.

These settings support long operational sessions and keep failures, quotas,
and primary actions easy to scan without decorative noise.

PesanPro menggunakan dashboard yang bersih dan fungsional dengan nuansa paper/warm UI.
Desain mengutamakan **operational clarity**, keterbacaan data, status yang jelas, dan aksi utama yang mudah ditemukan.

Hindari:

* Gradient biru/ungu generik
* Glassmorphism
* Glow/neon
* Shadow berlebihan
* Rounded card terlalu besar
* Decorative UI yang tidak memiliki fungsi

---

## Color Palette

| Token          | Color     | Usage                            |
| -------------- | --------- | -------------------------------- |
| `--pp-paper`      | `#FCFAF5` | Background utama                 |
| `--pp-ink`        | `#1A3300` | Text, primary button, navigation |
| `--pp-highlight`  | `#FFE95C` | Active, highlight, attention     |
| `--pp-mint`       | `#D5F5C2` | Healthy, connected, success      |
| `--pp-teal`       | `#A8E5E5` | Information, secondary state     |
| `--pp-blush`      | `#F6D0FF` | Paused, inactive                 |
| `--pp-terracotta` | `#CB5521` | Warning, quota, notification     |
| `--pp-danger`     | `#8B2F0B` | Error / destructive action       |
| `--pp-line`       | `#B6B6B6` | Border / separator               |
| `--pp-muted`      | `#607054` | Secondary text                   |
| `--pp-white`      | `#FFFFFF` | Surface / input                  |

---

## Typography

**Heading / Metric:** Bricolage Grotesque
**Body / Navigation / Form / Table:** Inter
**ID / Timestamp / Technical metadata:** System Mono

Hierarchy harus jelas dan compact, bukan oversized typography.

---

## Components

### Card

* Radius: `12px`
* Border tipis
* Default tanpa shadow
* Padding compact

### Button

* Radius: `6px`
* Primary: `#1A3300`
* Primary text: putih
* Secondary: outline / text button
* Minimum interactive height: `44px`

### Input

* Radius: `6px`
* Background putih
* Border neutral
* Focus state harus jelas

### Badge

* Pill radius
* Warna memiliki arti status, bukan dekorasi

### Table

* Header: mint
* Row compact
* Hover: subtle yellow
* Prioritaskan keterbacaan data

### Tabs

* Outlined
* Active state: yellow

---

## Layout

Desktop sidebar: `268px`
Topbar: `72px`

Dashboard menggunakan struktur:

`Sidebar → Topbar → Page Header → Primary Action → Main Content`

Sidebar harus konsisten berdasarkan role.

---

## Visual Principle

**One region = one obvious primary action.**

Warna harus menyampaikan fungsi:

* Yellow → attention / active
* Mint → healthy / success
* Teal → information
* Blush → inactive / paused
* Terracotta → warning / pressure
* Dark red → danger
