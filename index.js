// --- Render / Railway keep-alive server ---
const http = require('http');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');

const DB_FILE = './db.json';

/* =======================
   DATABASE HELPERS
======================= */

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

/* =======================
   CONFIG
======================= */

const BOT_TOKEN = process.env.BOT_TOKEN;
const AI_API_KEY = process.env.AI_API_KEY;
const ADMIN_ID = Number(process.env.ADMIN_ID);

/* =======================
   BOT INIT
======================= */

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userState = {};

/* =======================
   PLANS & LIMITS
======================= */

const paidUsers = {}; // approved users only

const isAdmin = id => Number(id) === ADMIN_ID;

const dailyLimit = id => {
  if (isAdmin(id)) return 9999;
  if (paidUsers[id]) return paidUsers[id].plan === 'lifetime' ? 9999 : 20;
  return 3;
};

/* =======================
   CREDIT SYSTEM (ONLY DB)
======================= */

function getUserCredits(id) {
  const db = loadDB();
  const today = getToday();

  if (!db.users[id] || db.users[id].date !== today) {
    db.users[id] = {
      credits: dailyLimit(id),
      date: today
    };
    saveDB(db);
  }

  return db.users[id].credits;
}

function useCredit(id) {
  const db = loadDB();
  if (db.users[id]) {
    db.users[id].credits -= 1;
    saveDB(db);
  }
}

/* =======================
   ALLOWED OPTIONS
======================= */

const platformsAllowed = id => {
  if (isAdmin(id)) return ['telegram', 'whatsapp', 'instagram', 'twitter'];
  if (paidUsers[id]) return ['telegram', 'whatsapp', 'instagram'];
  return ['telegram'];
};

const typesAllowed = id => {
  if (isAdmin(id) || paidUsers[id]) return ['motivation', 'quote', 'hooks'];
  return ['motivation', 'quote'];
};

/* =======================
   /START
======================= */

bot.onText(/\/start/, msg => {
  const id = msg.chat.id;

  // ensure user exists in DB
  getUserCredits(id);

  bot.sendMessage(
    id,
    `👋 *AI Discipline & Skills Bot*

Clean, realistic content.
No fake motivation. No hype.

🆓 Free: 3 posts/day  
💰 Paid: Higher limits + premium tone

👇 Start generating`,
    {
      parse_mode: 'Markdown',
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

  // ----- LIMIT -----
  if (data === 'limit') {
    const left = isAdmin(id) ? 'Unlimited' : getUserCredits(id);
    return bot.sendMessage(
      id,
      `📊 *Today’s remaining posts:* ${left}`,
      { parse_mode: 'Markdown' }
    );
  }

  // ----- PAID -----
  if (data === 'paid') {
    return bot.sendMessage(
      id,
      `💼 *Paid Plans*

₹299 / month – 20 posts/day  
₹999 Lifetime – Unlimited

Reply *PAID* to upgrade.`,
      { parse_mode: 'Markdown' }
    );
  }

  // ----- GENERATE -----
  if (data === 'generate') {
    const creditsLeft = isAdmin(id) ? 9999 : getUserCredits(id);

    console.log(
      '[DEBUG]',
      'User:', id,
      'Admin:', isAdmin(id),
      'Credits:', creditsLeft
    );

    if (!isAdmin(id) && creditsLeft <= 0) {
      return bot.sendMessage(
        id,
        `🚫 *Daily limit reached*

You’ve used all free posts today.
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

  // ----- PLATFORM -----
  if (data.startsWith('platform_')) {
    userState[id].platform = data.replace('platform_', '');

    const buttons = typesAllowed(id).map(t => [
      { text: t.toUpperCase(), callback_data: `type_${t}` }
    ]);

    return bot.sendMessage(id, 'Choose content type:', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // ----- TYPE -----
  if (data.startsWith('type_')) {
    userState[id].type = data.replace('type_', '');

    return bot.sendMessage(id, 'Choose language:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🇮🇳 Indian English', callback_data: 'lang_indian' }],
          [{ text: '🌍 Global English', callback_data: 'lang_global' }]
        ]
      }
    });
  }

  // ----- LANGUAGE → PROMPT CONTINUES IN PART-2 -----

if (data.startsWith('lang_')) {
    const lang = data.replace('lang_', '');
    const { platform, type } = userState[id];
    userState[id] = {};

    let prompt = `
You are NOT an assistant.
You do NOT explain.
You output ONLY final post-ready content.

Topic scope (STRICT):
discipline, effort, consistency, skills, self-improvement.

Money is allowed ONLY as an outcome of discipline and skills.
Do NOT promise money.
Do NOT mention income numbers.
Do NOT sell anything.

Writing style:
• Short, sharp sentences
• Truth-based, not inspirational
• Slightly bold, realistic tone
• Human, modern voice

Guidelines:
• Write like someone sharing a hard-earned realization
• No teaching, no advising, no explaining
• Avoid overused motivational phrases
• Avoid poetic or textbook-style language
• If a line sounds like advice, rewrite it as an observation
• Maximum 3 short lines (except hooks)

Platform: ${platform}
Language: ${lang === 'indian' ? 'Indian English' : 'Global English'}
Output format (STRICT):
• Write exactly 3 lines.
• Each line must be one short sentence.
• No numbering.
• No bullet points.
• No extra lines or spacing.
• Stop after the third line.
Stop after the third line.

Formatting rules:
Each line must be on a new line.
Use line breaks between lines.
Do not merge lines.
Do not use quotation marks. Never wrap output in quotes.
`;

  if (type === 'motivation') {
      prompt += `
Write blunt, practical motivation.
No fluff. No inspiration talk.
`;
    }

    if (type === 'quote') {
      prompt += `
Write ONE original quote.
Then add 1–2 supporting lines.
`;
    }

    if (type === 'hooks') {
      prompt += `
Write 3 short hook-style thoughts.
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
          max_tokens: 160
        })
      });

      const json = await res.json();
      const text = json.choices[0].message.content.trim();

      // ✅ CREDIT CUT — ONLY HERE
      if (!isAdmin(id)) {
        useCredit(id);
      }

      return bot.sendMessage(
        id,
        `✍️ *Content Ready*\n\n${text}`,
        { parse_mode: 'Markdown' }
      );

    } catch (e) {
      console.error(e);
      return bot.sendMessage(id, 'AI busy. Try again later.');
    }
  }
});

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





















