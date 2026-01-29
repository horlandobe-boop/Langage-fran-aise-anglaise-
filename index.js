require('dotenv').config();
const { Telegraf } = require('telegraf');
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc, setDoc, updateDoc, collection } = require("firebase/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const axios = require('axios');
const { DateTime } = require("luxon");

// --- 1. CONFIGURATION FIREBASE ---
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

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);

// --- 2. CONFIGURATION GEMINI (API KEYS 10) ---
// Eto no ametrahanao ireo API KEY 10 anao.
// Tsara raha atao anaty 'Environment Variables' ao amin'ny Render ireto fa eto dia ataoko lisitra.
const GEMINI_API_KEYS = [
    process.env.GEMINI_KEY_1 || "AIzaSyDtd9oI9r7CCEO6BfukyBgq_LH8PRc51GM",
    process.env.GEMINI_KEY_2 || "AIzaSyBGwU-Nx-Nw8Abh7GIYKvXgJ44CMt5-dPs",
    process.env.GEMINI_KEY_3 || "AIzaSyAB8vPq2mN0PvTadg4XxQFk9TnrOAiP128",
    process.env.GEMINI_KEY_4 || "AIzaSyBQxiAahvBv3CtNGY2dvLrraPzSRJqTdVA",
    process.env.GEMINI_KEY_5 || "AIzaSyDMX-H2qSNttX3i8NbN-4Eepu28fOGpTtc",
    process.env.GEMINI_KEY_6 || "AIzaSyDTTmu7hujNVCfetwILR_G2cppCtOhwcdI",
    process.env.GEMINI_KEY_7 || "AIzaSyAzwSY9j5AOaLFHnauZ80CX2ecGFI931Y4",
    process.env.GEMINI_KEY_8 || "AIzaSyDzhJYmC4gkVDKXWxWErgiTqg8OcuEj_2s",
    process.env.GEMINI_KEY_9 || "AIzaSyAVCGGC4-aPzjney5pHHFqYUx-lZ72gJtM",
    process.env.GEMINI_KEY_10 || "AIzaSyCgivxeIowWSnoZ_WhlmarA3J3djW2g84A",
];

// Fonction mifidy API Key kisendrasendra (Random) mba tsy ho tototra ny iray
function getGeminiModel() {
    const randomIndex = Math.floor(Math.random() * GEMINI_API_KEYS.length);
    const selectedKey = GEMINI_API_KEYS[randomIndex];
    const genAI = new GoogleGenerativeAI(selectedKey);
    // Modèle Gemini 1.5 Flash no haingana sy mora ampiasaina amin'ny sary sy feo
    return genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
}

// --- 3. CONFIGURATION BOT TELEGRAM ---
// ... (Code ambony rehetra) ...

// --- 3. CONFIGURATION BOT TELEGRAM ---
// 👇 ETO NO OVANA RAHA TE HAMETRAKA AZY MIVANTANA IANAO 👇
const bot = new Telegraf("8505202299:AAHkmuoq3Mlqn7VZw_pupLG4FT76Qr4HBeo"); // Soloy ny Token-nao manontolo io

const ADMIN_ID = 8207051152;
const PAYMENT_NUMBER = "0323911654";
const MONTHLY_PRICE = 2000;

// ... (Code ambany rehetra) ...

