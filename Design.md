# KingOfCoding Design System

## Theme

**Style:** Warm • Compact • Human • Operational

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
| `--canvas`     | `#FCFAF5` | Background utama                 |
| `--ink`        | `#1A3300` | Text, primary button, navigation |
| `--yellow`     | `#FFE95C` | Active, highlight, attention     |
| `--mint`       | `#D5F5C2` | Healthy, connected, success      |
| `--teal`       | `#A8E5E5` | Information, secondary state     |
| `--blush`      | `#F6D0FF` | Paused, inactive                 |
| `--terracotta` | `#CB5521` | Warning, quota, notification     |
| `--danger`     | `#8B2F0B` | Error / destructive action       |
| `--border`     | `#B6B6B6` | Border / separator               |
| `--muted`      | `#607054` | Secondary text                   |
| `--white`      | `#FFFFFF` | Surface / input                  |

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