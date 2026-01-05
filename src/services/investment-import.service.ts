import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { InvestmentCSVRow, extractSymbolFromDescription } from '../utils/csv-parser';
import { investmentTransactionService } from './investment-transaction.service';
import { createTransaction } from './transaction.service';

const prisma = new PrismaClient();

/**
 * Datos de entrada para la importación de transacciones de inversión
 */
interface ImportInvestmentTransactionsData {
  userId: string;
  accountId: string;
  fileName: string;
  fileType: 'CSV' | 'EXCEL';
  csvRows: InvestmentCSVRow[];
}

/**
 * Resultado de la importación
 */
interface ImportResult {
  importHistoryId: string;
  successCount: number;
  failedCount: number;
  duplicateCount: number;
  finalBalance: number;
  transactions: Array<{
    row: number;
    status: 'SUCCESS' | 'FAILED' | 'DUPLICATE';
    transactionId?: string;
    errorMessage?: string;
  }>;
}

/**
 * Tipo de transacción detectada
 */
interface DetectedTransaction {
  transactionType: 'INVESTMENT' | 'REGULAR' | 'SKIP';
  investmentType?: 'BUY' | 'SELL' | 'DIVIDEND' | 'INTEREST';
  regularType?: 'INCOME' | 'EXPENSE';
  assetSymbol?: string;
  assetName?: string;
  quantity?: number;
  pricePerUnit?: number;
  amount?: number;
  fees?: number;
  netAmount?: number; // Exact net amount from broker CSV (for TRADE transactions)
  date: Date;
}

/**
 * Normaliza un número del formato europeo (coma decimal) al formato JS (punto decimal)
 */
function parseEuropeanNumber(value: string): number {
  if (!value || value.trim() === '') return 0;
  // Reemplazar coma por punto para parseFloat
  const normalized = value.replace(',', '.');
  return parseFloat(normalized);
}

/**
 * Servicio para importación de transacciones de inversión desde CSV
 */
class InvestmentImportService {
  /**
   * Infiere el tipo de activo basándose en el símbolo
   */
  private inferAssetType(symbol: string): 'STOCK' | 'ETF' | 'CRYPTO' | 'FOREX' {
    const upperSymbol = symbol.toUpperCase();

    // Cryptocurrencies conocidas
    const cryptos = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'ADA', 'XRP', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI', 'ATOM', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'ICP', 'FIL', 'TRX', 'ETC', 'THETA', 'XMR', 'AAVE', 'EOS', 'AXS', 'CAKE', 'GRT'];
    // Sufijos crypto
    if (upperSymbol.endsWith('-USD') || upperSymbol.endsWith('USD') && upperSymbol.length <= 7) {
      return 'CRYPTO';
    }
    // Símbolos crypto conocidos
    if (cryptos.includes(upperSymbol)) {
      return 'CRYPTO';
    }

    // ETFs conocidos (principales ETFs de US)
    const etfs = [
      'SPY', 'QQQ', 'VOO', 'VTI', 'IWM', 'DIA', 'EEM', 'GLD', 'SLV', 'TLT',
      'IVV', 'VEA', 'AGG', 'VWO', 'IEFA', 'BND', 'VUG', 'IJR', 'VTV', 'IEMG',
      'VO', 'VGT', 'VCIT', 'VB', 'SCHD', 'VNQ', 'XLE', 'XLF', 'XLK', 'XLV',
      'XLI', 'XLP', 'XLY', 'XLU', 'XLB', 'XLRE', 'XLC', 'EWJ', 'EWZ', 'FXI',
      'VIG', 'VTEB', 'IJH', 'VYM', 'VXUS', 'BSV', 'MUB', 'LQD', 'HYG', 'BNDX'
    ];
    if (etfs.includes(upperSymbol)) {
      return 'ETF';
    }

    // Forex pairs (formato XXX/YYY)
    if (upperSymbol.includes('/') && upperSymbol.length <= 7) {
      return 'FOREX';
    }

    // Por defecto, STOCK (la mayoría de los casos)
    return 'STOCK';
  }

