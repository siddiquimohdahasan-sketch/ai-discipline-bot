// --- Render keep-alive server (MUST be at top) ---
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

const platformsAllowed = id => {
  if (isAdmin(id)) return ['telegram', 'whatsapp', 'instagram', 'twitter'];
  if (paidUsers[id]) {
    return paidUsers[id].plan === 'lifetime'
      ? ['telegram', 'whatsapp', 'instagram', 'twitter']
      : ['telegram', 'whatsapp', 'instagram'];
  }
  return ['telegram'];
};

const typesAllowed = id => {
  if (isAdmin(id) || paidUsers[id]) return ['motivation', 'quote', 'hooks'];
  return ['motivation', 'quote'];
};

/* =======================
   START
======================= */

bot.onText(/\/start/, msg => {
  const id = msg.chat.id;
  userCredits[id] = dailyLimit(id);

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

    if (userCredits[id] <= 0 && !isAdmin(id)) {
      return bot.sendMessage(
        id,
        `🚫 *Daily limit reached*

You’ve used all your free posts for today.
Upgrade to continue.`,
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
          [{ text: '🇮🇳 Indian English', callback_data: 'lang_indian' }],
          [{ text: '🌍 Global English', callback_data: 'lang_global' }]
        ]
      }
    });
  }

  // ---------- LANGUAGE → AI CALL ----------
  if (data.startsWith('lang_')) {
    const lang = data.replace('lang_', '');
    const { platform, type } = userState[id];
    userState[id] = {};

    if (!isAdmin(id)) userCredits[id]--;

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
Each hook must present a contrast, tension, or uncomfortable truth.
No motivational advice.
Each hook should be standalone and scroll-stopping.
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

      let footer = '';
      if (!paidUsers[id] && !isAdmin(id)) {
        footer = `\n\n—\nGenerated by @YourBotName`;
      }

     return bot.sendMessage(
  id,
  `✍️ *Content Ready*\n\n${text}${footer}`,
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
    `💳 Please send your payment screenshot or transaction ID.

After verification, your paid plan will be activated.`
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

  bot.sendMessage(uid, `✅ Your paid plan is now active.`);
  bot.sendMessage(msg.chat.id, `User ${uid} approved.`);
});










