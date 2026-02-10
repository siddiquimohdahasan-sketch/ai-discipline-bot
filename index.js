const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const AI_API_KEY = process.env.AI_API_KEY;
const ADMIN_ID = Number(process.env.ADMIN_ID);

const DB_FILE = './db.json';

/* =====================
   DB HELPERS
===================== */

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function today() {
  return new Date().toISOString().split('T')[0];
}

/* =====================
   USER INIT
===================== */

function initUser(db, id) {
  if (!db.users[id]) {
    db.users[id] = {
      plan: 'free', // free | paid
      date: today(),
      used: 0
    };
  }

  if (db.users[id].date !== today()) {
    db.users[id].date = today();
    db.users[id].used = 0;
  }
}

/* =====================
   BOT INIT
===================== */

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start/, msg => {
  const id = msg.chat.id;
  const db = loadDB();

  initUser(db, id);
  saveDB(db);

  bot.sendMessage(
    id,
`👋 *AI Discipline & Skills Bot*

🆓 Free: 3 posts/day  
💰 Paid: Unlimited posts

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

/* =====================
   CALLBACKS
===================== */

bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const data = q.data;
  bot.answerCallbackQuery(q.id);

  const db = loadDB();
  initUser(db, id);
  const user = db.users[id];

  // ---- LIMIT INFO ----
  if (data === 'limit') {
    return bot.sendMessage(
      id,
`📊 *Your Plan*

Plan: ${user.plan.toUpperCase()}
Used today: ${user.used}/3

Upgrade for unlimited access.`,
      { parse_mode: 'Markdown' }
    );
  }

  // ---- PAID PLAN ----
  if (data === 'paid') {
    return bot.sendMessage(
      id,
`💼 *Paid Plans*

₹299 / month  
• Unlimited posts  
• Premium tone  

₹999 Lifetime  

Reply *PAID* to upgrade.`,
      { parse_mode: 'Markdown' }
    );
  }

  // ---- GENERATE ----
  if (data === 'generate') {

    if (user.plan === 'free' && user.used >= 3) {
      return bot.sendMessage(
        id,
`🚫 *Daily limit reached*

Free users can generate only 3 posts/day.
Reply *PAID* to upgrade.`,
        { parse_mode: 'Markdown' }
      );
    }

    bot.sendMessage(id, 'Generating… ⏳');

    /* ===== YOUR PROMPT (UNCHANGED) ===== */

    const prompt = `
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
• Maximum 3 short lines

Output format (STRICT):
• Exactly 3 lines
• One sentence per line
• No bullets, no numbers
• Stop after third line
`;

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

      // ✅ CREDIT CUT – ONLY HERE
      if (user.plan === 'free') {
        user.used += 1;
        saveDB(db);
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

/* =====================
   PAYMENT FLOW (SAME AS YOURS)
===================== */

// user sends PAID
bot.onText(/PAID/i, msg => {
  bot.sendMessage(
    msg.chat.id,
`💳 *Upgrade to Paid Access*

₹299 – Monthly  
₹999 – Lifetime  

📸 Send payment screenshot or transaction ID.
Admin will verify & activate.`
  );
});

// admin approval
bot.onText(/\/approve (\d+)/, msg => {
  if (msg.chat.id !== ADMIN_ID) return;

  const uid = msg.match[1];
  const db = loadDB();

  initUser(db, uid);
  db.users[uid].plan = 'paid';
  saveDB(db);

  bot.sendMessage(uid, '✅ Paid access activated.');
  bot.sendMessage(ADMIN_ID, `User ${uid} approved.`);
});

console.log('✅ Bot running with strict free-user control');
