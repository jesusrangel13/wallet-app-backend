-- ============================================================================
-- QUICK FIX: Marcar gastos antiguos como pagados
-- ============================================================================
-- Copia y pega este comando directamente en tu cliente SQL
-- ============================================================================

UPDATE expense_participants
SET
  is_paid = true,
  paid_date = CURRENT_TIMESTAMP,
  paid_amount = amount_owed
FROM shared_expenses
WHERE expense_participants.expense_id = shared_expenses.id
  AND shared_expenses.date < '2025-12-01'
  AND expense_participants.is_paid = false;

-- ============================================================================
-- Eso es todo. Un solo comando que:
-- 1. Encuentra todos los participantes de gastos antes del 1 de diciembre 2025
-- 2. Los marca como is_paid = true
-- 3. Establece paid_date a la fecha actual
-- 4. Establece paid_amount al monto que debían
-- ============================================================================
