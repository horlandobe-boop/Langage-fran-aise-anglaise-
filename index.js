/*
 * BOT TELEGRAM GEMINI - LANGUAGE TUTOR & PAYMENT VERIFIER
 * Created for: Ravelomanantsoa Urmin
 */

const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc, setDoc, updateDoc, collection } = require("firebase/firestore");
const axios = require('axios');
const moment = require('moment-timezone');
const express = require('express');

// --- 1. CONFIGURATION ---

// Telegram Bot Token
const BOT_TOKEN = "8505202299:AAHkmuoq3Mlqn7VZw_pupLG4FT76Qr4HBeo";

// Admin ID
const ADMIN_ID = "8207051152";

// Gemini API Keys Pool
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

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDPrTWmxovZdbbi0BmXr6Tn6AyrlaO0cbM",
    authDomain: "bot-asa-en-ligne-mada.firebaseapp.com",
    databaseURL: "https://bot-asa-en-ligne-mada-default-rtdb.firebaseio.com",
    projectId: "bot-asa-en-ligne-mada",
    storageBucket: "bot-asa-en-ligne-mada.firebasestorage.app",
    messagingSenderId: "837671675184",
    appId: "1:837671675184:web:2cd55ef7eacac7e33554f5",
    measurementId: "G-72CKQLX75V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Bot
const bot = new Telegraf(BOT_TOKEN);

// --- 2. UTILITY FUNCTIONS ---

// Function to get a random Gemini Key (Rotation)
function getGeminiModel(modelName = "gemini-1.5-flash") {
    const randomKey = GEMINI_API_KEYS[Math.floor(Math.random() * GEMINI_API_KEYS.length)];
    const genAI = new GoogleGenerativeAI(randomKey);
    return genAI.getGenerativeModel({ model: modelName });
}

// Function to check subscription status
async function checkSubscription(userId) {
    const userRef = doc(db, "users", String(userId));
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        // New user: Start 2-day trial
        const now = moment().tz("Indian/Antananarivo");
        const trialEnd = now.clone().add(2, 'days');
        
        await setDoc(userRef, {
            joinedAt: now.toISOString(),
            status: 'trial',
            expiryDate: trialEnd.toISOString(),
            language: 'English', // Default
            usageCount: 0
        });
        return { valid: true, type: 'trial', message: 'Faly miarahaba anao! Manana 2 andro maimaim-poana ianao hanandramana.' };
    }

    const userData = userSnap.data();
    const expiryDate = moment(userData.expiryDate);
    const now = moment().tz("Indian/Antananarivo");

    if (now.isAfter(expiryDate)) {
        return { valid: false, type: 'expired', message: 'Tapitra ny fotoana fanandramana na ny abonnement anao.' };
    }

    return { valid: true, type: userData.status };
}

// Function to download file from Telegram
async function downloadFile(url) {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer'
    });
    return Buffer.from(response.data, 'binary');
}

// --- 3. BOT LOGIC: PAYMENT & VISION ---

