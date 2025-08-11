const fs = require('fs');
const path = require('path');
const axios = require('axios');

const tokenFile = path.join(__dirname, 'brphonia-token.json');
const TOKEN_URL = `https://mk.brphonia.com.br/mk/WSAutenticacao.rule?sys=MK0&token=${process.env.BRPHONIA_AUTH_TOKEN}&password=${process.env.BRPHONIA_AUTH_PASSWORD}&cd_servico=9999`;

let tokenData = null;

function carregarTokenDoArquivo() {
    if (fs.existsSync(tokenFile)) {
        const data = fs.readFileSync(tokenFile);
        tokenData = JSON.parse(data);
    }
}

async function renovarTokenSeNecessario() {
    carregarTokenDoArquivo();

    const agora = new Date();
    const expiraEm = tokenData?.Expire ? new Date(tokenData.Expire) : null;
    const expirado = !expiraEm || isNaN(expiraEm) || expiraEm < agora;
    const tokenVazio = !tokenData?.Token;

    if (tokenVazio || expirado) {
        console.log('[Brphonia] Token expirado ou vazio. Renovando...');
        const { data } = await axios.get(TOKEN_URL);

        if (data.status !== 'OK' || !data.Token) {
            throw new Error(`Falha ao renovar token: ${JSON.stringify(data)}`);
        }

        tokenData = {
            Token: data.Token,
            Expire: new Date(data.Expire).toISOString()
        };

        try {
            fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));
            console.log('[Brphonia] Novo token salvo no arquivo.');
        } catch (err) {
            console.error('[Brphonia] Erro ao salvar token no arquivo:', err);
        }
    }
}

async function obterToken() {
    await renovarTokenSeNecessario();
    return tokenData.Token;
}

module.exports = { obterToken };
