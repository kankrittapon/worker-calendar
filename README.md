# 📅 Calendar Worker - ระบบจัดการตารางงาน

ระบบจัดการตารางงานด้วย Cloudflare Workers + Flutter App พร้อม LINE Notification

---

## 🏗️ โครงสร้างโปรเจค

```
calendar-worker/
├── calendar-worker/          # Cloudflare Worker Backend
│   ├── src/
│   │   └── worker.ts        # Main API & LINE Bot
│   ├── public/              # HTML UI (Boss/Secretary/DevConsole)
│   ├── migrations/          # D1 Database Schema
│   └── wrangler.jsonc       # Cloudflare Config
│
└── worker_app/              # Flutter Mobile App
    ├── lib/
    │   ├── main.dart        # App Entry Point
    │   ├── api_service.dart # API Client
    │   └── screens/         # UI Screens
    ├── assets/              # App Icon
    └── android/             # Android Build Config
```

---

## 🚀 Features

### Backend (Cloudflare Worker)
- ✅ REST API สำหรับจัดการงาน (CRUD)
- ✅ LINE Bot Integration (Messaging API + Flex Message)
- ✅ Role-based Access Control (Boss/Secretary/Viewer)
- ✅ Cron Jobs (แจ้งเตือนอัตโนมัติ)
- ✅ XSS Protection & Input Validation
- ✅ D1 Database (SQLite)

### Frontend (Flutter App)
- ✅ Login ด้วย Password (Boss/Secretary)
- ✅ ดูตารางงานแบบ Calendar/Table
- ✅ เพิ่ม/แก้ไข/ลบงาน
- ✅ Theme สีฟ้าอ่อนทะเล
- ✅ Cross-platform (Android/iOS/Web)

### Web UI
- ✅ Boss Dashboard (HTML)
- ✅ Secretary Dashboard (HTML)
- ✅ Dev Console (ตั้งค่า Cron/ดู Logs)

---

## 📦 Installation

### 1. Backend Setup

```bash
cd calendar-worker/calendar-worker

# ติดตั้ง dependencies
npm install

# รัน migrations (ครั้งแรก)
wrangler d1 execute calendar-db --remote --file=migrations/0001_init.sql
wrangler d1 execute calendar-db --remote --file=migrations/0002_cron_settings.sql

# Deploy
wrangler deploy
```

### 2. Flutter App Setup

```bash
cd worker_app

# ติดตั้ง dependencies
flutter pub get

# Generate app icons
flutter pub run flutter_launcher_icons

# Build Android APK
flutter build apk --release

# หรือ Run บน Chrome
flutter run -d chrome --web-browser-flag="--disable-web-security"
```

---

## ⚙️ Configuration

### Backend Environment Variables

สร้างไฟล์ `.dev.vars` (สำหรับ local testing):

```env
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_token
LINE_CHANNEL_SECRET=your_line_channel_secret
SITE_PASSWORD=your_admin_password
BOSS_PASSWORD=comunicationandelectronic
SECRETARY_PASSWORD=helperSITE
```

### wrangler.jsonc

```jsonc
{
  "name": "calendar-worker",
  "main": "src/worker.ts",
  "compatibility_date": "2024-11-01",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "calendar-db",
      "database_id": "your_d1_database_id"
    }
  ],
  "vars": {
    "LINE_CHANNEL_ACCESS_TOKEN": "...",
    "LINE_CHANNEL_SECRET": "...",
    "SITE_PASSWORD": "...",
    "BOSS_PASSWORD": "comunicationandelectronic",
    "SECRETARY_PASSWORD": "helperSITE"
  }
}
```

---

## 🔐 API Endpoints

### Public
- `POST /webhook/line` - LINE Bot Webhook

### Protected (ต้อง login)
- `GET /api/events?month=YYYY-MM` - ดึงรายการงาน
- `POST /api/events` - เพิ่มงาน
- `PUT /api/events/:id` - แก้ไขงาน
- `DELETE /api/events/:id` - ลบงาน
- `GET /api/roles` - ดู Roles
- `GET /api/cron/settings` - ดูตั้งค่า Cron (Admin only)
- `POST /api/cron/settings` - บันทึกตั้งค่า Cron (Admin only)

---

## 🎨 UI Screenshots

### Flutter App
- **Login Screen** - ธีมสีฟ้าอ่อนทะเล
- **Calendar View** - ปฏิทินรายเดือน
- **Event List** - รายการงานแบบ Table

### Web UI
- **Boss Dashboard** - จัดการงาน + แจ้งเตือน
- **Secretary Dashboard** - ดูและแก้ไขงาน
- **Dev Console** - ตั้งค่าระบบ

---

## 📱 LINE Bot Commands

### User Commands
- `วันนี้` - ดูงานวันนี้
- `พรุ่งนี้` - ดูงานพรุ่งนี้
- `สัปดาห์นี้` - ดูงานสัปดาห์นี้
- `เดือนนี้` - ดูงานเดือนนี้

### Boss Commands
- `ไป` / `ไม่ไป` - บอกสถานะการเข้าร่วมงาน
- `สั่งงานด่วน: [รายละเอียด]` - สั่งงานด่วน
- ส่งไฟล์ `.pdf`, `.doc` - ส่งต่อให้เลขา

---

## ⏰ Cron Jobs

### Default Schedule
- **08:30** - แจ้งเตือนงานของวันนี้ (Boss only)
- **20:00** - แจ้งเตือนงานของพรุ่งนี้ (Boss only)
- **1 ชม. ก่อนงานเริ่ม** - แจ้งเตือนล่วงหน้า (Boss only)

สามารถปรับเวลาได้ที่ **Dev Console**

---

## 🛠️ Tech Stack

### Backend
- **Cloudflare Workers** - Serverless Runtime
- **Cloudflare D1** - SQLite Database
- **TypeScript** - Language
- **LINE Messaging API** - Chat Bot

### Frontend
- **Flutter 3.9+** - Cross-platform Framework
- **Dart** - Language
- **http** - HTTP Client
- **table_calendar** - Calendar UI

---

## 📄 License

MIT License - ใช้งานได้อย่างอิสระ

---

## 👨‍💻 Author

**Kan Krittapon**
- Backend: https://calendar-worker.kan-krittapon.workers.dev
- LINE OA: [@your-line-oa]

---

## 🙏 Credits

- LINE Messaging API
- Cloudflare Workers
- Flutter Framework
