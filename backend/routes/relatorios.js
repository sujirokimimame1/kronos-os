const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { requireTechnical } = require('../middleware/auth');
const relatorioController = require('../controllers/relatorioController');

router.use(authMiddleware, requireTechnical);

router.get('/', relatorioController.getRelatorios);
router.get('/dashboard/resumo', relatorioController.getDashboardResumo);
router.get('/sla/resumo', relatorioController.getSlaResumo);
router.get('/tecnicos', relatorioController.getRelatorioTecnicos);
router.get('/setores', relatorioController.getSetores);

module.exports = router;
