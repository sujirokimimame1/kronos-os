const express = require('express');
const router = express.Router();
const relatorioController = require('../controllers/relatorioController');

// ✅ CORREÇÃO: Usar o middleware externo
const authMiddleware = require('../middleware/auth');

// Aplicar middleware em todas as rotas
router.use(authMiddleware);

// Rota para relatórios principais com filtros
router.get('/', relatorioController.getRelatorios);

// Rota para relatório de setores/tecnicos
router.get('/tecnicos', relatorioController.getRelatorioTecnicos);

// Rota para listar setores
router.get('/setores', relatorioController.getSetores);

module.exports = router;