const express = require('express');
const router = express.Router();
const { db } = require('../db');

// ✅ Rota para criar usuário (CADASTRO)
router.post('/', (req, res) => {
  const { nome, email, senha, setor } = req.body;

  console.log('📝 Tentando criar usuário:', { nome, email, setor });

  if (!nome || !email || !senha) {
    return res.status(400).json({
      success: false,
      message: 'Nome, email e senha são obrigatórios'
    });
  }

  const query = `
    INSERT INTO usuarios (nome, email, senha, setor)
    VALUES (?, ?, ?, ?)
  `;

  db.run(query, [nome, email, senha, setor || 'Pronto Socorro'], function(err) {
    if (err) {
      console.error('❌ Erro ao criar usuário:', err);
      
      if (err.message.includes('UNIQUE constraint failed')) {
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
        nome: nome,
        email: email,
        setor: setor || 'Pronto Socorro'
      }
    });
  });
});

// ✅ LOGIN
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
    SELECT id, nome, email, setor 
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

    // Gerar token simples
    const token = Buffer.from(`${row.id}:${Date.now()}`).toString('base64');
    
    console.log('✅ Login bem-sucedido:', row.nome);
    
    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      user: {
        id: row.id,
        nome: row.nome,
        email: row.email,
        setor: row.setor
      },
      token: token
    });
  });
});

// ✅ Buscar usuário por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT id, nome, email, setor
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
      user: row
    });
  });
});

// ✅ Listar todos os usuários (para debug)
router.get('/', (req, res) => {
  const query = `
    SELECT id, nome, email, setor
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
      users: rows
    });
  });
});

module.exports = router;