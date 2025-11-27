# Instrucciones para Probar Pago de Gasto Compartido Individual

## Estado Actual

✅ **Problema identificado y solucionado:**
- Pedro Perez NO tenía cuenta por defecto configurada
- El gasto que Juan marcó como pagado fue revertido
- Ahora está listo para probarse correctamente

---

## Pasos para Completar la Prueba

### 1️⃣ Pedro Configura su Cuenta Por Defecto

**Usuario:** pedroperez@gmail.com
**Contraseña:** [Tu contraseña]

**Pasos:**
1. Iniciar sesión en la aplicación
2. Ir a: **Dashboard → Settings → General**
3. Buscar la sección: **"Cuenta por defecto para gastos compartidos"**
4. Seleccionar: **"Prueba (CLP)"** (su única cuenta activa)
5. Hacer clic en: **"Guardar"**
6. Verificar mensaje de éxito

---

### 2️⃣ Verificar Configuración (Opcional)

Ejecutar en el backend:
```bash
cd /Users/jesusrangel/finance-app/backend
npx ts-node verify_payment_success.ts
```

Debe mostrar:
```
✅ Pedro Perez: Cuenta configurada
✅ Juan Perez: Cuenta configurada
```

---

### 3️⃣ Juan Marca el Gasto Como Pagado

**Usuario:** juanperez@gmail.com
**Contraseña:** [Tu contraseña]

**Pasos:**
1. Iniciar sesión en la aplicación
2. Ir a: **Dashboard → Grupos**
3. Hacer clic en el grupo donde está el gasto compartido
4. Ir a la pestaña: **"Gastos y Balances"**
5. Buscar el gasto: **"Shared expense"** ($4,000)
6. Hacer clic en el botón: **"Pagué"** (solo aparece en su línea)
7. En el modal que se abre:
   - Verificar que muestra el gasto correcto
   - Verificar que su cuenta "Cuenta de prueba" está seleccionada
   - Hacer clic en: **"Confirmar Pago"**

**Mensaje esperado:**
```
✅ Gasto marcado como pagado. Transacciones creadas en tu cuenta.
```

**❌ Si aparece este mensaje, HAY UN PROBLEMA:**
```
⚠️ Gasto marcado como pagado. No se crearon transacciones
   (configura cuentas por defecto en Configuración).
```

---

### 4️⃣ Verificar que Todo Funcionó

Ejecutar en el backend:
```bash
cd /Users/jesusrangel/finance-app/backend
npx ts-node verify_payment_success.ts
```

**Resultado esperado:**
```
╔══════════════════════════════════════════════════════════════╗
║                    RESULTADO FINAL                           ║
╚══════════════════════════════════════════════════════════════╝

🎉 ¡TODO FUNCIONÓ CORRECTAMENTE!

✅ Ambos usuarios tienen cuenta por defecto configurada
✅ El gasto está marcado como pagado
✅ Se crearon transacciones en ambas cuentas
✅ Los balances se actualizaron correctamente
```

---

## Scripts de Verificación Disponibles

### Verificar configuración de usuarios
```bash
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    where: { email: { in: ['pedroperez@gmail.com', 'juanperez@gmail.com'] } },
    select: { email: true, name: true, defaultSharedExpenseAccountId: true }
  });

  console.log('\\nCONFIGURACIÓN DE USUARIOS:\\n');
  for (const u of users) {
    console.log(\`\${u.name} (\${u.email})\`);
    console.log(\`  Cuenta por defecto: \${u.defaultSharedExpenseAccountId || 'NO CONFIGURADA'}\\n\`);
  }

  await prisma.\$disconnect();
}

check();
"
```

### Verificar transacciones creadas hoy
```bash
npx ts-node check_transactions.ts
```

### Verificar estado de gastos pagados
```bash
npx ts-node check_paid_expenses.ts
```

### Verificación completa (RECOMENDADO)
```bash
npx ts-node verify_payment_success.ts
```

---

## Qué Verificar en la UI

### En la cuenta de Juan (después de pagar):
- **Ir a:** Dashboard → Transactions
- **Buscar:** Transacción reciente con descripción "Pago a Pedro Perez por 'Shared expense'"
- **Verificar:**
  - Tipo: **EXPENSE** (rojo)
  - Monto: **-$4,000**
  - Categoría: **Pago de deuda**
  - Balance de la cuenta debe haber **disminuido** $4,000

### En la cuenta de Pedro (debe recibirla automáticamente):
- **Pedro inicia sesión**
- **Ir a:** Dashboard → Transactions
- **Buscar:** Transacción reciente con descripción "Recibido de Juan Perez por 'Shared expense'"
- **Verificar:**
  - Tipo: **INCOME** (verde)
  - Monto: **+$4,000**
  - Categoría: **Cobro de deuda**
  - Balance de la cuenta debe haber **aumentado** $4,000

### En el widget de Balances:
- El gasto "Shared expense" debe aparecer con **✓ checkmark** (pagado)
- El balance pendiente entre Pedro y Juan debe haber **disminuido** en $4,000

---

## Solución de Problemas

### Si no se crean transacciones:

1. **Verificar cuentas por defecto:**
```bash
npx ts-node verify_payment_success.ts
```

2. **Revisar logs del backend:**
   - Buscar errores en la consola del servidor
   - Verificar que no hay errores de validación

3. **Verificar que las cuentas existen y están activas:**
```bash
npx ts-node check_pedro_accounts.ts
```

4. **Desmarcar y volver a marcar:**
```bash
npx ts-node fix_paid_expense.ts
```
   Luego volver a marcar como pagado desde la UI

---

## Comandos Útiles

### Limpiar archivos de scripts temporales:
```bash
cd /Users/jesusrangel/finance-app/backend
rm check_*.ts fix_*.ts verify_*.ts
```

### Reiniciar backend:
```bash
pkill -f "node dist/server.js"
npm start
```

### Ver estructura de base de datos:
```bash
npx prisma studio
```

---

## Contacto

Si algo no funciona correctamente, ejecuta:
```bash
npx ts-node verify_payment_success.ts
```

Y comparte el output completo para diagnosticar el problema.
