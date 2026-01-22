// ✅ CORREÇÃO: Sistema de autenticação e utilitários corrigidos
const API_BASE_URL = window.location.origin;

// Sistema de autenticação
class AuthSystem {
    static isAuthenticated() {
        return localStorage.getItem('kronos_user') && localStorage.getItem('kronos_token');
    }

    static getUser() {
        try {
            return JSON.parse(localStorage.getItem('kronos_user'));
        } catch {
            return null;
        }
    }

    static getToken() {
        return localStorage.getItem('kronos_token');
    }

    static logout() {
        localStorage.removeItem('kronos_user');
        localStorage.removeItem('kronos_token');
        localStorage.removeItem('tecnico_setor_selecionado');
        window.location.href = 'index.html';
    }

    static requireAuth() {
        if (!this.isAuthenticated()) {
            alert('Acesso não autorizado. Faça login primeiro.');
            window.location.href = 'index.html';
            return false;
        }
        return true;
    }
}

// Sistema de notificações
class NotificationSystem {
    static show(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;
        
        // Estilos da notificação
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#198754' : '#4dabf7'};
            color: white;
            padding: 15px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 10px;
            max-width: 400px;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove após 5 segundos
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    static error(message) {
        this.show(message, 'error');
    }

    static success(message) {
        this.show(message, 'success');
    }

    static info(message) {
        this.show(message, 'info');
    }
}

// Sistema de loading
class LoadingSystem {
    static show(element) {
        const loading = document.createElement('div');
        loading.className = 'loading-overlay';
        loading.innerHTML = `
            <div class="loading-spinner"></div>
            <p>Carregando...</p>
        `;
        
        loading.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: white;
            z-index: 1000;
            border-radius: inherit;
        `;
        
        element.style.position = 'relative';
        element.appendChild(loading);
        
        return loading;
    }

    static hide(loadingElement) {
        if (loadingElement && loadingElement.parentElement) {
            loadingElement.remove();
        }
    }
}

// Utilitários de formatação
class FormatUtils {
    static formatDate(dateString) {
        if (!dateString) return 'Data não informada';
        
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR') + ' às ' + 
               date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    static formatStatus(status) {
        const statusMap = {
            'Aberto': { class: 'aberto', icon: '🟢' },
            'Em Andamento': { class: 'emandamento', icon: '🟡' },
            'Finalizado': { class: 'finalizado', icon: '✅' },
            'Cancelado': { class: 'cancelado', icon: '❌' }
        };
        
        return statusMap[status] || { class: 'aberto', icon: '📄' };
    }

    static truncateText(text, maxLength = 50) {
        if (!text) return 'Não informado';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
}

// Sistema de API
class ApiService {
    static async request(endpoint, options = {}) {
        const token = AuthSystem.getToken();
        const url = `${API_BASE_URL}${endpoint}`;
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` }),
                ...options.headers
            },
            ...options
        };

        console.log(`🌐 API Request: ${config.method || 'GET'} ${url}`);
        
        try {
            const response = await fetch(url, config);
            console.log(`📡 API Response: ${response.status} ${url}`);
            
            if (response.status === 401) {
                NotificationSystem.error('Sessão expirada. Faça login novamente.');
                setTimeout(() => AuthSystem.logout(), 2000);
                throw new Error('Unauthorized');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error(`❌ API Error (${endpoint}):`, error);
            throw error;
        }
    }

    // ✅ CORREÇÃO: Métodos específicos corrigidos
    static async login(email, senha) {
        return this.request('/api/usuarios/login', {
            method: 'POST',
            body: JSON.stringify({ email, senha })
        });
    }

    static async cadastrarUsuario(userData) {
        return this.request('/api/usuarios', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    static async getMinhasOS() {
        return this.request('/api/os/minhas');
    }

    static async getOSPorSetor(setor) {
        return this.request(`/api/os/setor/${setor}`);
    }

    static async criarOS(osData) {
        return this.request('/api/os', {
            method: 'POST',
            body: JSON.stringify(osData)
        });
    }

    static async atualizarOS(id, osData) {
        return this.request(`/api/os/${id}`, {
            method: 'PUT',
            body: JSON.stringify(osData)
        });
    }

    static async getRelatorios() {
        return this.request('/api/os/relatorios/geral');
    }
}

// Sistema de navegação
class NavigationSystem {
    static redirectBasedOnUser() {
        if (!AuthSystem.isAuthenticated()) return;
        
        const user = AuthSystem.getUser();
        const setorSelecionado = localStorage.getItem('tecnico_setor_selecionado');
        
        if (user.setor === 'TI' || user.setor === 'Manutenção') {
            if (!setorSelecionado) {
                window.location.href = 'tecnico-selecao-setor.html';
            } else {
                window.location.href = 'tecnico-dashboard.html';
            }
        } else {
            window.location.href = 'solicitante-dashboard.html';
        }
    }

    static setupNavigation() {
        // Prevenir acesso direto a páginas sem autenticação
        const protectedPages = [
            'solicitante-dashboard.html',
            'tecnico-dashboard.html', 
            'tecnico-selecao-setor.html',
            'relatorios.html'
        ];
        
        const currentPage = window.location.pathname.split('/').pop();
        
        if (protectedPages.includes(currentPage) && !AuthSystem.isAuthenticated()) {
            window.location.href = 'index.html';
        }
    }
}

// Sistema de formulários
class FormHandler {
    static setupForm(formId, onSubmit) {
        const form = document.getElementById(formId);
        if (!form) return;
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await onSubmit(form);
        });
    }

    static getFormData(form) {
        const formData = new FormData(form);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            data[key] = value.trim();
        }
        
        return data;
    }

    static validateRequired(formData, requiredFields) {
        const errors = [];
        
        requiredFields.forEach(field => {
            if (!formData[field] || formData[field] === '') {
                errors.push(`O campo ${field} é obrigatório`);
            }
        });
        
        return errors;
    }
}

