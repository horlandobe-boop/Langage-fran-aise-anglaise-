require('dotenv').config();
const { Telegraf } = require('telegraf');
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const axios = require('axios');
const { DateTime } = require("luxon");

// --- 1. CONFIGURATION FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDPrTWmxovZdbbi0BmXr6Tn6AyrlaO0cbM",
  authDomain: "bot-asa-en-ligne-mada.firebaseapp.com",
  projectId: "bot-asa-en-ligne-mada",
  storageBucket: "bot-asa-en-ligne-mada.firebasestorage.app",
  messagingSenderId: "837671675184",
  appId: "1:837671675184:web:2cd55ef7eacac7e33554f5"
};

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);

// --- 2. GEMINI KEYS ---
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

function getGeminiModel() {
    const randomIndex = Math.floor(Math.random() * GEMINI_API_KEYS.length);
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEYS[randomIndex]);
    return genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
}

// --- 3. BOT CONFIG ---
const bot = new Telegraf("8505202299:AAHkmuoq3Mlqn7VZw_pupLG4FT76Qr4HBeo");
const ADMIN_ID = 8207051152;
const PAYMENT_NUMBER = "0323911654";
const MONTHLY_PRICE = 2000;

// --- 4. SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Bot Active'));
app.listen(process.env.PORT || 3000);

// --- 5. LOGIQUE USER (HITSY) ---
async function checkUserStatus(ctx, next) {
    if (!ctx.from) return;
    const userId = ctx.from.id.toString();
    const userRef = doc(db, "users", userId);
    
    try {
        const userSnap = await getDoc(userRef);
        const now = DateTime.now().setZone("Indian/Antananarivo");

        if (!userSnap.exists()) {
            // New user: trial for 2 days from now
            const expiryDate = now.plus({ days: 2 }).toJSDate();
            await setDoc(userRef, {
                firstName: ctx.from.first_name || "Mpianatra",
                joinedAt: now.toJSDate(),
                status: "trial",
                expiryDate: expiryDate
            });
            await ctx.reply(`👋 Salama! Mahazo andrana maimaimpoana 2 andro ianao.\nFaran'ny andrana: ${DateTime.fromJSDate(expiryDate).setZone("Indian/Antananarivo").toFormat('dd/MM/yyyy HH:mm')}`);
            return next();
        } else {
            const userData = userSnap.data();
            const expiryDate = DateTime.fromJSDate(userData.expiryDate.toDate());

            // Raha mbola tsy tapitra ny fotoana
            if (now < expiryDate) {
                return next();
            } else {
                // Raha mandefa sary izy dia avela handeha ho any amin'ny verification
                if (ctx.message && ctx.message.photo) return next();
                
                await ctx.reply(`⛔ Tapitra ny andrana. Mba hitohizana:\n💰 Sarany: ${MONTHLY_PRICE} Ar\n📞 MVola: ${PAYMENT_NUMBER}\n👤 [RAVELOMANANTSOA URMIN]\n📸 Alefaso eto ny sary porofo.`);
                return;
            }
        }
    } catch (e) { return next(); }
}

// --- 6. VERIFICATION SARY (HITSY) ---
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id.toString();
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    
    try {
        await ctx.reply("🔍 Gemini dia manamarina ny sary...");
        const fileLink = await bot.telegram.getFileLink(photo.file_id);
        const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);

        const nowMada = DateTime.now().setZone("Indian/Antananarivo");

        const prompt = `
            You are a payment auditor. Examine this receipt image.
            Today's Date: ${nowMada.toFormat("yyyy-MM-dd")}
            Current Time: ${nowMada.toFormat("HH:mm")}
            Required Recipient: ${PAYMENT_NUMBER}
            Required Min Amount: ${MONTHLY_PRICE}

            CRITERIA:
            1. Extract the Date and Time from the image. It must be within 15 mins of ${nowMada.toFormat("HH:mm")} today.
            2. Extract the recipient number. It must match ${PAYMENT_NUMBER}.
            3. Extract the Amount. It must be >= ${MONTHLY_PRICE}.
            4. Extract the Transaction Reference ID.

            Return JSON ONLY:
            {
                "isValid": boolean,
                "reason": "Explain in Malagasy why rejected or if accepted",
                "transactionId": "string",
                "amount": number
            }`;

        const model = getGeminiModel();
        const result = await model.generateContent([prompt, { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } }]);
        const verification = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());

        if (verification.isValid) {
            const txRef = doc(db, "transactions", verification.transactionId);
            const txSnap = await getDoc(txRef);

            if (txSnap.exists()) {
                await ctx.reply("❌ Efa nampiasaina io sary/ID io.");
            } else {
                const newExpiry = nowMada.plus({ days: 30 }).toJSDate();
                await setDoc(txRef, { userId, date: new Date(), ref: verification.transactionId });
                await updateDoc(doc(db, "users", userId), { status: "active", expiryDate: newExpiry });
                await ctx.reply("✅ Eken'ny Gemini ny fandoavam-bola! Afaka mianatra indray ianao mandritra ny 30 andro.");
                await bot.telegram.sendMessage(ADMIN_ID, `💰 NEW PAY: ${userId} | ${verification.amount}Ar`);
            }
        } else {
            await ctx.reply(`❌ Nolavin'ny Gemini: ${verification.reason}`);
        }
    } catch (e) {
        await ctx.reply("⚠️ Tsy voavaky ny sary. Ataovy mazava tsara ny sary misy ny laharana sy ny ID transaction.");
    }
});

