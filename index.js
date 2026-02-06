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
const paidUsers = {}; // manual approve for now
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

// --- BOT INIT ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userState = {};

// --- HELPERS ---
const platformsAllowed = id => {
  if (isAdmin(id)) return ['telegram', 'whatsapp', 'instagram', 'twitter'];
  if (paidUsers[id]) return ['telegram', 'whatsapp', 'instagram', 'twitter'];
  return ['telegram'];
};

const typesAllowed = id => {
  if (isAdmin(id) || paidUsers[id]) return ['motivation', 'quote', 'hooks'];
  return ['motivation', 'quote'];
};

// --- START ---
bot.onText(/\/start/, msg => {
  const id = msg.chat.id;

  bot.sendMessage(
    id,
    `👋 *AI Discipline & Skills Bot*

🆓 Free: 3 posts/day  
💰 Paid: Higher limits

👇 Start below`,
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

// --- CALLBACKS ---
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const data = q.data;
  bot.answerCallbackQuery(q.id);

  // ---- LIMIT INFO ----
  if (data === 'limit') {
    const credits = isAdmin(id) ? 'Unlimited' : getCredits(id);
    return bot.sendMessage(
      id,
      `📊 *Your Limit*

Remaining today: *${credits}*`,
      { parse_mode: 'Markdown' }
    );
  }

  // ---- PAID ----
  if (data === 'paid') {
    return bot.sendMessage(
      id,
      `💼 *Paid Plans*

₹299 / month  
• 20 posts/day  

₹999 Lifetime  
• Unlimited posts  

Reply *PAID* to upgrade.`,
      { parse_mode: 'Markdown' }
    );
  }

  // ---- GENERATE ----
  if (data === 'generate') {
    const credits = isAdmin(id) ? 9999 : getCredits(id);

    if (credits <= 0 && !isAdmin(id)) {
      return bot.sendMessage(
        id,
        `🚫 *Daily limit reached*

Free users get only 3 posts/day.`,
        { parse_mode: 'Markdown' }
      );
    }

    userState[id] = {};

    const buttons = platformsAllowed(id).map(p => [
      { text: p.toUpperCase(), callback_data: `platform_${p}` }
    ]);

    return bot.sendMessage(id, 'Choose platform:', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // ---- PLATFORM ----
  if (data.startsWith('platform_')) {
    userState[id].platform = data.replace('platform_', '');

    const buttons = typesAllowed(id).map(t => [
      { text: t.toUpperCase(), callback_data: `type_${t}` }
    ]);

    return bot.sendMessage(id, 'Choose content type:', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // ---- TYPE ----
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

  // ---- LANGUAGE → AI ----
  if (data.startsWith('lang_')) {
    const lang = data.replace('lang_', '');
    const { platform, type } = userState[id];
    userState[id] = {};

    if (!isAdmin(id)) useCredit(id);

    let prompt = `
You are NOT an assistant.
Output ONLY final post-ready content.

Topic: discipline, effort, consistency, skills.
Write 2–4 short sharp lines.

Platform: ${platform}
Language: ${lang === 'indian' ? 'Indian English' : 'Global English'}
`;

    if (type === 'hooks') {
      prompt += `Write 3 short hook-style thoughts.`;
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

      return bot.sendMessage(
        id,
        `✍️ *Content Ready*\n\n${text}`,
        { parse_mode: 'Markdown' }
      );
    } catch {
      return bot.sendMessage(id, 'AI busy. Try again later.');
    }
  }
});

// --- PAYMENT FLOW ---
bot.onText(/PAID/i, msg => {
  userState[msg.chat.id] = { awaitingPaymentProof: true };
  bot.sendMessage(msg.chat.id, '💳 Send payment screenshot or TXN ID.');
});

bot.on('message', msg => {
  const id = msg.chat.id;
  if (userState[id]?.awaitingPaymentProof && msg.photo) {
    bot.sendMessage(ADMIN_ID, `💰 Payment proof received from ${id}`);
    userState[id] = {};
    bot.sendMessage(id, '⏳ Verification in progress.');
  }
});

bot.onText(/\/approve (\d+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  paidUsers[match[1]] = { plan: 'monthly' };
  bot.sendMessage(match[1], '✅ Paid plan activated.');
});

console.log('✅ AI Discipline & Skills Bot Running...');
