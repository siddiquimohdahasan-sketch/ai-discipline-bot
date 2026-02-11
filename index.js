// ================= KEEP ALIVE =================
const http = require('http');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT);

// ================= IMPORTS =================
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const AI_API_KEY = process.env.AI_API_KEY;
const ADMIN_ID = Number(process.env.ADMIN_ID);

const DB_FILE = './db.json';

// ================= DATABASE =================
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
    db.users[id] = { credits: 3, date: today };
    saveDB(db);
  }

  return db.users[id].credits;
}

function useCredit(id) {
  const db = loadDB();
  if (db.users[id] && db.users[id].credits > 0) {
    db.users[id].credits -= 1;
    saveDB(db);
  }
}

// ================= BOT INIT =================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const paidUsers = {};
const isAdmin = id => id === ADMIN_ID;
const isPaid = id => paidUsers[id] || isAdmin(id);

// ================= START =================
bot.onText(/\/start/, msg => {
  bot.sendMessage(
    msg.chat.id,
`Story Creator Toolkit

Free: 3 Instagram emotional reel scripts per day
Paid: Multi-platform + Full emotional toolkit

Tap Generate to start.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Generate', callback_data: 'generate' }],
          [{ text: 'My Limit', callback_data: 'limit' }],
          [{ text: 'Paid Plan', callback_data: 'paid' }]
        ]
      }
    }
  );
});

// ================= CALLBACK =================
bot.on('callback_query', async q => {

  const id = q.message.chat.id;
  const data = q.data;
  bot.answerCallbackQuery(q.id);

  if (data === 'limit') {
    const credits = getCredits(id);
    return bot.sendMessage(id, `Free scripts left today: ${credits}`);
  }

  if (data === 'paid') {
    return bot.sendMessage(id,
`Paid Plan:
299 Monthly
999 Lifetime

Includes:
Instagram
Telegram
YouTube
Full emotional toolkit

Reply PAID to upgrade.`);
  }

  if (data === 'generate') {

    if (!isPaid(id)) {
      if (getCredits(id) <= 0) {
        return bot.sendMessage(id, 'Daily limit reached. Upgrade to continue.');
      }
    }

    const freePlatforms = [['Instagram', 'platform_instagram']];
    const paidPlatforms = [
      ['Instagram', 'platform_instagram'],
      ['Telegram', 'platform_telegram'],
      ['YouTube', 'platform_youtube']
    ];

    const buttons = isPaid(id) ? paidPlatforms : freePlatforms;

    return bot.sendMessage(id, 'Choose Platform:', {
      reply_markup: {
        inline_keyboard: buttons.map(p => [
          { text: p[0], callback_data: p[1] }
        ])
      }
    });
  }

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

  if (data.startsWith('lang_')) {

    const parts = data.split('_');
    const platform = parts[1];
    const language = parts[2];

    let prompt;

    if (!isPaid(id)) {

      prompt = `
Write a realistic emotional human story.
30-45 seconds length.
120-150 words.
No advice.
No marketing.
No growth tips.
No camera instructions.
No formatting symbols.
Language: ${language}
Platform tone: ${platform}

Output:
HOOK:
REEL SCRIPT:
ENDING:
`;

    } else {

      prompt = `
Write a realistic emotional human story.

No marketing.
No growth advice.
No explanation.
No camera directions.
No formatting symbols.
No markdown.

Language: ${language}
Platform tone: ${platform}

Output:

HOOK OPTION 1:
HOOK OPTION 2:
REEL SCRIPT:
ALTERNATE ENDING 1:
ALTERNATE ENDING 2:
CAPTION:
HASHTAGS:
LONG VERSION (200-300 words):
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

// ================= PAYMENT =================
bot.onText(/PAID/i, msg => {
  bot.sendMessage(msg.chat.id, 'Send payment screenshot to admin.');
});

bot.onText(/\/approve (\d+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;

  const uid = Number(match[1]);
  paidUsers[uid] = true;

  bot.sendMessage(uid, 'Paid access activated.');
  bot.sendMessage(msg.chat.id, `User ${uid} approved.`);
});

console.log('Story Creator Toolkit Bot Running');
