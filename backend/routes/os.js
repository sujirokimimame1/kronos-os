const express = require('express');
const router = express.Router();
const db = require('../db');

// LISTAR OS
router.get('/', async (req, res) => {
  try {

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      ORDER BY data_abertura DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {

    console.error('Erro ao listar OS:', error);

    res.status(500).json({
      success: false,
      message: 'Erro ao buscar ordens de serviço'
    });

  }
});


// OS POR SETOR (TÉCNICO)
router.get('/setor/:setor', async (req, res) => {

  try {

    const { setor } = req.params;

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      WHERE setor_destino = $1
      ORDER BY data_abertura DESC
    `,[setor]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {

    console.error('Erro ao buscar OS por setor:', error);

    res.status(500).json({
      success:false,
      message:'Erro ao buscar ordens de serviço'
    });

  }

});


// CRIAR OS
router.post('/', async (req,res)=>{

  try{

    const {
      user_id,
      setor_origem,
      setor_destino,
      categoria,
      cliente,
      descricao,
      prioridade
    } = req.body;

    const result = await db.query(`
      INSERT INTO ordens_servico
      (user_id,setor_origem,setor_destino,categoria,cliente,descricao,prioridade,status,data_abertura)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'Aberto',NOW())
      RETURNING *
    `,
    [
      user_id,
      setor_origem,
      setor_destino,
      categoria,
      cliente,
      descricao,
      prioridade
    ]);

    res.json({
      success:true,
      data: result.rows[0]
    });

  }catch(error){

    console.error('Erro ao criar OS:',error);

    res.status(500).json({
      success:false,
      message:'Erro ao criar ordem de serviço'
    });

  }

});


// ATUALIZAR STATUS
router.put('/:id/status', async (req,res)=>{

  try{

    const { id } = req.params;
    const { status } = req.body;

    const result = await db.query(`
      UPDATE ordens_servico
      SET status=$1
      WHERE id=$2
      RETURNING *
    `,[status,id]);

    res.json({
      success:true,
      data: result.rows[0]
    });

  }catch(error){

    console.error('Erro ao atualizar OS:',error);

    res.status(500).json({
      success:false,
      message:'Erro ao atualizar OS'
    });

  }

});

module.exports = router;