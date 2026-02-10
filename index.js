const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const AI_API_KEY = process.env.AI_API_KEY;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const DB_FILE = './db.json';

/* ================= DB ================= */

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

function initUser(db, id) {
  if (!db.users[id]) {
    db.users[id] = { plan: 'free', used: 0, date: today() };
  }
  if (db.users[id].date !== today()) {
    db.users[id].date = today();
    db.users[id].used = 0;
  }
}

const isAdmin = id => id === ADMIN_ID;

/* ================= LIMITS ================= */

function dailyLimit(user, id) {
  if (isAdmin(id)) return 999999;
  if (user.plan === 'lifetime') return 999999;
  if (user.plan === 'monthly') return 20;
  return 3;
}

function allowedPlatforms(user, id) {
  if (isAdmin(id) || user.plan === 'lifetime')
    return ['telegram', 'whatsapp', 'instagram', 'twitter'];
  if (user.plan === 'monthly')
    return ['telegram', 'whatsapp', 'instagram'];
  return ['telegram'];
}

function allowedTypes(user, id) {
  if (isAdmin(id) || user.plan !== 'free')
    return ['motivation', 'quote', 'hooks'];
  return ['motivation', 'quote'];
}

/* ================= BOT ================= */

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userState = {};

bot.onText(/\/start/, msg => {
  const id = msg.chat.id;
  const db = loadDB();
  initUser(db, id);
  saveDB(db);

  bot.sendMessage(
    id,
`👋 *AI Discipline & Skills Bot*

🆓 Free: 3 posts/day  
💰 Monthly: 20 posts/day  
💎 Lifetime: Unlimited`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✍️ Generate', callback_data: 'generate' }],
          [{ text: '💰 Paid Plan', callback_data: 'paid' }]
        ]
      }
    }
  );
});

/* ================= CALLBACK ================= */

bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const data = q.data;
  bot.answerCallbackQuery(q.id);

  const db = loadDB();
  initUser(db, id);
  const user = db.users[id];

  /* ----- PAID INFO ----- */
  if (data === 'paid') {
    return bot.sendMessage(
      id,
`₹299 – Monthly (20/day, no Twitter)
₹999 – Lifetime (Unlimited, all platforms)

Reply *PAID* to upgrade.`,
      { parse_mode: 'Markdown' }
    );
  }

  /* ----- GENERATE (🔥 CREDIT CUT HERE 🔥) ----- */
  if (data === 'generate') {

    if (user.used >= dailyLimit(user, id)) {
      return bot.sendMessage(
        id,
`🚫 *Daily limit reached*

Upgrade to continue.`,
        { parse_mode: 'Markdown' }
      );
    }

    // 🔒 CUT CREDIT IMMEDIATELY
    if (!isAdmin(id)) {
      user.used += 1;
      saveDB(db);
    }

    const buttons = allowedPlatforms(user, id).map(p => [
      { text: p.toUpperCase(), callback_data: `platform_${p}` }
    ]);

    return bot.sendMessage(id, 'Choose platform:', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  /* ----- PLATFORM ----- */
  if (data.startsWith('platform_')) {
    userState[id] = { platform: data.replace('platform_', '') };

    const buttons = allowedTypes(user, id).map(t => [
      { text: t.toUpperCase(), callback_data: `type_${t}` }
    ]);

    return bot.sendMessage(id, 'Choose type:', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  /* ----- TYPE ----- */
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

  /* ----- LANGUAGE → AI ----- */
  if (data.startsWith('lang_')) {
    const lang = data.replace('lang_', '');
    const { platform, type } = userState[id];
    userState[id] = {};

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

Platform: ${platform}
Type: ${type}
Language: ${lang === 'indian' ? 'Indian English' : 'Global English'}

Output:
Exactly 3 lines.
Stop after third line.
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
      return bot.sendMessage(id, json.choices[0].message.content.trim());

    } catch (e) {
      // 🔁 ROLLBACK CREDIT IF AI FAILS
      if (!isAdmin(id)) {
        user.used -= 1;
        saveDB(db);
      }
      return bot.sendMessage(id, 'AI busy. Try later.');
    }
  }
});

/* ================= PAYMENT ================= */

bot.onText(/PAID/i, msg => {
  bot.sendMessage(msg.chat.id, 'Send payment proof.');
});

bot.onText(/\/approve (\d+) (monthly|lifetime)/, msg => {
  if (msg.chat.id !== ADMIN_ID) return;

  const uid = msg.match[1];
  const plan = msg.match[2];
  const db = loadDB();

  initUser(db, uid);
  db.users[uid].plan = plan;
  saveDB(db);

  bot.sendMessage(uid, `✅ ${plan.toUpperCase()} activated`);
});

console.log('✅ BOT RUNNING – FREE USERS LOCKED');

