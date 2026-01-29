/*
 * BOT TELEGRAM GEMINI - FINAL FIX (VISION, VOICE, TEXT)
 * Updated for: Ravelomanantsoa Urmin
 */

const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");
const axios = require('axios');
const moment = require('moment-timezone');
const express = require('express');

// --- 1. CONFIGURATION ---

const BOT_TOKEN = "8505202299:AAHkmuoq3Mlqn7VZw_pupLG4FT76Qr4HBeo";
const ADMIN_ID = "8207051152";

// API Keys Gemini (Mihodina/Rotation)
const GEMINI_API_KEYS = [
    "AIzaSyDtd9oI9r7CCEO6BfukyBgq_LH8PRc51GM",
    "AIzaSyBGwU-Nx-Nw8Abh7GIYKvXgJ44CMt5-dPs",
    "AIzaSyAB8vPq2mN0PvTadg4XxQFk9TnrOAiP128",
    "AIzaSyBQxiAahvBv3CtNGY2dvLrraPzSRJqTdVA",
    "AIzaSyDMX-H2qSNttX3i8NbN-4Eepu28fOGpTtc",
    "AIzaSyDTTmu7hujNVCfetwILR_G2cppCtOhwcdI",
    "AIzaSyAzwSY9j5AOaLFHnauZ80CX2ecGFI931Y4",
    "AIzaSyDzhJYmC4gkVDKXWxWErgiTqg8OcuEj_2s",
    "AIzaSyAVCGGC4-aPzjney5pHHFqYUx-lZ72gJtM",
    "AIzaSyCgivxeIowWSnoZ_WhlmarA3J3djW2g84A"
];

// Configuration Firebase (Vaovao)
const firebaseConfig = {
  apiKey: "AIzaSyDbtw2NBkjWC5xs0BZ9mhK3FtxVeXfDGYE",
  authDomain: "autotrad-9e90b.firebaseapp.com",
  projectId: "autotrad-9e90b",
  storageBucket: "autotrad-9e90b.firebasestorage.app",
  messagingSenderId: "359414519740",
  appId: "1:359414519740:web:8c6b99de8769ad1dda3db9",
  measurementId: "G-RGNLJVKNZK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Bot
const bot = new Telegraf(BOT_TOKEN);

// --- 2. CONFIG GEMINI MAHERY VAIKA ---

// Fikirakirana mba tsy hanakana valiny (Safety Settings)
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

function getGeminiModel() {
    // Maka lakile iray kisendrasendra
    const randomKey = GEMINI_API_KEYS[Math.floor(Math.random() * GEMINI_API_KEYS.length)];
    const genAI = new GoogleGenerativeAI(randomKey);
    // Mampiasa model Flash izay haingana sy mahay sary
    return genAI.getGenerativeModel({ model: "gemini-2.5-flash", safetySettings });
}

// Fonction télécharger sary/feo
async function downloadFile(url) {
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer'
        });
        return Buffer.from(response.data, 'binary');
    } catch (e) {
        console.error("Error downloading file:", e);
        throw e;
    }
}

// Fanamarinana Abonnement
async function checkSubscription(userId) {
    try {
        const userRef = doc(db, "users", String(userId));
        const userSnap = await getDoc(userRef);
        const now = moment().tz("Indian/Antananarivo");

        if (!userSnap.exists()) {
            const trialEnd = now.clone().add(2, 'days');
            await setDoc(userRef, {
                joinedAt: now.toISOString(),
                status: 'trial',
                expiryDate: trialEnd.toISOString(),
                language: 'Anglais',
                usageCount: 0
            });
            return { valid: true, type: 'trial', message: '🎉 Tongasoa! Manana 2 andro maimaim-poana ianao.' };
        }

        const userData = userSnap.data();
        const expiryDate = moment(userData.expiryDate);

        if (now.isAfter(expiryDate)) {
            return { valid: false, type: 'expired', message: '⚠️ Tapitra ny fotoana fanandramana/abonnement.' };
        }

        return { valid: true, type: userData.status };
    } catch (error) {
        console.error("Firebase Error:", error);
        // Raha misy erreur Firebase, avela handeha ihany aloha mba tsy hikatso ny bot
        return { valid: true, type: 'error_fallback', message: '' }; 
    }
}

// --- 3. VISION & PAIEMENT ---

