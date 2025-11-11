import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
  console.log('\n=== Checking Database Data ===\n');

  // Count shared expenses
  const sharedExpensesCount = await prisma.sharedExpense.count();
  console.log(`📊 Total Shared Expenses: ${sharedExpensesCount}`);

  // Count groups
  const groupsCount = await prisma.group.count();
  console.log(`👥 Total Groups: ${groupsCount}`);

  // Count group members
  const groupMembersCount = await prisma.groupMember.count();
  console.log(`🧑‍🤝‍🧑 Total Group Members: ${groupMembersCount}`);

  // Get all shared expenses with details
  if (sharedExpensesCount > 0) {
    console.log('\n=== Shared Expenses Details ===\n');
    const expenses = await prisma.sharedExpense.findMany({
      include: {
        group: {
          select: {
            name: true,
          },
        },
        paidBy: {
          select: {
            name: true,
            email: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    expenses.forEach((expense, idx) => {
      console.log(`\nExpense ${idx + 1}:`);
      console.log(`  ID: ${expense.id}`);
      console.log(`  Description: ${expense.description}`);
      console.log(`  Amount: ${expense.amount}`);
      console.log(`  Group: ${expense.group.name}`);
      console.log(`  Paid By: ${expense.paidBy.name} (${expense.paidBy.email})`);
      console.log(`  Participants:`);
      expense.participants.forEach((p) => {
        console.log(`    - ${p.user.name}: owes ${p.amountOwed}`);
      });
    });
  }

  // Get all groups with members
  if (groupsCount > 0) {
    console.log('\n=== Groups Details ===\n');
    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    groups.forEach((group, idx) => {
      console.log(`\nGroup ${idx + 1}:`);
      console.log(`  ID: ${group.id}`);
      console.log(`  Name: ${group.name}`);
      console.log(`  Members:`);
      group.members.forEach((m) => {
        console.log(`    - ${m.user.name} (${m.user.email})`);
      });
    });
  }

  await prisma.$disconnect();
}

checkData().catch(console.error);
