// ================== KEEP ALIVE ==================
const http = require('http');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT);

// ================== IMPORTS ==================
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const AI_API_KEY = process.env.AI_API_KEY;
const ADMIN_ID = Number(process.env.ADMIN_ID);

const DB_FILE = './db.json';

// ================== DATABASE ==================
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

function getCredits(id) {
  const db = loadDB();
  const today = getToday();

  if (!db.users[id] || db.users[id].date !== today) {
    db.users[id] = {
      credits: 3,
      date: today
    };
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
  saveDB(db);
}

// ================== BOT INIT ==================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const paidUsers = {};
const isAdmin = id => id === ADMIN_ID;
const isPaid = id => paidUsers[id] || isAdmin(id);

// ================== START ==================
bot.onText(/\/start/, msg => {
  bot.sendMessage(
    msg.chat.id,
`🎬 Story Creator Toolkit

Create viral emotional reel scripts instantly.

🆓 Free: 3 Instagram reel scripts/day
💰 Paid: Multi-platform + Full Toolkit

Tap below to start.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Generate Script', callback_data: 'generate' }],
          [{ text: 'My Limit', callback_data: 'limit' }],
          [{ text: 'Paid Plan', callback_data: 'paid' }]
        ]
      }
    }
  );
});

// ================== CALLBACK ==================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const data = q.data;

  bot.answerCallbackQuery(q.id);

  // LIMIT
  if (data === 'limit') {
    const credits = getCredits(id);
    return bot.sendMessage(id, `You have ${credits} free scripts left today.`);
  }

  // PAID INFO
  if (data === 'paid') {
    return bot.sendMessage(id,
`💰 Paid Plan

₹299 / Month
₹999 Lifetime

Includes:
✔ Instagram
✔ Telegram
✔ YouTube
✔ Full Creator Toolkit

Reply PAID to upgrade.`);
  }

  // GENERATE
  if (data === 'generate') {

    if (!isPaid(id)) {
      const credits = getCredits(id);
      if (credits <= 0) {
        return bot.sendMessage(id, 'Daily limit reached. Upgrade to continue.');
      }
    }

    // Platform Selection
    const freePlatforms = [['Instagram', 'platform_instagram']];
    const paidPlatforms = [
      ['Instagram', 'platform_instagram'],
      ['Telegram', 'platform_telegram'],
      ['YouTube', 'platform_youtube']
    ];

    const buttons = isPaid(id)
      ? paidPlatforms
      : freePlatforms;

    return bot.sendMessage(id, 'Choose Platform:', {
      reply_markup: {
        inline_keyboard: buttons.map(p => [
          { text: p[0], callback_data: p[1] }
        ])
      }
    });
  }

  // PLATFORM SELECTED
  if (data.startsWith('platform_')) {
    const platform = data.replace('platform_', '');

    return bot.sendMessage(id, 'Choose Language:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Hindi', callback_data: `lang_${platform}_hindi` }],
          [{ text: 'English', callback_data: `lang_${platform}_english` }],
          [{ text: 'Hybrid', callback_data: `lang_${platform}_hybrid` }]
        ]
      }
    });
  }

  // LANGUAGE SELECTED
  if (data.startsWith('lang_')) {

    const parts = data.split('_');
    const platform = parts[1];
    const language = parts[2];

    let prompt;

    if (!isPaid(id)) {

      prompt = `
Write a 30-45 second emotional Instagram reel script.
120-150 words.
Strong hook.
One emotional ending.
Language: ${language}
Platform: ${platform}
No explanation.
`;

    } else {

      prompt = `
Create Full Creator Toolkit for ${platform}.

Language: ${language}

Include:
2 Hook Options
Reel Script
2 Alternate Endings
Caption
5 Hashtags
200-300 word long version

No explanation text.
`;
    }

    bot.sendMessage(id, 'Generating...');

    try {

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'mistralai/mistral-7b-instruct',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 700
        })
      });

      const json = await res.json();
      const text = json.choices[0].message.content.trim();

      if (!isPaid(id)) {
        useCredit(id);
      }

      return bot.sendMessage(id, `Content Ready:\n\n${text}`);

    } catch (err) {
      console.error(err);
      return bot.sendMessage(id, 'AI busy. Try again later.');
    }
  }
});

// ================== PAYMENT ==================
bot.onText(/PAID/i, msg => {
  bot.sendMessage(msg.chat.id,
'Send payment screenshot. Admin will activate your access.');
});

bot.onText(/\/approve (\d+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;

  const uid = Number(match[1]);
  paidUsers[uid] = true;

  bot.sendMessage(uid, 'Paid access activated.');
  bot.sendMessage(msg.chat.id, `User ${uid} approved.`);
});

console.log('🚀 Story Creator Toolkit Bot Running');