// Handle Photo (Payment Verification)
bot.on('photo', async (ctx) => {
    const userId = String(ctx.from.id);
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    // Only process photos if user is expired or explicit command (logic simplified: check all photos if user is expired)
    // Or if user just sent a photo, we assume it's payment proof.
    
    await ctx.reply("⏳ Mahandrasa kely, mijery ny porofo ny fandoavam-bola ny Gemini AI...");

    try {
        // Get file link
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        const imageBuffer = await downloadFile(fileLink.href);

        // Convert buffer to base64 for Gemini
        const imageBase64 = imageBuffer.toString('base64');

        // Current Time Context for Gemini
        const now = moment().tz("Indian/Antananarivo");
        const currentTimeString = now.format("YYYY-MM-DD HH:mm");

        const model = getGeminiModel("gemini-1.5-flash"); // Flash is faster for vision
        
        const prompt = `
        Act as a Payment Auditor. Use the current time in Madagascar: ${currentTimeString}.
        Analyze this mobile money receipt screenshot strictly.
        
        Required Criteria:
        1. Recipient Number must be: "0323911654" (Ravelomanantsoa Urmin).
        2. Amount must be at least 2000 Ar.
        3. Date must be today.
        4. Time validation: The transaction time in the image must be within 15 minutes of ${currentTimeString}.
        5. Extract the Transaction ID (Reference).

        Return ONLY a JSON object like this (no markdown):
        {
            "is_recipient_correct": boolean,
            "is_amount_correct": boolean,
            "is_time_valid": boolean,
            "transaction_id": "string_or_null",
            "reason": "explanation in Malagasy"
        }
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }
        ]);

        const responseText = result.response.text();
        // Clean response to get pure JSON
        const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysis = JSON.parse(jsonString);

        console.log("Payment Analysis:", analysis);

        if (analysis.is_recipient_correct && analysis.is_amount_correct && analysis.is_time_valid && analysis.transaction_id) {
            
            // CHECK DATABASE FOR DUPLICATE TRANSACTION ID
            const txRef = doc(db, "transactions", analysis.transaction_id);
            const txSnap = await getDoc(txRef);

            if (txSnap.exists()) {
                await ctx.reply("❌ Efa nampiasaina io Référence io. Tsy azo averina intsony.");
                // Notify Admin
                bot.telegram.sendMessage(ADMIN_ID, `⚠️ FRAUD ATTEMPT:\nUser: ${ctx.from.first_name}\nTxID: ${analysis.transaction_id} (Duplicate)`);
            } else {
                // SUCCESS: Update User Subscription
                const newExpiry = moment().tz("Indian/Antananarivo").add(30, 'days');
                
                await updateDoc(userRef, {
                    status: 'premium',
                    expiryDate: newExpiry.toISOString()
                });

                // Save Transaction
                await setDoc(txRef, {
                    userId: userId,
                    date: now.toISOString(),
                    amount: 2000
                });

                await ctx.reply(`✅ Voaray ny vola! Misaotra anao. \n\nAfaka manohy ny fianarana ianao izao mandritra ny 30 andro.\nExpiry: ${newExpiry.format("DD/MM/YYYY")}`);
                bot.telegram.sendMessage(ADMIN_ID, `💰 NEW PAYMENT:\nUser: ${ctx.from.first_name}\nAmount: 2000Ar\nTxID: ${analysis.transaction_id}`);
            }

        } else {
            // FAILED Verification by Gemini
            await ctx.reply(`❌ Tsy nekena ny fandoavam-bola.\n\nAntony: ${analysis.reason}\n\nAzafady, avereno jerena ny fepetra (15 minitra ny fe-potoana, laharana 0323911654).`);
            bot.telegram.sendMessage(ADMIN_ID, `🚫 FAILED PAYMENT:\nUser: ${ctx.from.first_name}\nReason: ${analysis.reason}`);
        }

    } catch (error) {
        console.error("Error processing payment:", error);
        await ctx.reply("Nisy olana teo amin'ny famakiana ny sary. Azafady alefaso sary mazava tsara.");
    }
});

// --- 4. BOT LOGIC: LANGUAGE PRACTICE ---

bot.command('start', async (ctx) => {
    const subStatus = await checkSubscription(ctx.from.id);
    
    if (!subStatus.valid) {
        return sendPaymentPrompt(ctx);
    }

    const keyboard = Markup.keyboard([
        ['🇬🇧 Anglais', '🇫🇷 Français'],
        ['🇩🇪 Allemagne', '🇮🇹 Italienne']
    ]).resize();

    await ctx.reply(
        `Salama! Izaho no Gemini Teacher anao.\n${subStatus.message}\n\nMisafidiana taranja iray tianao hianarana:`,
        keyboard
    );
});

// Handle Language Selection
const languages = ['🇬🇧 Anglais', '🇫🇷 Français', '🇩🇪 Allemagne', '🇮🇹 Italienne'];
bot.hears(languages, async (ctx) => {
    const subStatus = await checkSubscription(ctx.from.id);
    if (!subStatus.valid) return sendPaymentPrompt(ctx);

    const lang = ctx.message.text.split(' ')[1]; // Extract name (e.g., Anglais)
    
    // Update user language preference
    await updateDoc(doc(db, "users", String(ctx.from.id)), {
        language: lang
    });

    await ctx.reply(`D'accord! Hiresaka amin'ny teny **${lang}** isika izao. \nAzonao atao ny manoratra na mandefa feo (vocal). \nRaha misy diso dia hanitsy anao aho ary hanazava amin'ny teny Malagasy.`);
});

// Helper: Payment Prompt
async function sendPaymentPrompt(ctx) {
    const message = `
🛑 **Tapitra ny fotoana fanandramana/abonnement anao.**

Mba ahafahana manohy dia mila mandoa **2000 Ar** isam-bolana ianao.

📞 Alefaso amin'ity laharana ity ny vola:
**0323911654** (RAVELOMANANTSOA URMIN)

⚠️ **Torolalana:**
1. Alefaso ny vola.
2. Makà "Capture d'écran" (Sary) ny reçu.
3. Alefaso eto amin'ny bot avy hatrany ilay sary.
4. **Fanamarihana:** Mila alefa ao anatin'ny 15 minitra aorian'ny fandefasana vola ny sary, raha tsy izany dia ho reduser.
    `;
    await ctx.replyWithMarkdown(message);
}

// Handle Text & Voice Messages (The Core Learning Logic)
bot.on(['text', 'voice'], async (ctx) => {
    // 1. Check Subscription
    const subStatus = await checkSubscription(ctx.from.id);
    if (!subStatus.valid) {
        return sendPaymentPrompt(ctx);
    }

    // 2. Get User Context (Language)
    const userSnap = await getDoc(doc(db, "users", String(ctx.from.id)));
    const targetLang = userSnap.exists() ? userSnap.data().language : 'Anglais';

    let userContent = "";
    let isVoice = false;

    // 3. Process Input (Text or Voice)
    if (ctx.message.voice) {
        await ctx.replyWithChatAction('typing');
        const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const audioBuffer = await downloadFile(fileLink.href);
        const audioBase64 = audioBuffer.toString('base64');
        
        userContent = {
            inlineData: {
                mimeType: "audio/ogg",
                data: audioBase64
            }
        };
        isVoice = true;
    } else {
        userContent = ctx.message.text;
    }

    // 4. Send to Gemini
    try {
        if (!isVoice) await ctx.replyWithChatAction('typing');
        
        const model = getGeminiModel("gemini-2.5-flash"); // Flash is fast and cheap
        
        const systemPrompt = `
        You are a helpful language tutor teaching ${targetLang}.
        The user speaks Malagasy and learns ${targetLang}.
        
        Rules:
        1. If the user writes/speaks in ${targetLang}, reply naturally in ${targetLang} to keep the conversation going.
        2. If the user makes a mistake, correct them gently. Explain the correction in MALAGASY.
        3. If the user asks a question in Malagasy, explain the answer in Malagasy but give examples in ${targetLang}.
        4. Be encouraging and empathetic.
        5. Keep responses concise (under 200 words) suitable for a chat.
        `;

        const result = await model.generateContent([
            systemPrompt,
            "Student says:",
            userContent
        ]);

        const reply = result.response.text();
        await ctx.reply(reply);

    } catch (error) {
        console.error("Gemini Error:", error);
        await ctx.reply("Miala tsiny, somary sahirana kely ny tambajotra. Avereno afaka fotoana fohy.");
    }
});

// --- 5. SERVER SETUP (FOR RENDER & CRON-JOB) ---

const expressApp = express();
const PORT = process.env.PORT || 3000;

expressApp.get('/', (req, res) => {
    res.send('Gemini Bot is Active!');
});

// Keep-alive endpoint
expressApp.get('/keep-alive', (req, res) => {
    res.status(200).send('Ping received');
});

expressApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Start Bot
bot.launch().then(() => {
    console.log('Bot is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
