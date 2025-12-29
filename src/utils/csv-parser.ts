import Papa from 'papaparse';

/**
 * Interfaz para las filas del CSV de inversiones del broker
 */
export interface InvestmentCSVRow {
  'Operation Date': string;      // 2025-12-11T20:30:35.480Z
  'Operation Type': string;       // TRADE o TRANSACTION
  'Symbol': string;               // SHOP, VOO, etc. (puede estar vacío)
  'Description': string;          // BUY - SHOP, DIVIDEND - DIVIDEND, DEPOSIT, etc.
  'Trade Action': string;         // BUY, SELL (puede estar vacío)
  'Qty': string;                  // 117.719 (puede ser negativo para SELL: -84.656)
  'Price': string;                // 169.895
  'Fees'?: string;                // 0.15, 0.11 (OPCIONAL - solo en CSV nuevo)
  'Net amount': string;           // -200.15
  'Saldo': string;                // 906.01 (balance después de la transacción)
}

/**
 * Resultado del parsing del CSV
 */
export interface ParsedCSVResult {
  rows: InvestmentCSVRow[];
  errors: string[];
}

/**
 * Parsea un archivo CSV de transacciones de inversión con el formato del broker
 * @param csvText - Contenido del archivo CSV
 * @returns Resultado con las filas parseadas y errores (si los hay)
 */
export function parseInvestmentCSV(csvText: string): ParsedCSVResult {
  const errors: string[] = [];

  const result = Papa.parse<InvestmentCSVRow>(csvText, {
    header: true,
    delimiter: ';',            // CRÍTICO: Este CSV usa punto y coma como delimitador
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  if (result.errors.length > 0) {
    result.errors.forEach((error) => {
      errors.push(`Row ${error.row}: ${error.message}`);
    });
  }

  // Validar que existan las columnas requeridas
  const requiredColumns = [
    'Operation Date',
    'Operation Type',
    'Description',
    'Net amount',
    'Saldo',
  ];
  const headers = result.meta.fields || [];
  const missingColumns = requiredColumns.filter((col) => !headers.includes(col));

  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
    return { rows: [], errors };
  }

  return {
    rows: result.data,
    errors,
  };
}

/**
 * Extrae el símbolo del activo desde la descripción
 * Ejemplo: "DIVIDEND - VOO" -> "VOO"
 * @param description - Descripción de la transacción
 * @returns Símbolo del activo o null si no se puede extraer
 */
export function extractSymbolFromDescription(description: string): string | null {
  const parts = description.split(' - ');
  if (parts.length >= 2) {
    return parts[1].trim().toUpperCase();
  }
  return null;
}
