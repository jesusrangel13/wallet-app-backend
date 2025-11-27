const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function debugSettlement() {
  try {
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: ['pedroperez@gmail.com', 'juanperez@gmail.com']
        }
      },
      select: { id: true, email: true, name: true }
    });
    
    console.log('Users found:', JSON.stringify(users, null, 2));
    
    if (users.length !== 2) {
      console.log('ERROR: Expected 2 users, found:', users.length);
      return;
    }
    
    const pedro = users.find(u => u.email === 'pedroperez@gmail.com');
    const juan = users.find(u => u.email === 'juanperez@gmail.com');
    
    console.log('\n=== USER IDS ===');
    console.log('Pedro ID:', pedro.id);
    console.log('Juan ID:', juan.id);
    
    const pedroGroups = await prisma.groupMember.findMany({
      where: { userId: pedro.id },
      include: { group: true }
    });
    
    const juanGroups = await prisma.groupMember.findMany({
      where: { userId: juan.id },
      include: { group: true }
    });
    
    const commonGroup = pedroGroups.find(pg => 
      juanGroups.some(jg => jg.groupId === pg.groupId)
    );
    
    if (!commonGroup) {
      console.log('ERROR: No common group found');
      return;
    }
    
    const groupId = commonGroup.groupId;
    console.log('\n=== GROUP INFO ===');
    console.log('Group ID:', groupId);
    console.log('Group Name:', commonGroup.group.name);
    
    const allExpenses = await prisma.sharedExpense.findMany({
      where: { groupId },
      include: {
        participants: true,
        paidBy: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('\n=== ALL SHARED EXPENSES ===');
    console.log('Total expenses:', allExpenses.length);
    
    let pedroBalance = 0;
    let juanBalance = 0;
    
    allExpenses.forEach(exp => {
      console.log('\nExpense:', exp.description, '- Amount:', exp.amount, 'Paid by:', exp.paidBy.name);
      
      let unpaidTotal = 0;
      exp.participants.forEach(p => {
        const userName = p.userId === pedro.id ? 'Pedro' : (p.userId === juan.id ? 'Juan' : 'Other');
        console.log('  Participant:', userName, 'Owes:', p.amountOwed, 'isPaid:', p.isPaid);
        
        if (!p.isPaid) {
          unpaidTotal += Number(p.amountOwed);
          if (p.userId === pedro.id) {
            pedroBalance -= Number(p.amountOwed);
          } else if (p.userId === juan.id) {
            juanBalance -= Number(p.amountOwed);
          }
        }
      });
      
      if (unpaidTotal > 0) {
        if (exp.paidByUserId === pedro.id) {
          pedroBalance += unpaidTotal;
          console.log('  Pedro gets credit:', unpaidTotal);
        } else if (exp.paidByUserId === juan.id) {
          juanBalance += unpaidTotal;
          console.log('  Juan gets credit:', unpaidTotal);
        }
      }
    });
    
    console.log('\n=== BALANCES AFTER EXPENSES ===');
    console.log('Pedro balance:', pedroBalance);
    console.log('Juan balance:', juanBalance);
    
    const payments = await prisma.payment.findMany({
      where: { groupId },
      include: {
        from: { select: { name: true } },
        to: { select: { name: true } }
      },
      orderBy: { date: 'desc' }
    });
    
    console.log('\n=== PAYMENTS ===');
    console.log('Total payments:', payments.length);
    payments.forEach(payment => {
      console.log(payment.from.name, '->', payment.to.name, ':', payment.amount, 'on', payment.date);
      
      if (payment.fromUserId === pedro.id) {
        pedroBalance -= Number(payment.amount);
      } else if (payment.fromUserId === juan.id) {
        juanBalance -= Number(payment.amount);
      }
      
      if (payment.toUserId === pedro.id) {
        pedroBalance += Number(payment.amount);
      } else if (payment.toUserId === juan.id) {
        juanBalance += Number(payment.amount);
      }
    });
    
    console.log('\n=== FINAL BALANCES ===');
    console.log('Pedro balance:', pedroBalance);
    console.log('Juan balance:', juanBalance);
    console.log('Pedro owes Juan:', -pedroBalance > 0 ? -pedroBalance : 0);
    console.log('Juan owes Pedro:', -juanBalance > 0 ? -juanBalance : 0);
    
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        userId: { in: [pedro.id, juan.id] },
        date: { gte: new Date('2025-11-24T00:00:00Z') }
      },
      include: {
        user: { select: { name: true } },
        account: { select: { name: true } }
      },
      orderBy: { date: 'desc' }
    });
    
    console.log('\n=== RECENT TRANSACTIONS (since Nov 24) ===');
    console.log('Count:', recentTransactions.length);
    recentTransactions.forEach(t => {
      console.log(t.user.name, '-', t.type, ':', t.amount, '-', t.description, '- Account:', t.account.name);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugSettlement();