// --- 7. CHAT & VOICE ---
bot.use(checkUserStatus);
bot.on(['text', 'voice'], async (ctx) => {
    try {
        const model = getGeminiModel();
        let prompt = "You are a language teacher (EN, FR, DE, IT). Explain mistakes in MALAGASY. Be friendly.";
        let result;

        if (ctx.message.voice) {
            const fileLink = await bot.telegram.getFileLink(ctx.message.voice.file_id);
            const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
            result = await model.generateContent([prompt, { inlineData: { data: Buffer.from(response.data).toString("base64"), mimeType: "audio/ogg" } }]);
        } else {
            result = await model.generateContent(`${prompt}\nUser: ${ctx.message.text}`);
        }
        await ctx.reply(result.response.text());
    } catch (e) { console.error(e); }
});

bot.launch();
                expiryDate: trialEndDate
            });
            
            await ctx.reply(`👋 Salama tompoko! Tongasoa eto amin'ny Bot fampianarana.\n\n🎁 Manana 2 andro maimaimpoana ianao hanandramana azy.\n📚 Fitana hianarana: Anglais, Français, Allemand, Italien.\n\nAfaka manoratra na mandefa feo ianao dieny izao.`);
            return next();
        } else {
            // -- USER EFA MISY --
            const userData = userSnap.data();
            // Raha tsy misy expiryDate dia raisina ho efa lany
            const expiryDate = userData.expiryDate ? userData.expiryDate.toDate() : new Date(0);

            if (now > expiryDate) {
                // -- LANY NY FOTOANA (EXPIRED) --
                
                // Raha sary no nalefany, mety ho porofo fandoavam-bola ilay izy
                if (ctx.message && ctx.message.photo) {
                    return next(); 
                }

                await ctx.reply(`⛔ **Tapitra ny fe-potoana.**\n\nTapitra ny andrana na ny famandrihanao tompoko. Mba hitohizan'ny fianarana dia mila mandoa **${MONTHLY_PRICE} Ar** ianao.\n\n📞 Laharana MVola: **${PAYMENT_NUMBER}** [RAVELOMANANTSOA URMIN]\n\n📸 Rehefa vita ny depôt dia alefaso eto ny sary (capture) ahitana ny Référence sy ny Daty.`);
                return; // Tsy manohy mankany amin'ny Gemini Chat
            } else {
                // -- MBOLA MANAN-KERY (ACTIVE) --
                return next();
            }
        }
    } catch (e) {
        console.error("Erreur checkUserStatus:", e);
        // Raha misy erreur dia avela handeha ihany aloha mba tsy ho stuck
        return next();
    }
}

// --- 6. FIJERENA SARY PAIEMENT (Gemini Vision) ---

