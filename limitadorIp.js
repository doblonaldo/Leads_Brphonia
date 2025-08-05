const rateLimit = require('express-rate-limit');

const limitadorIp = rateLimit({
  windowMs: 1 * 60 * 1000, // minutos
  max: 5, // Máximo de 10 requisições por IP
  message: {
    error: 'Muitas requisições vindas deste IP. Tente novamente mais tarde.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = limitadorIp;