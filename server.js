// --- 4. ROTA PRINCIPAL DA API: /api/submit-lead ---
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

            // Descomente a validação do reCAPTCHA quando quiser reativar
            /*
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

            // Extração dos dados do corpo da requisição
            const {
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

            // Separar cidade e estado (esperando formato "Cidade / Estado")
            let cidade = '';
            let estado = '';
            if (cidade_estado && cidade_estado.includes('/')) {
                [cidade, estado] = cidade_estado.split('/').map(s => s.trim());
            } else {
                cidade = cidade_estado || '';
                estado = '';
            }

            // Monta o campo endereco_lead no formato esperado pela API externa
            const endereco_lead = `${estado}|${cidade}|${bairro}|${rua}|${numero}|casa|${cep}`;

            // Token fixo (melhor colocar no .env e usar process.env.TOKEN_API)
            const token = process.env.BRPHONIA_API_TOKEN || '887d9c5494fa02ef982e0ed1e039444d.350537';
            const sys = 'MK0';
            const dataConnection = ''; // ajustar conforme necessário

            // Monta a URL da API externa com todos os parâmetros devidamente encodeados
            const apiUrl = `https://mk.brphonia.com.br/mk/WSMKInserirLead.rule?documento=${encodeURIComponent(documento)}&nome=${encodeURIComponent(nome)}&fone01=${encodeURIComponent(telefone)}&email=${encodeURIComponent(email)}&endereco_lead=${encodeURIComponent(endereco_lead)}&lat=${encodeURIComponent(latitude || '0')}&lon=${encodeURIComponent(longitude || '0')}&token=${encodeURIComponent(token)}&sys=${encodeURIComponent(sys)}&informacoes=${encodeURIComponent(info_adicional || '')}&dataConnection=${encodeURIComponent(dataConnection)}`;

            // Chamada GET para a API externa
            const apiResponse = await axios.get(apiUrl);

            // Verifica se a API externa retornou erro (ajuste conforme resposta da API)
            if (apiResponse.data && apiResponse.data.status === 'ERRO') {
                return res.status(400).json({ errors: [{ msg: `Erro na API externa: ${apiResponse.data.Mensagem || 'Erro desconhecido'}` }] });
            }

            // Log local incluindo resposta da API externa
            logLeadToFile({ ...req.body, clientIp, apiResponse: apiResponse.data });

            console.log('Processo do lead concluído com sucesso no backend e API externa.');
            res.status(200).json({ message: 'Cadastro recebido com sucesso!', leadId: 'LEAD-' + Date.now() });

        } catch (error) {
            console.error('Erro inesperado no servidor:', error.response?.data || error.message || error);
            res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
        }
    }
);
