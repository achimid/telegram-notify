const swaggerAutogen = require('swagger-autogen')();

const doc = {
  info: {
    title: 'Telegram Notify Bot API',
    description: 'API criada utilizando a lib npm `node-telegram-bot-api`(https://www.npmjs.com/package/node-telegram-bot-api). Com o objetivo de disponibilizar os recursos por meio de API REST.',
  },
  basePath: '/api/v1',  
  host: 'telegram-notify-api.achimid.com.br',
  schemes: ['https'],
};

const outputFile = './swagger-output.json';
const endpointsFiles = ['./index.js'];

swaggerAutogen(outputFile, endpointsFiles, doc);