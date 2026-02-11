// --- Render keep-alive server (MUST be at top) ---
const http = require('http');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT, () => {
  // console.log(`🌐 HTTP server running on port ${PORT}`);
});

const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');
const DB_FILE = './db.json';

// load database
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

// save database
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/* =======================
   🔑 CONFIGURATION
======================= */

const BOT_TOKEN = process.env.BOT_TOKEN;
const AI_API_KEY = process.env.AI_API_KEY;

// 👑 ADMIN ID (numeric)
const ADMIN_ID =Number(process.env.ADMIN_ID);

/* =======================
   USER PLANS (MANUAL)
======================= */

const paidUsers = {
  // 987654321: { plan: 'monthly' },
  // 112233445: { plan: 'lifetime' }
};

/* =======================
   BOT INIT
======================= */

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userState = {};
const userCredits = {};

/* =======================
   HELPERS
======================= */

const isAdmin = id => id === ADMIN_ID;

const dailyLimit = id => {
  if (isAdmin(id)) return 9999;
  if (paidUsers[id]) return paidUsers[id].plan === 'lifetime' ? 9999 : 20;
  return 3;
};
function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getUserCredits(id) {
  const db = loadDB();
  const today = getToday();

  // user pehli baar aaya
  if (!db.users[id]) {
    db.users[id] = {
      credits: dailyLimit(id),
      date: today
    };
    saveDB(db);
  }

  // naya din shuru hua
  if (db.users[id].date !== today) {
    db.users[id].credits = dailyLimit(id);
    db.users[id].date = today;
    saveDB(db);
  }

  return db.users[id].credits;
}

function useCredit(id) {
  const db = loadDB();

  if (!db.users[id]) return;

  if (db.users[id].credits > 0) {
    db.users[id].credits -= 1;
  }

  // credit kabhi negative nahi jayega
  if (db.users[id].credits < 0) {
    db.users[id].credits = 0;
  }

  saveDB(db);
}

const platformsAllowed = id => {
  if (isAdmin(id) || paidUsers[id]) {
    return ['telegram', 'instagram', 'youtube'];
  }
  return ['telegram', 'instagram'];
};

const typesAllowed = id => {
  return ['reel'];
};

/* =======================
   START
======================= */

bot.onText(/\/start/, msg => {
  const id = msg.chat.id;
  userCredits[id] = dailyLimit(id);

  bot.sendMessage(
    id,
    `👋 AI Story Creator Toolkit

Create viral emotional reel scripts in seconds.

🆓 Free: 3 scripts/day
💰 Paid: Full Creator Toolkit access

👇 Tap below to start`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✍️ Generate Content', callback_data: 'generate' }],
          [
            { text: '📊 My Limit', callback_data: 'limit' },
            { text: '💰 Paid Plan', callback_data: 'paid' }
          ]
        ]
      }
    }
  );
});

/* =======================
   CALLBACKS
======================= */

bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const data = q.data;

  bot.answerCallbackQuery(q.id);
  userState[id] = userState[id] || {};

  // ---------- LIMIT INFO ----------
  if (data === 'limit') {
    return bot.sendMessage(
      id,
      `ℹ️ *Plan info*

You’re on the free plan.

Upgrade to unlock:
• Higher daily limits
• Multiple platforms
• Premium writing`,
      { parse_mode: 'Markdown' }
    );
  }
}
  // ---------- PAID PLANS ----------
  if (data === 'paid') {
    return bot.sendMessage(
      id,
      `💼 *Paid Plans*

₹299 / month  
• 20 posts/day  
• Premium writing  

₹999 Lifetime  
• Unlimited posts  
• All platforms

Reply *PAID* to upgrade.`,
      { parse_mode: 'Markdown' }
    );
  }

  // ---------- GENERATE ----------
if (data === 'generate') {

  const creditsLeft = isAdmin(id) ? 9999 : getUserCredits(id);

  if (creditsLeft <= 0 && !isAdmin(id)) {
    return bot.sendMessage(
      id,
      `🚫 *Daily limit reached*

Free users can generate only 3 posts per day.
Reply *PAID* to upgrade.`,
      { parse_mode: 'Markdown' }
    );
  }

  const buttons = platformsAllowed(id).map(p => [
    { text: p.toUpperCase(), callback_data: `platform_${p}` }
  ]);

  return bot.sendMessage(id, 'Choose platform:', {
    reply_markup: { inline_keyboard: buttons }
  });
}

  // ---------- PLATFORM ----------
  if (data.startsWith('platform_')) {
    userState[id].platform = data.replace('platform_', '');

    const buttons = typesAllowed(id).map(t => [
      { text: t.toUpperCase(), callback_data: `type_${t}` }
    ]);

    return bot.sendMessage(id, 'Choose content type:', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // ---------- TYPE ----------
  if (data.startsWith('type_')) {
    userState[id].type = data.replace('type_', '');

    return bot.sendMessage(id, 'Choose language:', {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🇮🇳 Hindi', callback_data: 'lang_hindi' }],
      [{ text: '🌍 English', callback_data: 'lang_english' }],
      [{ text: '🔥 Hybrid (Hindi + English)', callback_data: 'lang_hybrid' }]
    ]
  }
});
  }

  // ---------- LANGUAGE → AI CALL ----------
  const creditsLeft = isAdmin(id) ? 9999 : getUserCredits(id);