// --- 4. SERVER EXPRESS (Mba tsy hatory ny bot amin'ny Render/Cron-job) ---
const app = express();
app.get('/', (req, res) => res.send('Mandeha ny Bot Tompoko!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// --- 5. LOGIQUE FITANTANANA OLONA (User Management) ---

async function checkUserStatus(ctx, next) {
    const userId = ctx.from.id.toString();
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    const now = new Date();

    if (!userSnap.exists()) {
        // Mpampiasa vaovao: Omena 2 andro maimaimpoana
        const trialEndDate = new Date();
        trialEndDate.setDate(now.getDate() + 2); // +2 andro

        await setDoc(userRef, {
            firstName: ctx.from.first_name,
            joinedAt: now,
            status: "trial", // 'trial' na 'active' na 'expired'
            expiryDate: trialEndDate
        });
        
        await ctx.reply("Salama tompoko! Tongasoa eto amin'ny Bot fampianarana teny vahiny.\n\nManana 2 andro maimaimpoana ianao hanandramana azy. Misafidiana teny tianao hianarana (Anglais, Français, Allemand, Italien).");
        return next();
    } else {
        const userData = userSnap.data();
        const expiryDate = userData.expiryDate.toDate();

        if (now > expiryDate) {
            // Tapitra ny fe-potoana
            await ctx.reply(`Tapitra ny fe-potoana fanandramana na ny famandrihanao tompoko.\n\nMba hitohizan'ny fianarana dia mila mandoa **${MONTHLY_PRICE} Ar** isam-bolana ianao.\n\nLaharana: **${PAYMENT_NUMBER}** [RAVELOMANANTSOA URMIN]\n\nAlefaso eto ny sary (Capture d'écran) rehefa vita ny fandefasana vola.`);
            
            // Raha sary no nalefany dia alefa any amin'ny verification, raha tsy izany dia ajanona
            if (ctx.message.photo) {
                return next();
            } else {
                return; // Tsy manohy mankany amin'ny Gemini
            }
        } else {
            // Mbola manan-kery ny famandrihana
            return next();
        }
    }
}

// --- 6. FIJERENA SARY PAIEMENT (Gemini Vision) ---

bot.on('photo', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    
    // Raha mbola manana andro izy dia tsy mila mijery sary, raisina ho fianarana (ohatra: manoratra lahatsoratra amin'ny sary)
    // Fa eto, andao atao hoe raha mandefa sary izy dia paiement foana no first assumption raha efa expired, 
    // na azonao asiana commande manokana.
    
    // Makà sary avo lenta indrindra
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await bot.telegram.getFileLink(photo.file_id);
    
    try {
        await ctx.reply("Miandrasa kely tompoko, mijery ny sary ny Gemini...");

        // Download sary
        const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);

        // Fotoana ankehitriny (Madagascar Time)
        const nowMada = DateTime.now().setZone("Indian/Antananarivo");
        const formattedTime = nowMada.toFormat("yyyy-MM-dd HH:mm");

        // Prompt ho an'ny Gemini
        const prompt = `
            You are a payment verification assistant.
            Current Date and Time in Madagascar: ${formattedTime}.
            Expected Recipient Number: ${PAYMENT_NUMBER}.
            Minimum Amount: ${MONTHLY_PRICE}.
            
            Analyze the image (mobile money receipt). Verify these strict rules:
            1. **Date check**: The date on receipt must vary match today's date (${nowMada.toFormat("yyyy-MM-dd")}).
            2. **Time check**: The time on receipt must be within 15 minutes of ${nowMada.toFormat("HH:mm")}.
            3. **Number check**: The recipient number must contain ${PAYMENT_NUMBER}.
            4. **Amount check**: The amount must be equal or greater than ${MONTHLY_PRICE}.
            5. **Transaction ID**: Extract the transaction reference/ID.

            Return ONLY a JSON object (no markdown, no text) with this structure:
            {
                "isValid": boolean,
                "reason": "explanation in Malagasy if invalid",
                "transactionId": "string_of_id_found",
                "amount": number
            }
        `;

        const model = getGeminiModel();
        const result = await model.generateContent([
            prompt,
            { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } }
        ]);
        
        const responseText = result.response.text();
        // Fanadiovana ny valiny (raha misy markdown ```json)
        const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const verification = JSON.parse(jsonString);

        if (verification.isValid) {
            // Hamarino raha efa nampiasaina ny Transaction ID tao amin'ny Firestore
            const txRef = doc(db, "transactions", verification.transactionId);
            const txSnap = await getDoc(txRef);

            if (txSnap.exists()) {
                await ctx.reply("❌ Efa nampiasaina io Transaction ID io tompoko. Tsy ekena ny fandoavam-bola indroa.");
                // Signal Admin
                await bot.telegram.sendMessage(ADMIN_ID, `⚠️ **Tentative de fraude**\nUser: ${ctx.from.first_name} (${userId})\nTxID: ${verification.transactionId}\nRaison: ID déjà utilisé.`);
            } else {
                // Mety daholo ny zava-drehetra
                const newExpiry = new Date();
                newExpiry.setDate(newExpiry.getDate() + 30); // 30 andro

                // Tehirizo ny transaction
                await setDoc(txRef, {
                    userId: userId,
                    usedAt: new Date(),
                    amount: verification.amount,
                    photoId: photo.file_id
                });

                // Hanavao ny User
                await updateDoc(userRef, {
                    status: "active",
                    expiryDate: newExpiry
                });

                await ctx.reply("✅ Voaray ny vola tompoko! Misaotra anao. \n\nAfaka manohy ny fianarana indray ianao ao anatin'ny 30 andro manaraka.");
                
                // Signal Admin
                await bot.telegram.sendMessage(ADMIN_ID, `💰 **Paiement Reçu**\nUser: ${ctx.from.first_name}\nMontant: ${verification.amount} Ar\nTxID: ${verification.transactionId}`);
            }

        } else {
            // Tsy valid ilay sary araka ny Gemini
            await ctx.reply(`❌ Tsy ekena ny fandoavam-bola.\n\nAntony: ${verification.reason}\n\nRaha misy olana dia mifandraisa amin'ny Admin.`);
            
            // Signal Admin
            await bot.telegram.sendMessage(ADMIN_ID, `🚫 **Paiement Refusé**\nUser: ${ctx.from.first_name}\nRaison: ${verification.reason}`);
        }

    } catch (error) {
        console.error("Erreur Gemini/Vision:", error);
        await ctx.reply("Nisy olana kely teo amin'ny famakiana ny sary. Avereno alefa azafady na maka sary mazava kokoa.");
    }
});

