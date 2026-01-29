/*
 * BOT TELEGRAM GEMINI - PAYMENT FIXED & VISION UPDATE
 * Updated for: Ravelomanantsoa Urmin
 */

const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");
const axios = require('axios');
const moment = require('moment-timezone');
const express = require('express');

// --- 1. CONFIGURATION ---

const BOT_TOKEN = "8505202299:AAHkmuoq3Mlqn7VZw_pupLG4FT76Qr4HBeo";
const ADMIN_ID = "8207051152";

// API Keys Gemini (Rotation)
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

// Configuration Firebase Vaovao
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

// --- 2. FONCTION UTILITAIRE ---

// Maka API Key kisendrasendra (Rotation)
function getGeminiModel(modelName = "gemini-2.5-flash") {
    const randomKey = GEMINI_API_KEYS[Math.floor(Math.random() * GEMINI_API_KEYS.length)];
    const genAI = new GoogleGenerativeAI(randomKey);
    return genAI.getGenerativeModel({ model: modelName });
}

// Télécharger fichier depuis Telegram
async function downloadFile(url) {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer'
    });
    return Buffer.from(response.data, 'binary');
}

// Fanamarinana Abonnement (CORRECTED)
async function checkSubscription(userId) {
    const userRef = doc(db, "users", String(userId));
    const userSnap = await getDoc(userRef);
    const now = moment().tz("Indian/Antananarivo");

    // Raha mpampiasa vaovao (Tsy hita ao amin'ny base)
    if (!userSnap.exists()) {
        const trialEnd = now.clone().add(2, 'days'); // +2 andro manomboka izao
        
        // Mamorona compte
        await setDoc(userRef, {
            joinedAt: now.toISOString(),
            status: 'trial',
            expiryDate: trialEnd.toISOString(),
            language: 'Anglais',
            usageCount: 0
        });

        // Averina avy hatrany hoe EKENA satria vao nanomboka
        return { 
            valid: true, 
            type: 'trial', 
            message: '🎉 Tongasoa! Manana 2 andro maimaim-poana ianao hanandramana ny serivisy.' 
        };
    }

    // Raha efa misy compte
    const userData = userSnap.data();
    const expiryDate = moment(userData.expiryDate);

    if (now.isAfter(expiryDate)) {
        return { 
            valid: false, 
            type: 'expired', 
            message: '⚠️ Tapitra ny fotoana fanandramana na ny abonnement anao.' 
        };
    }

    return { valid: true, type: userData.status };
}

// --- 3. LOGIQUE SARY (VISION & PAIEMENT) ---