  /**
   * Detecta el tipo de transacción basándose en los datos del CSV
   */
  private detectTransactionType(row: InvestmentCSVRow): DetectedTransaction {
    const date = new Date(row['Operation Date']);

    // TRADE: Compra o Venta
    if (row['Operation Type'] === 'TRADE') {
      const tradeAction = row['Trade Action'];
      const quantity = Math.abs(parseEuropeanNumber(row['Qty'])); // Siempre positivo
      const pricePerUnit = parseEuropeanNumber(row['Price']);
      const assetSymbol = row['Symbol'].toUpperCase();

      // Leer fees desde la columna "Fees" del CSV (si existe)
      const feesRaw = row['Fees'];
      const fees = feesRaw && feesRaw !== 'undefined' && feesRaw !== ''
        ? parseEuropeanNumber(feesRaw)
        : 0;

      // Leer Net amount del CSV para usar el valor exacto del broker
      const netAmount = parseEuropeanNumber(row['Net amount']);

      if (tradeAction === 'BUY' || tradeAction === 'SELL') {
        return {
          transactionType: 'INVESTMENT',
          investmentType: tradeAction,
          assetSymbol,
          assetName: assetSymbol,
          quantity,
          pricePerUnit,
          fees,
          netAmount, // Usar el valor exacto del broker (evita errores de redondeo)
          date,
        };
      }
    }

    // TRANSACTION: Dividendo, Depósito, Retiro u Otros
    if (row['Operation Type'] === 'TRANSACTION') {
      const description = row['Description'];
      const amount = parseEuropeanNumber(row['Net amount']);

      // Dividendo
      if (description.includes('DIVIDEND')) {
        const assetSymbol =
          row['Symbol'] || extractSymbolFromDescription(description);

        if (!assetSymbol) {
          throw new Error(`Cannot extract symbol from dividend transaction: ${description}`);
        }

        return {
          transactionType: 'INVESTMENT',
          investmentType: 'DIVIDEND',
          assetSymbol: assetSymbol.toUpperCase(),
          assetName: assetSymbol.toUpperCase(),
          amount: amount, // Preservar el signo: negativos son retenciones de impuestos
          date,
        };
      }

      // FPL (Financial Protection Levy) - Tratarlo como INCOME regular
      // No puede ser INTEREST porque requiere un holding, y FPL no tiene activo asociado
      if (description === 'FPL') {
        return {
          transactionType: 'REGULAR',
          regularType: 'INCOME',
          amount: Math.abs(amount), // Siempre positivo
          date,
        };
      }

      // Depósito
      if (description === 'DEPOSIT') {
        return {
          transactionType: 'REGULAR',
          regularType: 'INCOME',
          amount: Math.abs(amount),
          date,
        };
      }

      // Retiro
      if (description === 'WITHDRAWAL') {
        return {
          transactionType: 'REGULAR',
          regularType: 'EXPENSE',
          amount: Math.abs(amount),
          date,
        };
      }

      // Fee (cargos/comisiones mensuales)
      // Nota: FEE puede ser negativo (cargo) o positivo (crédito/ajuste)
      if (description === 'FEE') {
        return {
          transactionType: 'REGULAR',
          regularType: amount < 0 ? 'EXPENSE' : 'INCOME',
          amount: Math.abs(amount),
          date,
        };
      }

      // Otros tipos desconocidos: omitir
      if (!description) {
        return {
          transactionType: 'SKIP',
          date,
        };
      }
    }

    // Si no coincide con ningún patrón conocido, omitir
    return {
      transactionType: 'SKIP',
      date,
    };
  }

  /**
   * Detecta si una transacción ya existe (duplicado)
   * Versión optimizada que usa un Set para búsqueda O(1)
   */
  private detectDuplicate(
    txnData: {
      assetSymbol?: string;
      transactionDate: Date;
      quantity?: number;
      pricePerUnit?: number;
    },
    existingTxnSet: Set<string>
  ): boolean {
    // Solo verificar duplicados para transacciones de inversión con datos completos
    if (!txnData.assetSymbol || txnData.quantity === undefined || txnData.pricePerUnit === undefined) {
      return false;
    }

    // Crear hash único de la transacción
    const hash = `${txnData.assetSymbol.toUpperCase()}-${txnData.transactionDate.getTime()}-${txnData.quantity.toFixed(8)}-${txnData.pricePerUnit.toFixed(2)}`;

    return existingTxnSet.has(hash);
  }


