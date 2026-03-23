const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');

// 🔥 LISTA OFICIAL DE SETORES
const setoresValidos = [
  "TI",
  "Manutenção",
  "RH",
  "Financeiro",
  "Hotelaria",
  "Assistência Social",
  "Direção",
  "Faturamento"
];

// ✅ ROTA: Minhas OS
router.get('/minhas', authMiddleware, async (req, res) => {
  try {
    const userId = req.user_id || req.user?.id;

    const result = await db.query(`
      SELECT * FROM ordens_servico
      WHERE user_id = $1
      ORDER BY data_abertura DESC, id DESC
    `, [userId]);

    res.json({ success: true, data: result.rows || [] });

  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// LISTAR TODAS
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM ordens_servico
      ORDER BY data_abertura DESC
    `);

    res.json({ success: true, data: result.rows });

  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// 🔧 OS POR SETOR
router.get('/setor/:setor', async (req, res) => {
  try {
    const { setor } = req.params;

    if (!setoresValidos.includes(setor)) {
      return res.status(400).json({
        success: false,
        message: 'Setor inválido'
      });
    }

    const result = await db.query(`
      SELECT * FROM ordens_servico
      WHERE setor_destino = $1
      ORDER BY data_abertura ASC
    `, [setor]);

    res.json({ success: true, data: result.rows });

  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// BUSCAR POR ID
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM ordens_servico
      WHERE id = $1
    `, [req.params.id]);

    res.json({ success: true, data: result.rows[0] });

  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// 🚀 CRIAR OS (COM VALIDAÇÃO)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user_id || req.user?.id;

    const {
      setor_origem,
      setor_destino,
      categoria,
      cliente,
      descricao,
      prioridade
    } = req.body;

    // 🔥 VALIDAÇÃO DOS SETORES
    if (!setoresValidos.includes(setor_origem) || !setoresValidos.includes(setor_destino)) {
      return res.status(400).json({
        success: false,
        message: 'Setor inválido'
      });
    }

    const result = await db.query(`
      INSERT INTO ordens_servico
      (user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status, data_abertura)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'Aberto',NOW())
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

    res.status(201).json({ success: true, data: result.rows[0] });

  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// STATUS
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    const result = await db.query(`
      UPDATE ordens_servico
      SET status = $1
      WHERE id = $2
      RETURNING *
    `, [status, req.params.id]);

    res.json({ success: true, data: result.rows[0] });

  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// EXCLUIR
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM ordens_servico WHERE id = $1`, [req.params.id]);

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;