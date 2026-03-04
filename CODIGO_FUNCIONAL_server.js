import express from 'express';
import axios from 'axios';
import cors from 'cors';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

const TINY_API_TOKEN = process.env.TINY_API_TOKEN;

// --- NOVA ROTA DE CALLBACK PARA O MERCADO LIVRE ---
// Esta rota captura o redirecionamento do ML e o envia para o frontend
app.get('/', (req, res) => {
  const { code } = req.query;

  // Se o ML redirecionou com um código de autorização...
  if (code) {
    // Redireciona o navegador do usuário para a aplicação React, passando o código.
    // **ATENÇÃO:** Se o seu frontend Vite não roda na porta 5173, altere o número da porta abaixo.
    const frontendUrl = `http://localhost:5173/?code=${code}`;
    return res.redirect(frontendUrl);
  }

  // Se não houver código, apenas responde que o servidor está no ar.
  res.send('Servidor backend do MeuSaaS Hub está online. Tudo pronto!');
});

	// --- ROTA PARA RENOVAR TOKEN (Igual ao Python) ---
	app.post('/api/ml/refresh-token', async (req, res) => {
	  const { refresh_token } = req.body;
	  if (!refresh_token) return res.status(400).json({ erro: 'Refresh token não fornecido' });

	  try {
		const body = new URLSearchParams();
		body.append('grant_type', 'refresh_token');
		body.append('client_id', process.env.ML_APP_ID);
		body.append('client_secret', process.env.ML_CLIENT_SECRET);
		body.append('refresh_token', refresh_token);

		const response = await axios.post('https://api.mercadolibre.com/oauth/token', body, {
		  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
		});
		res.json(response.data);
	  } catch (error) {
		res.status(500).json({ erro: 'Falha ao renovar', detalhes: error.response?.data });
	  }
	});


// --- ROTAS DO TINY ERP (Existentes) ---
app.post('/api/tiny-produtos', async (req, res) => {
  const url = 'https://api.tiny.com.br/api2/produtos.pesquisa.php';
  if (!TINY_API_TOKEN) return res.status(500).json({ erro: 'Token Tiny não configurado.' });

  const pesquisa = (req.body?.pesquisa ?? '').toString();
  try {
    let pagina = 1; let numeroPaginas = 1; const todosProdutos =[];
    do {
      const params = new URLSearchParams({ token: TINY_API_TOKEN, formato: 'JSON', pesquisa, pagina: String(pagina) });
      const respostaTiny = await axios.post(url, params);
      const retorno = respostaTiny.data?.retorno;

      if (!retorno || retorno.status !== 'OK') {
        const erroMsg = retorno?.erros?.[0]?.erro || 'A Consulta não retornou registros';
        if (erroMsg === 'A Consulta não retornou registros' && todosProdutos.length > 0) break;
        return res.status(400).json({ erro: erroMsg });
      }
      numeroPaginas = Number(retorno.numero_paginas ?? 1);
      todosProdutos.push(...(Array.isArray(retorno.produtos) ? retorno.produtos :[]));
      pagina++;
    } while (pagina <= numeroPaginas);
    
    return res.json(todosProdutos);
  } catch (error) {
    return res.status(500).json({ erro: 'Falha na comunicação com o Tiny.' });
  }
});

app.post('/api/tiny-produto-detalhes', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ erro: 'ID obrigatório.' });
  if (!TINY_API_TOKEN) return res.status(500).json({ erro: 'Token Tiny não configurado.' });

  try {
    const [detalhesResponse, estoqueResponse] = await Promise.all([
      axios.post('https://api.tiny.com.br/api2/produto.obter.php',
        new URLSearchParams({ token: TINY_API_TOKEN, formato: 'JSON', id })
      ),
      axios.post('https://api.tiny.com.br/api2/produto.obter.estoque.php',
        new URLSearchParams({ token: TINY_API_TOKEN, formato: 'JSON', id })
      )
    ]);

    const detRetorno = detalhesResponse.data?.retorno;
    const estRetorno = estoqueResponse.data?.retorno;

    if (!detRetorno || detRetorno.status !== 'OK') {
      return res.status(400).json({ erro: detRetorno?.erros?.[0]?.erro || 'Erro ao obter produto' });
    }
    if (!estRetorno || estRetorno.status !== 'OK') {
      return res.status(400).json({ erro: estRetorno?.erros?.[0]?.erro || 'Erro ao obter estoque' });
    }

    return res.json({ ...detRetorno.produto, estoque_atual: estRetorno.produto.saldo });
  } catch (error) {
    return res.status(500).json({ erro: error.message });
  }
});

// --- NOVAS ROTAS DO MERCADO LIVRE (Proxy) ---

// 1. Preditor de Categoria (Sugestão via Título)
app.get('/api/ml/predict-category', async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ erro: 'Título é obrigatório para predição.' });

  try {
    const response = await axios.get(`https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=3&q=${encodeURIComponent(title)}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar categoria no ML', detalhes: error.message });
  }
});

// 2. Busca de Categorias e Atributos (AGORA FICHA TÉCNICA COMPLETA)
app.get('/api/ml/category-attributes/:categoryId', async (req, res) => {
  const { categoryId } = req.params;
  try {
    const response = await axios.get(`https://api.mercadolibre.com/categories/${categoryId}/attributes`);
    
    // Removemos apenas os atributos "read_only" (somente leitura) que não podem ser enviados
    const validAttributes = response.data.filter(attr => !attr.tags?.read_only);
    
    res.json(validAttributes);
  } catch (error) {
    const status = error.response?.status || 500;
    const mlError = error.response?.data || { message: error.message };
    console.error('❌ Erro ao buscar atributos:', JSON.stringify(mlError, null, 2));
    res.status(status).json({ erro: 'Falha ao buscar atributos', detalhes: mlError });
  }
});

