
require('dotenv').config()

const TelegramBot = require('node-telegram-bot-api')
const swaggerUi = require('swagger-ui-express')
const mongoose = require('mongoose')
const express = require('express')
const app = express()


app.use(express.json())

const ChatsSchema = new mongoose.Schema({ token: { type: String }, id: { type: String }, chat: Object })
const BotsSchema = new mongoose.Schema({ token: { type: String, unique: true }, name: { type: String }, msgSuccess: { type: String }, msgDuplicated: { type: String }, msgError: { type: String } })

const ChatsModel = mongoose.model('Chats', ChatsSchema)
const BotsModel = mongoose.model('Bots', BotsSchema)

ChatsSchema.index({ token: 1, id: 1 }, { unique: true })


const DEFAULT_START_SUCCESS_MESSAGE = process.env.DEFAULT_START_SUCCESS_MESSAGE || 'Usuário cadastrado com Sucesso!'
const DEFAULT_START_DUPLICATED_MESSAGE = process.env.DEFAULT_START_DUPLICATED_MESSAGE || 'O seu usuário já estava cadastrado!'
const DEFAULT_START_ERROR_MESSAGE = process.env.DEFAULT_START_ERROR_MESSAGE || 'Ops! Ocorreu um erro ao cadastrar o seu usuário.'

const BASE_PATH_API = process.env.BASE_PATH_API || '/api/v1'

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


app.post(BASE_PATH_API + '/bot', async (req, res) => {
	// #swagger.tags = ['Bot']
	// #swagger.summary = 'Cadastro de um Bot'

	const { token, name, msgSuccess, msgDuplicated, msgError } = req.body

	return BotsModel.create({ token, name, msgSuccess, msgDuplicated, msgError })
		.then(bot => {
			initTelegramBot(token)
			return res.json(bot)
		})
})

app.put(BASE_PATH_API + '/bot/:token', async (req, res) => {
	// #swagger.tags = ['Bot']
	// #swagger.summary = 'Alterar as informações do Bot'

	const { token } = req.params
	const { name, msgSuccess, msgDuplicated, msgError } = req.body

	return BotsModel.findOneAndUpdate({ token }, {$set:{name,  msgSuccess, msgDuplicated, msgError}}, {new: true})
		.then((bot) => res.json(bot))
		.catch((e) => handleError(e, res))
})

app.delete(BASE_PATH_API + '/bot/:token', async (req, res) => {
	// #swagger.tags = ['Bot']
	// #swagger.summary = 'Excluir um Bot já cadastrado'
	
	const { token } = req.params
	return BotsModel.findOneAndDelete({ token })
		.then(() => res.json())
		.catch((e) => handleError(e, res))
})

app.get(BASE_PATH_API + '/bot/:token', async (req, res) => {
	// #swagger.tags = ['Bot']
	// #swagger.summary = 'Recuperar as informações de um Bot'
	
	const { token } = req.params
	return BotsModel.findOne({ token })
		.then((bot) => res.json(bot))
		.catch((e) => handleError(e, res))
})


app.post(BASE_PATH_API + '/message/send', async (req, res) => {
	// #swagger.tags = ['Message']
	// #swagger.summary = 'Efetuar o envio de uma mensagem para um usuário[chat.id] específico'

	const { token, id, text } = req.body
	
	return processMessageSend({ token, id, text })
		.then(() => res.json())
		.catch((e) => handleError(e, res))		
})

app.post(BASE_PATH_API + '/message/send/all', async (req, res) => {
	// #swagger.tags = ['Message']
	// #swagger.summary = 'Efetuar o envio de uma mensagem broadcast para todos os usuários[chat.id] de um Bot'

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

app.use('/', swaggerUi.serve, swaggerUi.setup(require('./swagger-output.json')))

app.listen(process.env.PORT || 3000)