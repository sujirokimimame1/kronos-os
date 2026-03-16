const express = require('express');
const router = express.Router();

// Controller
const relatorioController = require('../controllers/relatorioController');

/**
 * RELATÓRIOS DO SISTEMA
 * Base: /api/relatorios
 */

// Relatório geral (dashboard)
router.get('/', relatorioController.getRelatorios);

// Relatório por técnicos
router.get('/tecnicos', relatorioController.getRelatorioTecnicos);

// Relatório por setores
router.get('/setores', relatorioController.getSetores);

// Status do sistema
router.get('/status', relatorioController.getStatus);

module.exports = router;