const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Função para logar leads
function logLeadToFile(data) {
  const logPath = path.join(__dirname, 'leads.log');
  const timestamp = new Date().toISOString();
  const logData = `${timestamp} - ${JSON.stringify(data)}\n`;
  fs.appendFileSync(logPath, logData);
}

// Rota para receber o formulário
app.post('/api/submit-lead', [
  body('documento').notEmpty().withMessage('Documento é obrigatório.'),
  body('nome').notEmpty().withMessage('Nome é obrigatório.'),
  body('telefone').notEmpty().withMessage('Telefone é obrigatório.'),
  body('email').isEmail().withMessage('Email inválido.'),
  body('rua').notEmpty().withMessage('Rua é obrigatória.'),
  body('bairro').notEmpty().withMessage('Bairro é obrigatório.'),
  body('cidade_estado').notEmpty().withMessage('Cidade/Estado é obrigatório.'),
  body('numero').notEmpty().withMessage('Número é obrigatório.'),
  body('cep').notEmpty().withMessage('CEP é obrigatório.')
], async (req, res) => {
  const clientIp = req.ip;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const recaptchaEnabled = process.env.RECAPTCHA_ENABLED !== 'false';
  const recaptchaToken = req.body['g-recaptcha-response'];
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;

  if (recaptchaEnabled) {
    if (!recaptchaToken) {
      return res.status(400).json({ errors: [{ msg: 'Verificação do reCAPTCHA é obrigatória.' }] });
    }

    try {
      const recaptchaUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaToken}&remoteip=${clientIp}`;
      const recaptchaRes = await axios.post(recaptchaUrl);

      if (!recaptchaRes.data.success) {
        return res.status(400).json({ errors: [{ msg: 'Falha na verificação do reCAPTCHA.' }] });
      }
    } catch (error) {
      console.error('Erro ao verificar reCAPTCHA:', error);
      return res.status(500).json({ errors: [{ msg: 'Erro interno ao verificar o reCAPTCHA.' }] });
    }
  }

  const leadData = req.body;
  logLeadToFile({ ...leadData, ip: clientIp });

  // Enviar para API externa da Brphonia
  try {
    const {
      documento,
      nome,
      telefone,
      email,
      rua,
      bairro,
      cidade_estado,
      numero,
      cep,
      info_adicional,
      latitude,
      longitude
    } = leadData;

    const [cidade, estado] = cidade_estado.split('/').map(s => s.trim());

    const endereco_lead = `${estado}|${cidade}|${bairro}|${rua}|${numero}|${info_adicional || ''}|${cep}`;

    const apiUrl = 'https://mk.brphonia.com.br/mk/WSMKInserirLead.rule';
    const queryParams = new URLSearchParams({
      documento,
      nome,
      fone01: telefone.replace(/\D/g, ''),
      email,
      endereco_lead,
      lat: latitude || '0',
      lon: longitude || '0',
      token: process.env.API_BRPHONIA_TOKEN,
      sys: 'MK0',
      informacoes: info_adicional || '',
      dataConnection: ''
    });

    const response = await axios.get(`${apiUrl}?${queryParams.toString()}`);

    console.log('Resposta da API externa:', response.data);
    return res.status(200).json({ success: true, mensagem: 'Lead enviado com sucesso.', resposta: response.data });
  } catch (error) {
    console.error('Erro ao enviar lead para a API externa:', error.message);
    return res.status(500).json({ success: false, mensagem: 'Erro ao enviar para API externa.' });
  }
});

// Rota para debug de logs
app.get('/api/leads-log', (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.DEBUG_SECRET_KEY) {
    return res.status(403).json({ message: 'Acesso não autorizado.' });
  }

  const logPath = path.join(__dirname, 'leads.log');
  if (!fs.existsSync(logPath)) {
    return res.status(404).json({ message: 'Arquivo de log não encontrado.' });
  }

  const logs = fs.readFileSync(logPath, 'utf8');
  res.type('text/plain').send(logs);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
