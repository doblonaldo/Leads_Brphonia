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
    if (!tokenData || new Date(tokenData.Expire) < agora) {
        const { data } = await axios.get(TOKEN_URL);
        if (data.status !== 'OK') throw new Error('Falha ao renovar token');

        tokenData = {
            Token: data.Token,
            Expire: new Date(data.Expire).toISOString()
        };
        fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));
        console.log('[Brphonia] Novo token obtido.');
    }
}

async function obterToken() {
    await renovarTokenSeNecessario();
    return tokenData.Token;
}

module.exports = { obterToken };
