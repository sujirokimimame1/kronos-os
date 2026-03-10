const express = require('express');
const router = express.Router();
const { db } = require('../db');

function definirTipoPorSetor(setor, tipoInformado) {
  if (
    tipoInformado === 'admin' ||
    tipoInformado === 'tecnico' ||
    tipoInformado === 'solicitante'
  ) {
    return tipoInformado;
  }

  if (setor === 'TI' || setor === 'Manutenção') {
    return 'tecnico';
  }

  return 'solicitante';
}

// Criar usuário
router.post('/', (req, res) => {
  const { nome, email, senha, setor, tipo } = req.body;

  console.log('📝 Tentando criar usuário:', { nome, email, setor });

  if (!nome || !email || !senha) {
    return res.status(400).json({
      success: false,
      message: 'Nome, email e senha são obrigatórios'
    });
  }

  const setorFinal = setor || 'Pronto Socorro';
  const tipoFinal = definirTipoPorSetor(setorFinal, tipo);

  const query = `
    INSERT INTO usuarios (nome, email, senha, setor, tipo)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(query, [nome, email, senha, setorFinal, tipoFinal], function (err) {
    if (err) {
      console.error('❌ Erro ao criar usuário:', err);

      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({
          success: false,
          message: 'Email já cadastrado'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }

    console.log('✅ Usuário criado com ID:', this.lastID);

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso!',
      user: {
        id: this.lastID,
        nome,
        email,
        setor: setorFinal,
        tipo: tipoFinal
      }
    });
  });
});

// Login
router.post('/login', (req, res) => {
  const { email, senha } = req.body;

  console.log('🔐 Tentando login:', { email });

  if (!email || !senha) {
    return res.status(400).json({
      success: false,
      message: 'Email e senha são obrigatórios'
    });
  }

  const query = `
    SELECT id, nome, email, setor, tipo
    FROM usuarios
    WHERE email = ? AND senha = ?
  `;

  db.get(query, [email, senha], (err, row) => {
    if (err) {
      console.error('❌ Erro no login:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }

    if (!row) {
      console.log('❌ Login falhou: credenciais inválidas');
      return res.status(401).json({
        success: false,
        message: 'Email ou senha inválidos'
      });
    }

    const tipoFinal = definirTipoPorSetor(row.setor, row.tipo);
    const token = Buffer.from(`${row.id}:${Date.now()}`).toString('base64');

    console.log('✅ Login bem-sucedido:', row.nome);

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
  });
});

// Buscar usuário por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT id, nome, email, setor, tipo
    FROM usuarios
    WHERE id = ?
  `;

  db.get(query, [id], (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar usuário:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }

    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    res.json({
      success: true,
      user: {
        ...row,
        tipo: definirTipoPorSetor(row.setor, row.tipo)
      }
    });
  });
});

// Listar usuários
router.get('/', (req, res) => {
  const query = `
    SELECT id, nome, email, setor, tipo
    FROM usuarios
    ORDER BY nome
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('❌ Erro ao listar usuários:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }

    res.json({
      success: true,
      users: (rows || []).map(user => ({
        ...user,
        tipo: definirTipoPorSetor(user.setor, user.tipo)
      }))
    });
  });
});

module.exports = router;