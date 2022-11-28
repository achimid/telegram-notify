
require('dotenv').config()

const TelegramBot = require('node-telegram-bot-api')
const statusMonitor = require('express-status-monitor')
const mongoose = require('mongoose')
const express = require('express')
const app = express()

app.use(statusMonitor())
app.use(express.json())

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: true})
const ChatsModel = mongoose.model('Chats', new mongoose.Schema({ chatId: { type: String, unique: true }, chat: Object }))


app.post('/send', async function (req, res) {  
  const text = req.body.text
  
  console.log(text)
  const chats = await ChatsModel.find().lean()  
  chats.map(c => bot.sendMessage(c.chat.id, text))

  res.send()
})

bot.onText(/\/start/, async (msg) => { 
  try {
    await ChatsModel.create({chat: msg.chat, chatId: msg.chat.id})     
    console.log('Novo usuário telegram cadasrtado')
  } catch (error) { }
})


bot.on('error', (msg) => { console.error(msg) })
bot.on('webhook_error', (msg) => { console.error(msg) })
bot.on('polling_error', (msg) => { console.error(msg) })

main().catch(err => console.log(err))

async function main() {
  await mongoose.connect(process.env.MONGO_DB_CONNECTIONS, { useNewUrlParser: true, useUnifiedTopology: true }) 
}

app.listen(process.env.PORT || 3000)