bot.on('photo', async (ctx) => {
    console.log("Sary voaray...");
    const userId = String(ctx.from.id);
    const subStatus = await checkSubscription(userId);
    
    // Asehoy fa miasa ilay bot
    await ctx.sendChatAction('typing');

    try {
        // 1. Raisina ny sary
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        const imageBuffer = await downloadFile(fileLink.href);
        const imageBase64 = imageBuffer.toString('base64');
        
        const model = getGeminiModel();
        const now = moment().tz("Indian/Antananarivo");

        // CAS 1: VERIFICATION PAIEMENT (Raha tapitra ny abonnement)
        if (!subStatus.valid) {
            await ctx.reply("⏳ Mahandrasa kely, manamarina ny réçu...");
            
            const currentTimeString = now.format("YYYY-MM-DD HH:mm");
            const prompt = `
            Analyze this image carefully. Is it a mobile money receipt?
            Current Time: ${currentTimeString}.
            
            Rules for VALID payment:
            1. Recipient: Contains "0323911654".
            2. Amount: >= 2000 Ar.
            3. Time: Within 20 minutes of now.
            
            Return JSON:
            {
                "is_receipt": boolean,
                "valid": boolean,
                "tx_id": "string_or_null",
                "reason": "explanation in Malagasy"
            }`;

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }
            ]);
            
            const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}') + 1;
            const cleanJson = text.substring(jsonStart, jsonEnd);
            
            const analysis = JSON.parse(cleanJson);
            console.log("Analysis Paiement:", analysis);

            if (analysis.valid && analysis.tx_id) {
                // Check duplicate
                const txRef = doc(db, "transactions", analysis.tx_id);
                const txSnap = await getDoc(txRef);

                if (txSnap.exists()) {
                    await ctx.reply("❌ Efa nampiasaina io Référence io.");
                } else {
                    const newExpiry = now.clone().add(30, 'days');
                    await updateDoc(doc(db, "users", userId), { status: 'premium', expiryDate: newExpiry.toISOString() });
                    await setDoc(txRef, { userId, date: now.toISOString(), amount: 2000, ref: analysis.tx_id });
                    
                    await ctx.reply("✅ Voaray ny vola! Misaotra anao. Afaka mianatra ianao izao.");
                    bot.telegram.sendMessage(ADMIN_ID, `💰 NEW PAY: ${analysis.tx_id}`);
                }
            } else {
                await ctx.reply(`❌ Tsy nekena. Antony: ${analysis.reason}`);
            }
        } 
        // CAS 2: FIANARANA SARY (Raha mbola manana abonnement)
        else {
            const userSnap = await getDoc(doc(db, "users", userId));
            const lang = userSnap.exists() ? userSnap.data().language : 'Anglais';
            
            const prompt = `Describe this image in ${lang} and explain keywords in Malagasy.`;
            const result = await model.generateContent([
                prompt,
                { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }
            ]);
            
            await ctx.reply(result.response.text());
        }

    } catch (e) {
        console.error("Error Photo:", e);
        await ctx.reply("Miala tsiny, nisy olana tamin'ny sary. Andramo indray.");
    }
});

// --- 4. TEXTE & VOCAL ---

bot.command('start', async (ctx) => {
    const sub = await checkSubscription(ctx.from.id);
    if(!sub.valid) return sendPaymentPrompt(ctx);
    
    await ctx.reply(`Salama! ${sub.message}\nMisafidiana fiteny:`, 
        Markup.keyboard([['🇬🇧 Anglais', '🇫🇷 Français'], ['🇩🇪 Allemagne', '🇮🇹 Italienne']]).resize());
});

bot.hears(['🇬🇧 Anglais', '🇫🇷 Français', '🇩🇪 Allemagne', '🇮🇹 Italienne'], async (ctx) => {
    const lang = ctx.message.text.split(' ')[1];
    await updateDoc(doc(db, "users", String(ctx.from.id)), { language: lang });
    await ctx.reply(`D'accord! Hianatra teny **${lang}** isika.`);
});

async function sendPaymentPrompt(ctx) {
    await ctx.replyWithMarkdown(`🛑 **Tapitra ny fotoana.**\nAlefaso ny **2000 Ar** amin'ny **0323911654** ary alefaso eto ny sary (Recu).`);
}

bot.on(['text', 'voice'], async (ctx) => {
    console.log("Message voaray (Text/Voice)...");
    const sub = await checkSubscription(ctx.from.id);
    if (!sub.valid) return sendPaymentPrompt(ctx);

    const userSnap = await getDoc(doc(db, "users", String(ctx.from.id)));
    const lang = userSnap.exists() ? userSnap.data().language : 'Anglais';
    
    await ctx.sendChatAction('typing');

    try {
        let contentPart;
        
        // Raha Feo (Voice)
        if (ctx.message.voice) {
            const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
            const buffer = await downloadFile(link.href);
            contentPart = { inlineData: { mimeType: "audio/ogg", data: buffer.toString('base64') } };
        } 
        // Raha Soratra (Text)
        else {
            contentPart = ctx.message.text;
        }

        const model = getGeminiModel();
        const prompt = `You are a helpful tutor teaching ${lang}. The user speaks Malagasy. Reply in ${lang} but explain difficult parts in Malagasy.`;

        const result = await model.generateContent([prompt, contentPart]);
        const response = result.response.text();

        console.log("Valiny avy amin'ny Gemini:", response.substring(0, 50) + "...");
        await ctx.reply(response);

    } catch (e) {
        console.error("Gemini Error:", e);
        await ctx.reply("Miala tsiny, somary sahirana ny tambajotra. Avereno kely.");
    }
});

// --- 5. SERVER ---

const expressApp = express();
const PORT = process.env.PORT || 3000;

expressApp.get('/', (req, res) => res.send('Bot is running V3'));
expressApp.get('/keep-alive', (req, res) => res.status(200).send('Alive'));

expressApp.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Fohazina ny Bot
bot.launch().then(() => console.log("Bot started on Telegram!"));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
