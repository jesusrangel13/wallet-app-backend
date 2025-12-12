# Scripts de Base de Datos

Este directorio contiene scripts para operaciones de mantenimiento de la base de datos.

## mark-old-expenses-paid

Script para marcar como pagados (`isPaid = true`) todos los participantes de gastos compartidos creados antes del 1 de diciembre de 2025.

### ¿Por qué es necesario este script?

Antes de la corrección implementada, cuando se creaba un gasto compartido, TODOS los participantes se marcaban como `isPaid = false`, incluyendo la persona que pagó. Este script corrige los datos históricos.

### Opciones de ejecución

#### Opción 1: Script TypeScript (Recomendado)

```bash
cd backend
npx ts-node scripts/mark-old-expenses-paid.ts
```

**Ventajas:**
- Muestra información detallada
- Cuenta cuántos registros se actualizarán
- Muestra ejemplos de los gastos a actualizar
- Verifica los cambios después de la actualización
- Muestra resumen por usuario

#### Opción 2: SQL Directo

Si prefieres ejecutar SQL directamente en tu cliente de PostgreSQL:

```bash
psql -U your_user -d your_database -f scripts/mark-old-expenses-paid.sql
```

O copia y pega el contenido del archivo `mark-old-expenses-paid.sql` en tu cliente SQL favorito.

### ¿Qué hace el script?

1. Busca todos los registros en `expense_participants` donde:
   - El gasto compartido (`shared_expense`) tiene fecha anterior al 1 de diciembre de 2025
   - El campo `is_paid` es `false`

2. Actualiza esos registros estableciendo:
   - `is_paid = true`
   - `paid_date = NOW()` (o la fecha del gasto si ya tenía paid_date)
   - `paid_amount = amount_owed` (si no tenía paid_amount)

### Ejemplo de salida

```
🔍 Iniciando actualización de gastos antiguos...

📅 Fecha de corte: 2025-12-01T00:00:00.000Z

📊 Registros que serán actualizados: 45

📋 Ejemplos de gastos a actualizar (primeros 10):
  1. Cena en restaurante - Pedro Perez - $10000 (2024-11-15)
  2. Supermercado - Juan Perez - $15000 (2024-11-20)
  ...

⚠️  Se actualizarán 45 participantes de gastos compartidos.
⚠️  Esta operación no se puede deshacer fácilmente.

🔄 Actualizando registros...

✅ Actualización completada: 45 registros actualizados

✅ Verificación: 45 participantes de gastos antiguos ahora están marcados como pagados

📊 Resumen por usuario (top 10):
  1. Pedro Perez: 15 gastos marcados como pagados
  2. Juan Perez: 12 gastos marcados como pagados
  ...

✅ Script completado exitosamente!
```

### Seguridad

⚠️ **IMPORTANTE**: Este script modifica datos en producción. Asegúrate de:

1. Hacer un backup de la base de datos antes de ejecutar
2. Revisar el código del script
3. Probar en un ambiente de desarrollo primero
4. Verificar que la fecha de corte (1 de diciembre 2025) sea correcta

### Rollback

Si necesitas revertir los cambios:

```sql
-- CUIDADO: Esto revertirá TODOS los gastos a isPaid = false
-- Solo ejecutar si sabes lo que haces
UPDATE expense_participants
SET
  is_paid = false,
  paid_date = NULL,
  paid_amount = NULL
FROM shared_expenses
WHERE expense_participants.expense_id = shared_expenses.id
  AND shared_expenses.date < '2025-12-01';
```

### Notas

- El script es **idempotente**: puedes ejecutarlo múltiples veces sin problemas
- Solo actualiza registros que aún no están marcados como pagados
- No afecta gastos creados después del 1 de diciembre de 2025
