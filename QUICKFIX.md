# Quick Fix - สร้าง notification_settings table

## วิธีที่ 1: Run migration ใหม่ (แนะนำ)

```bash
wrangler d1 execute calendar_db --remote --file=./migrations/006_notification_settings.sql
```

## วิธีที่ 2: สร้างด้วยคำสั่งตรง

```bash
wrangler d1 execute calendar_db --remote --command="CREATE TABLE IF NOT EXISTS notification_settings (type TEXT PRIMARY KEY, thresholds TEXT NOT NULL, updated_at INTEGER NOT NULL)"

wrangler d1 execute calendar_db --remote --command="INSERT INTO notification_settings (type, thresholds, updated_at) VALUES ('ในหน่วย', '30', 0), ('ในกรม', '60', 0), ('บก.ใหญ่', '60', 0), ('นอกหน่วย', '120,60', 0) ON CONFLICT(type) DO NOTHING"
```

## วิธีที่ 3: Run script ทั้งหมด

```bash
# Windows
run-migrations.bat --remote

# Linux/Mac
./run-migrations.sh --remote
```

## ตรวจสอบ

```bash
wrangler d1 execute calendar_db --remote --command="SELECT * FROM notification_settings"
```

ควรเห็น:
```
type       | thresholds | updated_at
-----------|------------|------------
ในหน่วย    | 30         | 0
ในกรม      | 60         | 0
บก.ใหญ่   | 60         | 0
นอกหน่วย   | 120,60     | 0
```

## Deploy อีกครั้ง

```bash
wrangler deploy
```

## ทดสอบ

เปิด: https://calendar-worker.kan-krittapon.workers.dev/dev_console

ควรไม่ error แล้ว!