// --- 7. FAMPIANARANA TENY (TEXT & VOICE) ---

// Middleware: Ny hafatra rehetra miditra eto ambany dia voasivana (checkUserStatus)
bot.use(checkUserStatus);

// Handle Voice (Feo) sy Text (Soratra)
bot.on(['text', 'voice'], async (ctx) => {
    try {
        let userMessage = "";
        
        // Raha feo no alefany
        if (ctx.message.voice) {
            const fileLink = await bot.telegram.getFileLink(ctx.message.voice.file_id);
            const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
            const audioBuffer = Buffer.from(response.data);
            
            // Gemini 1.5 dia maheno feo mivantana
            // Mila ovaina kely ny prompt fa alefa miaraka amin'ny buffer ilay feo
            userMessage = "AUDIO_INPUT"; 
            
            // Prompt manokana ho an'ny feo
            const prompt = `
                Ilay mpianatra dia nandefa feo (audio). 
                Henoy tsara ilay feo. 
                Raha manao fanazaran-tena amin'ny teny (Anglais, Français, Allemand, na Italien) izy, dia valio amin'ny feo (soraty ny valiny dia hovakiako) na soratra.
                
                ZAVA-DEHIBE: 
                1. Fantaro hoe inona no fiteny ampiasainy.
                2. Ahitsio izy raha misy diso (grammaire na pronunciation).
                3. Ny fanazavana ny diso dia tsy maintsy amin'ny teny MALAGASY.
                4. Ny valiny (réponse pratique) dia amin'ny teny ianarana.
            `;
            
            const model = getGeminiModel();
            const result = await model.generateContent([
                prompt,
                { inlineData: { data: audioBuffer.toString("base64"), mimeType: "audio/ogg" } }
            ]);
            
            const replyText = result.response.text();
            await ctx.reply(replyText);
            return;

        } else {
            // Raha soratra
            userMessage = ctx.message.text;
        }

        // Prompt ho an'ny soratra
        const prompt = `
            You are a helpful language tutor bot for a Malagasy speaker.
            The user wants to practice: English, French, German, or Italian.
            
            User message: "${userMessage}"
            
            Instructions:
            1. Identify the language the user is trying to speak.
            2. Engage in a conversation in that language.
            3. If the user makes a mistake, correct them kindly.
            4. **CRITICAL**: Explain ALL corrections and grammar rules in **MALAGASY**.
            5. If the user speaks Malagasy, guide them to start practicing a language.
        `;

        const model = getGeminiModel();
        const result = await model.generateContent(prompt);
        const reply = result.response.text();

        await ctx.reply(reply);

    } catch (error) {
        console.error("Error Gemini Chat:", error);
        await ctx.reply("Miala tsiny, nisy olana kely tamin'ny fifandraisana. Andramo indray.");
    }
});

// --- 8. DEMARRAGE ---
bot.launch();

// Fikarakarana ny fampijanonana (Graceful stop)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));