const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTechnical } = require('../middleware/auth');

router.use(authMiddleware);

// LISTAR TODAS AS OS - técnico/admin
router.get('/', requireTechnical, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      ORDER BY data_abertura DESC, id DESC
    `);

    res.json({
      success: true,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Erro ao listar OS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar ordens de serviço'
    });
  }
});

// LISTAR MINHAS OS - solicitante/autenticado
router.get('/minhas', async (req, res) => {
  try {
    const userId = req.user_id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }

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
    console.error('Erro ao buscar minhas OS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar suas ordens de serviço'
    });
  }
});

// OS POR SETOR - técnico
router.get('/setor/:setor', requireTechnical, async (req, res) => {
  try {
    const { setor } = req.params;

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      WHERE setor_destino = $1
      ORDER BY data_abertura DESC, id DESC
    `, [setor]);

    res.json({
      success: true,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Erro ao buscar OS por setor:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar ordens de serviço do setor'
    });
  }
});

// BUSCAR OS POR ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      WHERE id = $1
    `, [id]);

    if (!result.rows || result.rows.length === 0) {
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
    console.error('Erro ao buscar OS por ID:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar ordem de serviço'
    });
  }
});

// CRIAR OS
router.post('/', async (req, res) => {
  try {
    const userId = req.user_id || req.user?.id;

    const {
      setor_origem,
      setor_destino,
      categoria,
      cliente,
      descricao,
      prioridade
    } = req.body;

    const result = await db.query(`
      INSERT INTO ordens_servico
      (user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status, data_abertura)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Aberto', NOW())
      RETURNING *
    `, [
      userId,
      setor_origem,
      setor_destino,
      categoria,
      cliente,
      descricao,
      prioridade
    ]);

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao criar OS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar ordem de serviço'
    });
  }
});

// ATUALIZAR STATUS
router.put('/:id/status', requireTechnical, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await db.query(`
      UPDATE ordens_servico
      SET status = $1
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'OS não encontrada'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao atualizar status da OS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar OS'
    });
  }
});

module.exports = router;