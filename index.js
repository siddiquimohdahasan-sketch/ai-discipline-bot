// --- HTTP keep-alive server ---
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT);

// --- Imports ---
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

// --- ENV ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const AI_API_KEY = process.env.AI_API_KEY;
const ADMIN_ID = Number(process.env.ADMIN_ID);

// --- DB ---
const DB_FILE = './db.json';

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

// --- PLANS ---
const paidUsers = {}; // manual for now

const isAdmin = id => id === ADMIN_ID;

function dailyLimit(id) {
  if (isAdmin(id)) return 9999;
  if (paidUsers[id]) return paidUsers[id].plan === 'lifetime' ? 9999 : 20;
  return 3;
}

function getCredits(id) {
  const db = loadDB();
  const t = today();

  if (!db.users[id] || db.users[id].date !== t) {
    db.users[id] = { credits: dailyLimit(id), date: t };
    saveDB(db);
  }

  return db.users[id].credits;
}

function useCredit(id) {
  const db = loadDB();
  if (db.users[id]) {
    db.users[id].credits--;
    saveDB(db);
  }
}

// --- BOT ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userState = {};

// --- START ---
bot.onText(/\/start/, msg => {
  bot.sendMessage(
    msg.chat.id,
    `👋 *AI Discipline & Skills Bot*

🆓 Free: 3 posts/day  
💰 Paid: Higher limits

👇 Start`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✍️ Generate Content', callback_data: 'generate' }],
          [{ text: '💰 Paid Plan', callback_data: 'paid' }]
        ]
      }
    }
  );
});

// --- CALLBACKS ---
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const data = q.data;
  bot.answerCallbackQuery(q.id);

  if (data === 'paid') {
    return bot.sendMessage(
      id,
      `💼 *Paid Plans*

₹299 / month — 20 posts/day  
₹999 Lifetime — Unlimited

Reply *PAID* to upgrade.`,
      { parse_mode: 'Markdown' }
    );
  }

  if (data === 'generate') {
    const credits = isAdmin(id) ? 9999 : getCredits(id);

    if (credits <= 0 && !isAdmin(id)) {
      return bot.sendMessage(
        id,
        `🚫 *Daily limit reached*

Free users get 3 posts/day.`,
        { parse_mode: 'Markdown' }
      );
    }

    return bot.sendMessage(id, 'Choose language:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🇮🇳 Indian English', callback_data: 'lang_indian' }],
          [{ text: '🌍 Global English', callback_data: 'lang_global' }]
        ]
      }
    });
  }

  if (data.startsWith('lang_')) {
    const lang = data.replace('lang_', '');

    if (!isAdmin(id)) useCredit(id);

    const prompt = `
You are NOT an assistant.
Output ONLY final content.

Topic: discipline, effort, consistency, skills.

Write 2–4 short sharp lines.
No numbering. No fluff.

Language: ${lang === 'indian' ? 'Indian English' : 'Global English'}
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
          max_tokens: 120
        })
      });

      const json = await res.json();
      const text = json.choices[0].message.content.trim();

      return bot.sendMessage(
        id,
        `✍️ *Content Ready*\n\n${text}`,
        { parse_mode: 'Markdown' }
      );
    } catch {
      return bot.sendMessage(id, 'AI busy. Try again.');
    }
  }
});

// --- PAYMENT FLOW ---
bot.onText(/PAID/i, msg => {
  userState[msg.chat.id] = { pay: true };
  bot.sendMessage(msg.chat.id, 'Send payment screenshot.');
});

bot.on('message', msg => {
  if (userState[msg.chat.id]?.pay && msg.photo) {
    bot.sendMessage(ADMIN_ID, `💰 Payment proof from ${msg.chat.id}`);
    userState[msg.chat.id] = {};
    bot.sendMessage(msg.chat.id, '⏳ Verification in progress.');
  }
});

bot.onText(/\/approve (\d+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  paidUsers[match[1]] = { plan: 'monthly' };
  bot.sendMessage(match[1], '✅ Paid plan activated.');
});

console.log('✅ Bot running');
