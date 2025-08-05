const { Telegraf, Scenes, session } = require("telegraf");
const OpenAI = require("openai");
require("dotenv").config();

// GPT подключение через OpenRouter
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// FSM-анкетирование
const askScene = new Scenes.WizardScene(
  "ask-scene",
  (ctx) => {
    ctx.reply("👋 Как тебя зовут?");
    return ctx.wizard.next();
  },
  (ctx) => {
    ctx.wizard.state.name = ctx.message.text;
    ctx.reply(
      "📚 Какой у тебя уровень английского сейчас?\n\nA0 — совсем с нуля\nA1 — немного понимаю\nA2 — могу говорить простыми фразами\nB1 и выше — свободно общаюсь"
    );
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
  (ctx) => {
    ctx.wizard.state.time = ctx.message.text;

    const { name, level, goal, time } = ctx.wizard.state;
    ctx.reply(`✅ Спасибо, ${name}!

📌 Уровень: ${level}
🎯 Цель: ${goal}
⏰ Время занятий: ${time}

🚀 Я подоберу для тебя подходящий курс. Ожидай сообщение от менеджера FluentFox или задай мне вопрос прямо сейчас!`);

    return ctx.scene.leave();
  }
);

// Сцены и инициализация бота
const stage = new Scenes.Stage([askScene]);
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.use(stage.middleware());

// 🔹 Старт — мотивация + клавиатура
bot.start((ctx) => {
  ctx.reply(
    `Привет! Я твой ассистент из школы английского языка FluentFox 🦊

Если ты давно хотел выучить английский, но всё откладывал — пора начинать. У нас есть курсы для любого уровня и цели 🎯

Хочешь, я помогу подобрать подходящий курс?`,
    {
      reply_markup: {
        keyboard: [["🚀 Записаться на курс"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
});

// 🔹 Кнопка-запуск анкеты
bot.hears("🚀 Записаться на курс", (ctx) => {
  ctx.scene.enter("ask-scene");
});

// 🔹 Команда /записаться (альтернатива)
bot.command("записаться", (ctx) => ctx.scene.enter("ask-scene"));

// 🔹 GPT-чат
bot.on("text", async (ctx) => {
  const userText = ctx.message.text;
  if (userText.startsWith("/")) return;

  try {
    const gptResponse = await openai.chat.completions.create({
      model: "openai/gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `
Ты вежливый и краткий ассистент школы английского языка FluentFox.

Школа основана в 2020 году, онлайн-формат, преподаватели с TEFL/CELTA, более 1500 учеников. Курсы: Start English, Spoken Boost, IELTS Ready, Business English, Teen English. Есть уроки в мини-группах и индивидуально. Программа подбирается по уровню и цели студента.

Отвечай понятно, с учётом реальных курсов. Помогай студентам выбрать подходящее направление.
`,
        },
        { role: "user", content: userText },
      ],
      headers: {
        "HTTP-Referer": "https://fluentfox.online",
        "X-Title": "FluentFox Assistant",
      },
    });

    const reply = gptResponse.choices[0].message.content;
    ctx.reply(reply);
  } catch (error) {
    console.error("Ошибка GPT:", error);
    ctx.reply("❌ Извините, что-то пошло не так. Попробуйте ещё раз.");
  }
});

bot.launch();
console.log("🤖 FluentFox GPT-консультант запущен!");
// Обманка для Render — фейковый HTTP сервер
const http = require("http");

http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end("Telegram bot is running");
  })
  .listen(process.env.PORT || 3000, () => {
    console.log("🌀 Фейковый веб-сервер запущен на порту", process.env.PORT || 3000);
  });