bot.on('photo', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    // Maka ny sary lehibe indrindra
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    
    try {
        const fileLink = await bot.telegram.getFileLink(photo.file_id);
        
        await ctx.reply("⏳ Miandrasa kely tompoko, mbola manamarina ny sary ny Bot...");

        const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);

        const nowMada = DateTime.now().setZone("Indian/Antananarivo");
        const formattedTime = nowMada.toFormat("yyyy-MM-dd HH:mm");

        const prompt = `
            Act as a strict payment verification system.
            Current Time in Madagascar: ${formattedTime}.
            Target Phone Number: ${PAYMENT_NUMBER}.
            Expected Amount: ${MONTHLY_PRICE} or more.
            
            Analyze the image provided. It is a mobile money receipt.
            
            RULES:
            1. **Date**: Must match today's date (${nowMada.toFormat("yyyy-MM-dd")}).
            2. **Time**: Must be within the last 15 minutes of ${nowMada.toFormat("HH:mm")}.
            3. **Recipient**: Must show number ending or containing "${PAYMENT_NUMBER}".
            4. **Amount**: Must be >= ${MONTHLY_PRICE}.
            5. **Ref**: Extract the Transaction ID/Reference.

            OUTPUT JSON ONLY:
            {
                "isValid": boolean,
                "reason": "Explain in MALAGASY why it is rejected or accepted",
                "transactionId": "EXTRACTED_ID_OR_NULL",
                "amount": number
            }
        `;

        const model = getGeminiModel();
        const result = await model.generateContent([
            prompt,
            { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } }
        ]);
        
        const responseText = result.response.text();
        const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        let verification;
        
        try {
             verification = JSON.parse(jsonString);
        } catch (e) {
             verification = { isValid: false, reason: "Tsy mazava ny sary, avereno azafady." };
        }

        if (verification.isValid) {
            // Vérification Doublon Transaction ID
            const txRef = doc(db, "transactions", verification.transactionId || "unknown_id");
            const txSnap = await getDoc(txRef);

            if (txSnap.exists()) {
                await ctx.reply("❌ **Tsy ekena:** Efa nampiasaina io Référence io.");
                await bot.telegram.sendMessage(ADMIN_ID, `⚠️ FRAUDE: ${userId} nampiasa Ref efa niasa: ${verification.transactionId}`);
            } else {
                // VALID
                const userRef = doc(db, "users", userId);
                const newExpiry = new Date();
                newExpiry.setDate(newExpiry.getDate() + 30); // +30 Andro

                await setDoc(txRef, {
                    userId: userId,
                    usedAt: new Date(),
                    amount: verification.amount,
                    ref: verification.transactionId
                });

                await updateDoc(userRef, {
                    status: "active",
                    expiryDate: newExpiry
                });

                await ctx.reply(`✅ **Voaray ny vola!** Misaotra anao.\n\nAfaka mianatra indray ianao manomboka izao ka hatramin'ny ${newExpiry.toLocaleDateString('fr-FR')}.\n\nManorata na mandefasa feo.`);
                await bot.telegram.sendMessage(ADMIN_ID, `💰 PAIEMENT OK: ${userId} - ${verification.amount}Ar - Ref: ${verification.transactionId}`);
            }
        } else {
            // INVALID
            await ctx.reply(`❌ **Tsy ekena ny fandoavam-bola.**\n\nAntony: ${verification.reason}\n\nRaha misy diso dia mifandraisa amin'ny Admin.`);
            await bot.telegram.sendMessage(ADMIN_ID, `🚫 REFUS: ${userId} - Raison: ${verification.reason}`);
        }

    } catch (error) {
        console.error("Error Vision:", error);
        await ctx.reply("Miala tsiny, tsy voavaky ny sary. Andramo averina alefa mazava tsara.");
    }
});

// --- 7. FAMPIANARANA (TEXT & VOICE) ---

// Ampiharina ny sivana (Check Status)
bot.use(checkUserStatus);

bot.on(['text', 'voice'], async (ctx) => {
    try {
        let userContent = "";
        let inputPart = {};

        // Raha FEO (Voice)
        if (ctx.message.voice) {
            await ctx.sendChatAction('record_voice'); // Aseho hoe "Recording..." ny bot
            const fileLink = await bot.telegram.getFileLink(ctx.message.voice.file_id);
            const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
            const audioBuffer = Buffer.from(response.data);
            
            userContent = "Audio input provided.";
            inputPart = { inlineData: { data: audioBuffer.toString("base64"), mimeType: "audio/ogg" } };
        
        // Raha SORATRA (Text)
        } else if (ctx.message.text) {
            await ctx.sendChatAction('typing'); // Aseho hoe "Typing..."
            userContent = ctx.message.text;
        }

        const prompt = `
            You are a language tutor (English, French, German, Italian).
            The user is a Malagasy speaker.
            
            TASK:
            1. If input is audio, listen carefully. If text, read carefully.
            2. Identify the target language (EN, FR, DE, IT).
            3. Reply conversationally in that target language.
            4. If there are mistakes, correct them.
            5. **STRICTLY:** Explain any corrections or grammar rules in **MALAGASY**.
            
            User Input: "${userContent}"
        `;

        const model = getGeminiModel();
        let result;
        
        if (ctx.message.voice) {
            result = await model.generateContent([prompt, inputPart]);
        } else {
            result = await model.generateContent(prompt);
        }

        const replyText = result.response.text();
        await ctx.reply(replyText);

    } catch (error) {
        console.error("Error Gemini Chat:", error);
        // Tsy tenenina foana ny erreur mba tsy hanelingelina, fa log-na
    }
});

// --- 8. DEMARRAGE SY FITANTANANA LES ERREURS ---
bot.launch().then(() => {
    console.log('Bot Telegram mandeha soa aman-tsara!');
}).catch((err) => {
    console.error('Tsy nety nandeha ny Bot:', err);
});

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
