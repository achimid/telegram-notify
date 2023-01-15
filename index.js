
require('dotenv').config()

const TelegramBot = require('node-telegram-bot-api')
const statusMonitor = require('express-status-monitor')
const mongoose = require('mongoose')
const express = require('express')
const app = express()

const swaggerUi = require('swagger-ui-express')
const swaggerFile = require('./swagger-output.json')

app.use(statusMonitor())
app.use(express.json())

const ChatsSchema = new mongoose.Schema({ token: { type: String }, id: { type: String }, chat: Object })
const BotsSchema = new mongoose.Schema({ token: { type: String, unique: true }, name: { type: String }, msgSuccess: { type: String }, msgDuplicated: { type: String }, msgError: { type: String } })

const ChatsModel = mongoose.model('Chats', ChatsSchema)
const BotsModel = mongoose.model('Bots', BotsSchema)

ChatsSchema.index({ token: 1, id: 1 }, { unique: true })


const DEFAULT_START_SUCCESS_MESSAGE = process.env.DEFAULT_START_SUCCESS_MESSAGE
const DEFAULT_START_DUPLICATED_MESSAGE = process.env.DEFAULT_START_DUPLICATED_MESSAGE
const DEFAULT_START_ERROR_MESSAGE = process.env.DEFAULT_START_ERROR_MESSAGE


const bots = {}

const initBots = async () => {
	const bots = await BotsModel.find().lean()
	bots.map((botM) => initTelegramBot(botM.token, botM))
}

const initTelegramBot = (token, botM) => {
	try {
		console.log(`\nInicializando Bot Telegram: ${token}`)
		const bot = new TelegramBot(token, { polling: true })
		console.log(`Bot inicializado com sucesso!`)

		bots[token] = bot


		bot.onText(/\/start/, async (msg) => {
			try {
				const botM = await BotsModel.findOne({ token })
				console.log('Nova solicitação de cadastro de usuário!', msg.chat)

				await ChatsModel.create({ chat: msg.chat, id: msg.chat.id, token })
					.then(() => bot.sendMessage(msg.chat.id, botM.msgSuccess || DEFAULT_START_SUCCESS_MESSAGE))
					.catch((e) => {
						if (e.message.includes("E11000 duplicate key")) {
							bot.sendMessage(msg.chat.id, botM.msgDuplicated || DEFAULT_START_DUPLICATED_MESSAGE)
						} else {
							bot.sendMessage(msg.chat.id, botM.msgError || DEFAULT_START_ERROR_MESSAGE)
						}
					})				
			} catch (error) { }
		})


		bot.on('error', (msg) => { console.error(msg) })
		bot.on('webhook_error', (msg) => { console.error(msg) })
		bot.on('polling_error', (msg) => { console.error(msg) })

		return bot

	} catch (error) {
		console.error(`Erro ao inicializar bot: ${token}`)
		console.error(error)
	}
}

const getBot = async (token) => {
	const bot = bots[token]
	
	if (bot) return bot
	
	return BotsModel.create({ token })
		.then(botM => initTelegramBot(botM.token, botM))
}


app.post('/bot', async (req, res) => {
	// #swagger.tags = ['Bot']
	// #swagger.summary = 'Some summary...'

	const { token, name, msgSuccess, msgDuplicated, msgError } = req.body

	return BotsModel.create({ token, name, msgSuccess, msgDuplicated, msgError })
		.then(bot => {
			initTelegramBot(token)
			return res.json(bot)
		})
})

app.put('/bot/:token', async (req, res) => {
	// #swagger.tags = ['Bot']

	const { token } = req.params
	const { name, msgSuccess, msgDuplicated, msgError } = req.body

	return BotsModel.findOneAndUpdate({ token }, {$set:{name,  msgSuccess, msgDuplicated, msgError}}, {new: true})
		.then((bot) => res.json(bot))
		.catch((e) => handleError(e, res))
})

app.delete('/bot/:token', async (req, res) => {
	// #swagger.tags = ['Bot']
	
	const { token } = req.params
	return BotsModel.findOneAndDelete({ token })
		.then(() => res.json())
		.catch((e) => handleError(e, res))
})

app.get('/bot/:token', async (req, res) => {
	// #swagger.tags = ['Bot']
	
	const { token } = req.params
	return BotsModel.findOne({ token })
		.then((bot) => res.json(bot))
		.catch((e) => handleError(e, res))
})


app.post('/message/send', async (req, res) => {
	// #swagger.tags = ['Message']
	const { token, id, text } = req.body
	
	return processMessageSend({ token, id, text })
		.then(() => res.json())
		.catch((e) => handleError(e, res))		
})

app.post('/message/send/all', async (req, res) => {
	// #swagger.tags = ['Message']
	const { token, text } = req.body
	
	return processMessageSendAll({ token, text })
		.then(() => res.json())
		.catch((e) => handleError(e, res))		
})

const processMessageSendAll = async ({ token, text }) => {
	

	if (!token) throw `O campo token não pode estar vazio`
	if (!text) throw `O campo text não pode estar vazio`

	const bot = await getBot(token)
	const chats = await ChatsModel.find({ token }).lean()
	chats.map(c => bot.sendMessage(c.chat.id, text))
}

const processMessageSend = async ({ token, id, text }) => {

	if (!token) throw `O campo token não pode estar vazio`
	if (!id) throw `O campo id não pode estar vazio`	
	if (!text) throw `O campo text não pode estar vazio`

	const bot = await getBot(token)
	const chats = await ChatsModel.find({ token, id }).lean()

	if (chats.length == 0) throw `Esse id(${id}) não foi encontrado para esse token(${token})`

	chats.map(c => bot.sendMessage(c.chat.id, text))
}

const handleError = (err, res) => {
	res.status(err.status || 400)
	res.json({ error: err })

	console.error(err)
}


main().catch(err => console.log(err))

async function main() {
	await mongoose.connect(process.env.MONGO_DB_CONNECTION)
	await initBots()
}

app.use('/', swaggerUi.serve, swaggerUi.setup(swaggerFile))

app.listen(process.env.PORT || 3000)