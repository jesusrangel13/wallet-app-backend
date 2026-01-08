
import { VoiceTransactionService } from '../src/services/voice/voiceTransaction.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const voiceService = new VoiceTransactionService();

async function testVoiceParsing() {
    console.log("🎤 Testing Voice Parsing...");

    // 1. Get a user
    const user = await prisma.user.findFirst();
    if (!user) {
        console.error("No user found");
        return;
    }
    console.log(`User: ${user.name}`);

    // Test Case 1: Subcategory and Merchant
    const text1 = "Un café en Starbucks por 5000 pesos";
    console.log(`\n--- Test 1: "${text1}" ---`);
    const result1 = await voiceService.parseTransaction(user.id, text1);
    console.log("Result:", JSON.stringify(result1, null, 2));

    // Test Case 2: Date (Ayer) + Description + Merchant/Category Match
    const text2 = "Ayer compré frutas en la feria por 10000";
    console.log(`\n--- Test 2: "${text2}" ---`);
    const result2 = await voiceService.parseTransaction(user.id, text2);
    console.log("Result:", JSON.stringify(result2, null, 2));

    // Test Case 3: Tags
    const text3 = "Gasto de bencina viaje al sur #vacaciones por 30000";
    console.log(`\n--- Test 3: "${text3}" ---`);
    const result3 = await voiceService.parseTransaction(user.id, text3);
    console.log("Result:", JSON.stringify(result3, null, 2));

    // Explicitly check for tag resolution if user has tags
    // Create a dummy tag if not exists for testing?
    // Let's assume user might have tags or AI might extract '#vacaciones' even if not matched.
    // Test Case 4: Shared Expense for "Familia"
    const text4 = "Compras del super por 50000 con la cuenta lider para el grupo familia";
    console.log(`\n--- Test 4: "${text4}" ---`);
    const result4 = await voiceService.parseTransaction(user.id, text4);
    console.log("Result:", JSON.stringify(result4, null, 2));
    // Test Case 5: User Reproduction - "gasto compartido en la casa"
    const text5 = "ayer compré en el líder frutas y cosas para la casa pagué $35,500 y esto lo pagué con la tarjeta líder bci y debe ser un gasto compartido en la casa";
    console.log(`\n--- Test 5: "${text5}" ---`);
    const result5 = await voiceService.parseTransaction(user.id, text5);
    console.log("Result:", JSON.stringify(result5, null, 2));
}

testVoiceParsing().catch(console.error).finally(() => prisma.$disconnect());
