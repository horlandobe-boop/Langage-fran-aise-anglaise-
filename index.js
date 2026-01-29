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

const firebaseConfig = {
  apiKey: "AIzaSyDbtw2NBkjWC5xs0BZ9mhK3FtxVeXfDGYE",
  authDomain: "autotrad-9e90b.firebaseapp.com",
  projectId: "autotrad-9e90b",
  storageBucket: "autotrad-9e90b.firebasestorage.app",
  messagingSenderId: "359414519740",
  appId: "1:359414519740:web:8c6b99de8769ad1dda3db9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const bot = new Telegraf(BOT_TOKEN);

// --- 2. GEMINI ENGINE ---
function getModel() {
    const key = GEMINI_API_KEYS[Math.floor(Math.random() * GEMINI_API_KEYS.length)];
    const genAI = new GoogleGenerativeAI(key);
    return genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
    });
}

// --- 3. HELPER FUNCTIONS ---
async function downloadAsBase64(ctx, fileId) {
    const link = await ctx.telegram.getFileLink(fileId);
    const res = await axios.get(link.href, { responseType: 'arraybuffer' });
    return Buffer.from(res.data).toString('base64');
}

async function checkUser(userId) {
    const userRef = doc(db, "users", String(userId));
    const snap = await getDoc(userRef);
    const now = moment().tz("Indian/Antananarivo");

    if (!snap.exists()) {
        const trialEnd = now.clone().add(2, 'days');
        await setDoc(userRef, { status: 'trial', expiryDate: trialEnd.toISOString(), language: 'Anglais' });
        return { valid: true, msg: "Faly miarahaba anao! Manana 2 andro maimaim-poana ianao." };
    }
    const data = snap.data();
    if (now.isAfter(moment(data.expiryDate))) return { valid: false };
    return { valid: true, msg: "" };
}

// --- 4. CORE HANDLER ---
bot.on(['text', 'voice', 'photo'], async (ctx) => {
    const userId = ctx.from.id;
    const sub = await checkUser(userId);
    const now = moment().tz("Indian/Antananarivo");

    // Raha expired ary tsy mandefa sary (porofo)
    if (!sub.valid && !ctx.message.photo) {
        return ctx.replyWithMarkdown(`🛑 **Tapitra ny fotoana fanandramana.**\n\nAlefaso **2000ar** amin'ny laharana:\n**0323911654** (RAVELOMANANTSOA URMIN)\n\nAvy eo, alefaso eto ny sary (Capture d'écran) porofon'ny fandefasana vola.`);
    }

    try {
        await ctx.sendChatAction('typing');
        const model = getModel();
        let promptParts = [];

        // CASE: PAYMENT VERIFICATION
        if (ctx.message.photo && !sub.valid) {
            const b64 = await downloadAsBase64(ctx, ctx.message.photo[ctx.message.photo.length - 1].file_id);
            const verifyPrompt = `
                Ianao dia mpanamarina vola (Auditor). Jereo ity sary ity.
                Ora ankehitriny: ${now.format("YYYY-MM-DD HH:mm")}.
                
                Fepetra:
                1. Ny laharana nandefasana: "0323911654".
                2. Ny montant: 2000 Ar na mihoatra.
                3. Ny daty sy ora: Mila latsaky ny 15 minitra ny elanelana amin'ny ora ankehitriny.
                4. Mitady "Transaction ID" na "Référence".
                
                Valio JSON fotsiny (strictly JSON):
                {
                    "valid": boolean,
                    "tx_id": "string_or_null",
                    "reason": "hazavao amin'ny teny malagasy raha misy diso"
                }
            `;
            const result = await model.generateContent([{ inlineData: { data: b64, mimeType: "image/jpeg" } }, { text: verifyPrompt }]);
            const responseText = result.response.text();
            
            try {
                const cleanJson = responseText.substring(responseText.indexOf('{'), responseText.lastIndexOf('}') + 1);
                const analysis = JSON.parse(cleanJson);
                
                if (analysis.valid && analysis.tx_id) {
                    const txRef = doc(db, "transactions", analysis.tx_id);
                    const txSnap = await getDoc(txRef);
                    if (txSnap.exists()) return ctx.reply("❌ Efa nampiasaina io Transaction ID io. Refusé.");
                    
                    await updateDoc(doc(db, "users", String(userId)), { status: 'premium', expiryDate: now.clone().add(30, 'days').toISOString() });
                    await setDoc(txRef, { userId, date: now.toISOString() });
                    return ctx.reply("✅ Ekena ny fandoavam-bola! Afaka manohy mianatra mandritra ny 30 andro ianao.");
                } else {
                    return ctx.reply(`❌ Refusé: ${analysis.reason}`);
                }
            } catch (e) {
                return ctx.reply("❌ Tsy voavaky ny sary na nisy diso. Avereno alefa ny sary mazava tsara.");
            }
        }

        // CASE: NORMAL LEARNING (TEXT, VOICE, PHOTO)
        const userSnap = await getDoc(doc(db, "users", String(userId)));
        const targetLang = userSnap.exists() ? userSnap.data().language : 'Anglais';
        
        promptParts.push({ text: `You are a language tutor teaching ${targetLang}. The user speaks Malagasy. If they make a mistake, explain it in Malagasy.` });

        if (ctx.message.photo) {
            const b64 = await downloadAsBase64(ctx, ctx.message.photo[ctx.message.photo.length - 1].file_id);
            promptParts.push({ inlineData: { data: b64, mimeType: "image/jpeg" } });
            promptParts.push({ text: "Hazavao ity sary ity mba hianarako fiteny." });
        } else if (ctx.message.voice) {
            const b64 = await downloadAsBase64(ctx, ctx.message.voice.file_id);
            promptParts.push({ inlineData: { data: b64, mimeType: "audio/ogg" } });
        } else {
            promptParts.push({ text: ctx.message.text });
        }

        const result = await model.generateContent({ contents: [{ role: "user", parts: promptParts }] });
        await ctx.reply(result.response.text());

    } catch (err) {
        console.error(err);
        await ctx.reply("⚠️ Miala tsiny, somary sahirana ny tambajotra. Avereno kely ny hafatrao.");
    }
});

// --- 5. COMMANDS ---
bot.command('start', async (ctx) => {
    const sub = await checkUser(ctx.from.id);
    ctx.reply(sub.msg || "Inona ny taranja hianarantsika?", Markup.keyboard([['🇬🇧 Anglais', '🇫🇷 Français'], ['🇩🇪 Allemagne', '🇮🇹 Italienne']]).resize());
});

bot.hears(['🇬🇧 Anglais', '🇫🇷 Français', '🇩🇪 Allemagne', '🇮🇹 Italienne'], async (ctx) => {
    const lang = ctx.message.text.split(' ')[1];
    await updateDoc(doc(db, "users", String(ctx.from.id)), { language: lang });
    ctx.reply(`D'accord! Hianatra ${lang} isika izao.`);
});

// --- 6. SERVER & CRON ---
const appExpress = express();
appExpress.get('/', (req, res) => res.send('Bot Active'));
appExpress.get('/keep-alive', (req, res) => res.status(200).send('OK'));
appExpress.listen(process.env.PORT || 3000);

bot.launch().then(() => console.log("Bot Gemini Full Ready!"));
