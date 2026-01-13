# Backend Migration Scripts

This directory contains data migration scripts for the Finance App backend.

## Available Scripts

### migrate-orphan-overrides.ts

**Purpose**: Links orphan category overrides to their corresponding templates.

**When to use**:
- After importing user data from an older version
- If you notice user categories missing custom subcategories in the UI
- When templates were added after user overrides were created

**How to run**:
```bash
npx ts-node scripts/migrate-orphan-overrides.ts
```

**What it does**:
1. Finds `UserCategoryOverride` records with `templateId = null` and `isCustom = false`
2. Matches them with `CategoryTemplate` records by name, icon, and color
3. Updates the override to link to the matching template
4. Displays a summary of matched and unmatched records

**Safety**: This script only updates existing records and does not delete or create new data.

## Adding New Scripts

When creating new migration scripts:
1. Use descriptive names (e.g., `migrate-[feature]-[date].ts`)
2. Add comprehensive documentation at the top of the file
3. Include error handling and transaction support where appropriate
4. Update this README with usage instructions
5. Test thoroughly on development data before production use
