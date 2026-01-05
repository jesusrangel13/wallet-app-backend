#!/usr/bin/env node
const fs = require('fs');

// Read IB file
const ibContent = fs.readFileSync('U3977847.TRANSACTIONS.20200429.20251226.csv', 'utf-8');
const ibLines = ibContent.split('\n');

// Find first few BUY transactions from IB
let ibBuys = [];
for (const line of ibLines) {
  if (!line.includes('Transaction History,Data')) continue;
  
  const parts = line.split(',');
  if (parts.length < 12) continue;
  
  const txType = parts[5];
  const symbol = parts[6];
  const qty = parts[7];
  const price = parts[8];
  const commission = parts[10];
  const netAmount = parts[11];
  
  if (txType === 'Buy' && ibBuys.length < 5) {
    ibBuys.push({
      symbol,
      qty,
      price,
      commission,
      netAmount,
    });
  }
}

console.log('📊 First 5 BUY transactions from IB CSV:');
console.log('=========================================');
ibBuys.forEach((buy, i) => {
  console.log(`${i+1}. ${buy.symbol}: Qty=${buy.qty}, Price=${buy.price}, Commission=${buy.commission}, Net=${buy.netAmount}`);
});
console.log('');

// Read Hapi CSV
const hapiContent = fs.readFileSync('U3977847-converted-hapi-format-full.csv', 'utf-8');
const hapiLines = hapiContent.split('\n').filter(line => line.trim() && line.includes('TRADE') && line.includes('BUY'));

console.log('📊 First 5 BUY transactions from Hapi CSV:');
console.log('===========================================');
hapiLines.slice(0, 5).forEach((line, i) => {
  const parts = line.split(';');
  console.log(`${i+1}. ${parts[2]}: Qty=${parts[5]}, Price=${parts[6]}, Fees=${parts[7]}, Net=${parts[8]}`);
});
