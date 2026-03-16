const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');

// ✅ ROTA NOVA: Listar minhas OS - PARA SOLICITANTES
// Esta rota DEVE vir antes de router.get('/:id', ...)
router.get('/minhas', authMiddleware, async (req, res) => {
  try {
    const userId = req.user_id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }

    console.log(`📋 Buscando OS para usuário: ${userId}`);

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      WHERE user_id = $1
      ORDER BY data_abertura DESC, id DESC
    `, [userId]);

    res.json({
      success: true,
      data: result.rows || []
    });

  } catch (error) {
    console.error('❌ Erro ao buscar minhas OS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar suas ordens de serviço'
    });
  }
});

// LISTAR TODAS OS
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      ORDER BY data_abertura DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('❌ Erro ao listar OS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar ordens de serviço'
    });
  }
});

// OS POR SETOR (TÉCNICO)
router.get('/setor/:setor', async (req, res) => {
  try {
    const { setor } = req.params;

    console.log(`🔧 Buscando OS para setor: ${setor}`);

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      WHERE setor_destino = $1
      ORDER BY 
        CASE 
          WHEN prioridade = 'Crítica' THEN 1
          WHEN prioridade = 'Alta' THEN 2
          WHEN prioridade = 'Média' THEN 3
          WHEN prioridade = 'Baixa' THEN 4
          ELSE 5
        END,
        data_abertura ASC
    `, [setor]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('❌ Erro ao buscar OS por setor:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar ordens de serviço'
    });
  }
});

// ✅ ROTA ESPECÍFICA: Buscar OS por ID
// Esta rota DEVE vir depois de /minhas e /setor/:setor
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID inválido'
      });
    }

    console.log(`🔍 Buscando OS com ID: ${id}`);

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ordem de serviço não encontrada'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao buscar OS por ID:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar ordem de serviço'
    });
  }
});

// CRIAR OS
router.post('/', async (req, res) => {
  try {
    const {
      user_id,
      setor_origem,
      setor_destino,
      categoria,
      cliente,
      descricao,
      prioridade
    } = req.body;

    if (!user_id || !setor_origem || !setor_destino || !descricao || !prioridade) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: user_id, setor_origem, setor_destino, descricao, prioridade'
      });
    }

    console.log('📝 Criando nova OS:', {
      user_id,
      setor_origem,
      setor_destino,
      categoria,
      cliente,
      prioridade
    });

    const result = await db.query(`
      INSERT INTO ordens_servico
      (user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status, data_abertura)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Aberto', NOW())
      RETURNING *
    `,
    [
      user_id,
      setor_origem,
      setor_destino,
      categoria || 'Geral',
      cliente || 'Não informado',
      descricao,
      prioridade
    ]);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao criar OS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar ordem de serviço'
    });
  }
});

// ATUALIZAR STATUS
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, relato_tecnico } = req.body;

    const statusPermitidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];
    if (!statusPermitidos.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status inválido. Permitidos: ${statusPermitidos.join(', ')}`
      });
    }

    console.log(`🔄 Atualizando OS ${id} para status: ${status}`);

    let query = `
      UPDATE ordens_servico
      SET status = $1
    `;
    const params = [status];
    let paramIndex = 2;

    if (status === 'Finalizado') {
      query += `, data_fechamento = NOW()`;
    }

    if (relato_tecnico) {
      query += `, relato_tecnico = $${paramIndex}`;
      params.push(relato_tecnico);
      paramIndex++;
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(id);

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ordem de serviço não encontrada'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao atualizar OS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar OS'
    });
  }
});

// EXCLUIR OS
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      DELETE FROM ordens_servico
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ordem de serviço não encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Ordem de serviço excluída com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao excluir OS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao excluir ordem de serviço'
    });
  }
});

module.exports = router;