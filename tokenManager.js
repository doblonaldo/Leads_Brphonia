// tokenManager.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const tokenFile = path.join(__dirname, 'brphonia-token.json');
const TOKEN_URL = `https://mk.brphonia.com.br/mk/WSAutenticacao.rule?sys=MK0&token=${process.env.BRPHONIA_AUTH_TOKEN}&password=${process.env.BRPHONIA_AUTH_PASSWORD}&cd_servico=9999`;

let tokenData = null;

function carregarTokenDoArquivo() {
    if (fs.existsSync(tokenFile)) {
        try {
            const data = fs.readFileSync(tokenFile, 'utf8');
            tokenData = JSON.parse(data);
        } catch (err) {
            console.error('[Brphonia] Erro ao ler token do arquivo:', err);
            tokenData = null;
        }
    }
}

async function renovarTokenSeNecessario() {
    carregarTokenDoArquivo();

    const agora = Date.now();
    const expiracao = tokenData ? new Date(tokenData.Expire).getTime() : 0;

    // Se não existe token ou já está vencido, renovar
    if (!tokenData || expiracao <= agora) {
        console.log('[Brphonia] Renovando token...');
        const { data } = await axios.get(TOKEN_URL);

        if (!data || !data.Token) {
            throw new Error('[Brphonia] Falha ao obter novo token da API');
        }

        tokenData = {
            Token: data.Token,
            Expire: new Date(data.Expire).toISOString()
        };

        try {
            fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2), 'utf8');
            console.log('[Brphonia] Novo token salvo com sucesso.');
        } catch (err) {
            console.error('[Brphonia] Erro ao salvar token:', err);
        }
    }
}

async function obterToken() {
    await renovarTokenSeNecessario();
    return tokenData.Token;
}

module.exports = { obterToken };
