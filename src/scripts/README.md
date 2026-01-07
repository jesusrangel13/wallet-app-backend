# Scripts de Mantenimiento

Este directorio contiene scripts de mantenimiento y migración de datos para la aplicación Finance App.

## Scripts Disponibles

### 1. `linkSharedExpenseTransactions.ts`

**Propósito:** Corrige el problema de doble conteo en los widgets de gastos personales y compartidos.

**Problema que resuelve:**
Anteriormente, cuando se liquidaban gastos compartidos, las transacciones creadas no estaban vinculadas al `SharedExpense` original. Esto causaba que:
- El gasto compartido se contara en "Shared Expenses" ✅
- La liquidación se contara TAMBIÉN en "Personal Expenses" ❌ (doble conteo)

**Qué hace el script:**
1. Busca todas las transacciones con categorías "Pago de deuda" o "Cobro de deuda" que no están vinculadas a un gasto compartido
2. Intenta hacer match automático basándose en:
   - Descripción del gasto compartido
   - Monto de la transacción
   - Fecha (con tolerancia de 7 días)
3. Vincula las transacciones encontradas a sus gastos compartidos correspondientes
4. Genera un reporte detallado de las transacciones vinculadas

**Cómo ejecutar:**

```bash
# Desde el directorio backend/
npm run fix:shared-expenses
```

**Cuándo ejecutar:**
- Una sola vez después de aplicar el fix del código (ya implementado)
- Solo si tienes datos históricos con este problema

**Impacto:**
- ✅ Elimina el doble conteo en los widgets
- ✅ Los widgets mostrarán los montos correctos
- ✅ No afecta los balances de cuentas
- ✅ Es seguro ejecutar múltiples veces (solo procesa transacciones no vinculadas)

**Ejemplo de salida:**
```
🔄 Starting shared expense transaction linking...

📋 Step 1: Finding debt payment categories...
   ✓ Found "Pago de deuda": Yes
   ✓ Found "Cobro de deuda": Yes

📋 Step 2: Finding unlinked settlement transactions...
   ✓ Found 42 unlinked settlement transactions

📋 Step 3: Loading shared expenses for matching...
   ✓ Loaded 127 shared expenses

📋 Step 4: Matching and linking transactions...

🔍 Processing transaction abc-123
   Type: EXPENSE
   Amount: $50000
   Description: "Pago a María por "Cena restaurante""
   ✅ Match found! Shared expense: "Cena restaurante"
   ✅ Transaction linked successfully!

================================================================================
📊 TRANSACTION LINKING SUMMARY
================================================================================

✅ Total transactions processed: 42
🔗 Successfully linked: 38
⚠️  Could not link: 4

💰 TOTAL AMOUNT LINKED: $1,234,567
```

---

### 2. `recalculateBalances.ts`

**Propósito:** Recalcula los balances de todas las cuentas basándose en el historial de transacciones.

**Problema que resuelve:**
En algunos casos, especialmente después de importar transacciones, los balances de las cuentas pueden quedar desincronizados.

**Cómo ejecutar:**

```bash
# Desde el directorio backend/
npm run recalculate:balances
```

---

## Orden Recomendado de Ejecución

Si estás corrigiendo el problema de gastos compartidos por primera vez, ejecuta los scripts en este orden:

1. **Primero:** Asegúrate de que el código está actualizado con el fix
   - Verifica que `sharedExpense.service.ts` incluye `sharedExpenseId` en las transacciones de liquidación

2. **Segundo:** Ejecuta el script de vinculación
   ```bash
   npm run fix:shared-expenses
   ```

3. **Tercero (opcional):** Si tienes dudas sobre los balances, recalcúlalos
   ```bash
   npm run recalculate:balances
   ```

4. **Cuarto:** Reinicia el backend
   ```bash
   npm run dev
   ```

5. **Quinto:** Verifica en el frontend que los widgets muestran los montos correctos

---

## Notas Importantes

### Backup de Base de Datos
Aunque los scripts son seguros, **siempre es recomendable hacer un backup de la base de datos antes de ejecutar cualquier script de migración**.

```bash
# Ejemplo con PostgreSQL
pg_dump -U your_username -d finance_app > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Logs y Debugging
Los scripts generan logs detallados que puedes revisar para entender qué cambios se realizaron. Guarda estos logs por si necesitas auditar los cambios.

```bash
# Guardar el output en un archivo
npm run fix:shared-expenses > migration_log_$(date +%Y%m%d_%H%M%S).txt 2>&1
```

### Transacciones No Vinculadas
Si el script no puede vincular automáticamente algunas transacciones, esto puede ser porque:
- La descripción del gasto compartido cambió
- El gasto compartido fue eliminado
- La fecha está fuera del rango de tolerancia (7 días)
- Es una transacción legítima de "Pago de deuda" que NO está relacionada con gastos compartidos

Estas transacciones pueden requerir revisión manual.

---

## Desarrollo de Nuevos Scripts

Si necesitas crear un nuevo script de migración, sigue esta plantilla:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function myMigrationScript() {
  console.log('🔄 Starting migration...\n');

  try {
    // Tu lógica aquí

  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
myMigrationScript()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
```

Y agrégalo al `package.json`:

```json
{
  "scripts": {
    "my-script": "ts-node src/scripts/myScript.ts"
  }
}
```
