// --- Keep alive ---
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT);

// =======================
// DEPENDENCIES
// =======================
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

// =======================
// ENV
// =======================
const BOT_TOKEN = process.env.BOT_TOKEN;
const AI_API_KEY = process.env.AI_API_KEY;
const ADMIN_ID = Number(process.env.ADMIN_ID);

// =======================
// BOT INIT
// =======================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userState = {};

// =======================
// DAILY LIMITER (REAL FIX)
// =======================
const dailyLimiter = new Map();

function today() {
  return new Date().toISOString().split('T')[0];
}

function canGenerate(id) {
  if (id === ADMIN_ID) return true;

  const key = `${id}_${today()}`;
  const used = dailyLimiter.get(key) || 0;

  if (used >= 3) return false;

  dailyLimiter.set(key, used + 1);
  return true;
}

// =======================
// START
// =======================
bot.onText(/\/start/, msg => {
  const id = msg.chat.id;

  bot.sendMessage(
    id,
`👋 *AI Discipline & Skills Bot*

Clean, realistic content.
No fake motivation. No hype.

🆓 Free: 3 posts/day  
💰 Paid: Higher limits + premium tone`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✍️ Generate Content', callback_data: 'generate' }]
        ]
      }
    }
  );
});

// =======================
// CALLBACKS
// =======================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const data = q.data;
  bot.answerCallbackQuery(q.id);

  userState[id] = userState[id] || {};

  // ----- GENERATE -----
  if (data === 'generate') {
    if (!canGenerate(id)) {
      return bot.sendMessage(
        id,
        `🚫 *Daily limit reached*

Free users can generate only 3 posts per day.`,
        { parse_mode: 'Markdown' }
      );
    }

    return bot.sendMessage(id, 'Choose platform:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'TELEGRAM', callback_data: 'platform_telegram' }]
        ]
      }
    });
  }

  // ----- PLATFORM -----
  if (data.startsWith('platform_')) {
    userState[id].platform = data.replace('platform_', '');
    return bot.sendMessage(id, 'Choose content type:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'MOTIVATION', callback_data: 'type_motivation' }],
          [{ text: 'QUOTE', callback_data: 'type_quote' }]
        ]
      }
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

  // ----- LANGUAGE → AI -----
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
      prompt += `\nWrite blunt, practical motivation.\nNo fluff. No inspiration talk.\n`;
    }

    if (type === 'quote') {
      prompt += `\nWrite ONE original quote.\nThen add 1–2 supporting lines.\n`;
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
    } catch (e) {
      console.error(e);
      return bot.sendMessage(id, 'AI busy. Try again later.');
    }
  }
});

console.log('✅ Bot running (Railway safe)');

// =======================
// PAYMENT FLOW (UNCHANGED)
// =======================
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

📸 Send your payment screenshot or transaction ID.`,
    { parse_mode: 'Markdown' }
  );
});

bot.on('message', msg => {
  const id = msg.chat.id;

  if (userState[id]?.awaitingPaymentProof && msg.photo) {
    bot.sendMessage(ADMIN_ID, `💰 Payment proof received from user: ${id}`);
    userState[id].awaitingPaymentProof = false;
    bot.sendMessage(id, `⏳ Proof received. Activation in progress.`);
  }
});

bot.onText(/\/approve (\d+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;

  const uid = Number(match[1]);
  paidUsers[uid] = { plan: 'monthly' };

  bot.sendMessage(
    uid,
    `✅ *Paid access activated*

You now have higher limits and premium content access.
Thank you for upgrading 🙌`,
    { parse_mode: 'Markdown' }
  );

  bot.sendMessage(msg.chat.id, `User ${uid} approved.`);
});

