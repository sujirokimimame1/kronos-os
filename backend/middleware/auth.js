// middleware/auth.js
const { db } = require('../models/OrdemServico');

module.exports = function(req, res, next) {
    const authHeader = req.header('Authorization');
    const token = authHeader ? authHeader.replace('Bearer ', '') : req.query.token;
    
    console.log('🔐 Middleware - Token recebido:', token ? token.substring(0, 20) + '...' : 'Nenhum');
    
    if (!token) {
        console.error('❌ Middleware - Token não fornecido');
        return res.status(401).json({ 
            success: false, 
            message: 'Token de acesso necessário' 
        });
    }
    
    try {
        // Decodificar o token simples (base64)
        const decoded = Buffer.from(token, 'base64').toString('ascii');
        console.log('🔐 Middleware - Token decodificado:', decoded);
        
        const [user_id, timestamp] = decoded.split(':');
        
        if (!user_id) {
            console.error('❌ Middleware - User ID não encontrado no token');
            return res.status(401).json({
                success: false,
                message: 'Token inválido'
            });
        }
        
        console.log('🔐 Middleware - User ID extraído:', user_id);
        
        // Verificar se o usuário existe no banco
        db.get('SELECT id, nome, email FROM usuarios WHERE id = ?', [user_id], (err, row) => {
            if (err) {
                console.error('❌ Middleware - Erro ao verificar usuário:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Erro interno do servidor'
                });
            }
            
            if (!row) {
                console.error('❌ Middleware - Usuário não encontrado no banco');
                return res.status(401).json({
                    success: false,
                    message: 'Usuário não encontrado'
                });
            }
            
            // ✅ DEFINIR o user_id na requisição
            req.user_id = parseInt(user_id);
            req.user = row;
            
            console.log('✅ Middleware - Autenticação OK. User ID definido:', req.user_id);
            console.log('✅ Middleware - Usuário:', row.nome, row.email);
            
            next();
        });
        
    } catch (error) {
        console.error('❌ Middleware - Erro ao processar token:', error);
        return res.status(401).json({
            success: false,
            message: 'Token inválido'
        });
    }
};