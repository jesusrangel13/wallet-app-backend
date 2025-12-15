#!/bin/bash

# Load environment variables from .env
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

# Configuration
BACKUP_DIR="backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Perform backup
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set"
  exit 1
fi

echo "Starting backup..."
pg_dump "$DATABASE_URL" > "$BACKUP_DIR/backup_$DATE.sql"

if [ $? -eq 0 ]; then
  echo "Backup completed successfully: $BACKUP_DIR/backup_$DATE.sql"
  
  # Optional: Delete old backups (keep last 30 days)
  find "$BACKUP_DIR" -name "backup_*.sql" -mtime +30 -delete
else
  echo "Backup failed"
  exit 1
fi