if (creditsLeft <= 0 && !isAdmin(id)) {
  return bot.sendMessage(
    id,
    `🚫 *Daily limit reached*

Free users can generate only 3 posts per day.
Come back tomorrow or reply *PAID* to upgrade.`,
    { parse_mode: 'Markdown' }
  );
}

  if (data.startsWith('lang_')) {

  const lang = data.replace('lang_', '');
  userState[id] = {};

  const isPaid = paidUsers[id] || isAdmin(id);

  let prompt;

  if (!isPaid) {

    // FREE VERSION
    prompt = `
You are a professional short-form emotional story writer.

Write a 30–45 second Reel Script.

Rules:
• 120–150 words
• Strong emotional hook (first 2 lines)
• Realistic situation
• No fantasy
• No advice tone
• Simple human language
• One emotional ending
• No hashtags
• No emojis
• No markdown
• No explanations

Language mode:
${lang === 'hindi' ? 'Write fully in Hindi.' :
  lang === 'english' ? 'Write fully in clean English.' :
  'Hook in Hindi, story in English, ending mixed Hindi-English.'}

Output format:

HOOK:
...

REEL SCRIPT:
...

ENDING:
...
`;

  } else {

    // PAID CREATOR TOOLKIT VERSION
    prompt = `
You are a viral emotional Reel Script writer for content creators.

Do NOT explain.
Do NOT give video instructions.
Do NOT use markdown.
Only output clean text.

Create a complete Creator Toolkit.

Language mode:
${lang === 'hindi' ? 'Write fully in Hindi.' :
  lang === 'english' ? 'Write fully in clean English.' :
  'Hook in Hindi, body in English, ending mixed Hindi-English.'}

Output format:

HOOK OPTION 1:
...

HOOK OPTION 2:
...

REEL SCRIPT:
...

ALTERNATE ENDING 1:
...

ALTERNATE ENDING 2:
...

CAPTION:
...

HASHTAGS:
#...

LONG VERSION:
(200–300 word expanded emotional version)
`;
  }

  bot.sendMessage(id, 'Generating… ⏳');

  try {

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct',
        messages: [{ role: 'system', content: prompt }],
        max_tokens: 600
      })
    });

    const json = await res.json();
    const text = json.choices[0].message.content.trim();

    if (!isAdmin(id)) {
      useCredit(id);
    }

    return bot.sendMessage(id, `✍️ Content Ready\n\n${text}`);

  } catch (e) {
    console.error(e);
    return bot.sendMessage(id, 'AI busy. Try again later.');
  }
}

console.log('✅ AI Discipline & Skills Bot Running...');
// ===== PAYMENT PROOF FLOW =====

// user sends PAID
bot.onText(/PAID/i, msg => {
  const id = msg.chat.id;

  userState[id] = { awaitingPaymentProof: true };

  bot.sendMessage(
    id,
    `💳 *Upgrade to Paid Access*

Unlock higher daily limits and premium-quality content.

💰 *Plans*
₹299 – Monthly  
₹999 – Lifetime  

📸 Send your payment screenshot or transaction ID.

⚠️ Only payments made to our official account are accepted.
Fake or unrelated screenshots will be ignored.

Your access will be activated after verification.`
  );
});


// receive screenshot
bot.on('message', msg => {
  const id = msg.chat.id;

  if (userState[id]?.awaitingPaymentProof && msg.photo) {

    // notify admin
    bot.sendMessage(
      ADMIN_ID,
      `💰 Payment proof received from user: ${id}`
    );

    userState[id].awaitingPaymentProof = false;

    bot.sendMessage(
      id,
      `⏳ Proof received. Activation in progress.`
    );
  }
});


// admin approve command
bot.onText(/\/approve (\d+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;

  const uid = Number(match[1]);

  paidUsers[uid] = { plan: 'monthly' };

  bot.sendMessage(
  uid,
  `✅ *Paid access activated*

You now have higher limits and premium content access.
Thank you for upgrading 🙌`
);
  bot.sendMessage(msg.chat.id, `User ${uid} approved.`);
});


















