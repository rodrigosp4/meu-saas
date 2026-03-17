// =====================================================================
// backend/src/controllers/compat.controller.js
// =====================================================================
// Controller para todas as operações de compatibilidade veicular.
// Conecta as rotas HTTP ao serviço de compatibilidade e ao Prisma (perfis).
// =====================================================================

import { compatService } from '../services/compat.service.js';
import { mlService } from '../services/ml.service.js';
import prisma from '../config/prisma.js';

// Helper para obter token ativo de uma conta
async function getActiveToken(contaId, userId) {
  const conta = await prisma.contaML.findFirst({ where: { id: contaId, userId } });
  if (!conta) throw new Error('Conta ML não encontrada ou não pertence ao usuário.');

  let activeToken = conta.accessToken;
  try {
    const refreshed = await mlService.refreshToken(conta.refreshToken);
    if (refreshed?.access_token) {
      activeToken = refreshed.access_token;
      await prisma.contaML.update({
        where: { id: contaId },
        data: {
          accessToken: activeToken,
          refreshToken: refreshed.refresh_token || conta.refreshToken,
          expiresAt: BigInt(Date.now() + (refreshed.expires_in || 21600) * 1000),
        },
      });
    }
  } catch (_) {
    // Se falhar refresh, usa token existente
  }
  return activeToken;
}

