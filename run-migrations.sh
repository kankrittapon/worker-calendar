#!/bin/bash
# Run all migrations for calendar_db

echo "🔄 Running migrations for calendar_db..."

# Array of migration files
migrations=(
  "001_init.sql"
  "002_attendance_audit.sql"
  "003_add_notes.sql"
  "004_sent_notifications.sql"
  "005_add_display_name.sql"
  "006_notification_settings.sql"
)

# Check if --remote flag is provided
if [ "$1" == "--remote" ]; then
  echo "📡 Running on REMOTE database..."
  REMOTE_FLAG="--remote"
else
  echo "💻 Running on LOCAL database..."
  REMOTE_FLAG="--local"
fi

# Run each migration
for migration in "${migrations[@]}"; do
  echo "  ➡️  Running $migration..."
  wrangler d1 execute calendar_db $REMOTE_FLAG --file="./migrations/$migration"
  
  if [ $? -eq 0 ]; then
    echo "  ✅ $migration completed"
  else
    echo "  ❌ $migration failed"
    exit 1
  fi
done

echo ""
echo "✅ All migrations completed successfully!"
echo ""
echo "📋 Verify with:"
echo "  wrangler d1 execute calendar_db $REMOTE_FLAG --command=\"SELECT name FROM sqlite_master WHERE type='table'\""