// Inicialização do sistema
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Kronos OS - Sistema inicializado');
    
    // Configurar navegação
    NavigationSystem.setupNavigation();
    
    // Configurar logout global
    const logoutButtons = document.querySelectorAll('[data-logout]');
    logoutButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Tem certeza que deseja sair?')) {
                AuthSystem.logout();
            }
        });
    });
    
    // Atualizar informações do usuário em todas as páginas
    const userInfoElements = document.querySelectorAll('[data-user-info]');
    if (userInfoElements.length > 0) {
        const user = AuthSystem.getUser();
        if (user) {
            userInfoElements.forEach(element => {
                element.textContent = user.nome.split(' ')[0];
            });
        }
    }
});

// ✅ CORREÇÃO: Funções globais para compatibilidade
window.AuthSystem = AuthSystem;
window.NotificationSystem = NotificationSystem;
window.ApiService = ApiService;
window.FormatUtils = FormatUtils;

// Funções globais de utilidade
window.recarregarPagina = function() {
    window.location.reload();
};

window.voltarPagina = function() {
    window.history.back();
};

window.irPara = function(url) {
    window.location.href = url;
};

// ✅ CORREÇÃO: Debug helper
window.debugInfo = function() {
    const user = AuthSystem.getUser();
    const token = AuthSystem.getToken();
    const setor = localStorage.getItem('tecnico_setor_selecionado');
    
    console.group('🔍 Debug Info');
    console.log('Usuário:', user);
    console.log('Token:', token ? 'Presente' : 'Ausente');
    console.log('Setor selecionado:', setor);
    console.log('API Base:', API_BASE_URL);
    console.groupEnd();
    
    return { user, token, setor };
};

// Estilos CSS dinâmicos para componentes
const dynamicStyles = `
@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.loading-spinner {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #4dabf7;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
}

.notification button {
    background: none;
    border: none;
    color: white;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.status-aberto { background: #dc3545; color: white; }
.status-emandamento { background: #ffc107; color: black; }
.status-finalizado { background: #198754; color: white; }
.status-cancelado { background: #6c757d; color: white; }
`;

// Adicionar estilos dinâmicos ao documento
if (!document.querySelector('#dynamic-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'dynamic-styles';
    styleSheet.textContent = dynamicStyles;
    document.head.appendChild(styleSheet);
}

console.log('✅ script.js carregado com sucesso!');