// --- NOVAS ROTAS PARA O NAVEGADOR DE CATEGORIAS EM ÁRVORE ---
// Busca O DUMP COMPLETO de todas as categorias para a pesquisa offline
app.get('/api/ml/categories-all', async (req, res) => {
  try {
    const response = await axios.get('https://api.mercadolibre.com/sites/MLB/categories/all');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao baixar dump de categorias', detalhes: error.message });
  }
});

// --- ROTAS DO NAVEGADOR DE CATEGORIAS ---
app.get('/api/ml/categories', async (req, res) => {
  try {
    const { token } = req.query;
    // Disfarçamos o Axios com o mesmo User-Agent que você usou no Python
    const headers = { 'User-Agent': 'MLTinySimple/1.0' };
    if (token && token !== 'undefined') headers.Authorization = `Bearer ${token}`;

    const response = await axios.get('https://api.mercadolibre.com/sites/MLB/categories', { headers });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ erro: 'Erro categorias', detalhes: error.response?.data });
  }
});

app.get('/api/ml/categories/:id', async (req, res) => {
  try {
    const { token } = req.query;
    const headers = { 'User-Agent': 'MLTinySimple/1.0' };
    if (token && token !== 'undefined') headers.Authorization = `Bearer ${token}`;

    const response = await axios.get(`https://api.mercadolibre.com/categories/${req.params.id}`, { headers });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ erro: 'Erro subcategorias', detalhes: error.response?.data });
  }
});

// --- ROTA PARA PUBLICAR NO MERCADO LIVRE (AGORA COM DESCRIÇÃO) ---
app.post('/api/ml/publish', async (req, res) => {
  const { accessToken, payload, description } = req.body;

  if (!accessToken) {
    return res.status(400).json({ erro: 'Token do Mercado Livre não fornecido.' });
  }

  const tryPost = async (p) => {
    return axios.post('https://api.mercadolibre.com/items', p, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  };

  const tryPostDescription = async (itemId, desc) => {
    try {
      await axios.post(`https://api.mercadolibre.com/items/${itemId}/description`, 
        { plain_text: desc },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      console.log(`✅ Descrição adicionada ao item ${itemId}`);
    } catch (err) {
      console.error(`❌ Erro ao adicionar descrição no item ${itemId}:`, err.response?.data || err.message);
    }
  };

  try {
    console.log('Enviando anúncio para o Mercado Livre...');
    try {
      // 1ª Tentativa (Geralmente com "title")
      const response = await tryPost(payload);
      const itemId = response.data.id;
      console.log('✅ Sucesso! Anúncio criado:', itemId);
      
      // Se tiver descrição, faz o POST na API de descrição do ML
      if (description) await tryPostDescription(itemId, description);

      return res.json(response.data);

    } catch (err1) {
      const status1 = err1.response?.status || 500;
      const mlError1 = err1.response?.data || { message: err1.message };
      const errorText = JSON.stringify(mlError1).toLowerCase();

      // LOGICA DE FALLBACK IDÊNTICA AO SEU PYTHON
      if (status1 === 400 && errorText.includes('family_name')) {
        console.log('🔄 Detectado erro de Title/Family Name. Tentando inverter chaves...');
        const payloadFallback = JSON.parse(JSON.stringify(payload));

        if (payloadFallback.family_name) {
          payloadFallback.title = payloadFallback.family_name;
          delete payloadFallback.family_name;
        } else if (payloadFallback.title) {
          payloadFallback.family_name = payloadFallback.title;
          delete payloadFallback.title;
        }

        try {
          const r2 = await tryPost(payloadFallback);
          const itemId2 = r2.data.id;
          console.log('✅ Sucesso no fallback! Anúncio criado:', itemId2);
          
          if (description) await tryPostDescription(itemId2, description);

          return res.json(r2.data);
        } catch (err2) {
          return res.status(err2.response?.status || 500).json({
            erro: 'Falha ao publicar (Mesmo após fallback)',
            detalhes: err2.response?.data || err2.message,
          });
        }
      }

      return res.status(status1).json({ erro: 'Falha ao publicar no Mercado Livre', detalhes: mlError1 });
    }
  } catch (error) {
    return res.status(500).json({ erro: 'Falha interna no servidor', detalhes: error.message });
  }
});

app.post('/api/ml/auth', async (req, res) => {
  const { code } = req.body;

  try {
    // 1) Troca o code pelo access_token (FORM urlencoded no BODY)
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('client_id', process.env.ML_APP_ID);
    body.append('client_secret', process.env.ML_CLIENT_SECRET);
    body.append('code', code);
    body.append('redirect_uri', process.env.ML_REDIRECT_URI);

    const response = await axios.post(
      'https://api.mercadolibre.com/oauth/token',
      body,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const authData = response.data;

    // 2) Busca nickname da conta
    try {
      const userResponse = await axios.get('https://api.mercadolibre.com/users/me', {
        headers: { Authorization: `Bearer ${authData.access_token}` },
      });
      authData.nickname = userResponse.data.nickname;
    } catch (userErr) {
      console.log('Aviso: Não foi possível buscar o nickname da conta.');
    }

    // 3) Retorna pro front
    res.json(authData);
  } catch (error) {
    console.error('Erro na autenticação ML:', error.response?.data || error.message);
    res.status(500).json({
      erro: 'Falha ao autenticar com o Mercado Livre',
      detalhes: error.response?.data || error.message,
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend rodando em http://localhost:${PORT}`);
});