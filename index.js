const { Telegraf, Scenes, session } = require("telegraf");
const OpenAI = require("openai");
const userHistories = {}; // userHistories[userId] = [ { role, content } ]
require("dotenv").config();

// Если не подключён node-fetch:
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// GPT через OpenRouter
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// FSM-сцена анкеты
const askScene = new Scenes.WizardScene(
  "ask-scene",
  (ctx) => {
    ctx.reply("👋 Как тебя зовут?");
    return ctx.wizard.next();
  },
  (ctx) => {
    ctx.wizard.state.name = ctx.message.text;
    ctx.reply("📚 Какой у тебя уровень английского сейчас?\n\nA0 — с нуля\nA1 — немного понимаю\nA2 — могу говорить простыми фразами\nB1+ — свободно общаюсь");
    return ctx.wizard.next();
  },
  (ctx) => {
    ctx.wizard.state.level = ctx.message.text;
    ctx.reply("🎯 Зачем тебе английский? (работа, учёба, путешествия, эмиграция и т.п.)");
    return ctx.wizard.next();
  },
  (ctx) => {
    ctx.wizard.state.goal = ctx.message.text;
    ctx.reply("⏰ Когда тебе удобно заниматься? (утро / день / вечер)");
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.time = ctx.message.text;
    const { name, level, goal, time } = ctx.wizard.state;

    // Отправка в Make Webhook
    try {
      await fetch("https://hook.eu2.make.com/x581d3p6va1uiext27oka94joezfiiek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, level, goal, time }),
      });
      console.log("📤 Данные отправлены в Make");
    } catch (err) {
      console.error("❌ Ошибка отправки в Make:", err);
    }

    await ctx.reply(`✅ Спасибо, ${name}!

📌 Уровень: ${level}
🎯 Цель: ${goal}
⏰ Удобное время: ${time}

🚀 Я подберу для тебя подходящий курс. Ожидай сообщение от менеджера FluentFox или напиши, если есть вопросы!`);

    // CTA-кнопка после анкеты
    await ctx.reply("📅 Готов записаться прямо сейчас?", {
      reply_markup: {
        inline_keyboard: [[
          { text: "🚀 Записаться на пробный", url: "https://fluentfox.online/signup" }
        ]]
      }
    });

    return ctx.scene.leave();
  }
);

// Сцена и бот
const stage = new Scenes.Stage([askScene]);
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use(stage.middleware());

// /start
bot.start((ctx) => {
  ctx.reply(
    `Привет! Я ассистент школы английского языка FluentFox 🦊

Мы поможем тебе подобрать подходящий курс, независимо от уровня и цели.
Хочешь, я помогу начать?`,
    {
      reply_markup: {
        keyboard: [["🚀 Записаться на курс"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
});

// Кнопка — альтернатива ручного вызова анкеты
bot.hears("🚀 Записаться на курс", (ctx) => ctx.scene.enter("ask-scene"));
bot.command("записаться", (ctx) => ctx.scene.enter("ask-scene"));

// Обработка обычных текстов через GPT
bot.on("text", async (ctx) => {
  const userText = ctx.message.text;
  const userId = ctx.from.id;

if (!userHistories[userId]) userHistories[userId] = [];

userHistories[userId].push({ role: "user", content: userText });
// ограничим историю до 10 сообщений
userHistories[userId] = userHistories[userId].slice(-10);


  // Команды пропускаем
  if (userText.startsWith("/")) return;

  try {
    const gptResponse = await openai.chat.completions.create({
      model: "openai/gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `
Ты виртуальный консультант школы английского языка FluentFox. 
Отвечай только на вопросы, связанные с курсами, уровнем, расписанием, обучением, записью. 
Никогда не помогай с математикой, финансами, бытовыми вопросами — ты НЕ универсальный ассистент.

Если пользователь выражает готовность учиться, интерес к записи, желание пройти анкету — 
добавь в конце ответа три слова __start_form__ (на новой строке или в конце). 
В остальных случаях не добавляй ничего подобного.

Примеры:
- "хочу учиться" → ответ + __start_form__
- "запиши меня" → ответ + __start_form__
- "готов начать" → ответ + __start_form__

Не спрашивай у пользователя, готов ли он — просто запускай анкету, если видишь явный интерес.
`,
        },
        ...userHistories[userId]
      ],
      headers: {
        "HTTP-Referer": "https://fluentfox.online",
        "X-Title": "FluentFox Assistant",
      },
    });

    const reply = gptResponse.choices[0].message.content;
    userHistories[userId].push({ role: "assistant", content: reply });
userHistories[userId] = userHistories[userId].slice(-10); // ограничение


    if (reply.includes("__start_form__")) {
      const cleanReply = reply.replace("__start_form__", "").trim();
      await ctx.reply(cleanReply);
      return ctx.scene.enter("ask-scene");
    } else {
      return ctx.reply(reply.trim());
    }

  } catch (error) {
    console.error("Ошибка GPT:", error);
    ctx.reply("❌ Извините, возникла ошибка. Попробуй ещё раз.");
  }
});

// Фейковый сервер для Render Free Tier
const http = require("http");
http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end("Telegram bot is running");
  })
  .listen(process.env.PORT || 3000, () => {
    console.log("🌀 Фейковый веб-сервер запущен на порту", process.env.PORT || 3000);
  });

bot.launch();
console.log("🤖 FluentFox GPT-консультант запущен!");
