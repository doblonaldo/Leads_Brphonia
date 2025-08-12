const fs = require('fs');
const path = require('path');
const axios = require('axios');

const tokenFile = path.join(__dirname, 'brphonia-token.json');
const TOKEN_URL = `https://mk.brphonia.com.br/mk/WSAutenticacao.rule?sys=MK0&token=${process.env.BRPHONIA_AUTH_TOKEN}&password=${process.env.BRPHONIA_AUTH_PASSWORD}&cd_servico=9999`;

let tokenData = null;

/**
 * Carrega token do arquivo local, se existir.
 */
function carregarTokenDoArquivo() {
    if (fs.existsSync(tokenFile)) {
        try {
            const data = fs.readFileSync(tokenFile, 'utf-8');
            tokenData = JSON.parse(data);
        } catch (err) {
            console.error('[Brphonia] Erro ao ler token do arquivo:', err);
            tokenData = null;
        }
    }
}

/**
 * Tenta converter para Date e garante que seja válida.
 * Se for inválida, retorna null.
 */
function parseDataSegura(valor) {
    const data = new Date(valor);
    return isNaN(data) ? null : data;
}

/**
 * Renovar token se ele estiver vazio ou expirado.
 */
async function renovarTokenSeNecessario() {
    carregarTokenDoArquivo();

    const agora = new Date();
    const expiraEm = parseDataSegura(tokenData?.Expire);
    const expirado = !expiraEm || expiraEm < agora;
    const tokenVazio = !tokenData?.Token;

    if (tokenVazio || expirado) {
        console.log('[Brphonia] Token expirado ou vazio. Renovando...');

        let data;
        try {
            const res = await axios.get(TOKEN_URL);
            data = res.data;
        } catch (err) {
            throw new Error(`[Brphonia] Falha ao conectar na API para renovar token: ${err.message}`);
        }

        if (data.status !== 'OK' || !data.Token) {
            throw new Error(`[Brphonia] Falha ao renovar token: ${JSON.stringify(data)}`);
        }

        let expireDate = parseDataSegura(data.Expire);

        if (!expireDate) {
            // Fallback para 2 dias a partir de agora
            expireDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
            console.warn('[Brphonia] Data de expiração inválida recebida. Usando fallback:', expireDate.toISOString());
        }

        tokenData = {
            Token: data.Token,
            Expire: expireDate.toISOString()
        };

        try {
            fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2), 'utf-8');
            console.log('[Brphonia] Novo token salvo no arquivo.');
        } catch (err) {
            console.error('[Brphonia] Erro ao salvar token no arquivo:', err);
        }
    }
}

/**
 * Obtém token válido, renovando se necessário.
 */
async function obterToken() {
    await renovarTokenSeNecessario();
    return tokenData.Token;
}

module.exports = { obterToken };
