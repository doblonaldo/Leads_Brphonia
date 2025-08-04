/*
================================================================================
ARQUIVO: server.js (Versão com controlo de debug via web)
================================================================================
*/

// --- 1. IMPORTAÇÕES E CONFIGURAÇÃO INICIAL ---
require('dotenv').config();
const ENVIO_EXTERNO_ATIVO = process.env.API_ENVIO_EXTERNO !== 'off';
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Para escrever no ficheiro de log
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const { cpf, cnpj } = require('cpf-cnpj-validator'); // Importa ambos
const axios = require('axios');
// Função utilitária para remover acentos e caracteres especiais
const removeCaracteresEspeciais = (str) => {
    if (!str) return '';
    return str
        .normalize('NFD')                   // Decompor acentos
        .replace(/[\u0300-\u036f]/g, '')    // Remover acentos
        .replace(/[^a-zA-Z0-9\s]/g, '')     // Remover caracteres especiais
        .replace(/\s+/g, ' ')               // Espaços múltiplos -> único
        .trim();                            // Remover espaços nas extremidades
};
const app = express();
const PORT = process.env.PORT || 9000;

// Variável para controlar o modo debug em tempo real
let isDebugMode = false;

// --- 2. MIDDLEWARES ---
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 3. FUNÇÃO DE LOG ---
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

// --- 4. ROTA PRINCIPAL DA API: /api/submit-lead ---
app.post(
    '/api/submit-lead',
    upload.fields([]),
    [
        body('nome').trim().isLength({ min: 3, max: 100 }).matches(/^[A-Za-zÀ-ÿ\s\-']+$/).not().isNumeric().escape(),
        body('documento').trim().notEmpty().custom(value => { const doc = value.replace(/\D/g, ''); if (!cpf.isValid(doc) && !cnpj.isValid(doc)) throw new Error('CPF/CNPJ inválido'); return true; }),
        body('telefone').trim().isLength({ min: 10, max: 15 }).blacklist('()- '),
        body('email').trim().isEmail().normalizeEmail(),
        body('cep').if(body('sem_cep').not().equals('on')).trim().isPostalCode('BR'),
        body('rua').trim().isLength({ min: 1, max: 100 }).escape(),
        body('numero').trim().isLength({ max: 20 }).escape(),
        body('bairro').trim().isLength({ min: 1, max: 100 }).escape(),
        body('cidade_estado').trim().matches(/^[A-Za-zÀ-ÿ\s\-]+\/[A-Z]{2}$/).escape(),
        body('servicos').optional().custom(value => { if (!Array.isArray(value)) value = [value]; const valid = ['Internet','Telefonia Móvel','Telefonia Fixa','Central']; if (!value.every(v => valid.includes(v))) throw new Error('Serviços inválidos'); return true; }),
        body('info_adicional').optional().trim().isLength({ max: 500 }).escape()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const clientIp = req.ip;

            /*
            // reCAPTCHA desativado temporariamente
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
            */

            // Extrai dados do formulário
            let {
                documento,
                nome,
                telefone,
                email,
                cep,
                rua,
                numero,
                bairro,
                cidade_estado,
                info_adicional,
                latitude,
                longitude
            } = req.body;

            // Sanitize campos sensíveis
            nome = removeCaracteresEspeciais(nome);
            rua = removeCaracteresEspeciais(rua);
            bairro = removeCaracteresEspeciais(bairro);
            info_adicional = validator.escape(info_adicional || '');

            // Separa cidade e estado (espera "Cidade / Estado")
            let cidade = '';
            let estado = '';
            if (cidade_estado && cidade_estado.includes('/')) {
                [cidade, estado] = cidade_estado.split('/').map(s => s.trim());
            } else {
                cidade = cidade_estado || '';
                estado = '';
            }
            
            cidade = removeCaracteresEspeciais(cidade);

            // Monta endereco_lead conforme esperado pela API externa
            const endereco_lead = `${estado}|${cidade}|${bairro}|${rua}|${numero}|casa|${cep}`;

            // Token da API - recomendo colocar no .env
            const token = process.env.BRPHONIA_API_TOKEN;
            const sys = 'MK0';
            const dataConnection = ''; // ajuste conforme necessário

            // Monta a URL da API externa
            const apiUrl = `https://mk.brphonia.com.br/mk/WSMKInserirLead.rule?documento=${encodeURIComponent(documento)}&nome=${encodeURIComponent(nome)}&fone01=${encodeURIComponent(telefone)}&email=${encodeURIComponent(email)}&endereco_lead=${encodeURIComponent(endereco_lead)}&lat=${encodeURIComponent(latitude || '0')}&lon=${encodeURIComponent(longitude || '0')}&token=${encodeURIComponent(token)}&sys=${encodeURIComponent(sys)}&informacoes=${encodeURIComponent(info_adicional || '')}&dataConnection=${encodeURIComponent(dataConnection)}`;

            // Chamada GET para API externa
            let apiResponse = { data: { status: 'SUCESSO', Mensagem: 'API externa desativada para teste.' } };

            if (ENVIO_EXTERNO_ATIVO) {
                apiResponse = await axios.get(apiUrl);
        
                if (apiResponse.data && apiResponse.data.status === 'ERRO') {
                    return res.status(400).json({ errors: [{ msg: `Erro na API externa: ${apiResponse.data.Mensagem || 'Erro desconhecido'}` }] });
                }
            }

            // Log local com resposta da API externa
            logLeadToFile({
                documento,
                nome,
                telefone,
                email,
                cep,
                rua,
                numero,
                bairro,
                cidade,
                estado,
                endereco_lead,
                info_adicional,
                latitude,
                longitude,
                clientIp,
                apiResponse: apiResponse.data
            });


            console.log('Processo do lead concluído com sucesso no backend e API externa.');
            res.status(200).json({ message: 'Cadastro recebido com sucesso!', leadId: 'LEAD-' + Date.now() });

        } catch (error) {
            console.error('Erro inesperado no servidor:', error.response?.data || error.message || error);
            res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
        }
    }
);

// --- 5. ROTAS DE CONTROLO DE DEBUG ---
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

// --- 6. ROTA PARA VISUALIZAR LOGS (CONDICIONAL) ---
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

// --- 7. INICIAR O SERVIDOR HTTP ---
app.listen(PORT, () => {
    console.log(`Servidor backend (HTTP) a correr em http://localhost:${PORT}`);
    console.log('Para controlar o modo debug, use os endpoints /api/debug/on e /api/debug/off com a chave secreta.');
});
