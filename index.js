const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");
const axios = require('axios');
const express = require('express');

// --- CONFIGURATION ---
const BOT_TOKEN = "8505202299:AAHkmuoq3Mlqn7VZw_pupLG4FT76Qr4HBeo";
const ADMIN_ID = 8207051152;
const GEMINI_API_KEYS = [
    "AIzaSyDtd9oI9r7CCEO6BfukyBgq_LH8PRc51GM", "AIzaSyBGwU-Nx-Nw8Abh7GIYKvXgJ44CMt5-dPs",
    "AIzaSyAB8vPq2mN0PvTadg4XxQFk9TnrOAiP128", "AIzaSyBQxiAahvBv3CtNGY2dvLrraPzSRJqTdVA",
    "AIzaSyDMX-H2qSNttX3i8NbN-4Eepu28fOGpTtc", "AIzaSyDTTmu7hujNVCfetwILR_G2cppCtOhwcdI",
    "AIzaSyAzwSY9j5AOaLFHnauZ80CX2ecGFI931Y4", "AIzaSyDzhJYmC4gkVDKXWxWErgiTqg8OcuEj_2s",
    "AIzaSyAVCGGC4-aPzjney5pHHFqYUx-lZ72gJtM", "AIzaSyCgivxeIowWSnoZ_WhlmarA3J3djW2g84A"
];

// Firebase Setup
const firebaseConfig = {
    projectId: "bot-asa-en-ligne-mada",
    // Ampidiro eto ny serviceAccount raha hivoaka production (JSON file)
};
admin.initializeApp({
    credential: admin.credential.applicationDefault(), 
    databaseURL: "https://bot-asa-en-ligne-mada-default-rtdb.firebaseio.com"
});
const db = admin.firestore();

// Express ho an'ny Render (Keep-alive)
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000);

const bot = new Telegraf(BOT_TOKEN);
let keyIndex = 0;

// Function haka API Key mifandimby
function getGeminiAPI() {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEYS[keyIndex]);
    keyIndex = (keyIndex + 1) % GEMINI_API_KEYS.length;
    return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
}

// --- LOGIC MOMBA NY MPAMPIASA ---
async function checkSubscription(ctx, next) {
    const userId = ctx.from.id.toString();
    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();

    const now = new Date();

    if (!doc.exists) {
        await userRef.set({
            joinedAt: admin.firestore.Timestamp.now(),
            status: 'trial',
            expiryDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
        });
        return next();
    }

    const userData = doc.data();
    if (now > userData.expiryDate.toDate()) {
        return ctx.reply("⚠️ Tapitra ny fanandramana maimaim-poana (2 andro).\n\nMba hanohizana, handefaso 2000 Ar ity laharana ity:\n📞 0323911654 (RAVELOMANANTSOA URMIN)\n\nAvy eo, alefaso eto ny SARY (Screenshot) porofon'ny fandefasana vola.");
    }
    return next();
}

// --- FANDRAISANA SARY (PAYMENT VERIFICATION) ---
bot.on('photo', async (ctx) => {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const link = await ctx.telegram.getFileLink(fileId);
    
    ctx.reply("🔄 Eo am-panamarinana ny fandoavam-bola...");

    const model = getGeminiAPI();
    const prompt = `
        Ity misy sary porofon'ny fandoavam-bola (Mobile Money). 
        Jereo tsara ireto fepetra ireto:
        1. Ny daty dia tokony androany ${new Date().toLocaleDateString()}.
        2. Ny ora dia tsy mahazo mihoatra ny 15 minitra amin'izao ${new Date().toLocaleTimeString()}.
        3. Ny laharana nidiran'ny vola dia 0323911654.
        4. Ny vola nalefa dia farafahakeliny 2000ar.
        5. Ny Transaction ID dia tsy tokony ho efa nampiasaina.

        Raha feno ireo, valio hoe "OK_PAID". Raha misy diso, hazavao amin'ny teny Malagasy ny antony nandavana azy.
    `;

    // Fanamarihana: Mila mampiasa axios haka ny sary ho buffer eto ho an'ny Gemini
    const response = await axios.get(link.href, { responseType: 'arraybuffer' });
    const imageParts = [{
        inlineData: { data: Buffer.from(response.data).toString("base64"), mimeType: "image/jpeg" }
    }];

    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();

    if (text.includes("OK_PAID")) {
        await db.collection('users').doc(ctx.from.id.toString()).update({
            status: 'active',
            expiryDate: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000)
        });
        ctx.reply("✅ Ekena ny fandoavam-bola! Afaka mampiasa ny bot ianao mandritra ny 30 andro.");
    } else {
        ctx.reply("❌ Nolavina ny fandoavam-bola.\n" + text);
    }
});

// --- FIANARANA TENY (VOICE SY TEXT) ---
bot.on(['text', 'voice'], checkSubscription, async (ctx) => {
    const model = getGeminiAPI();
    let userInput = ctx.message.text;

    if (ctx.message.voice) {
        userInput = "[Ilay mpampiasa dia nandefa feo, valio amin'ny alalan'ny lahatsoratra sy toromarika fanononana]";
    }

    const prompt = `Ianao dia mpampianatra teny vahiny (Anglais, Français, Allemand, Italien). 
    Ny mpianatra dia manao pratique vocal na écrit. 
    Raha misy diso ny fehezanteny, hazavao amin'ny teny Malagasy ny fahadisoany.
    Admin ID: ${ADMIN_ID}.
    Message: ${userInput}`;

    const result = await model.generateContent(prompt);
    ctx.reply(result.response.text());
});

bot.launch();
