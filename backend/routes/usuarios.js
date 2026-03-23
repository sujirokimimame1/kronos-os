const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'kronos_secret_dev';

const setoresSolicitante = [
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

const setoresTecnicos = ['TI', 'Manutenção'];
const setoresPermitidos = [...setoresSolicitante, ...setoresTecnicos];

function definirTipoPorSetor(setor, tipoInformado) {
  if (tipoInformado === 'admin') return 'admin';
  if (tipoInformado === 'tecnico') return 'tecnico';
  if (tipoInformado === 'solicitante') return 'solicitante';
  return 'solicitante';
}

router.post('/', async (req, res) => {
  try {
    const { nome, email, senha, setor, tipo } = req.body;

    if (!nome || !email || !senha || !setor) {
      return res.status(400).json({
        success: false,
        message: 'Nome, email, senha e setor são obrigatórios'
      });
    }

    if (!setoresPermitidos.includes(setor)) {
      return res.status(400).json({ success: false, message: 'Setor inválido' });
    }

    const tipoFinal = definirTipoPorSetor(setor, tipo);
    const query = `
      INSERT INTO usuarios (nome, email, senha, setor, tipo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    const result = await db.query(query, [nome, email, senha, setor, tipoFinal]);
    const userId = result.rows?.[0]?.id || null;

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso!',
      user: { id: userId, nome, email, setor, tipo: tipoFinal }
    });
  } catch (err) {
    console.error('❌ Erro ao criar usuário:', err);

    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('duplicate key value'))) {
      return res.status(400).json({ success: false, message: 'Email já cadastrado' });
    }

    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios' });
    }

    const query = `
      SELECT id, nome, email, setor, tipo
      FROM usuarios
      WHERE email = $1 AND senha = $2
    `;

    const row = await db.get(query, [email, senha]);
    if (!row) {
      return res.status(401).json({ success: false, message: 'Email ou senha inválidos' });
    }

    const tipoFinal = definirTipoPorSetor(row.setor, row.tipo);
    const token = jwt.sign({ id: row.id, email: row.email, tipo: tipoFinal }, JWT_SECRET, { expiresIn: '8h' });

    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      user: {
        id: row.id,
        nome: row.nome,
        email: row.email,
        setor: row.setor,
        tipo: tipoFinal
      },
      token
    });
  } catch (err) {
    console.error('❌ Erro no login:', err);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  const tipoFinal = definirTipoPorSetor(req.user.setor, req.user.tipo);
  res.json({
    success: true,
    user: {
      id: req.user.id,
      nome: req.user.nome,
      email: req.user.email,
      setor: req.user.setor,
      tipo: tipoFinal
    }
  });
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT id, nome, email, setor, tipo
      FROM usuarios
      WHERE id = $1
    `;

    const row = await db.get(query, [id]);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }

    res.json({ success: true, user: { ...row, tipo: definirTipoPorSetor(row.setor, row.tipo) } });
  } catch (err) {
    console.error('❌ Erro ao buscar usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT id, nome, email, setor, tipo
      FROM usuarios
      ORDER BY nome
    `;
    const rows = await db.all(query, []);

    res.json({
      success: true,
      users: (rows || []).map((user) => ({ ...user, tipo: definirTipoPorSetor(user.setor, user.tipo) }))
    });
  } catch (err) {
    console.error('❌ Erro ao listar usuários:', err);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

module.exports = router;