bot.on('photo', async (ctx) => {
    const userId = String(ctx.from.id);
    const subStatus = await checkSubscription(userId); // Zahana ny status

    await ctx.replyWithChatAction('typing');

    try {
        // 1. Raisina ilay sary
        const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Ny sary lehibe indrindra
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        const imageBuffer = await downloadFile(fileLink.href);
        const imageBase64 = imageBuffer.toString('base64');
        const now = moment().tz("Indian/Antananarivo");

        const model = getGeminiModel("gemini-1.5-flash");

        // --- CAS 1: RAHA TAPITRA NY ABONNEMENT (Verification Paiement) ---
        if (!subStatus.valid) {
            await ctx.reply("🔍 Mijery ny rosia (réçu) nalefanao ny Gemini...");

            const currentTimeString = now.format("YYYY-MM-DD HH:mm");
            
            // Prompt hentitra ho an'ny Paiement
            const paymentPrompt = `
            Act as a Payment Auditor for a generic mobile money receipt.
            Current Time in Madagascar: ${currentTimeString}.
            
            Analyze this image. Is it a transaction receipt?
            If NO, set "is_receipt": false.
            
            If YES, extract:
            1. Recipient Number (Must contain "0323911654").
            2. Amount (Must be >= 2000).
            3. Time (Must be within 20 minutes of ${currentTimeString}).
            4. Transaction Reference/ID.

            JSON OUTPUT ONLY:
            {
                "is_receipt": boolean,
                "recipient_match": boolean,
                "amount_match": boolean,
                "time_match": boolean,
                "transaction_id": "string",
                "reason_malagasy": "reason string"
            }
            `;

            const result = await model.generateContent([
                paymentPrompt,
                { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }
            ]);

            const responseText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            let analysis;
            
            try {
                analysis = JSON.parse(responseText);
            } catch (e) {
                console.log("JSON Parse Error:", responseText);
                return ctx.reply("❌ Tsy voavaky tsara ny sary. Azafady alefaso sary mazava tsara (Capture d'écran original).");
            }

            // Validations
            if (!analysis.is_receipt) {
                return ctx.reply("❌ Tsy rosia (réçu) io sary io. Alefaso ny porofo nandefasana vola.");
            }

            if (analysis.recipient_match && analysis.amount_match && analysis.time_match && analysis.transaction_id) {
                
                // Hamarina sao efa nampiasaina ny ID
                const txRef = doc(db, "transactions", analysis.transaction_id);
                const txSnap = await getDoc(txRef);

                if (txSnap.exists()) {
                    await ctx.reply("❌ Efa nampiasaina io Référence io. Tsy azo averina.");
                    bot.telegram.sendMessage(ADMIN_ID, `⚠️ FRAUD: User ${ctx.from.first_name} tried duplicate ID ${analysis.transaction_id}`);
                } else {
                    // ACCEPTED
                    const newExpiry = moment().tz("Indian/Antananarivo").add(30, 'days');
                    await updateDoc(doc(db, "users", userId), {
                        status: 'premium',
                        expiryDate: newExpiry.toISOString()
                    });
                    
                    await setDoc(txRef, {
                        userId: userId,
                        date: now.toISOString(),
                        amount: 2000,
                        ref: analysis.transaction_id
                    });

                    await ctx.reply(`✅ Voaray ny vola! Misaotra anao.\nAfaka mianatra ianao izao hatramin'ny ${newExpiry.format("DD/MM/YYYY")}.`);
                    bot.telegram.sendMessage(ADMIN_ID, `💰 PAYMENT: ${ctx.from.first_name} - 2000Ar - Ref: ${analysis.transaction_id}`);
                }
            } else {
                // REJECTED
                await ctx.reply(`❌ Nolavina ny fandoavam-bola.\nAntony: ${analysis.reason_malagasy}\n\nFitsipika: Laharana 0323911654, Vola 2000Ar, ary latsaky ny 15 minitra ny fotoana.`);
                bot.telegram.sendMessage(ADMIN_ID, `🚫 REJECTED: ${ctx.from.first_name} - Reason: ${analysis.reason_malagasy}`);
            }

        } 
        // --- CAS 2: RAHA MANANA ABONNEMENT (Fianarana @ alalan'ny sary) ---
        else {
            await ctx.reply("👁️ Mijery ny sarinao aho...");
            
            // Raisina ny fiteny ankehitriny
            const userSnap = await getDoc(doc(db, "users", userId));
            const targetLang = userSnap.data().language || 'Anglais';

            const generalPrompt = `
            You are a language tutor. The user is learning ${targetLang}.
            Look at this image.
            1. Describe what is in the image in ${targetLang}.
            2. Then, explain the key vocabulary in Malagasy.
            3. Keep it helpful and educational.
            `;

            const result = await model.generateContent([
                generalPrompt,
                { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }
            ]);

            await ctx.reply(result.response.text());
        }

    } catch (error) {
        console.error("Error Image:", error);
        await ctx.reply("Nisy olana kely tamin'ny famakiana sary. Avereno afaka fotoana fohy.");
    }
});

// --- 4. LOGIQUE FIANARANA (TEXTE & VOCAL) ---

