import * as fs from 'fs';

/**
 * Script para convertir CSV de Interactive Brokers al formato de la aplicación
 *
 * Formato IB:
 * Transaction History,Data,Date,Account,Description,Transaction Type,Symbol,Quantity,Price,Gross Amount,Commission,Net Amount
 *
 * Formato App:
 * Operation Date;Operation Type;Symbol;Description;Trade Action;Qty;Price;Net amount;Saldo
 */

interface IBTransaction {
  Date: string;
  Account: string;
  Description: string;
  'Transaction Type': string;
  Symbol: string;
  Quantity: string;
  Price: string;
  'Gross Amount': string;
  Commission: string;
  'Net Amount': string;
}

interface AppTransaction {
  'Operation Date': string;
  'Operation Type': string;
  Symbol: string;
  Description: string;
  'Trade Action': string;
  Qty: string;
  Price: string;
  'Net amount': string;
  Saldo: string;
}

function parseIBCSV(filePath: string): { transactions: IBTransaction[]; initialCash: number } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const transactions: IBTransaction[] = [];
  let initialCash = 0;

  for (const line of lines) {
    // Obtener efectivo inicial
    if (line.includes('Summary,Data,Efectivo inicial,')) {
      const parts = line.split(',');
      initialCash = parseFloat(parts[3]) || 0;
      console.log(`💰 Initial cash balance: $${initialCash.toFixed(2)}`);
      continue;
    }

    // Solo procesar líneas que empiecen con "Transaction History,Data,"
    if (!line.startsWith('Transaction History,Data,')) {
      continue;
    }

    // Remover el prefijo "Transaction History,Data,"
    const dataLine = line.substring('Transaction History,Data,'.length);

    // Parsear manualmente para manejar comas dentro de campos
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < dataLine.length; i++) {
      const char = dataLine[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim());

    if (fields.length < 10) {
      console.log(`⚠️  Skipping line with ${fields.length} fields (expected 10+): ${fields.join(' | ')}`);
      continue;
    }

    transactions.push({
      Date: fields[0],
      Account: fields[1],
      Description: fields[2],
      'Transaction Type': fields[3],
      Symbol: fields[4],
      Quantity: fields[5],
      Price: fields[6],
      'Gross Amount': fields[7],
      Commission: fields[8],
      'Net Amount': fields[9],
    });
  }

  return { transactions, initialCash };
}

function convertToAppFormat(ibTransactions: IBTransaction[], initialCash: number): AppTransaction[] {
  const appTransactions: AppTransaction[] = [];
  let runningBalance = initialCash;

  // Ordenar por fecha (más antigua primero) para calcular el balance correcto
  const sorted = [...ibTransactions].sort((a, b) => {
    return new Date(a.Date).getTime() - new Date(b.Date).getTime();
  });

  console.log(`\n📅 Processing ${sorted.length} transactions chronologically...\n`);

  for (const tx of sorted) {
    const txType = tx['Transaction Type'];
    const symbol = tx.Symbol || '';
    const qty = parseFloat(tx.Quantity) || 0;
    const price = parseFloat(tx.Price) || 0;
    const netAmount = parseFloat(tx['Net Amount']) || 0;

    let operationType = '';
    let tradeAction = '';
    let description = tx.Description;

    // Determinar el tipo de operación
    if (txType === 'Buy') {
      operationType = 'TRADE';
      tradeAction = 'BUY';
      description = `BUY - ${symbol}`;
    } else if (txType === 'Sell') {
      operationType = 'TRADE';
      tradeAction = 'SELL';
      description = `SELL - ${symbol}`;
    } else if (txType === 'Other Fee') {
      operationType = 'TRANSACTION';
      tradeAction = '';
      description = 'FPL';
    }else if (txType === 'Deposit'){
      operationType = 'TRANSACTION';
      tradeAction = '';
      description = 'DEPOSIT';
    } else {
      // Skip transacciones que no sean Buy, Sell u Other Fee
      console.log(`⏭️  Skipping transaction type: ${txType}`);
      continue;
    }

    // Actualizar balance acumulativo
    runningBalance += netAmount;

    // Convertir fecha a formato ISO
    const date = new Date(tx.Date);
    const isoDate = date.toISOString();

    // Formatear números al estilo europeo (coma decimal)
    const formatNumber = (num: number): string => {
      return num.toString().replace('.', ',');
    };

    console.log(`  ${tx.Date.substring(0, 10)} | ${txType.padEnd(10)} | ${symbol.padEnd(6)} | Net: ${netAmount.toFixed(2).padStart(10)} | Balance: ${runningBalance.toFixed(2).padStart(10)}`);

    appTransactions.push({
      'Operation Date': isoDate,
      'Operation Type': operationType,
      Symbol: symbol,
      Description: description,
      'Trade Action': tradeAction,
      Qty: formatNumber(Math.abs(qty)),
      Price: formatNumber(Math.abs(price)),
      'Net amount': formatNumber(netAmount),
      Saldo: formatNumber(runningBalance),
    });
  }

  return appTransactions;
}

function writeAppCSV(transactions: AppTransaction[], outputPath: string): void {
  const headers = [
    'Operation Date',
    'Operation Type',
    'Symbol',
    'Description',
    'Trade Action',
    'Qty',
    'Price',
    'Net amount',
    'Saldo',
  ];

  const rows = transactions.map(tx => {
    return [
      tx['Operation Date'],
      tx['Operation Type'],
      tx.Symbol,
      tx.Description,
      tx['Trade Action'],
      tx.Qty,
      tx.Price,
      tx['Net amount'],
      tx.Saldo,
    ].join(';');
  });

  const csvContent = [headers.join(';'), ...rows].join('\n');

  fs.writeFileSync(outputPath, csvContent, 'utf-8');
}

// Main execution
const inputFile = process.argv[2] || '/Users/jesusrangel/finance-app/U3977847.TRANSACTIONS.20201201.20251226.csv';
const outputFile = process.argv[3] || '/Users/jesusrangel/finance-app/U3977847-converted.csv';

console.log(`📥 Reading IB CSV from: ${inputFile}\n`);

const { transactions: ibTransactions, initialCash } = parseIBCSV(inputFile);
console.log(`✅ Parsed ${ibTransactions.length} transactions from IB CSV`);

console.log(`🔄 Converting to app format...`);
const appTransactions = convertToAppFormat(ibTransactions, initialCash);
console.log(`\n✅ Converted ${appTransactions.length} transactions`);

console.log(`\n💾 Writing to: ${outputFile}`);
writeAppCSV(appTransactions, outputFile);

console.log(`\n✨ Conversion complete!`);
console.log(`📊 Summary:`);
console.log(`   - Input:  ${ibTransactions.length} transactions`);
console.log(`   - Output: ${appTransactions.length} transactions`);
console.log(`   - File:   ${outputFile}`);

if (appTransactions.length > 0) {
  const lastTx = appTransactions[appTransactions.length - 1];
  console.log(`   - Final Balance: ${lastTx.Saldo}`);
}
