import { prisma } from '../src/utils/prisma';

async function main() {
    await prisma.aiInsight.deleteMany({});
    console.log('Cleared all AI insights.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