bot.command('start', async (ctx) => {
    const subStatus = await checkSubscription(ctx.from.id);
    
    // Na dia tapitra aza, asehoy ihany ny menu fa rehefa mifidy vao bloquer-na
    // na asehoy ny message d'accueil raha vao tonga
    if (!subStatus.valid) {
        // Raha tapitra, alefa avy hatrany ny demande paiement
        return sendPaymentPrompt(ctx);
    }

    const keyboard = Markup.keyboard([
        ['🇬🇧 Anglais', '🇫🇷 Français'],
        ['🇩🇪 Allemagne', '🇮🇹 Italienne']
    ]).resize();

    await ctx.reply(
        `Salama! ${subStatus.message}\n\nMisafidiana taranja tianao hianarana:`,
        keyboard
    );
});

// Misafidy fiteny
const languages = ['🇬🇧 Anglais', '🇫🇷 Français', '🇩🇪 Allemagne', '🇮🇹 Italienne'];
bot.hears(languages, async (ctx) => {
    const subStatus = await checkSubscription(ctx.from.id);
    if (!subStatus.valid) return sendPaymentPrompt(ctx);

    const lang = ctx.message.text.split(' ')[1]; 
    await updateDoc(doc(db, "users", String(ctx.from.id)), { language: lang });

    await ctx.reply(`D'accord! Hiresaka amin'ny teny **${lang}** isika. \nAzonao atao ny manoratra, mandefa feo, na mandefa sary hianarana.`);
});

// Message ho an'ny fandoavam-bola
async function sendPaymentPrompt(ctx) {
    const message = `
🛑 **Tapitra ny fotoana fanandramana/abonnement.**

Mba ahafahana manohy dia mila mandoa **2000 Ar** ianao.

📞 Alefaso amin'ny: **0323911654** (RAVELOMANANTSOA URMIN)

⚠️ **Torolalana:**
1. Alefaso ny vola.
2. Makà "Capture d'écran" mazava ny reçu.
3. Alefaso eto amin'ny bot ilay sary ao anatin'ny **15 minitra**.
    `;
    await ctx.replyWithMarkdown(message);
}

// Traitement Texte sy Feo
bot.on(['text', 'voice'], async (ctx) => {
    const subStatus = await checkSubscription(ctx.from.id);
    if (!subStatus.valid) return sendPaymentPrompt(ctx);

    const userSnap = await getDoc(doc(db, "users", String(ctx.from.id)));
    const targetLang = userSnap.data().language || 'Anglais';

    let userContent = "";
    
    // Raha feo
    if (ctx.message.voice) {
        await ctx.replyWithChatAction('typing');
        const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const audioBuffer = await downloadFile(fileLink.href);
        const audioBase64 = audioBuffer.toString('base64');
        userContent = { inlineData: { mimeType: "audio/ogg", data: audioBase64 } };
    } else {
        userContent = ctx.message.text;
    }

    try {
        if (!ctx.message.voice) await ctx.replyWithChatAction('typing');
        
        const model = getGeminiModel("gemini-1.5-flash");
        
        const systemPrompt = `
        You are a language tutor teaching ${targetLang}. The user speaks Malagasy.
        
        1. If user speaks ${targetLang}, reply in ${targetLang}.
        2. Correct mistakes gently and explain in MALAGASY.
        3. Explain definitions in Malagasy but give examples in ${targetLang}.
        4. Keep it short and conversational.
        `;

        const result = await model.generateContent([systemPrompt, userContent]);
        await ctx.reply(result.response.text());

    } catch (error) {
        console.error("Gemini Error:", error);
        await ctx.reply("Miala tsiny, misy olana kely. Avereno afaka fotoana fohy.");
    }
});

// --- 5. SERVER KEEP-ALIVE ---

const expressApp = express();
const PORT = process.env.PORT || 3000;

expressApp.get('/', (req, res) => res.send('Bot Active'));
expressApp.get('/keep-alive', (req, res) => res.status(200).send('Ping OK'));

expressApp.listen(PORT, () => console.log(`Server running on port ${PORT}`));

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
