require('../config/env');
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { jwtSecret } = require('../config/env');
const { hashPassword, verifyPassword, isHashedPassword } = require('../utils/password');
const { loginRateLimit, registerFailure, clearFailures } = require('../utils/loginRateLimit');

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

function normalizarTexto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function definirTipoPorSetor(setor, tipoInformado) {
  if (tipoInformado === 'admin') return 'admin';
  if (tipoInformado === 'tecnico') return 'tecnico';
  if (tipoInformado === 'solicitante') return 'solicitante';
  return setoresTecnicos.includes(setor) ? 'tecnico' : 'solicitante';
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
  }

  if (req.user.tipo !== 'admin') {
    return res.status(403).json({ success: false, message: 'Acesso permitido apenas para administradores' });
  }

  return next();
}

router.post('/', async (req, res) => {
  try {
    const nome = normalizarTexto(req.body?.nome);
    const email = normalizarTexto(req.body?.email).toLowerCase();
    const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';
    const setor = normalizarTexto(req.body?.setor);
    const tipo = normalizarTexto(req.body?.tipo);

    if (!nome || !email || !senha || !setor) {
      return res.status(400).json({
        success: false,
        message: 'Nome, email, senha e setor são obrigatórios'
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'A senha deve ter pelo menos 6 caracteres'
      });
    }

    if (!setoresPermitidos.includes(setor)) {
      return res.status(400).json({ success: false, message: 'Setor inválido' });
    }

    const tipoFinal = definirTipoPorSetor(setor, tipo);
    const senhaHash = await hashPassword(senha);

    const result = await db.query(`
      INSERT INTO usuarios (nome, email, senha, setor, tipo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [nome, email, senhaHash, setor, tipoFinal]);

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

router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const email = normalizarTexto(req.body?.email).toLowerCase();
    const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';

    if (!email || !senha) {
      return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios' });
    }

    const row = await db.get(`
      SELECT id, nome, email, senha, setor, tipo
      FROM usuarios
      WHERE email = $1
    `, [email]);

    if (!row) {
      registerFailure(req);
      return res.status(401).json({ success: false, message: 'Email ou senha inválidos' });
    }

    const senhaValida = await verifyPassword(senha, row.senha);
    if (!senhaValida) {
      registerFailure(req);
      return res.status(401).json({ success: false, message: 'Email ou senha inválidos' });
    }

    if (!isHashedPassword(row.senha)) {
      const senhaAtualizada = await hashPassword(senha);
      await db.query('UPDATE usuarios SET senha = $1 WHERE id = $2', [senhaAtualizada, row.id]);
    }

    clearFailures(req);

    const tipoFinal = definirTipoPorSetor(row.setor, row.tipo);
    const token = jwt.sign(
      { id: row.id, email: row.email, tipo: tipoFinal },
      jwtSecret,
      { expiresIn: '8h' }
    );

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

router.get('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const row = await db.get(`
      SELECT id, nome, email, setor, tipo
      FROM usuarios
      WHERE id = $1
    `, [id]);

    if (!row) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }

    res.json({ success: true, user: { ...row, tipo: definirTipoPorSetor(row.setor, row.tipo) } });
  } catch (err) {
    console.error('❌ Erro ao buscar usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT id, nome, email, setor, tipo
      FROM usuarios
      ORDER BY nome
    `, []);

    res.json({
      success: true,
      users: (rows || []).map((user) => ({ ...user, tipo: definirTipoPorSetor(user.setor, user.tipo) }))
    });
  } catch (err) {
    console.error('❌ Erro ao listar usuários:', err);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});



router.put('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const nome = normalizarTexto(req.body?.nome);
    const email = normalizarTexto(req.body?.email).toLowerCase();
    const setor = normalizarTexto(req.body?.setor);
    const tipo = normalizarTexto(req.body?.tipo);
    const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';

    if (!nome || !email || !setor) {
      return res.status(400).json({ success: false, message: 'Nome, email e setor são obrigatórios' });
    }

    if (!setoresPermitidos.includes(setor)) {
      return res.status(400).json({ success: false, message: 'Setor inválido' });
    }

    const existente = await db.get(`SELECT id, email FROM usuarios WHERE id = $1`, [id]);
    if (!existente) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }

    const conflito = await db.get(`SELECT id FROM usuarios WHERE email = $1 AND id <> $2`, [email, id]);
    if (conflito) {
      return res.status(400).json({ success: false, message: 'Já existe outro usuário com este email' });
    }

    const tipoFinal = definirTipoPorSetor(setor, tipo);

    if (senha && senha.length < 6) {
      return res.status(400).json({ success: false, message: 'A senha deve ter pelo menos 6 caracteres' });
    }

    if (senha) {
      const senhaHash = await hashPassword(senha);
      await db.query(`
        UPDATE usuarios
        SET nome = $1, email = $2, setor = $3, tipo = $4, senha = $5
        WHERE id = $6
      `, [nome, email, setor, tipoFinal, senhaHash, id]);
    } else {
      await db.query(`
        UPDATE usuarios
        SET nome = $1, email = $2, setor = $3, tipo = $4
        WHERE id = $5
      `, [nome, email, setor, tipoFinal, id]);
    }

    return res.json({
      success: true,
      message: 'Usuário atualizado com sucesso',
      user: { id: Number(id), nome, email, setor, tipo: tipoFinal }
    });
  } catch (err) {
    console.error('❌ Erro ao atualizar usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});


router.post('/:id/reset-password', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';

    if (!senha || senha.trim().length < 6) {
      return res.status(400).json({ success: false, message: 'A nova senha deve ter pelo menos 6 caracteres' });
    }

    const existente = await db.get(`SELECT id, nome, email FROM usuarios WHERE id = $1`, [id]);
    if (!existente) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }

    const senhaHash = await hashPassword(senha.trim());
    await db.query(`UPDATE usuarios SET senha = $1 WHERE id = $2`, [senhaHash, id]);

    return res.json({
      success: true,
      message: 'Senha redefinida com sucesso',
      user: { id: Number(id), nome: existente.nome, email: existente.email }
    });
  } catch (err) {
    console.error('❌ Erro ao redefinir senha do usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const existente = await db.get(`SELECT id, nome, email, tipo FROM usuarios WHERE id = $1`, [id]);
    if (!existente) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }

    if (Number(req.user.id) === Number(id)) {
      return res.status(400).json({ success: false, message: 'Você não pode excluir seu próprio usuário' });
    }

    await db.query(`DELETE FROM usuarios WHERE id = $1`, [id]);
    return res.json({ success: true, message: 'Usuário excluído com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao excluir usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

module.exports = router;
