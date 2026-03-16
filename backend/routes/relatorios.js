const express = require('express');
const router = express.Router();

// Importa o controller de relatórios
const relatorioController = require('../controllers/relatorioController');

/**
 * ROTAS DE RELATÓRIOS
 * Base: /api/relatorios
 */

// Relatório geral do sistema
router.get('/', relatorioController.getRelatorios);

// Relatório por técnicos
router.get('/tecnicos', relatorioController.getRelatorioTecnicos);

// Lista de setores disponíveis
router.get('/setores', relatorioController.getSetores);

module.exports = router;