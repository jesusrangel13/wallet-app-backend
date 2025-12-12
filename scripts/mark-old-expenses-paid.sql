-- Script para marcar como pagados todos los gastos compartidos anteriores al 1 de diciembre de 2025
-- Este script actualiza la tabla expense_participants

-- Primero, veamos cuántos registros se van a actualizar
SELECT COUNT(*) as "Registros a actualizar"
FROM expense_participants ep
JOIN shared_expenses se ON ep.expense_id = se.id
WHERE se.date < '2025-12-01'
  AND ep.is_paid = false;

-- Actualizar todos los participantes de gastos anteriores al 1 de diciembre 2025
UPDATE expense_participants
SET
  is_paid = true,
  paid_date = COALESCE(paid_date, shared_expenses.date),
  paid_amount = COALESCE(paid_amount, amount_owed)
FROM shared_expenses
WHERE expense_participants.expense_id = shared_expenses.id
  AND shared_expenses.date < '2025-12-01'
  AND expense_participants.is_paid = false;

-- Verificar los cambios
SELECT COUNT(*) as "Registros actualizados a isPaid=true"
FROM expense_participants ep
JOIN shared_expenses se ON ep.expense_id = se.id
WHERE se.date < '2025-12-01'
  AND ep.is_paid = true;
