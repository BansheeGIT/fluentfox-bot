const { Telegraf, Scenes, session } = require("telegraf")
const OpenAI = require("openai")
require("dotenv").config()

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
})

// FSM сцена
const askScene = new Scenes.WizardScene(
  "ask-scene",
  (ctx) => {
    ctx.reply("👋 Как вас зовут?")
    return ctx.wizard.next()
  },
  (ctx) => {
    ctx.wizard.state.name = ctx.message.text
    ctx.reply("🎯 Какая ваша цель изучения английского? (например: для карьеры, IELTS, переезд...)")
    return ctx.wizard.next()
  },
  (ctx) => {
    ctx.wizard.state.goal = ctx.message.text
    ctx.reply("⏰ Сколько часов в неделю готовы заниматься?")
    return ctx.wizard.next()
  },
  (ctx) => {
    ctx.wizard.state.hours = ctx.message.text
    const { name, goal, hours } = ctx.wizard.state

    ctx.reply(`✅ Спасибо, ${name}!\n\n📌 Цель: ${goal}\n🕐 Время: ${hours} ч/нед\n\nСкоро с вами свяжется менеджер.`)
    return ctx.scene.leave()
  }
)

const stage = new Scenes.Stage([askScene])
const bot = new Telegraf(process.env.BOT_TOKEN)

bot.use(session())
bot.use(stage.middleware())

// Старт
bot.start((ctx) => ctx.reply("Привет! Напиши /записаться чтобы начать анкету ✍️"))

// FSM запуск
bot.command("записаться", (ctx) => ctx.scene.enter("ask-scene"))

// GPT-поддержка (общий чат)
bot.on("text", async (ctx) => {
  const userText = ctx.message.text

  if (userText.startsWith("/")) return // не обрабатываем команды

  const gptResponse = await openai.chat.completions.create({
    model: "openai/gpt-3.5-turbo",
    messages: [
      { role: "system", content: "Ты ассистент школы английского. Отвечай вежливо, кратко и по делу." },
      { role: "user", content: userText }
    ],
    headers: {
      "HTTP-Referer": "https://fluentfox.online",
      "X-Title": "FluentFox Assistant"
    }
  })

  const reply = gptResponse.choices[0].message.content
  ctx.reply(reply)
})

bot.launch()
console.log("🤖 FSM-бот работает!")
