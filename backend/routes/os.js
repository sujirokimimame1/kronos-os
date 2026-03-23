const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTechnical } = require('../middleware/auth');

const setoresOrigemValidos = [
  'Pronto Socorro',
  'Recepção',
  'Ambulatório',
  'Administrativo',
  'RH',
  'Financeiro',
  'Hotelaria',
  'Assistência Social',
  'Direção',
  'Faturamento',
  'Maternidade',
  'Clínica Médica',
  'Clínica Cirúrgica',
  'Centro Cirúrgico',
  'Tomografia',
  'Mamografia',
  'HEMOPI',
  'Núcleos',
  'UTI',
  'Farmácia',
  'Almoxarifado',
  'Nutrição',
  'Laboratório',
  'Fisioterapia',
  'TI',
  'Manutenção'
];

const setoresDestinoValidos = ['TI', 'Manutenção'];
const statusPermitidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];

router.get('/minhas', authMiddleware, async (req, res) => {
  try {
    const userId = req.user_id || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
    }

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      WHERE user_id = $1
      ORDER BY data_abertura DESC, id DESC
    `, [userId]);

    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('❌ Erro ao buscar minhas OS:', error);
    res.status(500).json({ success: false, message: 'Erro ao carregar suas ordens de serviço' });
  }
});

router.get('/', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      ORDER BY data_abertura DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Erro ao listar OS:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar ordens de serviço' });
  }
});

router.get('/setor/:setor', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { setor } = req.params;

    if (!setoresDestinoValidos.includes(setor)) {
      return res.status(400).json({ success: false, message: 'Setor técnico inválido' });
    }

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
        data_abertura ASC,
        id DESC
    `, [setor]);

    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('❌ Erro ao buscar OS por setor:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar ordens de serviço' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'ID inválido' });
    }

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      WHERE id = $1
    `, [id]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ordem de serviço não encontrada' });
    }

    const os = result.rows[0];
    const isTech = req.user?.tipo === 'tecnico' || req.user?.tipo === 'admin';
    const isOwner = os.user_id === (req.user_id || req.user?.id);

    if (!isTech && !isOwner) {
      return res.status(403).json({ success: false, message: 'Acesso negado' });
    }

    res.json({ success: true, data: os });
  } catch (error) {
    console.error('❌ Erro ao buscar OS por ID:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar ordem de serviço' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user_id || req.user?.id;
    const { setor_origem, setor_destino, categoria, cliente, descricao, prioridade } = req.body;

    if (!user_id) {
      return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
    }

    if (!setor_origem || !setor_destino || !descricao || !prioridade) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: setor_origem, setor_destino, descricao, prioridade'
      });
    }

    if (!setoresOrigemValidos.includes(setor_origem)) {
      return res.status(400).json({ success: false, message: 'Setor de origem inválido' });
    }

    if (!setoresDestinoValidos.includes(setor_destino)) {
      return res.status(400).json({ success: false, message: 'Setor de destino inválido' });
    }

    const result = await db.query(`
      INSERT INTO ordens_servico
      (user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status, data_abertura)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Aberto', NOW())
      RETURNING *
    `, [
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
    console.error('❌ Erro ao criar OS:', error);
    res.status(500).json({ success: false, message: error?.detail || error?.message || 'Erro ao criar ordem de serviço' });
  }
});

router.put('/:id/status', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, relato_tecnico } = req.body;

    if (!statusPermitidos.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status inválido. Permitidos: ${statusPermitidos.join(', ')}`
      });
    }

    let query = `UPDATE ordens_servico SET status = $1`;
    const params = [status];
    let paramIndex = 2;

    if (status === 'Finalizado') {
      query += `, data_fechamento = NOW()`;
    }

    if (typeof relato_tecnico === 'string') {
      query += `, relato_tecnico = $${paramIndex}`;
      params.push(relato_tecnico);
      paramIndex += 1;
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(id);

    const result = await db.query(query, params);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ordem de serviço não encontrada' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao atualizar OS:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar OS' });
  }
});

router.delete('/:id', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      DELETE FROM ordens_servico
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ordem de serviço não encontrada' });
    }

    res.json({
      success: true,
      message: 'Ordem de serviço excluída com sucesso',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erro ao excluir OS:', error);
    res.status(500).json({ success: false, message: 'Erro ao excluir ordem de serviço' });
  }
});

module.exports = router;