export const compatController = {

  // ==================================================================
  // 1. GET /api/compat/config
  //    Retorna configuração do domínio de veículos (attrs em ordem)
  // ==================================================================
  async getConfig(req, res) {
    try {
      const config = compatService.getVehicleDomainConfig();

      // Se tiver contaId e userId, busca nomes dos atributos via API
      const { contaId, userId } = req.query;
      if (contaId && userId) {
        const token = await getActiveToken(contaId, userId);
        const displayNames = await compatService.getAttributeDisplayNames(token, config.domainId);
        config.attributeNames = displayNames;
      }

      res.json(config);
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },

  // ==================================================================
  // 2. POST /api/compat/attribute-values
  //    Retorna os top_values de um atributo (cascata)
  //    Body: { contaId, userId, domainId, attributeId, knownAttributes }
  // ==================================================================
  async getAttributeValues(req, res) {
    try {
      const { contaId, userId, domainId, attributeId, knownAttributes } = req.body;
      if (!contaId || !userId || !domainId || !attributeId) {
        return res.status(400).json({ erro: 'Parâmetros obrigatórios: contaId, userId, domainId, attributeId' });
      }

      const token = await getActiveToken(contaId, userId);
      const values = await compatService.getAttributeTopValues(token, domainId, attributeId, knownAttributes || []);
      res.json({ values });
    } catch (error) {
      console.error('[compat] getAttributeValues error:', error.message);
      res.status(error.response?.status || 500).json({ erro: error.message, detalhes: error.response?.data });
    }
  },

  // ==================================================================
  // 3. POST /api/compat/search-vehicles
  //    Busca veículos no catálogo ML
  //    Body: { contaId, userId, domainId, knownAttributes, maxResults }
  // ==================================================================
  async searchVehicles(req, res) {
    try {
      const { contaId, userId, domainId, knownAttributes, maxResults } = req.body;
      if (!contaId || !userId || !domainId) {
        return res.status(400).json({ erro: 'Parâmetros obrigatórios: contaId, userId, domainId' });
      }

      const token = await getActiveToken(contaId, userId);
      const result = await compatService.searchVehicles(token, domainId, knownAttributes || [], maxResults || 5000);
      res.json(result);
    } catch (error) {
      console.error('[compat] searchVehicles error:', error.message);
      res.status(error.response?.status || 500).json({ erro: error.message, detalhes: error.response?.data });
    }
  },

  // ==================================================================
  // 4. POST /api/compat/load-item
  //    Carrega compatibilidades existentes de um item ML
  //    Body: { contaId, userId, itemId }
  // ==================================================================
  async loadItemCompatibilities(req, res) {
    try {
      const { contaId, userId, itemId } = req.body;
      if (!contaId || !userId || !itemId) {
        return res.status(400).json({ erro: 'Parâmetros obrigatórios: contaId, userId, itemId' });
      }

      const token = await getActiveToken(contaId, userId);
      const result = await compatService.getItemCompatibilities(token, itemId);
      res.json(result);
    } catch (error) {
      console.error('[compat] loadItemCompatibilities error:', error.message);
      res.status(error.response?.status || 500).json({ erro: error.message, detalhes: error.response?.data });
    }
  },

  // ==================================================================
  // 5. POST /api/compat/apply-item
  //    Aplica (PUT) lista de compatibilidades a um item no ML
  //    Body: { contaId, userId, itemId, compatibilities }
  // ==================================================================
  async applyItemCompatibilities(req, res) {
    try {
      const { contaId, userId, itemId, compatibilities } = req.body;
      if (!contaId || !userId || !itemId || !Array.isArray(compatibilities)) {
        return res.status(400).json({ erro: 'Parâmetros obrigatórios: contaId, userId, itemId, compatibilities[]' });
      }

      const token = await getActiveToken(contaId, userId);
      const result = await compatService.applyItemCompatibilities(token, itemId, compatibilities);
      res.json(result);
    } catch (error) {
      console.error('[compat] applyItemCompatibilities error:', error.message);
      const status = error.response?.status || 500;
      res.status(status).json({ erro: error.message, detalhes: error.response?.data });
    }
  },

  // ==================================================================
  // 6. GET /api/compat/perfis?userId=xxx
  //    Lista todos os perfis de compatibilidade do usuário
  // ==================================================================
  async listarPerfis(req, res) {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });

      const perfis = await prisma.perfilCompatibilidade.findMany({
        where: { userId },
        select: { id: true, nome: true, descricao: true, createdAt: true, updatedAt: true },
        orderBy: { nome: 'asc' },
      });
      res.json(perfis);
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },

  // ==================================================================
  // 7. GET /api/compat/perfis/:id?userId=xxx
  //    Carrega um perfil específico (com os dados JSON)
  // ==================================================================
  async carregarPerfil(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });

      const perfil = await prisma.perfilCompatibilidade.findFirst({
        where: { id, userId },
      });
      if (!perfil) return res.status(404).json({ erro: 'Perfil não encontrado' });

      let compatibilities = [];
      try {
        compatibilities = JSON.parse(perfil.compatibilidadesJson);
      } catch (_) {}

      res.json({
        id: perfil.id,
        nome: perfil.nome,
        descricao: perfil.descricao,
        compatibilities,
        createdAt: perfil.createdAt,
        updatedAt: perfil.updatedAt,
      });
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },

  // ==================================================================
  // 8. POST /api/compat/perfis
  //    Cria ou atualiza um perfil de compatibilidade
  //    Body: { userId, nome, descricao, compatibilities }
  // ==================================================================
  async salvarPerfil(req, res) {
    try {
      const { userId, nome, descricao, compatibilities } = req.body;
      if (!userId || !nome || !Array.isArray(compatibilities)) {
        return res.status(400).json({ erro: 'Parâmetros obrigatórios: userId, nome, compatibilities[]' });
      }

      const jsonStr = JSON.stringify(compatibilities);

      const perfil = await prisma.perfilCompatibilidade.upsert({
        where: { userId_nome: { userId, nome } },
        update: {
          descricao: descricao || '',
          compatibilidadesJson: jsonStr,
        },
        create: {
          userId,
          nome,
          descricao: descricao || '',
          compatibilidadesJson: jsonStr,
        },
      });

      res.json({
        id: perfil.id,
        nome: perfil.nome,
        descricao: perfil.descricao,
        message: 'Perfil salvo com sucesso',
      });
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },

  // ==================================================================
  // 9. POST /api/compat/posicoes
  //    Retorna os valores de posição (POSITION restriction) para um domínio
  //    Body: { contaId, userId, mainDomainId, secondaryDomainId }
  // ==================================================================
  async getPosicoes(req, res) {
    try {
      const { contaId, userId, mainDomainId, secondaryDomainId } = req.body;
      if (!contaId || !userId) {
        return res.status(400).json({ erro: 'contaId e userId obrigatórios' });
      }
      const token = await getActiveToken(contaId, userId);
      const result = await compatService.getPositionValues(token, mainDomainId, secondaryDomainId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },

// ==================================================================
  // 10. POST /api/compat/aplicar-lote
  //     Aplica compatibilidades de um perfil a múltiplos itens ML
  // ==================================================================
  async aplicarPerfilEmLote(req, res) {
    try {
      const { contaId, userId, itemIds, compatibilities } = req.body;
      if (!userId || !Array.isArray(itemIds) || !Array.isArray(compatibilities)) {
        return res.status(400).json({ erro: 'Parâmetros obrigatórios: userId, itemIds[], compatibilities[]' });
      }
      if (itemIds.length === 0) return res.status(400).json({ erro: 'Nenhum item informado.' });
      if (compatibilities.length === 0) return res.status(400).json({ erro: 'Nenhuma compatibilidade informada.' });

      // 1. Descobre a qual conta cada anúncio pertence consultando o banco local
      const anunciosBD = await prisma.anuncioML.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, contaId: true }
      });

      // 2. Agrupa os itens por Conta (para pegar o token só uma vez por conta)
      const porConta = {};
      for (const id of itemIds) {
        const ad = anunciosBD.find(a => a.id === id);
        // Se não achar no banco, usa a conta enviada pelo front como fallback
        const targetConta = ad ? ad.contaId : contaId; 
        if (!targetConta) continue;

        if (!porConta[targetConta]) porConta[targetConta] = [];
        porConta[targetConta].push(id);
      }

      const results = [];

      // 3. Executa a aplicação usando o Token correto para cada grupo de itens
      for (const [cId, ids] of Object.entries(porConta)) {
        try {
          const token = await getActiveToken(cId, userId);
          for (const itemId of ids) {
            try {
              const r = await compatService.applyItemCompatibilities(token, itemId, compatibilities);
              results.push({ itemId, success: true, message: r.message });
            } catch (err) {
              results.push({ itemId, success: false, erro: err.response?.data?.message || err.message });
            }
          }
        } catch (tokenErr) {
          // Se o token da conta falhar, marca erro para todos os itens dessa conta
          for (const itemId of ids) {
            results.push({ itemId, success: false, erro: 'Falha de autenticação na conta deste anúncio.' });
          }
        }
      }

      const sucessos = results.filter(r => r.success).length;
      const erros = results.filter(r => !r.success).length;
      res.json({ results, sucessos, erros });

    } catch (error) {
      console.error('[compat] aplicarPerfilEmLote error:', error.message);
      res.status(500).json({ erro: error.message });
    }
  },

  // ==================================================================
  // 11. DELETE /api/compat/perfis/:id?userId=xxx
  //     Deleta um perfil de compatibilidade
  // ==================================================================
  async deletarPerfil(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ erro: 'userId obrigatório' });

      const perfil = await prisma.perfilCompatibilidade.findFirst({ where: { id, userId } });
      if (!perfil) return res.status(404).json({ erro: 'Perfil não encontrado' });

      await prisma.perfilCompatibilidade.delete({ where: { id } });
      res.json({ success: true, message: 'Perfil deletado' });
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },

  // ==================================================================
  // 12. PUT /api/compat/perfis/:id
  //     Renomeia um perfil de compatibilidade
  //     Body: { userId, nome }
  // ==================================================================
  async renomearPerfil(req, res) {
    try {
      const { id } = req.params;
      const { userId, nome } = req.body;
      console.log('[renomearPerfil] id:', id, 'userId:', userId, 'nome:', nome);
      if (!userId || !nome) return res.status(400).json({ erro: 'userId e nome obrigatórios' });

      const perfil = await prisma.perfilCompatibilidade.findFirst({ where: { id, userId } });
      console.log('[renomearPerfil] perfil encontrado:', perfil ? perfil.nome : 'null');
      if (!perfil) return res.status(404).json({ erro: 'Perfil não encontrado' });

      const updated = await prisma.perfilCompatibilidade.update({ where: { id }, data: { nome: nome.trim() } });
      res.json({ id: updated.id, nome: updated.nome });
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  },
};