  /**
   * Recalcula el balance de la cuenta basándose en todas las transacciones
   */
  private async recalculateAccountBalance(accountId: string): Promise<number> {
    // Obtener todas las transacciones de la cuenta
    const [investmentTxns, regularTxns] = await Promise.all([
      prisma.investmentTransaction.findMany({
        where: { accountId },
        select: { type: true, totalAmount: true, fees: true },
        orderBy: { transactionDate: 'asc' },
      }),
      prisma.transaction.findMany({
        where: {
          accountId,
          type: { in: ['INCOME', 'EXPENSE'] },
        },
        select: { type: true, amount: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    let calculatedBalance = 0;

    // Procesar transacciones de inversión
    for (const txn of investmentTxns) {
      const totalAmount = Number(txn.totalAmount);
      const fees = Number(txn.fees);

      if (txn.type === 'BUY') {
        calculatedBalance -= totalAmount + fees;
      } else if (txn.type === 'SELL') {
        calculatedBalance += totalAmount - fees;
      } else if (txn.type === 'DIVIDEND' || txn.type === 'INTEREST') {
        calculatedBalance += totalAmount - fees;
      }
    }

    // Procesar transacciones regulares (depósitos/retiros)
    for (const txn of regularTxns) {
      const amount = Number(txn.amount);
      if (txn.type === 'INCOME') {
        calculatedBalance += amount;
      } else if (txn.type === 'EXPENSE') {
        calculatedBalance -= amount;
      }
    }

    // Actualizar balance de la cuenta
    await prisma.account.update({
      where: { id: accountId },
      data: { balance: calculatedBalance },
    });

    return calculatedBalance;
  }

  /**
   * Importa transacciones de inversión desde un CSV
   */
  async importInvestmentTransactions(
    data: ImportInvestmentTransactionsData
  ): Promise<ImportResult> {
    const { userId, accountId, fileName, fileType, csvRows } = data;

    // Verificar que la cuenta existe, pertenece al usuario y es tipo INVESTMENT
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
        type: 'INVESTMENT',
      },
    });

    if (!account) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        400,
        'Account not found or is not an investment account'
      );
    }

    // Crear registro de importación con status PROCESSING
    const importHistory = await prisma.investmentImportHistory.create({
      data: {
        userId,
        accountId,
        fileName,
        fileType,
        totalRows: csvRows.length,
        status: 'PROCESSING',
      },
    });

    // Iniciar contador de tiempo total
    const importStartTime = Date.now();
    console.log(`\n🚀 Starting import of ${csvRows.length} transactions for account ${accountId}`);

    // Ordenar filas por fecha ASC (CRÍTICO para balance correcto)
    const sortedRows = [...csvRows].sort(
      (a, b) =>
        new Date(a['Operation Date']).getTime() -
        new Date(b['Operation Date']).getTime()
    );

    // OPTIMIZACIÓN: Pre-cargar holdings de la cuenta para evitar queries repetidas
    const existingHoldings = await prisma.investmentHolding.findMany({
      where: { accountId }
    });
    const holdingsCache = new Map(
      existingHoldings.map(h => [h.assetSymbol, h])
    );

    // OPTIMIZACIÓN: Pre-cargar transacciones existentes para detección rápida de duplicados
    const existingTransactions = await prisma.investmentTransaction.findMany({
      where: { accountId },
      select: {
        assetSymbol: true,
        transactionDate: true,
        quantity: true,
        pricePerUnit: true
      }
    });

    const existingTxnSet = new Set(
      existingTransactions.map(tx =>
        `${tx.assetSymbol}-${tx.transactionDate.getTime()}-${tx.quantity.toFixed(8)}-${tx.pricePerUnit.toFixed(2)}`
      )
    );

    const results: Array<{
      row: number;
      status: 'SUCCESS' | 'FAILED' | 'DUPLICATE';
      transactionId?: string;
      errorMessage?: string;
    }> = [];

    let successCount = 0;
    let failedCount = 0;
    let duplicateCount = 0;
    let accumulatedBalanceChange = 0;
    const importRecords: any[] = [];

    // Validar límite de transacciones
    const MAX_TRANSACTIONS = 10000;
    if (sortedRows.length > MAX_TRANSACTIONS) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        400,
        `Maximum ${MAX_TRANSACTIONS} transactions per import. You have ${sortedRows.length}.`
      );
    }

    // OPTIMIZACIÓN: Procesar en batches con transacción Prisma
    const BATCH_SIZE = 20;  // Reducido de 100 a 20 para evitar timeouts
    for (let i = 0; i < sortedRows.length; i += BATCH_SIZE) {
      const batch = sortedRows.slice(i, i + BATCH_SIZE);
      const batchStartTime = Date.now();

      console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(sortedRows.length / BATCH_SIZE)} (rows ${i + 1}-${Math.min(i + BATCH_SIZE, sortedRows.length)})`);

      // NOTA: No usamos $transaction aquí porque cada createTransaction ya tiene su propia transacción
      // Usar nested transactions causaba overhead masivo de rendimiento
      for (let j = 0; j < batch.length; j++) {
          const row = batch[j];
          const rowNumber = i + j + 1;
          const txnStartTime = Date.now();

          try {
            // Detectar tipo de transacción
            const detected = this.detectTransactionType(row);

            // Si es SKIP, marcar como éxito
            if (detected.transactionType === 'SKIP') {
              importRecords.push({
                importHistoryId: importHistory.id,
                rowNumber,
                status: 'SUCCESS',
                originalDate: row['Operation Date'],
                csvOperationType: row['Operation Type'],
                csvSymbol: row['Symbol'] || null,
                csvDescription: row['Description'],
                csvTradeAction: row['Trade Action'] || null,
                csvQuantity: row['Qty'],
                csvPrice: row['Price'],
                csvNetAmount: row['Net amount'],
              });
              successCount++;

              const txnDuration = Date.now() - txnStartTime;
              console.log(`  ⏭️  Row ${rowNumber}: SKIPPED (${row['Description']}) - ${txnDuration}ms`);
              continue;
            }

            // Verificar duplicados usando el Set pre-cargado
            if (detected.transactionType === 'INVESTMENT') {
              const isDuplicate = this.detectDuplicate(
                {
                  assetSymbol: detected.assetSymbol,
                  transactionDate: detected.date,
                  quantity: detected.quantity,
                  pricePerUnit: detected.pricePerUnit
                },
                existingTxnSet
              );

              if (isDuplicate) {
                importRecords.push({
                  importHistoryId: importHistory.id,
                  rowNumber,
                  status: 'SUCCESS',
                  isDuplicate: true,
                  originalDate: row['Operation Date'],
                  csvOperationType: row['Operation Type'],
                  csvSymbol: row['Symbol'] || null,
                  csvDescription: row['Description'],
                  csvTradeAction: row['Trade Action'] || null,
                  csvQuantity: row['Qty'],
                  csvPrice: row['Price'],
                  csvNetAmount: row['Net amount'],
                });
                duplicateCount++;

                const txnDuration = Date.now() - txnStartTime;
                console.log(`  🔁 Row ${rowNumber}: DUPLICATE (${detected.assetSymbol} ${detected.investmentType}) - ${txnDuration}ms`);
                continue;
              }
            }

            let createdTransactionId: string | undefined;

            // Crear transacción de inversión
            if (detected.transactionType === 'INVESTMENT') {
              const transactionData: any = {
                accountId,
                assetSymbol: detected.assetSymbol!,
                assetName: detected.assetName!,
                assetType: this.inferAssetType(detected.assetSymbol!),
                type: detected.investmentType!,
                fees: detected.fees || 0,
                currency: 'USD',
                transactionDate: detected.date,
                netAmount: detected.netAmount, // Pass exact net amount from CSV
              };

              if (detected.investmentType === 'BUY' || detected.investmentType === 'SELL') {
                transactionData.quantity = detected.quantity!;
                transactionData.pricePerUnit = detected.pricePerUnit!;
              } else if (detected.investmentType === 'DIVIDEND' || detected.investmentType === 'INTEREST') {
                transactionData.amount = detected.amount!;
              }

              const { transaction, balanceChange } = await investmentTransactionService.createTransaction(
                userId,
                transactionData,
                {
                  skipAccountValidation: true,
                  skipBalanceValidation: true,
                  holdingsCache,
                  accumulateBalanceOnly: true
                }
              );

              accumulatedBalanceChange += balanceChange;
              createdTransactionId = transaction.id;

              // OPTIMIZACIÓN: Actualizar holdings EN MEMORIA (no en DB)
              // Los cambios se aplicarán al final en batch
              // NOTA: El holding ya está en cache (lo agregó createTransaction si era nuevo)
              const holding = holdingsCache.get(transaction.assetSymbol);

              if (holding) {
                // Actualizar cantidades en memoria
                if (transaction.type === 'BUY') {
                  const currentQty = Number(holding.totalQuantity);
                  const wasShort = currentQty < 0;
                  const newQty = currentQty + Number(transaction.quantity);
                  const isNowLong = newQty > 0;
                  const isClosed = newQty === 0;

                  let newAvgCost;
                  let newCostBasis;
                  let realizedGainLoss = 0;

                  if (wasShort) {
                    // Cubriendo short
                    if (isClosed) {
                      const shortOpenCost = Math.abs(Number(holding.totalCostBasis));
                      const coverCost = Number(transaction.pricePerUnit) * Number(transaction.quantity) + Number(transaction.fees);
                      realizedGainLoss = shortOpenCost - coverCost;
                      newCostBasis = Number(holding.totalCostBasis);
                      newAvgCost = Number(holding.averageCostPerUnit);
                    } else if (isNowLong) {
                      const shortQty = Math.abs(currentQty);
                      const coverCost = Number(transaction.pricePerUnit) * shortQty + (Number(transaction.fees) * shortQty / Number(transaction.quantity));
                      realizedGainLoss = Math.abs(Number(holding.totalCostBasis)) - coverCost;

                      const remainingQty = newQty;
                      const remainingCost = Number(transaction.pricePerUnit) * remainingQty + (Number(transaction.fees) * remainingQty / Number(transaction.quantity));
                      newAvgCost = remainingCost / remainingQty;
                      newCostBasis = remainingCost;
                    } else {
                      const coverQty = Number(transaction.quantity);
                      const coverProportion = coverQty / Math.abs(currentQty);
                      const costBasisCovered = Math.abs(Number(holding.totalCostBasis)) * coverProportion;
                      const actualCoverCost = Number(transaction.pricePerUnit) * coverQty + Number(transaction.fees);
                      realizedGainLoss = costBasisCovered - actualCoverCost;

                      newCostBasis = Number(holding.totalCostBasis) + costBasisCovered;
                      newAvgCost = Number(holding.averageCostPerUnit);
                    }
                  } else {
                    // Compra long normal
                    const currentValue = Number(holding.averageCostPerUnit) * Number(holding.totalQuantity);
                    const newValue = Number(transaction.pricePerUnit) * Number(transaction.quantity) + Number(transaction.fees);
                    newAvgCost = (currentValue + newValue) / newQty;
                    newCostBasis = Number(holding.totalCostBasis) + newValue;
                  }

                  holding.totalQuantity = newQty as any;
                  holding.averageCostPerUnit = newAvgCost as any;
                  holding.totalCostBasis = newCostBasis as any;
                  holding.realizedGainLoss = (Number(holding.realizedGainLoss || 0) + realizedGainLoss) as any;
                } else if (transaction.type === 'SELL') {
                  const currentQty = Number(holding.totalQuantity);
                  const newQuantity = currentQty - Number(transaction.quantity);

                  const wasLong = currentQty > 0;
                  const wasShort = currentQty < 0;
                  const isNowShort = newQuantity < 0;
                  const isClosed = newQuantity === 0;

                  let realizedGainLoss = 0;
                  let newCostBasis = Number(holding.totalCostBasis);
                  let newAvgCost = Number(holding.averageCostPerUnit);

                  if (wasLong) {
                    const costBasisSold = Number(holding.averageCostPerUnit) * Number(transaction.quantity);
                    const proceedsFromSale = Number(transaction.pricePerUnit) * Number(transaction.quantity) - Number(transaction.fees);
                    realizedGainLoss = proceedsFromSale - costBasisSold;

                    if (isClosed) {
                      newCostBasis = Number(holding.totalCostBasis);
                    } else if (isNowShort) {
                      // Cruzó a short
                      const shortQty = Math.abs(newQuantity);
                      const shortValue = Number(transaction.pricePerUnit) * shortQty - (Number(transaction.fees) * shortQty / Number(transaction.quantity));
                      newCostBasis = -shortValue;
                      newAvgCost = Number(transaction.pricePerUnit);
                    } else {
                      // Todavía long
                      newCostBasis = Number(holding.totalCostBasis) - costBasisSold;
                    }
                  } else if (wasShort || currentQty === 0) {
                    // Añadiendo a short o abriendo short
                    const currentShortValue = Math.abs(Number(holding.totalCostBasis));
                    const newShortValue = Number(transaction.pricePerUnit) * Number(transaction.quantity) - Number(transaction.fees);
                    const totalShortQty = Math.abs(newQuantity);

                    newAvgCost = (currentShortValue + newShortValue) / totalShortQty;
                    newCostBasis = -(currentShortValue + newShortValue);
                  }

                  holding.totalQuantity = newQuantity as any;
                  holding.averageCostPerUnit = newAvgCost as any;
                  holding.totalCostBasis = newCostBasis as any;
                  holding.realizedGainLoss = (Number(holding.realizedGainLoss || 0) + realizedGainLoss) as any;
                }

                holdingsCache.set(transaction.assetSymbol, holding);
              }

              importRecords.push({
                importHistoryId: importHistory.id,
                investmentTransactionId: transaction.id,
                rowNumber,
                status: 'SUCCESS',
                originalDate: row['Operation Date'],
                csvOperationType: row['Operation Type'],
                csvSymbol: row['Symbol'] || null,
                csvDescription: row['Description'],
                csvTradeAction: row['Trade Action'] || null,
                csvQuantity: row['Qty'],
                csvPrice: row['Price'],
                csvNetAmount: row['Net amount'],
              });

              successCount++;

              const txnDuration = Date.now() - txnStartTime;
              console.log(`  ✅ Row ${rowNumber}: ${detected.investmentType} ${detected.assetSymbol} (${detected.quantity} @ $${detected.pricePerUnit}) - ${txnDuration}ms`);
            }

            // Crear transacción regular (depósito/retiro)
            if (detected.transactionType === 'REGULAR') {
              const transaction = await createTransaction(userId, {
                accountId,
                type: detected.regularType!,
                amount: detected.amount!,
                description: row['Description'],
                date: detected.date.toISOString(),
              });

              createdTransactionId = transaction.id;

              importRecords.push({
                importHistoryId: importHistory.id,
                regularTransactionId: transaction.id,
                rowNumber,
                status: 'SUCCESS',
                originalDate: row['Operation Date'],
                csvOperationType: row['Operation Type'],
                csvSymbol: row['Symbol'] || null,
                csvDescription: row['Description'],
                csvTradeAction: row['Trade Action'] || null,
                csvQuantity: row['Qty'],
                csvPrice: row['Price'],
                csvNetAmount: row['Net amount'],
              });

              successCount++;

              const txnDuration = Date.now() - txnStartTime;
              console.log(`  💰 Row ${rowNumber}: ${detected.regularType} $${detected.amount} (${row['Description']}) - ${txnDuration}ms`);
            }

          } catch (error) {
            failedCount++;
            importRecords.push({
              importHistoryId: importHistory.id,
              rowNumber,
              status: 'FAILED',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              originalDate: row['Operation Date'],
              csvOperationType: row['Operation Type'],
              csvSymbol: row['Symbol'] || null,
              csvDescription: row['Description'],
              csvTradeAction: row['Trade Action'] || null,
              csvQuantity: row['Qty'],
              csvPrice: row['Price'],
              csvNetAmount: row['Net amount'],
            });

            const txnDuration = Date.now() - txnStartTime;
            console.log(`  ❌ Row ${rowNumber}: FAILED - ${error instanceof Error ? error.message : 'Unknown error'} - ${txnDuration}ms`);
          }
        }

      const batchDuration = Date.now() - batchStartTime;
      console.log(`✨ Batch ${Math.floor(i / BATCH_SIZE) + 1} completed in ${batchDuration}ms (avg ${(batchDuration / batch.length).toFixed(2)}ms per transaction)`);
    }

    // OPTIMIZACIÓN: Batch update de holdings (aplicar todos los cambios acumulados en memoria)
    // NOTA: Los holdings ya existen en DB (creados por createTransaction), solo actualizamos
    console.log(`\n💾 Updating ${holdingsCache.size} holdings...`);
    const holdingUpdateStartTime = Date.now();

    for (const [symbol, holding] of holdingsCache) {
      // Actualizar holding con los valores acumulados en memoria
      await prisma.investmentHolding.update({
        where: { id: holding.id },
        data: {
          totalQuantity: holding.totalQuantity,
          averageCostPerUnit: holding.averageCostPerUnit,
          totalCostBasis: holding.totalCostBasis,
          realizedGainLoss: holding.realizedGainLoss,
        }
      });
    }

    const holdingUpdateTime = Date.now() - holdingUpdateStartTime;
    console.log(`✅ Holdings updated in ${holdingUpdateTime}ms`);

    // OPTIMIZACIÓN: Batch insert de registros de importación
    if (importRecords.length > 0) {
      await prisma.investmentImportedTransaction.createMany({
        data: importRecords
      });
    }

    // OPTIMIZACIÓN: Actualizar balance acumulado en una sola operación
    if (accumulatedBalanceChange !== 0) {
      await prisma.account.update({
        where: { id: accountId },
        data: { balance: { increment: accumulatedBalanceChange } }
      });
    }

    // Recalcular balance final de la cuenta
    const finalBalance = await this.recalculateAccountBalance(accountId);

    // Determinar estado final
    const finalStatus = failedCount === csvRows.length ? 'FAILED' : 'COMPLETED';

    // Actualizar historial de importación
    await prisma.investmentImportHistory.update({
      where: { id: importHistory.id },
      data: {
        successCount,
        failedCount,
        duplicateCount,
        status: finalStatus,
        completedAt: new Date(),
      },
    });

    // Log resumen final
    const totalImportTime = Date.now() - importStartTime;
    const avgTimePerTransaction = (totalImportTime / sortedRows.length).toFixed(2);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✨ IMPORT COMPLETE - ${totalImportTime}ms total (${avgTimePerTransaction}ms avg per transaction)`);
    console.log(`${'='.repeat(80)}`);
    console.log(`📊 Results:`);
    console.log(`   ✅ Success:    ${successCount} transactions`);
    console.log(`   🔁 Duplicates: ${duplicateCount} transactions`);
    console.log(`   ❌ Failed:     ${failedCount} transactions`);
    console.log(`   📝 Total:      ${sortedRows.length} transactions`);
    console.log(`   💰 Final Balance: $${finalBalance.toFixed(2)}`);
    console.log(`${'='.repeat(80)}\n`);

    return {
      importHistoryId: importHistory.id,
      successCount,
      failedCount,
      duplicateCount,
      finalBalance,
      transactions: results,
    };
  }

  /**
   * Obtiene el historial de importaciones del usuario
   */
  async getImportHistory(
    userId: string,
    pagination?: { page?: number; limit?: number }
  ) {
    const page = pagination?.page || 1;
    const limit = Math.min(pagination?.limit || 20, 100);
    const skip = (page - 1) * limit;

    const total = await prisma.investmentImportHistory.count({ where: { userId } });

    const imports = await prisma.investmentImportHistory.findMany({
      where: { userId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            currency: true,
          },
        },
        importedTransactions: {
          select: {
            id: true,
            status: true,
            isDuplicate: true,
          },
        },
      },
      orderBy: {
        importedAt: 'desc',
      },
      skip,
      take: limit,
    });

    return {
      data: imports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtiene el detalle de una importación específica
   */
  async getImportHistoryById(userId: string, importId: string) {
    const importHistory = await prisma.investmentImportHistory.findFirst({
      where: {
        id: importId,
        userId,
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            currency: true,
          },
        },
        importedTransactions: {
          include: {
            investmentTransaction: {
              select: {
                id: true,
                type: true,
                assetSymbol: true,
                quantity: true,
                pricePerUnit: true,
                totalAmount: true,
                transactionDate: true,
              },
            },
            regularTransaction: {
              select: {
                id: true,
                type: true,
                amount: true,
                description: true,
                date: true,
              },
            },
          },
          orderBy: {
            rowNumber: 'asc',
          },
        },
      },
    });

    if (!importHistory) {
      throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404, 'Import history not found');
    }

    return importHistory;
  }
}

export const investmentImportService = new InvestmentImportService();
