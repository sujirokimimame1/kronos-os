const express = require('express');
const router = express.Router();

const relatorioController = require('../controllers/relatorioController');

// Relatório geral
router.get('/', relatorioController.getRelatorios);

// Relatório por técnicos
router.get('/tecnicos', relatorioController.getRelatorioTecnicos);

// Relatório por setores
router.get('/setores', relatorioController.getSetores);

module.exports = router;