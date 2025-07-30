require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { cpf, cnpj } = require('cpf-cnpj-validator');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 9000;

let isDebugMode = false;

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function logLeadToFile(leadData) {
    const logFilePath = path.join(__dirname, 'leads.log');
    const timestamp = new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const logEntry = `[${timestamp}] - NOVO LEAD RECEBIDO:\n${JSON.stringify(leadData, null, 2)}\n========================================\n\n`;

    try {
        fs.appendFileSync(logFilePath, logEntry);
        console.log('Lead guardado com sucesso em leads.log');
    } catch (error) {
        console.error('ERRO AO GUARDAR O LOG:', error);
    }
}

app.post(
    '/api/submit-lead',
    upload.fields([]),
    [
        body('nome').trim().notEmpty().withMessage('O nome é obrigatório.')
            .not().isNumeric().withMessage('O nome não pode ser apenas números.'),
        body('documento').trim().notEmpty().withMessage('O CPF/CNPJ é obrigatório.').custom(value => {
            const doc = value.replace(/\D/g, '');
            if (!cpf.isValid(doc) && !cnpj.isValid(doc)) {
                throw new Error('O CPF ou CNPJ fornecido é inválido.');
            }
            return true;
        }),
        body('telefone').trim().notEmpty().withMessage('O telefone é obrigatório.'),
        body('email').trim().notEmpty().withMessage('O email é obrigatório.').isEmail(),
        body('cep').if(body('sem_cep').not().equals('on')).trim().notEmpty().withMessage('O CEP é obrigatório.'),
        body('rua').trim().notEmpty().withMessage('A rua é obrigatória.'),
        body('numero').trim().notEmpty().withMessage('O número é obrigatório.'),
        body('bairro').trim().notEmpty().withMessage('O bairro é obrigatório.'),
        body('cidade_estado').trim().notEmpty().withMessage('A cidade/estado são obrigatórios.'),
        body('servicos').optional(),
        body('info_adicional').optional().trim(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const clientIp = req.ip;
            const recaptchaToken = req.body['g-recaptcha-response'];
            const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;

            if (!recaptchaToken) {
                return res.status(400).json({ errors: [{ msg: 'Verificação do reCAPTCHA é obrigatória.' }] });
            }

            const recaptchaUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaToken}&remoteip=${clientIp}`;
            const recaptchaRes = await axios.post(recaptchaUrl);

            if (!recaptchaRes.data.success) {
                console.log('Falha na validação do reCAPTCHA:', recaptchaRes.data['error-codes']);
                return res.status(400).json({ errors: [{ msg: 'Falha na verificação do reCAPTCHA. Tente novamente.' }] });
            }

            const leadData = { ...req.body, clientIp };
            logLeadToFile(leadData);

            // --- ENVIAR PARA API EXTERNA DA BRPHONIA ---
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
            } = req.body;

            const [cidade, estado] = cidade_estado.split('/').map(str => str.trim());

            const endereco_lead = `${estado}|${cidade}|${bairro}|${rua}|${numero}|${info_adicional || ''}|${cep}`;
            const token = process.env.API_BRPHONIA_TOKEN;
            const apiURL = 'https://mk.brphonia.com.br/mk/WSMKInserirLead.rule';

            const queryParams = new URLSearchParams({
                documento,
                nome,
                fone01: telefone.replace(/\D/g, ''),
                email,
                endereco_lead,
                lat: latitude || '0',
                lon: longitude || '0',
                token,
                sys: 'MK0',
                informacoes: info_adicional || '',
                dataConnection: new Date().toISOString()
            });

            const { data: respostaAPI } = await axios.get(`${apiURL}?${queryParams.toString()}`);
            console.log('Resposta da API externa:', respostaAPI);

            return res.status(200).json({
                message: 'Cadastro recebido com sucesso e enviado à Brphonia!',
                leadId: 'LEAD-' + Date.now(),
                respostaAPI
            });

        } catch (error) {
            console.error('Erro inesperado no servidor:', error);
            res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
        }
    }
);

// Rotas de debug (sem alterações)
const checkDebugSecret = (req, res, next) => {
    const secret = req.query.secret;
    if (!secret || secret !== process.env.DEBUG_SECRET_KEY) {
        return res.status(401).send('Chave secreta inválida.');
    }
    next();
};

app.get('/api/debug/on', checkDebugSecret, (req, res) => {
    isDebugMode = true;
    console.log('MODO DEBUG ATIVADO VIA API.');
    res.send('Modo debug ativado. A rota /api/logs está agora acessível.');
});

app.get('/api/debug/off', checkDebugSecret, (req, res) => {
    isDebugMode = false;
    console.log('MODO DEBUG DESATIVADO VIA API.');
    res.send('Cannot GET /api/logs');
});

app.get('/api/logs', (req, res) => {
    if (!isDebugMode) {
        return res.status(403).type('text/plain').send('Cannot GET /api/logs.');
    }

    const logFilePath = path.join(__dirname, 'leads.log');
    fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                return res.status(404).type('text/plain').send('Ficheiro de log ainda não foi criado.');
            }
            return res.status(500).type('text/plain').send('Erro ao ler o ficheiro de log.');
        }
        res.header('Content-Type', 'text/plain; charset=utf-8');
        res.send(data);
    });
});

app.listen(PORT, () => {
    console.log(`Servidor backend (HTTP) a correr em http://localhost:${PORT}`);
    console.log('Para controlar o modo debug, use os endpoints /api/debug/on e /api/debug/off com a chave secreta.');
});
