const express = require('express');
const router = express.Router();
const relatorioController = require('../controllers/relatorioController');

const authMiddleware = require('../middleware/auth');
const { requireTechnical } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', requireTechnical, relatorioController.getRelatorios);
router.get('/tecnicos', requireTechnical, relatorioController.getRelatorioTecnicos);
router.get('/setores', requireTechnical, relatorioController.getSetores);

module.exports = router;