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

// Firebase Setup (Ampiasao ny Database URL mivantana ho an'ny Render)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: "bot-asa-en-ligne-mada",
            // Raha manana serviceAccountKey ianao dia ampidiro eto, raha tsy izany dia ampiasao ny configuration ambany
        }),
        databaseURL: "https://bot-asa-en-ligne-mada-default-rtdb.firebaseio.com"
    });
}
const db = admin.firestore();

const bot = new Telegraf(BOT_TOKEN);
let keyIndex = 0;

function getGeminiModel() {
    const key = GEMINI_API_KEYS[keyIndex];
    const genAI = new GoogleGenerativeAI(key);
    keyIndex = (keyIndex + 1) % GEMINI_API_KEYS.length;
    return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
}

// --- BAIKO /START ---
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const welcomeMsg = `👋 Salama ${ctx.from.first_name}! 
Tongasoa eto amin'ny Bot ianarana teny vahiny.

📚 Matière azo atao:
- Anglais 🇬🇧
- Français 🇫🇷
- Allemagne 🇩🇪
- Italienne 🇮🇹

✅ Manana 2 andro maimaim-poana ianao izao hanandrana azy.
Afaka mandefa feo (vocal) na lahatsoratra (écrit) ianao.`;

    try {
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) {
            await userRef.set({
                joinedAt: admin.firestore.Timestamp.now(),
                status: 'trial',
                expiryDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000))
            });
        }
        ctx.reply(welcomeMsg);
    } catch (e) {
        console.error(e);
        ctx.reply("Misy olana kely ny fidirana, andramo indray.");
    }
});

// --- CHECK SUBSCRIPTION MIDDLEWARE ---
async function checkUserStatus(ctx, next) {
    const userId = ctx.from.id.toString();
    try {
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();
        const userData = doc.data();
        const now = admin.firestore.Timestamp.now();

        if (userData && now.seconds > userData.expiryDate.seconds) {
            return ctx.reply(`⚠️ Tapitra ny fe-potoana maimaim-poana.
            
Mba hanohizana ny fampiasana ny AI mandritra ny 30 andro:
💰 Sarany: 2000 Ar / volana
📞 Laharana: 0323911654
👤 Anarana: RAVELOMANANTSOA URMIN

Rehefa lasa ny vola, alefaso eto ny SARY porofon'ny transaction (Screenshot).`);
        }
        return next();
    } catch (e) {
        return next();
    }
}

// --- FANDRAISANA SARY (VERIFICATION PAYEMENT) ---
bot.on('photo', async (ctx) => {
    try {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileUrl = await ctx.telegram.getFileLink(fileId);
        
        ctx.reply("⏳ Eo am-panamarinana ny sary... Miandrasa kely azafady.");

        const response = await axios.get(fileUrl.href, { responseType: 'arraybuffer' });
        const model = getGeminiModel();
        
        const prompt = `
        Ity misy sary porofon'ny fandoavam-bola. Jereo tsara:
        - Daty: Mila androany (Ankehitriny)
        - Ora: Tsy mahazo mihoatra ny 15 minitra amin'izao fotoana izao.
        - Laharana: 0323911654.
        - Montant: 2000ar farafahakeliny.
        - Transaction ID: Jereo tsara raha efa nisy taloha.

        Raha marina ny zava-drehetra, valio fotsiny hoe "OK_VALIDATED".
        Raha misy diso, hazavao amin'ny teny Malagasy hoe inona no tsy mety.`;

        const imagePart = {
            inlineData: { data: Buffer.from(response.data).toString("base64"), mimeType: "image/jpeg" }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();

        if (responseText.includes("OK_VALIDATED")) {
            await db.collection('users').doc(ctx.from.id.toString()).update({
                status: 'paid',
                expiryDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
            });
            ctx.reply("✅ Ekena ny fandoavam-bola! Afaka mampiasa ny Bot ianao mandritra ny 30 andro manomboka izao.");
        } else {
            ctx.reply("❌ Nolavina ny fandoavam-bola:\n\n" + responseText);
        }
    } catch (error) {
        ctx.reply("Nisy olana teo am-pamakiana ny sary. Avereno indray azafady.");
    }
});

// --- CHAT LOGIC (TEXT & VOICE) ---
bot.on(['text', 'voice'], checkUserStatus, async (ctx) => {
    try {
        const model = getGeminiModel();
        let userMessage = ctx.message.text || "Nandefa feo ny mpampiasa, ampio izy amin'ny fanononana.";

        const prompt = `Ianao dia mpampianatra teny vahiny (Anglais, Français, Allemagne, Italienne). 
        Ny tanjona dia pratique vocal sy écrit ihany. 
        Raha misy diso ny teniny, hazavao amin'ny teny Malagasy ny fahadisoany.
        Admin: 8207051152.
        Mpampiasa: ${userMessage}`;

        const result = await model.generateContent(prompt);
        ctx.reply(result.response.text());
    } catch (err) {
        ctx.reply("Misy olana kely amin'ny API. Andramo indray afaka fotoana fohy.");
    }
});

// Express for Render
const app = express();
app.get('/', (req, res) => res.send('Bot is Live!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    bot.launch();
});
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
