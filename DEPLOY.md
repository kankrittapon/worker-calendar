# 🚀 การ Deploy Calendar Worker

## ขั้นตอนการ Deploy ครั้งแรก

### 1. Setup D1 Database

```bash
# สร้าง database
wrangler d1 create calendar_db

# คัดลอก database_id ที่ได้ไปใส่ใน wrangler.jsonc
```

### 2. Run Migrations

#### **Windows:**
```bash
# Local (ทดสอบ)
run-migrations.bat

# Production (จริง)
run-migrations.bat --remote
```

#### **Linux/Mac:**
```bash
# ให้สิทธิ์ execute
chmod +x run-migrations.sh

# Local (ทดสอบ)
./run-migrations.sh

# Production (จริง)
./run-migrations.sh --remote
```

#### **หรือ Run ทีละไฟล์:**
```bash
wrangler d1 execute calendar_db --remote --file=./migrations/001_init.sql
wrangler d1 execute calendar_db --remote --file=./migrations/002_attendance_audit.sql
wrangler d1 execute calendar_db --remote --file=./migrations/003_add_notes.sql
wrangler d1 execute calendar_db --remote --file=./migrations/004_sent_notifications.sql
wrangler d1 execute calendar_db --remote --file=./migrations/005_add_display_name.sql
wrangler d1 execute calendar_db --remote --file=./migrations/006_notification_settings.sql
```

### 3. ตรวจสอบ Tables

```bash
# ดู tables ทั้งหมด
wrangler d1 execute calendar_db --remote --command="SELECT name FROM sqlite_master WHERE type='table'"

# ตรวจสอบ notification_settings
wrangler d1 execute calendar_db --remote --command="SELECT * FROM notification_settings"
```

**ผลลัพธ์ที่คาดหวัง:**
```
Tables:
- events
- roles
- attendance
- audit_log
- sent_notifications
- notification_settings

Notification Settings:
- ในหน่วย: 30
- ในกรม: 60
- บก.ใหญ่: 60
- นอกหน่วย: 120,60
```

### 4. ตั้งค่า Secrets

```bash
wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
wrangler secret put SITE_PASSWORD
```

### 5. Deploy Worker

```bash
wrangler deploy
```

---

## การอัพเดท (เมื่อมี Migration ใหม่)

### ถ้ามี Migration ใหม่:

```bash
# 1. Run migration ใหม่เท่านั้น
wrangler d1 execute calendar_db --remote --file=./migrations/006_notification_settings.sql

# 2. Deploy worker
wrangler deploy
```

---

## ตรวจสอบสถานะ

### ดู Logs:
```bash
wrangler tail
```

### ทดสอบ Cron:
```bash
# ดู cron schedule
wrangler deployments list

# ทดสอบ scheduled handler (local)
wrangler dev --test-scheduled
```

---

## Troubleshooting

### ❌ Table ไม่มี:
```bash
# ตรวจสอบว่า migration run หรือยัง
wrangler d1 execute calendar_db --remote --command="SELECT name FROM sqlite_master WHERE type='table'"

# Run migration ที่ขาด
wrangler d1 execute calendar_db --remote --file=./migrations/XXX.sql
```

### ❌ Migration ซ้ำ:
```
Error: UNIQUE constraint failed
```
→ ปกติครับ table มีอยู่แล้ว ข้ามได้

### ❌ Worker error:
```bash
# ดู logs
wrangler tail

# ทดสอบ local
wrangler dev
```

---

## URL สำคัญ

หลัง Deploy แล้ว แก้ URL ใน code:

### worker.ts:
- Line 545: คำสั่งช่วยเหลือ
- Line 560: ข้อความต้อนรับ
- Line 838: Attendance link เวลา 08:30

แก้จาก:
```
https://your-worker.workers.dev
```

เป็น:
```
https://YOUR-WORKER-NAME.workers.dev
```

---

## เช็คลิสต์ก่อน Deploy

- [ ] Run migrations ทั้งหมด (--remote)
- [ ] ตั้งค่า Secrets (LINE_CHANNEL_ACCESS_TOKEN, SITE_PASSWORD)
- [ ] ตรวจสอบ wrangler.jsonc (database_id ถูกต้อง)
- [ ] แก้ไข URL ใน worker.ts
- [ ] Deploy: `wrangler deploy`
- [ ] ตั้งค่า Boss และ Secretary role ที่ `/dev_console.html`
- [ ] ทดสอบแจ้งเตือนตอนเช้า (08:30)

---

## Migration History

| Version | File | Description |
|---------|------|-------------|
| 001 | init.sql | สร้าง tables หลัก (events, roles) |
| 002 | attendance_audit.sql | เพิ่ม attendance, audit_log |
| 003 | add_notes.sql | เพิ่ม column notes ใน events |
| 004 | sent_notifications.sql | ป้องกันการแจ้งเตือนซ้ำ |
| 005 | add_display_name.sql | เพิ่ม display_name ใน roles |
| 006 | notification_settings.sql | ตั้งค่าเวลาแจ้งเตือนได้ |

---

## 🎉 เสร็จสิ้น

หลัง Deploy แล้ว เข้าใช้งานที่:
- **Boss**: `/boss.html`, `/attendance.html`
- **Secretary**: `/secretary.html`, `/index.html`
- **Admin**: `/dev_console.html`
- **Help**: `/boss-help.html`
