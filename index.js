import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import FormData from "form-data";
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

dotenv.config();

/* ================= TELEGRAM ================= */
const BOT_TOKEN = "8505202299:AAHkmuoq3Mlqn7VZw_pupLG4FT76Qr4HBeo";
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const ADMIN_ID = 8207051152;

/* ================= GEMINI KEYS ================= */
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
  process.env.GEMINI_KEY_10 || "AIzaSyCgivxeIowWSnoZ_WhlmarA3J3djW2g84A"
];

let geminiIndex = 0;
function getGeminiKey() {
  geminiIndex = (geminiIndex + 1) % GEMINI_API_KEYS.length;
  return GEMINI_API_KEYS[geminiIndex];
}

/* ================= FIREBASE ================= */
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ================= HELPERS ================= */
function now() {
  return Date.now();
}

function twoDaysPassed(start) {
  return now() - start > 2 * 24 * 60 * 60 * 1000;
}

function thirtyDaysPassed(start) {
  return now() - start > 30 * 24 * 60 * 60 * 1000;
}

/* ================= GEMINI TEXT ================= */
async function geminiText(prompt) {
  const key = getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`;

  const res = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }]
  });

  return res.data.candidates[0].content.parts[0].text;
}

/* ================= GEMINI IMAGE CHECK ================= */
async function verifyPaymentWithGemini(imageUrl) {
  const prompt = `
  Jereo ity sary paiement ity:
  - Montant tokony ho 2000 Ar
  - Numéro tokony ho 0323911654
  - Date androany ihany
  - Heure tsy mihoatra ny 15 minutes
  - ID transaction tsy miverimberina

  Valio hoe ACCEPTED na REFUSED miaraka amin'ny antony amin'ny teny Malagasy.
  `;

  const key = getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${key}`;

  const res = await axios.post(url, {
    contents: [{
      parts: [
        { text: prompt },
        { image_url: { url: imageUrl } }
      ]
    }]
  });

  return res.data.candidates[0].content.parts[0].text;
}

/* ================= BOT LOGIC ================= */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userRef = doc(db, "users", String(chatId));
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      createdAt: now(),
      trialStart: now(),
      paid: false
    });

    return bot.sendMessage(
      chatId,
      "Tongasoa 😊 Manana fanandramana 2 andro ianao.\nAfaka manao pratique Anglais, Français, Allemand, Italienne (écrit & vocal)."
    );
  }

  const user = snap.data();

  if (!user.paid && twoDaysPassed(user.trialStart)) {
    return bot.sendMessage(
      chatId,
      `⛔ Tapitra ny fanandramana.

💰 Paiement: 2000 Ar / mois
📞 Numéro: 0323911654
👤 Nom: RAVELOMANANTSOA URMIN

Alefaso ny sary preuve paiement azafady.`
    );
  }

  if (user.paid && thirtyDaysPassed(user.paidAt)) {
    await updateDoc(userRef, { paid: false });
    return bot.sendMessage(chatId, "⛔ Tapitra ny abonnement. Avereno ny paiement azafady.");
  }

  if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const file = await bot.getFile(fileId);
    const imageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const result = await verifyPaymentWithGemini(imageUrl);

    if (result.includes("ACCEPTED")) {
      await updateDoc(userRef, {
        paid: true,
        paidAt: now()
      });

      return bot.sendMessage(chatId, "✅ Ekena ny paiement. Afaka mampiasa indray mandritra ny 30 andro 🎉");
    } else {
      return bot.sendMessage(chatId, "❌ Refuser ny paiement:\n" + result);
    }
  }

  if (msg.text) {
    const reply = await geminiText(
      `Valio amin'ny teny Malagasy, fanazavana tsotra raha misy diso.
      Matière: Anglais, Français, Allemand, Italienne.
      Fanontaniana: ${msg.text}`
    );
    return bot.sendMessage(chatId, reply);
  }
});

console.log("🤖 Bot Telegram mandeha tsara...");
