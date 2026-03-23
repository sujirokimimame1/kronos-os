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
  'Fisioterapia'
];

const setoresDestinoValidos = ['TI', 'Manutenção'];
const statusPermitidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];
const TAMANHO_MAX_BASE64 = 5 * 1024 * 1024 * 1.37;
let schemaGarantido = false;

async function garantirColunasFoto() {
  if (schemaGarantido) return;

  await db.query(`
    ALTER TABLE ordens_servico
    ADD COLUMN IF NOT EXISTS foto_base64 TEXT
  `);

  await db.query(`
    ALTER TABLE ordens_servico
    ADD COLUMN IF NOT EXISTS foto_mime_type VARCHAR(100)
  `);

  await db.query(`
    ALTER TABLE ordens_servico
    ADD COLUMN IF NOT EXISTS foto_nome VARCHAR(255)
  `);

  schemaGarantido = true;
}

function normalizarBase64(valor) {
  if (!valor || typeof valor !== 'string') return null;
  return valor.replace(/^data:[^;]+;base64,/, '').trim();
}

router.get('/painel-tv', async (req, res) => {
  try {
    await garantirColunasFoto();

    const [resultAtivas, resultStats] = await Promise.all([
      db.query(`
        SELECT id, user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status, data_abertura, data_fechamento, relato_tecnico
        FROM ordens_servico
        WHERE status IN ('Aberto', 'Em Andamento', 'Aguardando Peças')
        ORDER BY
          CASE
            WHEN prioridade = 'Crítica' THEN 1
            WHEN prioridade = 'Alta' THEN 2
            WHEN prioridade = 'Média' THEN 3
            WHEN prioridade = 'Baixa' THEN 4
            ELSE 5
          END,
          data_abertura DESC,
          id DESC
      `),
      db.query(`
        SELECT
          COUNT(*)::int AS total_geral,
          COUNT(*) FILTER (
            WHERE status <> 'Finalizado'
              AND DATE(data_abertura AT TIME ZONE 'America/Fortaleza') = DATE(NOW() AT TIME ZONE 'America/Fortaleza')
          )::int AS total_dia_nao_finalizado
        FROM ordens_servico
      `)
    ]);

    const stats = resultStats.rows?.[0] || {};

    res.json({
      success: true,
      data: resultAtivas.rows || [],
      stats: {
        total_geral: Number(stats.total_geral || 0),
        total_dia_nao_finalizado: Number(stats.total_dia_nao_finalizado || 0)
      }
    });
  } catch (error) {
    console.error('❌ Erro ao carregar painel TV:', error);
    res.status(500).json({ success: false, message: 'Erro ao carregar painel TV' });
  }
});

router.get('/minhas', authMiddleware, async (req, res) => {
  try {
    await garantirColunasFoto();

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
    await garantirColunasFoto();

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
    await garantirColunasFoto();

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
    await garantirColunasFoto();

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
    await garantirColunasFoto();

    const user_id = req.user_id || req.user?.id;
    const { setor_origem, setor_destino, categoria, cliente, descricao, prioridade, foto_base64, foto_mime_type, foto_nome } = req.body;

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

    const base64Limpa = normalizarBase64(foto_base64);
    const mimePermitido = !foto_mime_type || ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(String(foto_mime_type).toLowerCase());

    if (base64Limpa && base64Limpa.length > TAMANHO_MAX_BASE64) {
      return res.status(400).json({
        success: false,
        message: 'A foto é muito grande. Use uma imagem de até 5 MB.'
      });
    }

    if (base64Limpa && !mimePermitido) {
      return res.status(400).json({
        success: false,
        message: 'Formato de imagem inválido. Use JPG, PNG ou WEBP.'
      });
    }

    const result = await db.query(`
      INSERT INTO ordens_servico
      (user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status, data_abertura, foto_base64, foto_mime_type, foto_nome)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Aberto', NOW(), $8, $9, $10)
      RETURNING *
    `, [
      user_id,
      setor_origem,
      setor_destino,
      categoria || 'Geral',
      cliente || 'Não informado',
      descricao,
      prioridade,
      base64Limpa,
      base64Limpa ? (foto_mime_type || 'image/jpeg') : null,
      base64Limpa ? (foto_nome || 'imagem-os') : null
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao criar OS:', error);
    res.status(500).json({ success: false, message: error?.detail || error?.message || 'Erro ao criar ordem de serviço' });
  }
});

router.put('/:id/status', authMiddleware, requireTechnical, async (req, res) => {
  try {
    await garantirColunasFoto();

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
    await garantirColunasFoto();

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
