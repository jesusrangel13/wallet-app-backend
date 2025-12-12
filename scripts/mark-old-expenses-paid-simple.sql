-- ============================================================================
-- Script SQL para marcar como pagados todos los gastos compartidos
-- anteriores al 1 de diciembre de 2025
-- ============================================================================
-- IMPORTANTE: Ejecutar este script directamente en tu cliente SQL (pgAdmin, DBeaver, etc.)
-- ============================================================================

-- 1. Ver cuántos registros se van a actualizar (consulta de verificación)
SELECT COUNT(*) as "registros_a_actualizar"
FROM expense_participants ep
JOIN shared_expenses se ON ep.expense_id = se.id
WHERE se.date < '2025-12-01'
  AND ep.is_paid = false;

-- 2. Ver ejemplos de los registros que se van a actualizar
SELECT
  se.description as "gasto",
  u.name as "usuario",
  ep.amount_owed as "monto",
  se.date as "fecha_gasto",
  ep.is_paid as "esta_pagado"
FROM expense_participants ep
JOIN shared_expenses se ON ep.expense_id = se.id
JOIN users u ON ep.user_id = u.id
WHERE se.date < '2025-12-01'
  AND ep.is_paid = false
ORDER BY se.date DESC
LIMIT 10;

-- 3. ACTUALIZAR los registros (ESTE ES EL COMANDO PRINCIPAL)
UPDATE expense_participants
SET
  is_paid = true,
  paid_date = CURRENT_TIMESTAMP,
  paid_amount = amount_owed
FROM shared_expenses
WHERE expense_participants.expense_id = shared_expenses.id
  AND shared_expenses.date < '2025-12-01'
  AND expense_participants.is_paid = false;

-- 4. Verificar cuántos registros se actualizaron
SELECT COUNT(*) as "registros_actualizados"
FROM expense_participants ep
JOIN shared_expenses se ON ep.expense_id = se.id
WHERE se.date < '2025-12-01'
  AND ep.is_paid = true;

-- 5. Ver resumen por usuario
SELECT
  u.name as "usuario",
  COUNT(*) as "gastos_marcados_como_pagados"
FROM expense_participants ep
JOIN users u ON ep.user_id = u.id
JOIN shared_expenses se ON ep.expense_id = se.id
WHERE se.date < '2025-12-01'
  AND ep.is_paid = true
GROUP BY u.name
ORDER BY COUNT(*) DESC;

-- ============================================================================
-- ROLLBACK (solo si necesitas revertir los cambios)
-- ============================================================================
-- ⚠️ CUIDADO: Esto revertirá TODOS los gastos antiguos a isPaid = false
-- Solo descomentar y ejecutar si necesitas deshacer los cambios
-- ============================================================================

/*
UPDATE expense_participants
SET
  is_paid = false,
  paid_date = NULL,
  paid_amount = NULL
FROM shared_expenses
WHERE expense_participants.expense_id = shared_expenses.id
  AND shared_expenses.date < '2025-12-01';
*/
