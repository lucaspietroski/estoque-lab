import { supabase } from './supabase.js'

// --- ARQUITETURA DE AMBIENTES OPERACIONAIS ---
const ENVIRONMENTS_CONFIG = {
    LAB: {
        name: 'Laborat├│rio',
        icon: '­ƒö¼',
        tabs: ['dashboard', 'estoque', 'historico', 'movimentacoes', 'modelo-custo'],
        defaultTab: 'dashboard'
    },
    REMANU: {
        name: 'Remanufatura',
        icon: 'ÔÜÖ´©Å',
        tabs: ['dashboard', 'estoque', 'historico', 'movimentacoes', 'modelo-custo'],
        defaultTab: 'dashboard'
    },
    '3D': {
        name: 'Impress├úo 3D',
        icon: '­ƒôª',
        tabs: ['dashboard', 'estoque', 'historico', 'movimentacoes'],
        defaultTab: 'dashboard'
    },
    ADMIN: {
        name: 'Administrativo',
        icon: '­ƒöÆ',
        tabs: ['dashboard', 'historico', 'movimentacoes', 'auditoria', 'modelo-custo', 'bi-equipamentos'],
        defaultTab: 'dashboard'
    }
};

const remanuOnlyUsers = [
    'andrio.rockenbach@selbetti.com.br',
    'carlos.nogueira@selbetti.com.br'
];

const REMANU_SELB_MAP = {
    'RI43': 'LINHA MULTIFUNCIONAL 430F / P502',
    'RK55': 'LINHA MULTIFUNCIONAL RICOH MP501 / KYOCERA M3655',
    'RI37': 'LINHA MULTIFUNCIONAL RICOH 3710SF / 320F',
    'KY40': 'LINHA MULTIFUNCIONAL KYOCERA 2640 / 2040',
    'SA70': 'LINHA MULTIFUNCIONAL 4070 / 4020'
};

// --- CACHE DE EQUIPAMENTOS PARA ALTA PERFORMANCE ---
window.equipamentosCache = new Map();
window.equipamentosCacheLoaded = false;
window.selbSearchTimeout = null;
window.buscarPecaSearchTimeout = null;
window.buscarPecaQuerySeq = 0;
window.vincModeloSearchTimeout = null;

// --- FUN├ç├âO PARA PRECARREGAR CACHE DE EQUIPAMENTOS (MODO DIN├éMICO/ON-DEMAND) ---
async function carregarCacheEquipamentos() {
    console.log("­ƒôÑ Cache de equipamentos inicializado no modo din├ómico (on-demand).");
    window.equipamentosCache.clear();
    window.equipamentosCacheLoaded = true;
}

// --- ESTADO GLOBAL ---
let currentUser = null;
let currentUserProfile = null;
let currentTab = 'dashboard';
let searchTimeout = null;
let saidaItems = []; // Carrinho de sa├¡da SELB
window.currentSector = 'LAB'; // Ambiente/Setor atual
let activeAudit = null;
let activeAuditItems = {};

// --- ESTRUTURA DE PERMISS├òES ---
window.hasPermission = (action) => {
    if (!currentUserProfile) return false;
    if (currentUserProfile.is_admin || currentUserProfile.role === 'ADMIN') return true;
    
    const rolePermissions = {
        'manual_adjustments': ['ADMIN'],
        'create_parts': ['ADMIN'],
        'view_costs': ['ADMIN', 'MANAGER'],
        'import_xml': ['ADMIN', 'MANAGER'],
        'run_audit': ['ADMIN', 'AUDITOR'],
        'link_selb': ['ADMIN', 'MANAGER'],
        'register_revisados': ['ADMIN', 'MANAGER', 'OPERATOR']
    };
    
    const allowedRoles = rolePermissions[action] || [];
    return allowedRoles.includes(currentUserProfile.role);
};

// --- FALLBACK RESILIENTE DE PERFIL (Garantia de Zero Downtime) ---
function getFallbackProfile(user) {
    const email = user.email || '';
    const isLucas = email === 'lucas.araujo@selbetti.com.br';
    const isBruno = email === 'bruno.batista@selbetti.com.br';
    const isLeandro = email === 'leandro.schimidt@selbetti.com.br';
    
    if (isLucas || isBruno || isLeandro) {
        return {
            email,
            role: 'ADMIN',
            allowed_sectors: ['LAB', 'REMANU', '3D', 'ADMIN'],
            default_sector: 'LAB',
            is_admin: true,
            active: true
        };
    }
    
    if (email === 'bernardo.voit@selbetti.com.br') {
        return {
            email,
            role: 'MANAGER',
            allowed_sectors: ['REMANU'],
            default_sector: 'REMANU',
            is_admin: false,
            active: true
        };
    }
    
    if (remanuOnlyUsers.includes(email)) {
        return {
            email,
            role: 'OPERATOR',
            allowed_sectors: ['REMANU'],
            default_sector: 'REMANU',
            is_admin: false,
            active: true
        };
    }
    
    return {
        email,
        role: 'OPERATOR',
        allowed_sectors: ['LAB'],
        default_sector: 'LAB',
        is_admin: false,
        active: true
    };
}

// --- BUSCA DE PERFIL DO SUPABASE ---
async function loadUserProfile(user) {
    if (!user) {
        currentUserProfile = null;
        return;
    }
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
            
        if (error) throw error;
        
        if (data) {
            currentUserProfile = data;
        } else {
            currentUserProfile = getFallbackProfile(user);
        }
    } catch (e) {
        console.warn('ÔÜá´©Å Erro ao ler user_profiles, usando fallback local:', e.message);
        currentUserProfile = getFallbackProfile(user);
    }
}

// --- FUN├ç├âO PARA SELECIONAR AMBIENTE ---
window.selectEnvironment = (env) => {
    window.currentSector = env;
    localStorage.setItem('last_selected_env', env);
    
    // --- RESET DE ESTADOS E FILTROS DO FRONTEND ---
    currentFilter = '';
    dashFilterLow = false;
    saidaItems = [];
    
    if (activeAudit) {
        activeAudit = null;
        activeAuditItems = {};
        const auditSetup = document.getElementById('audit-panel-setup');
        if (auditSetup) auditSetup.style.display = 'block';
        const auditSummary = document.getElementById('audit-panel-summary');
        if (auditSummary) auditSummary.style.display = 'none';
        const auditActive = document.getElementById('audit-panel-active');
        if (auditActive) auditActive.style.display = 'none';
    }

    // Limpar inputs HTML de busca e filtros das abas
    const searchInp = document.getElementById('search-main');
    if (searchInp) searchInp.value = '';
    
    const histSearch = document.getElementById('hist-search');
    if (histSearch) histSearch.value = '';
    const histTipo = document.getElementById('hist-tipo');
    if (histTipo) histTipo.value = '';
    const histD1 = document.getElementById('hist-d1');
    if (histD1) histD1.value = '';
    const histD2 = document.getElementById('hist-d2');
    if (histD2) histD2.value = '';

    const movProd = document.getElementById('mov-prod');
    if (movProd) movProd.value = '';
    const movTipo = document.getElementById('mov-tipo');
    if (movTipo) movTipo.value = '';
    const movD1 = document.getElementById('mov-d1');
    if (movD1) movD1.value = '';
    const movD2 = document.getElementById('mov-d2');
    if (movD2) movD2.value = '';

    const modBusca = document.getElementById('mod-busca');
    if (modBusca) modBusca.value = '';
    const modD1 = document.getElementById('mod-d1');
    if (modD1) modD1.value = '';
    const modD2 = document.getElementById('mod-d2');
    if (modD2) modD2.value = '';

    const equipSearch = document.getElementById('equip-search-input');
    if (equipSearch) equipSearch.value = '';
    // --- FIM DO RESET ---
    
    const config = ENVIRONMENTS_CONFIG[env];
    if (!config) return;
    
    // Redesenhar abas permitidas (Carregamento Modular)
    const tabBar = document.querySelector('.tab-bar');
    if (tabBar) {
        tabBar.innerHTML = config.tabs.map(tab => {
            const tabNames = {
                dashboard: '­ƒôè Dashboard',
                estoque: '­ƒôª Estoque',
                historico: '­ƒôï Hist├│rico',
                movimentacoes: '­ƒôê Movimenta├º├Áes',
                'modelo-custo': '­ƒÆ░ Custo/Modelo',
                auditoria: '­ƒöì Auditoria',
                'bi-equipamentos': '­ƒôü Base BI (WMS)'
            };
            return `<button class="tab-btn" data-tab="${tab}">${tabNames[tab] || tab}</button>`;
        }).join('');
        
        // Re-vincular eventos de clique
        tabBar.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
    }
    
    // Fechar overlay de sele├º├úo se aberto
    const overlay = document.getElementById('env-selector-overlay');
    if (overlay) overlay.style.display = 'none';
    
    // Atualizar classes do switcher superior se vis├¡vel
    if (currentUserProfile && currentUserProfile.allowed_sectors) {
        currentUserProfile.allowed_sectors.forEach(sec => {
            const btn = document.getElementById(`btn-sector-${sec.toLowerCase()}`);
            if (btn) btn.classList.toggle('active', sec === env);
        });
    }
    
    // Exibir bot├úo v├¡nculos se for REMANU
    const btnVinculos = document.getElementById('btn-remanu-vinculos');
    if (btnVinculos) btnVinculos.style.display = env === 'REMANU' ? 'inline-block' : 'none';
    
    // Carregar aba padr├úo do ambiente
    switchTab(config.defaultTab || 'dashboard');
};

// Aliases para compatibilidade legada
window.changeSector = (sector) => window.selectEnvironment(sector);

const getEstoqueTable = () => {
    if (window.currentSector === 'REMANU') return 'estoque_remanu';
    if (window.currentSector === '3D') return 'estoque_3d';
    return 'estoque';
};

const getHistoricoTable = () => {
    if (window.currentSector === 'REMANU') return 'historico_remanu';
    if (window.currentSector === '3D') return 'historico_3d';
    return 'historico';
};

// --- HELPER DE BUSCA ---
window.formatSearchQuery = (val) => {
    if (!val) return '';
    let safeVal = val.replace(/,/g, ' ');
    if (safeVal.includes('%')) {
        return safeVal.split('%').map(p => p.trim()).filter(p => p.length > 0).join('%');
    }
    return safeVal;
};

// --- MODO CUSTO REAL ---
if (localStorage.getItem('mode_custo_ativo') === null) {
    localStorage.setItem('mode_custo_ativo', '1');
}

window.adjC = (val) => {
    const active = localStorage.getItem('mode_custo_ativo') === '1';
    return active ? Number(val) / 1.90 : Number(val);
};

// Helper para atualizar previews de custo real nos formul├írios administrativos (evita erros manuais do usu├írio)
window.updatePricePreview = (inputId, previewId) => {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;

    const value = parseFloat(input.value) || 0;
    const isCustoReal = localStorage.getItem('mode_custo_ativo') === '1';

    if (isCustoReal) {
        const custoRealVal = value / 1.90;
        preview.innerHTML = `­ƒæü´©Å Custo Real Equivalente (Vis├úo Atual): <strong style="color:var(--green)">R$ ${custoRealVal.toFixed(2)}</strong> <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">(Salvar├í o valor comercial de R$ ${value.toFixed(2)} no banco)</span>`;
    } else {
        preview.innerHTML = `­ƒæü´©Å Valor Comercial (Vis├úo Atual): <strong style="color:var(--blue)">R$ ${value.toFixed(2)}</strong>`;
    }
};

window.toggleModeCusto = () => {
    const active = localStorage.getItem('mode_custo_ativo') === '1';
    localStorage.setItem('mode_custo_ativo', active ? '0' : '1');
    window.updateModeCustoBtn();

    // Recarregar a tela atual que exibe custos
    if (currentTab === 'dashboard') updateDashboard();
    if (currentTab === 'modelo-custo') renderModeloCusto();
    if (currentTab === 'movimentacoes') renderMovDashboard();
    if (currentTab === 'historico') renderHistorico();
    if (currentTab === 'estoque') renderEstoque();
};

window.updateModeCustoBtn = () => {
    const btn = document.getElementById('btn-toggle-custo');
    const badge = document.getElementById('custo-real-badge');
    const active = localStorage.getItem('mode_custo_ativo') === '1';

    // Badge no header
    if (badge) badge.style.display = active ? 'inline-flex' : 'none';

    // Bot├úo no menu admin
    if (!btn) return;
    if (active) {
        btn.style.background = '#10b981';
        btn.style.color = '#ffffff';
        btn.textContent = '­ƒÆ▓ Modo Custo Real (ATIVADO)';
    } else {
        btn.style.background = 'var(--bg-hover)';
        btn.style.color = 'var(--text)';
        btn.textContent = '­ƒÆ▓ Modo Custo Real (DESATIVADO)';
    }
};

// --- ELEMENTOS DOM ---
const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const loginErr = document.getElementById('login-err');
const btnAuthSubmit = document.getElementById('auth-submit');
const btnLogout = document.getElementById('btn-logout');
const btnLoginArea = document.getElementById('btn-login');
const adminBadge = document.getElementById('admin-badge');

// --- INICIALIZA├ç├âO ---
async function init() {
    console.log('­ƒÜÇ Inicializando sistema...');
    
    // Precarrega o cache de equipamentos localmente em segundo plano
    carregarCacheEquipamentos();
    
    try {
        renderChips();
    } catch (err) {
        console.error('ÔÜá´©Å Erro ao renderizar chips na inicializa├º├úo:', err);
    }

    try {
        window.updateModeCustoBtn();
    } catch (err) {
        console.error('ÔÜá´©Å Erro ao atualizar bot├úo de custo na inicializa├º├úo:', err);
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;
        
        if (currentUser) {
            await loadUserProfile(currentUser);
        }
        updateUIForAuth();

        if (currentUser) {
            handleLoginContext();
        }
    } catch (err) {
        console.error('ÔÜá´©Å Erro ao carregar sess├úo ou perfil do usu├írio na inicializa├º├úo:', err);
        // Garante que a tela de login apare├ºa caso ocorra um erro de rede/sess├úo
        updateUIForAuth();
    }

    try {
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('­ƒöä Estado de autentica├º├úo alterado:', event);
            currentUser = session?.user || null;
            
            if (event === 'PASSWORD_RECOVERY') {
                const modal = document.getElementById('modal-reset-password');
                if (modal) {
                    modal.style.display = 'flex';
                    const errEl = document.getElementById('reset-pass-err');
                    if (errEl) errEl.textContent = '';
                    const newPass = document.getElementById('reset-new-pass');
                    if (newPass) newPass.value = '';
                    const confirmPass = document.getElementById('reset-confirm-pass');
                    if (confirmPass) confirmPass.value = '';
                }
                return;
            }

            if (currentUser) {
                if (!currentUserProfile || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                    await loadUserProfile(currentUser);
                }
            } else {
                currentUserProfile = null;
            }
            updateUIForAuth();
            if (currentUser && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
                handleLoginContext();
            }
        });
    } catch (err) {
        console.error('ÔÜá´©Å Erro ao registrar onAuthStateChange:', err);
    }

    // --- FLUXO DE RECUPERA├ç├âO DE SENHA (EVENT LISTENERS RESILIENTES) ---
    const linkForgot = document.getElementById('link-forgot-pass');
    const btnForgotBack = document.getElementById('forgot-back');
    const formLogin = document.getElementById('login-form');
    const formForgot = document.getElementById('forgot-pass-form');

    console.log('­ƒöì Elementos de recupera├º├úo de senha:', {
        linkForgot: !!linkForgot,
        btnForgotBack: !!btnForgotBack,
        formLogin: !!formLogin,
        formForgot: !!formForgot
    });

    if (linkForgot) {
        linkForgot.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('­ƒæå Clique detectado no link "Esqueci minha senha"');
            
            if (formLogin) {
                formLogin.style.display = 'none';
            } else {
                console.warn('ÔÜá´©Å Elemento #login-form n├úo encontrado para esconder.');
            }
            
            if (formForgot) {
                formForgot.style.display = 'block';
                console.log('­ƒöô Formul├írio de recupera├º├úo de senha exibido com sucesso');
                const forgotEmail = document.getElementById('forgot-email');
                if (forgotEmail) forgotEmail.value = '';
                const forgotErr = document.getElementById('forgot-err');
                if (forgotErr) forgotErr.textContent = '';
            } else {
                console.error('ÔØî Elemento #forgot-pass-form n├úo encontrado para exibir!');
            }
        });
    } else {
        console.error('ÔØî Elemento #link-forgot-pass (Esqueci minha senha) n├úo encontrado no DOM!');
    }

    if (btnForgotBack) {
        btnForgotBack.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('­ƒæå Clique detectado no bot├úo "Voltar para o Login"');
            
            if (formForgot) {
                formForgot.style.display = 'none';
            } else {
                console.warn('ÔÜá´©Å Elemento #forgot-pass-form n├úo encontrado para esconder.');
            }
            
            if (formLogin) {
                formLogin.style.display = 'block';
                const loginErrEl = document.getElementById('login-err');
                if (loginErrEl) loginErrEl.textContent = '';
            } else {
                console.error('ÔØî Elemento #login-form n├úo encontrado para exibir!');
            }
        });
    } else {
        console.warn('ÔÜá´©Å Elemento #forgot-back n├úo encontrado no DOM!');
    }

    const btnForgotSubmit = document.getElementById('forgot-submit');
    if (btnForgotSubmit) {
        btnForgotSubmit.addEventListener('click', async () => {
            const email = document.getElementById('forgot-email').value.trim();
            const errEl = document.getElementById('forgot-err');
            
            if (!email) {
                errEl.style.color = 'var(--red)';
                errEl.textContent = 'ÔÜá´©Å Informe o seu e-mail corporativo.';
                return;
            }

            btnForgotSubmit.disabled = true;
            btnForgotSubmit.textContent = 'Enviando...';
            errEl.style.color = 'var(--text-muted)';
            errEl.textContent = 'Ôîø Solicitando link de redefini├º├úo...';

            try {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + window.location.pathname
                });

                if (error) throw error;

                errEl.style.color = 'var(--green)';
                errEl.textContent = 'Ô£à Link enviado com sucesso! Verifique seu e-mail.';
                
                setTimeout(() => {
                    formForgot.style.display = 'none';
                    formLogin.style.display = 'block';
                    document.getElementById('login-err').style.color = 'var(--green)';
                    document.getElementById('login-err').textContent = 'Ô£à Link enviado! Verifique seu e-mail corporativo.';
                }, 3000);

            } catch (err) {
                console.error(err);
                errEl.style.color = 'var(--red)';
                errEl.textContent = 'ÔØî Erro: ' + (err.message || 'Falha ao enviar link de redefini├º├úo.');
            } finally {
                btnForgotSubmit.disabled = false;
                btnForgotSubmit.textContent = 'Enviar E-mail de Recupera├º├úo';
            }
        });
    }

    const btnResetConfirm = document.getElementById('btn-reset-pass-confirm');
    if (btnResetConfirm) {
        btnResetConfirm.addEventListener('click', async () => {
            const newPass = document.getElementById('reset-new-pass').value;
            const confirmPass = document.getElementById('reset-confirm-pass').value;
            const errEl = document.getElementById('reset-pass-err');

            if (!newPass || newPass.length < 6) {
                errEl.style.color = 'var(--red)';
                errEl.textContent = 'ÔÜá´©Å A senha deve conter pelo menos 6 caracteres.';
                return;
            }

            if (newPass !== confirmPass) {
                errEl.style.color = 'var(--red)';
                errEl.textContent = 'ÔÜá´©Å As senhas digitadas n├úo coincidem.';
                return;
            }

            btnResetConfirm.disabled = true;
            btnResetConfirm.textContent = 'Atualizando...';
            errEl.style.color = 'var(--text-muted)';
            errEl.textContent = 'Ôîø Atualizando senha no Supabase...';

            try {
                const { error } = await supabase.auth.updateUser({ password: newPass });
                if (error) throw error;

                errEl.style.color = 'var(--green)';
                errEl.textContent = 'Ô£à Senha atualizada com sucesso!';

                setTimeout(async () => {
                    document.getElementById('modal-reset-password').style.display = 'none';
                    // Recarregar os dados do usu├írio para for├ºar o login
                    const { data: { session } } = await supabase.auth.getSession();
                    currentUser = session?.user || null;
                    if (currentUser) {
                        await loadUserProfile(currentUser);
                    }
                    updateUIForAuth();
                    if (currentUser) {
                        handleLoginContext();
                    }
                }, 2000);

            } catch (err) {
                console.error(err);
                errEl.style.color = 'var(--red)';
                errEl.textContent = 'ÔØî Erro: ' + (err.message || 'N├úo foi poss├¡vel redefinir a senha.');
            } finally {
                btnResetConfirm.disabled = false;
                btnResetConfirm.textContent = 'Atualizar Senha';
            }
        });
    }

    // Eventos de Tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Busca com Debounce
    const searchInp = document.getElementById('search-main');
    if (searchInp) {
        searchInp.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => renderEstoque(e.target.value), 300);
        });
    }

    document.getElementById('mov-prod')?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(renderMovDashboard, 300);
    });
    document.getElementById('mov-tipo')?.addEventListener('change', renderMovDashboard);
    document.getElementById('mov-d1')?.addEventListener('change', renderMovDashboard);
    document.getElementById('mov-d2')?.addEventListener('change', renderMovDashboard);

    document.getElementById('hist-search')?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(renderHistorico, 300);
    });
    document.getElementById('hist-tipo')?.addEventListener('change', renderHistorico);
    document.getElementById('hist-d1')?.addEventListener('change', renderHistorico);
    document.getElementById('hist-d2')?.addEventListener('change', renderHistorico);
    
    document.getElementById('equip-search-input')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => renderBIList(e.target.value), 300);
    });

    document.getElementById('mod-busca')?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(renderModeloCusto, 300);
    });

    document.getElementById('saida-selb')?.addEventListener('input', async (e) => {
        const selb = e.target.value.trim().toUpperCase();
        const infoDiv = document.getElementById('saida-selb-info');
        if (!infoDiv) return;

        if (selb.length === 0) {
            infoDiv.style.display = 'none';
            infoDiv.innerHTML = '';
            return;
        }

        // --- VALIDA├ç├âO REMANUFATURA ---
        if (window.currentSector === 'REMANU') {
            if (selb.length === 4) {
                const allowed = ['RI43', 'RK55', 'RI37', 'KY40', 'SA70'];
                if (!allowed.includes(selb)) {
                    infoDiv.style.display = 'block';
                    infoDiv.style.background = '#fee2e2';
                    infoDiv.style.color = '#991b1b';
                    infoDiv.innerHTML = `ÔÜá´©Å SELB Bloqueado! A Remanufatura s├│ pode utilizar: ${allowed.join(', ')}`;
                    return;
                }

                // Resolu├º├úo instant├ónea local (Zero Lat├¬ncia)
                const localModelo = REMANU_SELB_MAP[selb];
                if (localModelo) {
                    infoDiv.style.display = 'block';
                    infoDiv.style.background = '#dcfce7';
                    infoDiv.style.color = '#166534';
                    infoDiv.innerHTML = `Ô£à <strong>Modelo:</strong> ${localModelo}`;
                    return;
                }
            } else {
                infoDiv.style.display = 'block';
                infoDiv.style.background = '#fee2e2';
                infoDiv.style.color = '#991b1b';
                infoDiv.innerHTML = `ÔÜá´©Å SELB da Remanufatura deve ter 4 caracteres.`;
                return;
            }
        }

        // --- VALIDA├ç├âO OUTROS SETORES (LAB, 3D, ETC.) ---
        // 1. Verificar primeiro o cache local em Map (Zero Lat├¬ncia - O(1))
        const cacheModelo = window.equipamentosCache.get(selb);
        if (cacheModelo !== undefined) {
            infoDiv.style.display = 'block';
            infoDiv.style.background = '#dcfce7';
            infoDiv.style.color = '#166534';
            infoDiv.innerHTML = `Ô£à <strong>Modelo:</strong> ${cacheModelo}`;
            return;
        }

        // 2. Se o SELB tem um comprimento m├¡nimo razo├ível (>= 4 d├¡gitos)
        if (selb.length >= 4) {
            infoDiv.style.display = 'block';
            infoDiv.style.background = 'var(--bg-hover)';
            infoDiv.style.color = 'var(--text-muted)';
            infoDiv.innerHTML = 'Ôîø Buscando SELB...';

            // Usamos um pequeno debounce com timeout para n├úo sobrecarregar com requisi├º├Áes enquanto o usu├írio digita
            clearTimeout(window.selbSearchTimeout);
            window.selbSearchTimeout = setTimeout(async () => {
                // Verificar cache novamente caso tenha sido carregado nesse meio tempo
                const cacheModeloDouble = window.equipamentosCache.get(selb);
                if (cacheModeloDouble !== undefined) {
                    infoDiv.style.background = '#dcfce7';
                    infoDiv.style.color = '#166534';
                    infoDiv.innerHTML = `Ô£à <strong>Modelo:</strong> ${cacheModeloDouble}`;
                    return;
                }

                // Fallback de consulta direta ao banco
                try {
                    const { data, error } = await supabase.from('equipamentos').select('modelo').eq('selb', selb).maybeSingle();
                    
                    // Certifica que o valor do input ainda ├® o mesmo que o usu├írio digitou
                    if (document.getElementById('saida-selb').value.trim().toUpperCase() !== selb) return;

                    if (error) {
                        console.error('Erro ao buscar SELB:', error.message);
                        infoDiv.style.background = '#fee2e2';
                        infoDiv.style.color = '#991b1b';
                        infoDiv.innerHTML = `ÔØî Erro ao verificar SELB: ${error.message}`;
                    } else if (data) {
                        // Adiciona ao cache local para futuras buscas instant├óneas
                        window.equipamentosCache.set(selb, data.modelo || '');
                        
                        infoDiv.style.background = '#dcfce7';
                        infoDiv.style.color = '#166534';
                        infoDiv.innerHTML = `Ô£à <strong>Modelo:</strong> ${data.modelo}`;
                    } else {
                        infoDiv.style.background = '#fee2e2';
                        infoDiv.style.color = '#991b1b';
                        infoDiv.innerHTML = `ÔÜá´©Å SELB n├úo encontrado na base de dados.`;
                    }
                } catch (dbErr) {
                    console.error('Erro ao acessar base de dados:', dbErr);
                }
            }, 300); // 300ms debounce
        } else {
            infoDiv.style.display = 'block';
            infoDiv.style.background = 'var(--bg-hover)';
            infoDiv.style.color = 'var(--text-muted)';
            infoDiv.innerHTML = 'Digite o SELB completo...';
        }
    });

    btnAuthSubmit?.addEventListener('click', doLogin);
    btnLogout?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.reload();
    });

    btnLoginArea?.addEventListener('click', () => {
        if (!currentUser) document.getElementById('modal-login-overlay').classList.add('open');
    });

    document.getElementById('btn-cancel-login')?.addEventListener('click', () => {
        document.getElementById('modal-login-overlay').classList.remove('open');
    });

    document.getElementById('btn-do-login')?.addEventListener('click', doModalLogin);

    // Tecla Enter para realizar Login
    document.getElementById('login-pass')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doLogin();
    });
    document.getElementById('modal-login-pass')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doModalLogin();
    });

    // Bipador Auditoria Integrada
    document.getElementById('main-audit-bipador')?.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const code = e.target.value.trim().toUpperCase();
            if (code) {
                await window.biparItemAuditoria(code);
            }
            e.target.value = '';
        }
    });

    // Eventos para atualiza├º├úo de preview de pre├ºo em tempo real (evita que o usu├írio fa├ºa divis├Áes manuais erradas)
    document.getElementById('modal-price')?.addEventListener('input', () => {
        window.updatePricePreview('modal-price', 'modal-price-preview');
    });
    document.getElementById('cad-custo')?.addEventListener('input', () => {
        window.updatePricePreview('cad-custo', 'cad-custo-preview');
    });

    // Sugest├úo de modelos para V├¡nculos de Remanufatura com Debounce e Limite
    document.getElementById('vinc-modelo')?.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        const dl = document.getElementById('list-modelos-remanu');
        if (!dl) return;

        if (!val || val.length < 2) {
            dl.innerHTML = '';
            return;
        }

        clearTimeout(window.vincModeloSearchTimeout);
        window.vincModeloSearchTimeout = setTimeout(async () => {
            try {
                const { data, error } = await supabase
                    .from('equipamentos')
                    .select('modelo')
                    .ilike('modelo', `%${val}%`)
                    .limit(100);

                if (!error && data) {
                    const unique = [...new Set(data.map(e => e.modelo))];
                    dl.innerHTML = unique.map(m => `<option value="${m}">`).join('');
                }
            } catch (err) {
                console.error('Erro ao buscar sugest├Áes de modelos:', err);
            }
        }, 300);
    });

    // --- ESTABILIZA├ç├âO E RECUPERA├ç├âO DE FOCO (VISIBILITY CHANGE) ---
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            console.log('­ƒæÇ Tab focused, checking and recovering session dynamically...');
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;

                if (session?.user) {
                    currentUser = session.user;
                    console.log('­ƒöä Session is valid, auto-refreshing active tab visual data...');
                    if (typeof currentTab !== 'undefined') {
                        if (currentTab === 'dashboard') {
                            updateDashboard();
                        } else if (currentTab === 'estoque') {
                            renderChips();
                            const searchVal = document.getElementById('search-main')?.value.trim() || '';
                            renderEstoque(searchVal);
                        } else if (currentTab === 'historico') {
                            renderHistorico();
                        } else if (currentTab === 'movimentacoes') {
                            renderMovDashboard();
                        } else if (currentTab === 'revisados') {
                            renderRevisados();
                        } else if (currentTab === 'bi-equipamentos') {
                            const searchVal = document.getElementById('equip-search-input')?.value.trim() || '';
                            renderBIList(searchVal);
                        } else if (currentTab === 'modelo-custo') {
                            renderModeloCusto();
                        }
                    }
                } else {
                    console.log('­ƒöä Session is null, resetting user auth state...');
                    currentUser = null;
                    currentUserProfile = null;
                    updateUIForAuth();
                }
            } catch (err) {
                console.warn('ÔÜá´©Å Error recovering session on tab focus:', err.message);
            }
        }
    });
}

// --- AUTENTICA├ç├âO ---
async function doLogin() {
    let email = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    if (!email || !pass) { loginErr.textContent = 'ÔØî Preencha todos os campos'; return; }
    
    // Auto-completar dom├¡nio corporativo
    if (!email.includes('@')) {
        email += '@selbetti.com.br';
    }

    loginErr.textContent = 'Ôîø Autenticando...';
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) loginErr.textContent = 'ÔØî ' + error.message;
}

async function doModalLogin() {
    let email = document.getElementById('modal-login-user').value.trim();
    const pass = document.getElementById('modal-login-pass').value;
    const err = document.getElementById('modal-login-err');
    if (!email || !pass) { err.textContent = 'ÔØî Preencha todos os campos'; return; }

    // Auto-completar dom├¡nio corporativo
    if (!email.includes('@')) {
        email += '@selbetti.com.br';
    }

    err.textContent = 'Ôîø Verificando...';
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) err.textContent = 'ÔØî ' + error.message;
    else document.getElementById('modal-login-overlay').classList.remove('open');
}


function updateUIForAuth() {
    const elAuthScreen = document.getElementById('auth-screen') || authScreen;
    const elAppShell = document.getElementById('app-shell') || appShell;
    const elBtnLogout = document.getElementById('btn-logout') || btnLogout;
    const elBtnLoginArea = document.getElementById('btn-login') || btnLoginArea;

    if (currentUser) {
        if (elAuthScreen) elAuthScreen.style.display = 'none';
        if (elAppShell) elAppShell.style.display = 'flex';
        if (elBtnLogout) elBtnLogout.style.display = 'inline-flex';
        if (elBtnLoginArea) elBtnLoginArea.style.display = 'none';
        
        // Exibir selo admin/operador adequado com base nas permiss├Áes
        const badge = document.getElementById('admin-badge');
        if (badge) {
            badge.style.display = 'inline-flex';
            if (currentUserProfile) {
                if (currentUserProfile.role === 'ADMIN') {
                    badge.textContent = '­ƒöÆ Admin';
                    badge.style.background = '#ef4444';
                } else if (currentUserProfile.role === 'MANAGER') {
                    badge.textContent = '­ƒÆ╝ Gestor';
                    badge.style.background = '#f59e0b';
                } else if (currentUserProfile.role === 'AUDITOR') {
                    badge.textContent = '­ƒöì Auditor';
                    badge.style.background = '#8b5cf6';
                } else {
                    badge.textContent = 'ÔÜÖ´©Å Operador';
                    badge.style.background = '#3b82f6';
                }
            } else {
                badge.textContent = 'ÔÜÖ´©Å Operador';
                badge.style.background = '#3b82f6';
            }
        }
        
        // Exibir engrenagem admin se tiver qualquer permiss├úo de controle
        const gearBtn = document.getElementById('btn-reset-gear');
        if (gearBtn) {
            const canSeeGear = hasPermission('view_costs') || hasPermission('import_xml') || hasPermission('link_selb') || hasPermission('create_parts');
            gearBtn.style.display = canSeeGear ? 'inline-flex' : 'none';
        }
    } else {
        if (elAuthScreen) elAuthScreen.style.display = 'flex';
        if (elAppShell) elAppShell.style.display = 'none';
        if (elBtnLogout) elBtnLogout.style.display = 'none';
        if (elBtnLoginArea) elBtnLoginArea.style.display = 'inline-flex';
        
        const badge = document.getElementById('admin-badge');
        if (badge) badge.style.display = 'none';
        
        const ss = document.getElementById('sector-switcher');
        if (ss) { ss.style.display = 'none'; ss.innerHTML = ''; }
        
        const overlay = document.getElementById('env-selector-overlay');
        if (overlay) overlay.style.display = 'none';
    }
}

// --- FLUXO DE LOGIN CONTEXTUAL (Escolha de Ambiente) ---
function handleLoginContext() {
    if (!currentUserProfile) return;
    
    const allowed = currentUserProfile.allowed_sectors || ['LAB'];
    
    // Se o usu├írio tiver apenas 1 ambiente permitido
    if (allowed.length === 1) {
        // Esconder switcher e modal de sele├º├úo
        const ss = document.getElementById('sector-switcher');
        if (ss) ss.style.display = 'none';
        
        const overlay = document.getElementById('env-selector-overlay');
        if (overlay) overlay.style.display = 'none';
        
        window.selectEnvironment(allowed[0]);
    } else if (allowed.length > 1) {
        // Seletor superior (switcher)
        const ss = document.getElementById('sector-switcher');
        if (ss) {
            ss.style.display = 'inline-flex';
            ss.innerHTML = allowed.map(sec => {
                const cfg = ENVIRONMENTS_CONFIG[sec];
                if (!cfg) return '';
                // Mostrar apenas a primeira palavra no bot├úo do cabe├ºalho
                const shortName = cfg.name.split(' ')[0];
                return `<button id="btn-sector-${sec.toLowerCase()}" class="sector-btn" onclick="window.selectEnvironment('${sec}')">${cfg.icon} ${shortName}</button>`;
            }).join('');
        }
        
        // Renderizar os cards de ambiente no modal
        const cardsGrid = document.getElementById('env-cards-grid');
        if (cardsGrid) {
            cardsGrid.innerHTML = allowed.map(sec => {
                const cfg = ENVIRONMENTS_CONFIG[sec];
                if (!cfg) return '';
                
                let desc = '';
                if (sec === 'LAB') desc = 'Estoque de placas, chips e componentes eletr├┤nicos do laborat├│rio.';
                if (sec === 'REMANU') desc = 'Setor de recupera├º├úo de cilindros, fus├Áes, cartuchos e fuso.';
                if (sec === '3D') desc = 'Mapeamento de filamentos, bicos, extrusores e insumos de impress├úo.';
                if (sec === 'ADMIN') desc = 'Painel global do administrador, auditorias integradas e relat├│rios.';
                
                return `
                    <div class="env-card env-${sec.toLowerCase()}" onclick="window.selectEnvironment('${sec}')">
                        <div class="env-card-icon-wrapper">
                            <span class="env-card-icon">${cfg.icon}</span>
                            <span class="env-card-badge">${cfg.name.split(' ')[0]}</span>
                        </div>
                        <div>
                            <h4 class="env-card-title">${cfg.name}</h4>
                            <p class="env-card-desc">${desc}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // Ajustar o importador XML: se n├úo tiver permiss├úo para o Lab, desativar e esconder o r├ídio correspondente
        const xmlRadioLab = document.querySelector('input[name="xml-sector"][value="LAB"]');
        const xmlRadioRemanu = document.querySelector('input[name="xml-sector"][value="REMANU"]');
        if (xmlRadioLab) {
            if (!allowed.includes('LAB')) {
                xmlRadioLab.disabled = true;
                xmlRadioLab.checked = false;
                xmlRadioLab.parentElement.style.display = 'none';
                if (xmlRadioRemanu) xmlRadioRemanu.checked = true;
            } else {
                xmlRadioLab.disabled = false;
                xmlRadioLab.parentElement.style.display = 'flex';
            }
        }
        
        // Se j├í tiver uma escolha pr├®via ativa nesta m├íquina e autorizada, carregar ela
        const lastEnv = localStorage.getItem('last_selected_env');
        if (lastEnv && allowed.includes(lastEnv)) {
            window.selectEnvironment(lastEnv);
        } else {
            // Mostrar overlay de sele├º├úo
            const overlay = document.getElementById('env-selector-overlay');
            if (overlay) overlay.style.display = 'flex';
        }
    }
}

// --- NAVEGA├ç├âO ---
function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${tabId}`));
    if (tabId === 'dashboard') updateDashboard();
    if (tabId === 'estoque') {
        renderChips();
        renderEstoque();
    }
    if (tabId === 'historico') renderHistorico();
    if (tabId === 'movimentacoes') renderMovDashboard();
    if (tabId === 'revisados') {
        const rData = document.getElementById('revisados-data');
        if (rData && !rData.value) rData.value = new Date().toISOString().split('T')[0];
        renderRevisados();
    }
    if (tabId === 'bi-equipamentos') renderBIList();
    if (tabId === 'modelo-custo') {
        const d1 = document.getElementById('mod-d1');
        const d2 = document.getElementById('mod-d2');
        if (d1 && !d1.value) {
            const today = new Date();
            const d30 = new Date(); d30.setDate(today.getDate() - 30);
            d1.value = d30.toISOString().split('T')[0];
            d2.value = today.toISOString().split('T')[0];
        }
        renderModeloCusto();
    }
    if (tabId === 'auditoria') {
        if (activeAudit) {

            document.getElementById('audit-panel-setup').style.display = 'none';
            document.getElementById('audit-panel-summary').style.display = 'none';
            document.getElementById('audit-panel-active').style.display = 'block';
            setTimeout(() => {
                const b = document.getElementById('main-audit-bipador');
                if (b) {
                    b.focus();
                    b.value = '';
                }
            }, 100);
        } else {
            document.getElementById('audit-panel-setup').style.display = 'block';
            document.getElementById('audit-panel-summary').style.display = 'none';
            document.getElementById('audit-panel-active').style.display = 'none';
            window.renderHistoricoAuditorias();
        }
    }
}

async function loadInitialData() {
    updateDashboard();
}

let dashFilterLow = false;

// --- DASHBOARD ---
async function updateDashboard() {
    const tName = getEstoqueTable();
    try {
        console.log('­ƒôè Atualizando Dashboard...');
        const { count: totalParts } = await supabase.from('parts').select('*', { count: 'exact', head: true });
        
        const { data: stockData } = await supabase.from(tName).select('qty').gt('qty', 0);
        const inStockCount = stockData?.length || 0;
        const volTotal = stockData?.reduce((acc, curr) => acc + curr.qty, 0) || 0;

        const { count: lowCount } = await supabase.from(tName).select('*', { count: 'exact', head: true }).lt('qty', 5).gt('qty', 0);

        if (getEstoqueTable() !== tName) return;

        document.getElementById('dash-total').textContent = (totalParts || 0).toLocaleString('pt-BR');
        document.getElementById('dash-instock').textContent = inStockCount.toLocaleString('pt-BR');
        document.getElementById('dash-vol-total').textContent = volTotal.toLocaleString('pt-BR');
        document.getElementById('dash-low-count').textContent = (lowCount || 0).toLocaleString('pt-BR');

        if (document.getElementById('stat-in-stock')) document.getElementById('stat-in-stock').textContent = volTotal;
        if (document.getElementById('stat-zero')) {
             const { count: zeroCount } = await supabase.from(tName).select('*', { count: 'exact', head: true }).eq('qty', 0);
             if (getEstoqueTable() !== tName) return;
             document.getElementById('stat-zero').textContent = zeroCount || 0;
        }

        renderChips();
        renderDashTable();
    } catch (e) { console.error('ÔØî Erro dashboard:', e.message); }
}

window.toggleLowStockFilter = () => {
    dashFilterLow = !dashFilterLow;
    const card = document.getElementById('card-low-stock');
    if (dashFilterLow) {
        card.style.boxShadow = '0 0 0 3px var(--red)';
        card.style.transform = 'scale(1.02)';
        document.querySelector('.dash-section-title').textContent = 'ÔÜá´©Å Itens com Estoque Cr├¡tico (< 5)';
    } else {
        card.style.boxShadow = '';
        card.style.transform = '';
        document.querySelector('.dash-section-title').textContent = 'Itens com Saldo em Estoque';
    }
    renderDashTable();
};

async function renderDashTable() {
    const tName = getEstoqueTable();
    try {
        const tbody = document.getElementById('dash-tbody');
        if (!tbody) return;

        let query = supabase.from(tName)
            .select('qty, parts!inner(code, descricao)')
            .order('qty', { ascending: false });

        if (dashFilterLow) {
            query = query.lt('qty', 5).gt('qty', 0);
        } else {
            query = query.gt('qty', 0);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (getEstoqueTable() !== tName) return;

        if (!data || data.length === 0) {
            document.getElementById('dash-empty').style.display = 'block';
            tbody.innerHTML = '';
            return;
        }

        document.getElementById('dash-empty').style.display = 'none';
        
        let totalQty = 0;
        let html = data.map(item => {
            totalQty += item.qty;
            return `
                <tr>
                    <td class="td-desc">${item.parts?.descricao}</td>
                    <td class="td-code">${item.parts?.code}</td>
                    <td class="td-stock">${item.qty}</td>
                    <td><span class="status-ok">Ô£ö OK</span></td>
                </tr>
            `;
        }).join('');

        // Adiciona rodap├® de total
        html += `
            <tr style="background: rgba(59, 130, 246, 0.05); font-weight: bold;">
                <td colspan="2" style="text-align: right; padding: 15px; color: #64748b;">TOTAL DE PE├çAS EM ESTOQUE:</td>
                <td style="font-size: 1.1rem; color: #2563eb; padding: 15px;">${totalQty}</td>
                <td></td>
            </tr>
        `;

        tbody.innerHTML = html;
    } catch (e) {
        console.error('ÔØî Erro renderDashTable:', e.message);
    }
}

// --- MARCAS / FILTROS ---
const MARCAS = ['HP', 'RICOH', 'XEROX', 'ZEBRA', 'EPSON', 'BROTHER', 'LEXMARK', 'SAMSUNG', 'CANON', 'DATACARD', 'DATAMAX', 'CITIZEN', 'GODEX', 'ARGOX', 'TSC', 'AVISION', 'TOSHIBA', 'SHARP', 'OKI', 'KYOCERA', 'KONICA', 'MIMAKI'];
let currentFilter = '';

async function renderChips() {
    const el = document.getElementById('brand-chips');
    if (!el) return;

    // Busca todas as pe├ºas com estoque para calcular os totais lendo a descri├º├úo
    const tName = getEstoqueTable();
    const { data } = await supabase.from('parts')
        .select(`descricao, ${tName}!inner(qty)`)
        .gt(`${tName}.qty`, 0);

    if (getEstoqueTable() !== tName) return;

    const totals = {};
    if (data) {
        data.forEach(p => {
            const desc = (p.descricao || '').toUpperCase();
            // Identifica a marca dentro do texto da descri├º├úo
            const brand = MARCAS.find(m => desc.includes(m)) || 'OUTROS';
            const qty = p[tName]?.qty ?? p[tName]?.[0]?.qty ?? 0;
            totals[brand] = (totals[brand] || 0) + qty;
        });
    }

    // S├│ mostra marcas com saldo > 0 e ordena (Marcas conhecidas primeiro, depois OUTROS)
    const marcasAtivas = Object.entries(totals)
        .filter(([_, qty]) => qty > 0)
        .sort((a, b) => {
            if (a[0] === 'OUTROS') return 1;
            if (b[0] === 'OUTROS') return -1;
            return b[1] - a[1];
        });

    let html = `<span class="filter-chip ${!currentFilter ? 'active' : ''}" onclick="setFilter('')">Todos</span>`;
    
    html += marcasAtivas.map(([marca, qty]) => {
        const isActive = currentFilter === marca ? 'active' : '';
        return `<span class="filter-chip ${isActive}" onclick="setFilter('${marca}')">
            ${marca} <b style="color: #22c55e; margin-left: 5px;">${qty}</b>
        </span>`;
    }).join('');

    el.innerHTML = html;
}

window.setFilter = (marca) => {
    currentFilter = marca;
    // Re-renderiza os chips para atualizar a classe 'active' e depois o estoque
    renderChips();
    const searchVal = document.getElementById('search-main')?.value.trim() || '';
    renderEstoque(searchVal);
};

// --- BUSCA E ESTOQUE ---
async function renderEstoque(query = '') {
    const tbody = document.getElementById('result-body');
    const countEl = document.getElementById('result-count');
    try {
        const isSearchActive = query.length > 0;
        
        // Se n├úo estiver pesquisando um c├│digo espec├¡fico, usamos inner join para trazer s├│ o que tem saldo
        const tName = getEstoqueTable();
        const relEstoque = isSearchActive ? `${tName}!left(qty)` : `${tName}!inner(qty)`;

        let dbQuery = supabase.from('parts').select(`code, descricao, marca, ${relEstoque}, custos!left(last_cost)`);

        // Regra: Se N├âO estiver pesquisando um c├│digo/termo espec├¡fico, filtramos S├ô o que tem saldo
        if (!isSearchActive) {
            dbQuery = dbQuery.gt(`${tName}.qty`, 0);
        }

        if (currentFilter) {
            if (currentFilter === 'OUTROS') {
                // Filtro para OUTROS: descri├º├Áes que n├úo cont├¬m nenhuma das marcas conhecidas
                MARCAS.forEach(m => {
                    dbQuery = dbQuery.not('descricao', 'ilike', `%${m}%`);
                });
            } else {
                dbQuery = dbQuery.ilike('descricao', `%${currentFilter}%`);
            }
        }

        if (isSearchActive) {
            const safeQuery = window.formatSearchQuery(query);
            dbQuery = dbQuery.or(`code.ilike.%${safeQuery}%,descricao.ilike.%${safeQuery}%`);
        }

        const { data: rawData } = await dbQuery.limit(isSearchActive ? 100 : 500);

        if (getEstoqueTable() !== tName) return;

        if (!rawData || rawData.length === 0) {
            tbody.innerHTML = ''; countEl.textContent = '0'; document.getElementById('empty-state').style.display = 'block'; return;
        }

        // Ordena├º├úo por maior volume (f├¡sico) primeiro
        const data = rawData.sort((a, b) => {
            const qtyA = a[tName]?.qty ?? a[tName]?.[0]?.qty ?? 0;
            const qtyB = b[tName]?.qty ?? b[tName]?.[0]?.qty ?? 0;
            return qtyB - qtyA;
        });

        if (!data || data.length === 0) {
            tbody.innerHTML = ''; countEl.textContent = '0'; document.getElementById('empty-state').style.display = 'block'; return;
        }
        document.getElementById('empty-state').style.display = 'none';
        countEl.textContent = data.length;

        tbody.innerHTML = data.map(p => {
            const qty = p[tName]?.qty ?? p[tName]?.[0]?.qty ?? 0;
            const cost = p.custos?.last_cost ?? p.custos?.[0]?.last_cost ?? 0;
            return `
                <tr>
                    <td class="td-code">${p.code}</td>
                    <td class="td-desc">${p.descricao} ${p.marca ? `<small>(${p.marca})</small>` : ''}</td>
                    <td class="td-stock ${qty <= 5 ? 'stock-low' : 'stock-ok'}">${qty}</td>
                    <td style="text-align:right">R$ ${Number(window.adjC(cost)).toFixed(2)}</td>
                    <td class="td-actions">
                        ${hasPermission('manual_adjustments') ? `<button class="btn-sm btn-set" onclick="openEditModal('${p.code}', '${p.descricao.replace(/'/g, "\\'")}')">Ô£Å</button>` : ''}
                        <button class="btn-sm btn-minus" onclick="openSaidaModal('${p.code}')">Ô×û</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) { console.error('ÔØî Erro busca:', e.message); }
}

// --- LOGICA DE ENTRADA (LOTE) ---
async function processarEntrada() {
    const textarea = document.getElementById('entrada-textarea');
    const lines = textarea.value.split('\n').map(l => l.trim().toUpperCase()).filter(Boolean);
    const resultDiv = document.getElementById('entrada-result');
    if (!lines.length) return;

    resultDiv.innerHTML = 'Ôîø Processando...';
    const counts = {}; lines.forEach(c => counts[c] = (counts[c] || 0) + 1);

    for (const [code, qty] of Object.entries(counts)) {
        const { data: part } = await supabase.from('parts').select('descricao').eq('code', code).single();
        if (!part) continue;
        const { data: cur } = await supabase.from(getEstoqueTable()).select('qty').eq('code', code).single();
        const newQty = (cur?.qty || 0) + qty;
        await supabase.from(getEstoqueTable()).upsert({ code, qty: newQty });
        await supabase.from(getHistoricoTable()).insert({ tipo: 'entrada', code, descricao: part.descricao, qty, user_email: currentUser.email, dt: new Date().toLocaleString('pt-BR') });
    }
    textarea.value = '';
    resultDiv.innerHTML = 'Ô£à Entradas registradas!';
    updateDashboard();
}

// --- LOGICA DE SA├ìDA (SELB) ---
window.buscarPecaPorDesc = async (val) => {
    const list = document.getElementById('pecas-sugestoes-custom');
    if (!list) return;

    if (window.buscarPecaSearchTimeout) {
        clearTimeout(window.buscarPecaSearchTimeout);
    }

    if (!val || val.length < 2) { 
        list.style.display = 'none'; 
        list.innerHTML = ''; 
        return; 
    }

    // Incrementar n├║mero de sequ├¬ncia
    window.buscarPecaQuerySeq = (window.buscarPecaQuerySeq || 0) + 1;
    const currentSeq = window.buscarPecaQuerySeq;

    window.buscarPecaSearchTimeout = setTimeout(async () => {
        // L├│gica do Coringa %
        let queryVal = val.trim().toUpperCase();
        
        // Se o usu├írio selecionou uma op├º├úo completa da lista (ex: "DESC [CODE]")
        if (queryVal.includes(' [') && queryVal.endsWith(']')) {
            const code = queryVal.split(' [').pop().replace(']', '');
            document.getElementById('saida-peca').value = code;
            list.style.display = 'none';
            return;
        }

        let q = supabase.from('parts').select('code, descricao').limit(20);
        
        const safeQuery = window.formatSearchQuery(queryVal);
        q = q.or(`code.ilike.%${safeQuery}%,descricao.ilike.%${safeQuery}%`);

        const { data } = await q;

        // Se uma busca mais nova j├í foi disparada, ignora o resultado desta
        if (currentSeq !== window.buscarPecaQuerySeq) {
            return;
        }

        let results = [];
        if (data && data.length > 0) {
            const codes = data.map(p => p.code);
            const { data: stockData } = await supabase
                .from(getEstoqueTable())
                .select('code, qty')
                .in('code', codes);

            const stockMap = {};
            if (stockData) {
                stockData.forEach(s => {
                    stockMap[s.code] = s.qty || 0;
                });
            }

            results = data.map(p => ({
                code: p.code,
                descricao: p.descricao,
                qty: stockMap[p.code] || 0
            }));

            // Ordenar por maior saldo primeiro
            results.sort((a, b) => b.qty - a.qty);
        }

        if (results && results.length > 0) {
            list.innerHTML = results.map(p => {
                const descSanitized = p.descricao.replace(/'/g, "\\'");
                const qtyColor = p.qty > 0 ? 'var(--green, #10b981)' : 'var(--red, #ef4444)';
                return `
                    <div class="custom-datalist-item" onclick="window.selecionarPeca('${descSanitized}', '${p.code}')" style="display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${p.descricao} <span style="color:var(--text-muted);font-size:0.75rem;">[${p.code}]</span>
                        </div>
                        <div style="font-weight: bold; color: ${qtyColor}; font-size: 0.85rem; padding-left: 5px; white-space: nowrap;">
                            Saldo: ${p.qty}
                        </div>
                    </div>
                `;
            }).join('');
            list.style.display = 'block';
        } else {
            list.innerHTML = '<div style="padding:10px 15px;color:var(--text-muted);font-size:12px;">Nenhuma pe├ºa encontrada...</div>';
            list.style.display = 'block';
        }
    }, 300);
};

window.selecionarPeca = (desc, code) => {
    document.getElementById('saida-busca-desc').value = `${desc} [${code}]`;
    document.getElementById('saida-peca').value = code;
    document.getElementById('pecas-sugestoes-custom').style.display = 'none';
};

// Fechar o dropdown customizado se clicar fora dele
document.addEventListener('click', (e) => {
    const list = document.getElementById('pecas-sugestoes-custom');
    const input = document.getElementById('saida-busca-desc');
    if (list && list.style.display === 'block' && !list.contains(e.target) && e.target !== input) {
        list.style.display = 'none';
    }
});

async function confirmarSaida() {
    const selb = document.getElementById('saida-selb').value.trim().toUpperCase();
    
    if (!saidaItems.length) {
        alert('Por favor, adicione pe├ºas ao carrinho antes de finalizar a baixa.');
        return;
    }

    // Valida├º├úo de comprimento baseada no setor
    if (window.currentSector === 'REMANU') {
        if (selb.length !== 4) {
            alert('ÔØî SELB Inv├ílido!\n\nNa Remanufatura, o SELB deve ter exatamente 4 caracteres.');
            return;
        }
        const allowed = ['RI43', 'RK55', 'RI37', 'KY40', 'SA70'];
        if (!allowed.includes(selb)) {
            alert(`ÔØî SELB Inv├ílido para a Remanufatura!\n\nEste setor est├í restrito aos seguintes modelos:\n${allowed.join(', ')}`);
            return;
        }
    } else {
        if (!selb || selb.length < 4) {
            alert('ÔØî SELB Inv├ílido!\n\nPor favor, digite o SELB completo (m├¡nimo de 4 caracteres) do equipamento.');
            return;
        }
    }

    const btn = document.getElementById('saida-confirm-btn');
    btn.disabled = true; btn.textContent = 'Verificando SELB...';

    let equip = null;
    if (window.currentSector === 'REMANU') {
        const localModelo = REMANU_SELB_MAP[selb];
        if (localModelo) {
            equip = { modelo: localModelo };
        }
    } else {
        // Busca primeiro de forma instant├ónea O(1) no cache local usando Map
        const localModelo = window.equipamentosCache.get(selb);
        if (localModelo !== undefined) {
            equip = { modelo: localModelo };
        }
    }

    if (!equip) {
        // Fallback r├ípido ao banco de dados se n├úo encontrado no cache local
        try {
            const { data: dbEquip, error: equipErr } = await supabase.from('equipamentos').select('modelo').eq('selb', selb).maybeSingle();
            if (equipErr) {
                alert('ÔØî Erro ao verificar o SELB: ' + equipErr.message);
                btn.disabled = false; btn.textContent = 'Finalizar Baixa';
                return;
            }
            if (dbEquip) {
                equip = dbEquip;
                // Salva no cache local para futuras consultas instant├óneas
                window.equipamentosCache.set(selb, dbEquip.modelo || '');
            }
        } catch (dbErr) {
            console.error('Erro de rede ao verificar SELB:', dbErr);
        }
    }

    if (!equip) {
        alert(`ÔØî SELB incorreto!\n\nEste SELB n├úo foi encontrado no banco de dados. Caso o SELB esteja correto, solicite ao administrador que realize o cadastro no sistema.`);
        btn.disabled = false; btn.textContent = 'Finalizar Baixa';
        return;
    }

    btn.textContent = 'Gravando...';

    try {
        // Valida├º├úo preventiva: impede baixar itens que n├úo possuem saldo em estoque
        for (const item of saidaItems) {
            const { data: cur } = await supabase.from(getEstoqueTable()).select('qty').eq('code', item.code).maybeSingle();
            const currentQty = cur?.qty || 0;
            if (currentQty < item.qty) {
                throw new Error(`Saldo insuficiente para a pe├ºa ${item.code} (${item.descricao || 'Sem descri├º├úo'}). Saldo atual em estoque: ${currentQty}, solicitado para baixa: ${item.qty}.`);
            }
        }

        const ts = new Date().toISOString();
        
        let revision_id = null;
        let vlr_nova_ref = null;

        if (window.currentSector === 'REMANU') {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const hh = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            revision_id = `REV-${yyyy}${mm}${dd}-${hh}${min}${ss}`;

            // Snapshot Financeiro
            const { data: vinculo } = await supabase.from('modelos_remanu').select('codigo_nova').eq('modelo', equip.modelo).maybeSingle();
            if (vinculo && vinculo.codigo_nova) {
                const { data: custoNova } = await supabase.from('custos').select('last_cost').eq('code', vinculo.codigo_nova).maybeSingle();
                if (custoNova && custoNova.last_cost) {
                    vlr_nova_ref = custoNova.last_cost;
                }
            }
        }

        for (const item of saidaItems) {
            // 1) Baixa o estoque
            const { data: cur } = await supabase.from(getEstoqueTable()).select('qty').eq('code', item.code).single();
            const newQty = (cur?.qty || 0) - item.qty;
            const { error: estoqueErr } = await supabase.from(getEstoqueTable()).upsert({ code: item.code, qty: newQty });
            if (estoqueErr) throw new Error(`Erro ao baixar estoque de ${item.code}: ${estoqueErr.message}`);

            // 2) Grava no hist├│rico COM vlr_unit e vlr_total
            const histPayload = {
                tipo: 'sa├¡da',
                code: item.code,
                descricao: item.descricao,
                qty: item.qty,
                vlr_unit: item.vlrUnit,
                vlr_total: item.vlrTotal,
                selb: selb,
                user_email: currentUser.email,
                ts: ts
            };
            if (revision_id) histPayload.revision_id = revision_id;
            if (vlr_nova_ref !== null) histPayload.vlr_nova_ref = vlr_nova_ref;

            const { error: histErr } = await supabase.from(getHistoricoTable()).insert(histPayload);
            if (histErr) throw new Error(`Erro ao gravar hist├│rico de ${item.code}: ${histErr.message}`);
        }

        alert('\u2705 Baixa conclu\u00edda!');
        closeSaidaModal();
        updateDashboard();
        if (currentTab === 'estoque') {
            const searchVal = document.getElementById('search-main')?.value || '';
            renderEstoque(searchVal);
        }
    } catch (err) {
        alert('\u274c ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Finalizar Baixa';
    }
}

function openSaidaModal(code) {
    saidaItems = [];
    document.getElementById('saida-selb').value = '';
    
    const infoDiv = document.getElementById('saida-selb-info');
    if (infoDiv) {
        infoDiv.style.display = 'none';
        infoDiv.innerHTML = '';
    }

    const list = document.getElementById('pecas-sugestoes-custom');
    if (list) {
        list.style.display = 'none';
        list.innerHTML = '';
    }

    // Configura├º├úo din├ómica do campo de input SELB conforme o setor
    const selbInput = document.getElementById('saida-selb');
    const labelContainer = selbInput?.parentElement?.querySelector('strong');
    
    if (selbInput) {
        if (window.currentSector === 'REMANU') {
            if (labelContainer) labelContainer.textContent = 'SELB (4 d├¡gitos):';
            selbInput.maxLength = 4;
            selbInput.placeholder = 'Ex: RI43';
            selbInput.style.width = '80px';
        } else {
            if (labelContainer) labelContainer.textContent = 'SELB (Equipamento):';
            selbInput.removeAttribute('maxlength');
            selbInput.placeholder = 'Ex: SA701234';
            selbInput.style.width = '140px';
        }
    }

    document.getElementById('saida-peca').value = code || '';
    document.getElementById('saida-busca-desc').value = '';
    renderSaidaItems();
    document.getElementById('modal-saida-overlay').classList.add('open');
}

async function addSaidaItem() {
    const code = document.getElementById('saida-peca').value.trim().toUpperCase();
    const qty = parseInt(document.getElementById('saida-qtd').value) || 1;
    if (!code) { alert('Selecione uma pe├ºa primeiro pesquisando pela descri├º├úo.'); return; }

    // TRAVA DE ESTOQUE: Verifica saldo antes de adicionar
    const { data: st } = await supabase.from(getEstoqueTable()).select('qty').eq('code', code).single();
    const currentStock = st?.qty || 0;

    // Verifica se j├í tem esse item no lote atual
    const inBatch = saidaItems.find(i => i.code === code)?.qty || 0;

    if (currentStock < (qty + inBatch)) {
        alert(`ÔØî SALDO INSUFICIENTE!\nEstoque atual: ${currentStock}\nVoc├¬ j├í adicionou ${inBatch} e est├í tentando adicionar mais ${qty}.`);
        return;
    }

    supabase.from('parts').select('descricao, custos(last_cost)').eq('code', code).single().then(({ data }) => {
        if (!data) { alert('Pe├ºa n├úo encontrada no cadastro.'); return; }
        const vlr = data.custos?.last_cost ?? data.custos?.[0]?.last_cost ?? 0;
        
        const existing = saidaItems.find(i => i.code === code);
        if (existing) {
            existing.qty += qty;
            existing.vlrTotal = existing.qty * existing.vlrUnit;
        } else {
            saidaItems.push({ code, descricao: data.descricao, qty, vlrUnit: vlr, vlrTotal: qty * vlr });
        }
        
        document.getElementById('saida-peca').value = ''; 
        document.getElementById('saida-busca-desc').value = '';
        renderSaidaItems();
    });
}

function renderSaidaItems() {
    const tbody = document.getElementById('saida-tbody');
    document.getElementById('saida-count').textContent = saidaItems.reduce((s, i) => s + i.qty, 0);
    document.getElementById('saida-total').textContent = 'R$ ' + window.adjC(saidaItems.reduce((s, i) => s + i.vlrTotal, 0)).toFixed(2);
    tbody.innerHTML = saidaItems.map((item, idx) => `<tr><td>${item.code}</td><td>${item.descricao}</td><td class="text-center">${item.qty}</td><td class="text-right">R$ ${window.adjC(item.vlrTotal).toFixed(2)}</td><td><button onclick="window.removeSaidaItem(${idx})">ÔØî</button></td></tr>`).join('');
}

// --- AJUSTE MANUAL ---
let currentEditCode = '';
let currentEditPrevQty = 0;
let currentEditPrevPrice = 0;

function openEditModal(code, desc) {
    currentEditCode = code;
    document.getElementById('modal-code').textContent = code;
    document.getElementById('modal-desc').textContent = desc;
    document.getElementById('modal-obs').value = ''; // Limpa observa├º├úo anterior

    supabase.from(getEstoqueTable()).select('qty').eq('code', code).single().then(({ data }) => {
        currentEditPrevQty = data?.qty || 0;
        document.getElementById('modal-qty').value = currentEditPrevQty;
    });
    supabase.from('custos').select('last_cost').eq('code', code).single().then(({ data }) => {
        currentEditPrevPrice = data?.last_cost || 0;
        document.getElementById('modal-price').value = currentEditPrevPrice;
        window.updatePricePreview('modal-price', 'modal-price-preview');
    });
    document.getElementById('modal-overlay').classList.add('open');
}

async function savePriceModal() {
    if (!hasPermission('manual_adjustments')) {
        alert('ÔØî Permiss├úo negada! Seu perfil n├úo tem permiss├úo para realizar ajustes manuais.');
        return;
    }

    const qty = parseInt(document.getElementById('modal-qty').value) || 0;
    const price = parseFloat(document.getElementById('modal-price').value) || 0;
    const obs = document.getElementById('modal-obs').value.trim();

    if (!obs) {
        alert('ÔÜá´©Å A observa├º├úo ├® obrigat├│ria para registrar o hist├│rico do ajuste.');
        return;
    }

    const btn = document.querySelector('#modal-overlay .btn-confirm');
    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Gravando...'; }

    try {
        await supabase.from(getEstoqueTable()).upsert({ code: currentEditCode, qty });
        await supabase.from('custos').upsert({ code: currentEditCode, last_cost: price });

        const formatChange = `AJUSTE MANUAL: ${obs} (Qtd: ${currentEditPrevQty} Ô×í´©Å ${qty} | Pre├ºo: R$ ${currentEditPrevPrice.toFixed(2)} Ô×í´©Å R$ ${price.toFixed(2)})`;

        await supabase.from(getHistoricoTable()).insert({
            tipo: 'ajuste',
            code: currentEditCode,
            qty: qty,
            vlr_unit: price,
            vlr_total: qty * price,
            selb: 'AJUSTE',
            descricao: formatChange,
            user_email: currentUser.email,
            ts: new Date().toISOString()
        });

        document.getElementById('modal-overlay').classList.remove('open');
        renderEstoque(); 
        updateDashboard();
        alert('Ô£à Ajuste realizado e registrado no hist├│rico com sucesso!');
    } catch (err) {
        alert('ÔØî Erro ao salvar o ajuste: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
}

// --- HIST├ôRICO ---
async function renderHistorico() {
    const hName = getHistoricoTable();
    const tbody = document.getElementById('hist-tbody');
    const searchQ = document.getElementById('hist-search')?.value.trim().toUpperCase() || '';
    const tipoF = document.getElementById('hist-tipo')?.value || '';
    const d1Str = document.getElementById('hist-d1')?.value || '';
    const d2Str = document.getElementById('hist-d2')?.value || '';

    let q = supabase.from(hName).select('*').order('ts', { ascending: false }).limit(200);

    if (tipoF) q = q.eq('tipo', tipoF);
    if (searchQ) {
        const sq = window.formatSearchQuery(searchQ);
        q = q.or(`code.ilike.%${sq}%,descricao.ilike.%${sq}%,selb.ilike.%${sq}%`);
    }
    if (d1Str) q = q.gte('ts', d1Str + 'T00:00:00Z');
    if (d2Str) q = q.lte('ts', d2Str + 'T23:59:59.999Z');

    const { data } = await q;
    if (getHistoricoTable() !== hName) return;
    if (!data) return;

    let displayData = [];
    
    if (window.currentSector === 'REMANU') {
        const grouped = {};
        for (const h of data) {
            if (h.revision_id) {
                if (!grouped[h.revision_id]) {
                    grouped[h.revision_id] = {
                        isGroup: true,
                        revision_id: h.revision_id,
                        ts: h.ts,
                        tipo: h.tipo,
                        selb: h.selb,
                        user_email: h.user_email,
                        vlr_total: 0,
                        items: []
                    };
                }
                grouped[h.revision_id].vlr_total += (h.vlr_total || 0);
                grouped[h.revision_id].items.push(h);
            } else {
                displayData.push(h);
            }
        }
        for (const key in grouped) displayData.push(grouped[key]);
        displayData.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    } else {
        displayData = data;
    }

    document.getElementById('hist-count').textContent = `${displayData.length} registros (limite de visualiza├º├úo)`;

    tbody.innerHTML = displayData.map(h => {
        if (h.isGroup) {
            return `
            <tr style="background-color: var(--bg-hover);">
                <td>${new Date(h.ts).toLocaleString()}</td>
                <td class="td-code" style="font-size: 0.75rem; color: var(--primary)">${h.revision_id}</td>
                <td>
                    <span class="hist-badge badge-saida" style="background:#6366f1; color:white">REVIS├âO</span>
                </td>
                <td class="text-center">${h.items.length} itens</td>
                <td style="text-align:right; color: var(--text-muted)">-</td>
                <td style="text-align:right; font-weight: bold;">${h.vlr_total ? 'R$ ' + window.adjC(h.vlr_total).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                <td>${h.user_email?.split('@')[0] || ''}</td>
                <td style="font-size: 0.85rem;">
                    <strong>${h.selb || ''}</strong>
                    <details style="margin-top: 5px; cursor: pointer;">
                        <summary style="color: var(--primary); font-weight: 500; font-size: 0.75rem;">Ver Pe├ºas (${h.items.length})</summary>
                        <ul style="margin: 5px 0; padding-left: 15px; font-size: 0.7rem; color: var(--text-muted);">
                            ${h.items.map(i => `<li>${i.code} (Qtd: ${i.qty}) - R$ ${window.adjC(i.vlr_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</li>`).join('')}
                        </ul>
                    </details>
                </td>
                <td></td>
            </tr>`;
        }

        return `
        <tr>
            <td>${new Date(h.ts).toLocaleString()}</td>
            <td class="td-code">${h.code}</td>
            <td>
                <span class="hist-badge ${h.tipo === 'entrada' ? 'badge-entrada' : 'badge-saida'}${h.tipo === 'ajuste' ? ' badge-ajuste' : ''}" 
                      ${h.tipo === 'ajuste' ? `title="${h.descricao}" style="cursor:help"` : ''}>
                    ${h.tipo}
                </span>
            </td>
            <td class="text-center">${h.qty}</td>
            <td style="text-align:right; color: var(--text-muted)">${h.vlr_unit ? 'R$ ' + window.adjC(h.vlr_unit).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
            <td style="text-align:right; font-weight: bold;">${h.vlr_total ? 'R$ ' + window.adjC(h.vlr_total).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
            <td>${h.user_email?.split('@')[0] || ''}</td>
            <td style="font-size: 0.85rem;">
                <strong>${h.selb || ''}</strong>
                ${h.descricao && h.descricao !== h.selb ? `<div style="font-size: 0.7rem; color: var(--text-muted); line-height:1.2">${h.descricao}</div>` : ''}
            </td>
            <td>
                ${hasPermission('manual_adjustments') ? `<button class="btn-edit-hist" onclick="openAjusteHistorico('${h.id}')" title="Ajustar Registro">Ô£Å´©Å</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

// --- AJUSTE DE HIST├ôRICO (SOMENTE LUCAS) ---
window.openAjusteHistorico = async (id) => {
    if (!hasPermission('manual_adjustments')) {
        alert('ÔØî Permiss├úo negada! Seu perfil n├úo tem permiss├úo para realizar ajustes manuais.');
        return;
    }
    const { data } = await supabase.from(getHistoricoTable()).select('*').eq('id', id).single();
    if (!data) return;

    document.getElementById('ajuste-id').value = data.id;
    document.getElementById('ajuste-selb').value = data.selb || '';
    document.getElementById('ajuste-code').value = data.code || '';
    document.getElementById('ajuste-obs').value = '';
    document.getElementById('ajuste-status').innerHTML = '';
    
    document.getElementById('modal-ajuste-historico').classList.add('open');
};

window.closeAjusteHistorico = () => document.getElementById('modal-ajuste-historico').classList.remove('open');

window.saveAjusteHistorico = async () => {
    if (!hasPermission('manual_adjustments')) {
        alert('ÔØî Permiss├úo negada! Seu perfil n├úo tem permiss├úo para realizar ajustes manuais.');
        return;
    }
    const id = document.getElementById('ajuste-id').value;
    const newSelb = document.getElementById('ajuste-selb').value.trim().toUpperCase();
    const newCode = document.getElementById('ajuste-code').value.trim().toUpperCase();
    const obs = document.getElementById('ajuste-obs').value.trim();
    const status = document.getElementById('ajuste-status');

    if (!newCode || !obs) {
        status.innerHTML = '<span style="color:var(--red)">ÔÜá´©Å Informe o c├│digo e o motivo.</span>';
        return;
    }

    status.innerHTML = 'Ôîø Processando ajuste...';

    // 1. Pegar registro original
    const { data: original } = await supabase.from(getHistoricoTable()).select('*').eq('id', id).single();
    if (!original) return;

    // 2. Buscar o pre├ºo da pe├ºa (seja a antiga ou a nova)
    const { data: costData } = await supabase.from('custos').select('last_cost').eq('code', newCode).single();
    const newPrice = costData?.last_cost || original.vlr_unit || 0;
    const newTotal = newPrice * original.qty;

    // 3. Se mudou o c├│digo, ajusta o estoque
    if (original.code !== newCode) {
        // Devolve o antigo
        const factor = (original.tipo === 'sa├¡da' || original.tipo === 'saida') ? 1 : -1;
        
        // Atualiza estoque da pe├ºa antiga (devolvendo/revertendo)
        const { data: stOld } = await supabase.from(getEstoqueTable()).select('qty').eq('code', original.code).single();
        await supabase.from(getEstoqueTable()).upsert({ code: original.code, qty: (stOld?.qty || 0) + (original.qty * factor) });

        // Atualiza estoque da pe├ºa nova (retirando/aplicando)
        const { data: stNew } = await supabase.from(getEstoqueTable()).select('qty').eq('code', newCode).single();
        await supabase.from(getEstoqueTable()).upsert({ code: newCode, qty: (stNew?.qty || 0) - (original.qty * factor) });
    }

    // 4. Atualiza o registro original
    const { error: errUpdate } = await supabase.from(getHistoricoTable()).update({
        selb: newSelb,
        code: newCode,
        vlr_unit: newPrice,
        vlr_total: newTotal
    }).eq('id', id);

    if (errUpdate) {
        status.innerHTML = 'ÔØî Erro ao atualizar: ' + errUpdate.message;
        return;
    }

    // 5. Cria registro de auditoria (TIPO AJUSTE) com os valores
    await supabase.from(getHistoricoTable()).insert({
        tipo: 'ajuste',
        code: newCode,
        qty: original.qty,
        vlr_unit: newPrice,
        vlr_total: newTotal,
        selb: newSelb,
        descricao: `AJUSTE: ${obs} (Original: ${original.code} / ${original.selb})`,
        user_email: currentUser.email,
        ts: new Date().toISOString()
    });

    status.innerHTML = '<span style="color:var(--green)">Ô£à Ajuste conclu├¡do com sucesso!</span>';
    setTimeout(() => {
        closeAjusteHistorico();
        renderHistorico();
        updateDashboard();
    }, 1500);
};

// --- EXPOR PARA GLOBAL (BOT├òES HTML) ---
window.switchTab = switchTab;
window.processarEntrada = processarEntrada;

// Fun├º├úo para abrir o menu de engrenagem
window.openAdminMenu = () => {
    const menu = document.getElementById('admin-menu-overlay');
    if (menu) {
        // Controlar visibilidade de cada op├º├úo administrativa baseado nas permiss├Áes do usu├írio
        const btnImportXml = document.getElementById('admin-btn-import-xml');
        const btnCustoModelo = document.getElementById('admin-btn-modelo-custo');
        const btnImportWms = document.getElementById('admin-btn-import-wms');
        const btnRevisados = document.getElementById('admin-btn-revisados');
        const btnVinculoSelb = document.getElementById('admin-btn-vinculo-selb');
        const btnCadastroPeca = document.getElementById('admin-btn-cadastro-peca');
        const btnBackup = document.getElementById('admin-btn-backup');
        const btnToggleCusto = document.getElementById('btn-toggle-custo');

        if (btnImportXml) btnImportXml.style.display = hasPermission('import_xml') ? 'block' : 'none';
        if (btnCustoModelo) btnCustoModelo.style.display = hasPermission('view_costs') ? 'block' : 'none';
        if (btnImportWms) btnImportWms.style.display = hasPermission('import_xml') ? 'block' : 'none';
        if (btnRevisados) btnRevisados.style.display = hasPermission('register_revisados') ? 'block' : 'none';
        if (btnVinculoSelb) btnVinculoSelb.style.display = hasPermission('link_selb') ? 'block' : 'none';
        if (btnCadastroPeca) btnCadastroPeca.style.display = hasPermission('create_parts') ? 'block' : 'none';
        if (btnBackup) btnBackup.style.display = hasPermission('manual_adjustments') ? 'block' : 'none';
        if (btnToggleCusto) btnToggleCusto.style.display = hasPermission('view_costs') ? 'block' : 'none';

        menu.classList.add('open');
    }
};
window.closeAdminMenu = () => {
    const menu = document.getElementById('admin-menu-overlay');
    if (menu) menu.classList.remove('open');
};

window.openSaidaModal = openSaidaModal;
window.closeSaidaModal = () => {
    document.getElementById('modal-saida-overlay').classList.remove('open');
    const list = document.getElementById('pecas-sugestoes-custom');
    if (list) {
        list.style.display = 'none';
        list.innerHTML = '';
    }
};
window.addSaidaItem = addSaidaItem;
window.confirmarSaida = confirmarSaida;
window.removeSaidaItem = (idx) => { saidaItems.splice(idx, 1); renderSaidaItems(); };
window.openEditModal = openEditModal;
window.closeModal = () => document.getElementById('modal-overlay').classList.remove('open');
window.savePriceModal = savePriceModal;

// --- VINCULO MANUAL SELB ---
window.openManualSELBModal = async () => {
    document.getElementById('manual-selb').value = '';
    document.getElementById('manual-modelo').value = '';
    document.getElementById('manual-selb-status').innerHTML = '';
    
    // Carregar sugest├Áes de modelos existentes para o datalist
    const { data } = await supabase.from('equipamentos').select('modelo').limit(1000);
    if (data) {
        const uniqueModels = [...new Set(data.map(e => e.modelo))].sort();
        document.getElementById('modelos-existentes').innerHTML = uniqueModels.map(m => `<option value="${m}">`).join('');
    }
    
    document.getElementById('modal-selb-manual').classList.add('open');
};

window.closeManualSELBModal = () => document.getElementById('modal-selb-manual').classList.remove('open');

window.saveManualSELB = async () => {
    const selb = document.getElementById('manual-selb').value.trim().toUpperCase();
    const modelo = document.getElementById('manual-modelo').value.trim().toUpperCase();
    const status = document.getElementById('manual-selb-status');

    if (!selb || !modelo) {
        status.innerHTML = '<span style="color:var(--red)">ÔÜá´©Å Preencha todos os campos.</span>';
        return;
    }

    status.innerHTML = 'Ôîø Salvando...';
    
    const { error } = await supabase.from('equipamentos').upsert({
        selb,
        modelo,
        descricao: 'V├ìNCULO MANUAL'
    });

    if (error) {
        status.innerHTML = `<span style="color:var(--red)">ÔØî Erro: ${error.message}</span>`;
    } else {
        // Atualizar o cache local instant├óneo Map O(1)
        window.equipamentosCache.set(selb, modelo);

        status.innerHTML = `<span style="color:var(--green)">Ô£à SELB ${selb} vinculado com sucesso!</span>`;
        setTimeout(() => {
            closeManualSELBModal();
            renderModeloCusto(); // Atualiza o relat├│rio se estiver aberto
        }, 1500);
    }
};

// --- CADASTRO DE PE├çA NOVA ---
window.openCadastroPecaModal = () => {
    if (!hasPermission('create_parts')) {
        alert('ÔØî Permiss├úo negada! Seu perfil n├úo possui autoriza├º├úo para cadastrar pe├ºas novas.');
        return;
    }
    document.getElementById('cad-code').value = '';
    document.getElementById('cad-desc').value = '';
    document.getElementById('cad-marca').value = 'OUTROS';
    document.getElementById('cad-custo').value = '';
    window.updatePricePreview('cad-custo', 'cad-custo-preview');
    document.getElementById('cadastro-peca-status').innerHTML = '';
    
    document.getElementById('modal-cadastro-peca').classList.add('open');
};

window.closeCadastroPecaModal = () => {
    document.getElementById('modal-cadastro-peca').classList.remove('open');
};

window.saveCadastroPeca = async () => {
    if (!hasPermission('create_parts')) {
        alert('ÔØî Permiss├úo negada! Seu perfil n├úo possui autoriza├º├úo para cadastrar pe├ºas novas.');
        return;
    }

    const code = document.getElementById('cad-code').value.trim().toUpperCase();
    const desc = document.getElementById('cad-desc').value.trim().toUpperCase();
    const marca = document.getElementById('cad-marca').value.trim().toUpperCase() || 'OUTROS';
    const custo = parseFloat(document.getElementById('cad-custo').value) || 0;
    const status = document.getElementById('cadastro-peca-status');

    if (!code || !desc || isNaN(custo) || custo <= 0) {
        status.innerHTML = '<span style="color:var(--red)">ÔÜá´©Å C├│digo, descri├º├úo e valor (maior que zero) s├úo obrigat├│rios!</span>';
        return;
    }

    status.innerHTML = 'Ôîø Cadastrando pe├ºa no Supabase...';

    try {
        // 1. Verificar se a pe├ºa j├í existe
        const { data: checkPart, error: checkErr } = await supabase
            .from('parts')
            .select('code')
            .eq('code', code)
            .maybeSingle();

        if (checkErr) throw checkErr;
        if (checkPart) {
            status.innerHTML = '<span style="color:var(--red)">ÔØî C├│digo de pe├ºa j├í cadastrado!</span>';
            return;
        }

        // 2. Cadastrar na tabela parts
        const { error: partErr } = await supabase.from('parts').insert({
            code: code,
            descricao: desc,
            marca: marca
        });
        if (partErr) throw partErr;

        // 3. Cadastrar na tabela custos
        const { error: costErr } = await supabase.from('custos').upsert({
            code: code,
            last_cost: custo
        });
        if (costErr) throw costErr;

        // 4. Inicializar saldos com 0 nas tabelas estoque e estoque_remanu
        await supabase.from('estoque').upsert({ code: code, qty: 0 });
        await supabase.from('estoque_remanu').upsert({ code: code, qty: 0 });

        status.innerHTML = '<span style="color:var(--green)">Ô£à Pe├ºa cadastrada com sucesso!</span>';
        setTimeout(() => {
            document.getElementById('modal-cadastro-peca').classList.remove('open');
            const menu = document.getElementById('admin-menu-overlay');
            if (menu) menu.classList.remove('open');
            
            // Recarrega se estiver na aba de estoque
            if (currentTab === 'estoque') {
                renderChips();
                renderEstoque();
            }
        }, 1500);

    } catch (e) {
        console.error(e);
        status.innerHTML = `<span style="color:var(--red)">ÔØî Erro: ${e.message}</span>`;
    }
};

// Facilitar navega├º├úo do menu admin
window.openImportFromMenu = () => {
    document.getElementById('admin-menu-box').style.display = 'none';
    document.getElementById('import-submenu-box').style.display = 'block';
};
window.backToAdminMenu = () => {
    document.getElementById('admin-menu-box').style.display = 'block';
    document.getElementById('import-submenu-box').style.display = 'none';
};
window.doImportProtheus = () => {
    window.closeAdminMenu();
    window.switchTab('entrada-xml');
};
window.processarXML = async (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(e.target.result, "application/xml");
            const rows = Array.from(doc.querySelectorAll('Row'));

            if (!rows.length) { alert('Nenhuma linha encontrada no XML.'); return; }

            // 1. Busca o n├║mero do pedido globalmente nas primeiras 15 linhas do XML
            let globalPedido = '';
            for (let ri = 0; ri < Math.min(rows.length, 15); ri++) {
                const cells = rows[ri].querySelectorAll('Cell');
                for (const cell of cells) {
                    const txt = cell.querySelector('Data')?.textContent.trim() || '';
                    const upperTxt = txt.toUpperCase();
                    if (upperTxt.includes('PEDIDO') || upperTxt.includes('PED.COMPRA') || upperTxt.includes('PED. COMPRA')) {
                        const match = txt.match(/(?:PEDIDO|PED\.COMPRA|PED\. COMPRA)(?:\s+(?:DE\s+COMPRA|N┬║|NUM\.?|N\.?))?[\s.:#-]+([A-Z0-9]+)/i);
                        if (match && match[1]) {
                            globalPedido = match[1].trim();
                            break;
                        }
                    }
                }
                if (globalPedido) break;
            }

            let colProduto = -1, colQtd = -1, colVlrUnit = -1, colPedido = -1;
            let dataStartIdx = -1;

            for (let ri = 0; ri < Math.min(rows.length, 100); ri++) {
                const cells = rows[ri].querySelectorAll('Cell');
                const texts = Array.from(cells).map(c => c.querySelector('Data')?.textContent.trim().toUpperCase() || '');
                if (texts.some(t => t.includes('PRODUTO') || t === 'COD. PRODUTO')) {
                    texts.forEach((t, i) => {
                        if (t.includes('PRODUTO') && colProduto < 0) colProduto = i;
                        if ((t.includes('QUANTIDADE') || t === 'QTD') && colQtd < 0) colQtd = i;
                        if (t.includes('UNIT') && colVlrUnit < 0) colVlrUnit = i;
                        if ((t.includes('PEDIDO') || t.includes('PED.COMPRA') || t.includes('PED. COMPRA') || t === 'PED') && colPedido < 0) colPedido = i;
                    });
                    dataStartIdx = ri + 1;
                    break;
                }
            }

            if (dataStartIdx < 0 || colProduto < 0) {
                colProduto = 2; colQtd = 5; colVlrUnit = 6;
                dataStartIdx = 0;
            }

            const itemsMap = {};
            for (let ri = dataStartIdx; ri < rows.length; ri++) {
                const cells = rows[ri].querySelectorAll('Cell');
                if (cells.length < 3) continue;

                const getCell = (idx) => idx >= 0 && idx < cells.length ? (cells[idx].querySelector('Data')?.textContent.trim() || '') : '';

                const rawCode = getCell(colProduto).toUpperCase().replace(/\s+/g, '');
                if (!rawCode || rawCode.length < 2 || rawCode.includes('PRODUTO') || rawCode === 'TOTAL') continue;

                const qtdRaw = getCell(colQtd).replace(',', '.').replace(/[^0-9.]/g, '');
                const qty = parseFloat(qtdRaw) || 0;
                if (qty <= 0) continue;

                const vlrUnit = parseFloat(getCell(colVlrUnit).replace(',', '.').replace(/[^0-9.]/g, '')) || 0;

                // Captura o n├║mero do pedido por linha (se existir a coluna) ou usa o global
                const rowPedido = colPedido >= 0 ? getCell(colPedido).trim() : '';
                const orderNum = rowPedido || globalPedido || '';

                if (!itemsMap[rawCode]) itemsMap[rawCode] = { qty: 0, vlrUnit: vlrUnit, pedido: orderNum };
                itemsMap[rawCode].qty += qty;
                if (orderNum && !itemsMap[rawCode].pedido) {
                    itemsMap[rawCode].pedido = orderNum;
                }
            }

            const keys = Object.keys(itemsMap);
            if (keys.length === 0) { alert('Nenhum item v├ílido encontrado.'); return; }

            document.getElementById('xml-drop-area').innerHTML = `<h3 style="color:#2e7d32;text-align:center">Processando ${keys.length} itens no banco de dados... Aguarde.</h3>`;

            let processados = 0;
            const targetSector = document.querySelector('input[name="xml-sector"]:checked').value;
            const tableEstoque = targetSector === 'REMANU' ? 'estoque_remanu' : 'estoque';
            const tableHist = targetSector === 'REMANU' ? 'historico_remanu' : 'historico';

            for (const code of keys) {
                const { qty, vlrUnit, pedido } = itemsMap[code];

                // Garante que a pe├ºa esteja cadastrada no cat├ílogo 'parts' para evitar viola├º├úo de chave estrangeira (FK)
                const { data: pCheck } = await supabase.from('parts').select('code').eq('code', code).maybeSingle();
                if (!pCheck) {
                    const { error: pErr } = await supabase.from('parts').insert({
                        code: code,
                        descricao: `PE├çA IMPORTADA VIA XML (${code})`,
                        marca: 'OUTROS'
                    });
                    if (pErr) {
                        console.warn(`Aviso ao cadastrar pe├ºa ${code}:`, pErr.message);
                    }
                }

                const { data: cur } = await supabase.from(tableEstoque).select('qty').eq('code', code).single();
                const newQty = (cur?.qty || 0) + qty;

                const { error: errEst } = await supabase.from(tableEstoque).upsert({ code, qty: newQty });
                if (errEst) throw new Error(`Estoque: ${errEst.message}`);
                
                if (vlrUnit > 0) {
                    const { error: errCust } = await supabase.from('custos').upsert({ code, last_cost: vlrUnit });
                    if (errCust) throw new Error(`Custos: ${errCust.message}`);
                }

                if (currentUser) {
                    const descHist = pedido ? `Entrada Lote XML - Pedido ${pedido}` : 'Entrada Lote XML';
                    const { error: errHist } = await supabase.from(tableHist).insert({
                        tipo: 'entrada', code, descricao: descHist, qty,
                        user_email: currentUser.email, dt: new Date().toLocaleString('pt-BR'),
                        vlr_unit: vlrUnit, vlr_total: vlrUnit * qty
                    });
                    if (errHist) throw new Error(`Hist├│rico: ${errHist.message}`);
                }
                processados++;
            }

            alert(`Importa├º├úo conclu├¡da! ${processados} itens processados com sucesso.`);
            window.location.reload();
        } catch (err) {
            alert('Erro na importa├º├úo: ' + err.message);
            window.location.reload();
        }
    };
    reader.readAsText(file, 'utf-8');
};

// --- MOVIMENTA├ç├òES DASHBOARD ---
let chartDaily = null;
let chartWeekly = null;

window.renderMovDashboard = async () => {
    const hName = getHistoricoTable();
    const tName = getEstoqueTable();
    const prodF = document.getElementById('mov-prod')?.value.trim().toUpperCase();
    const tipoF = document.getElementById('mov-tipo')?.value;
    const d1El = document.getElementById('mov-d1');
    const d2El = document.getElementById('mov-d2');

    if (d1El && d2El && (!d1El.value || !d2El.value)) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
        if (!d1El.value) d1El.value = `${y}-${m}-01`;
        if (!d2El.value) d2El.value = `${y}-${m}-${lastDay}`;
    }

    const d1 = d1El?.value || '';
    const d2 = d2El?.value || '';

    let q = supabase.from(hName).select('*').order('ts', { ascending: true });
    if (tipoF) q = q.eq('tipo', tipoF);
    if (prodF) {
        const sq = window.formatSearchQuery(prodF);
        q = q.or(`code.ilike.%${sq}%,descricao.ilike.%${sq}%`);
    }
    if (d1) q = q.gte('ts', d1 + 'T00:00:00Z');
    if (d2) q = q.lte('ts', d2 + 'T23:59:59Z');

    const { data } = await q;
    if (getHistoricoTable() !== hName) return;
    if (!data) return;

    let totIn = 0, totOut = 0, vlrIn = 0, vlrOut = 0;
    const daily = {};
    const weekly = {};

    data.forEach(h => {
        const qty = h.qty || 0;
        const vlr = h.vlr_total || 0;
        const dt = h.ts ? h.ts.split('T')[0] : 'Sem Data';

        if (h.tipo === 'entrada') { totIn += qty; vlrIn += vlr; }
        else if (h.tipo === 'sa├¡da' || h.tipo === 'saida') { totOut += qty; vlrOut += vlr; }

        if (dt !== 'Sem Data') {
            if (!daily[dt]) daily[dt] = { in: 0, out: 0, vlrIn: 0, vlrOut: 0 };
            if (h.tipo === 'entrada') { daily[dt].in += qty; daily[dt].vlrIn += vlr; }
            else if (h.tipo === 'sa├¡da' || h.tipo === 'saida') { daily[dt].out += qty; daily[dt].vlrOut += vlr; }

            const dateObj = new Date(h.ts);
            const startOfYear = new Date(dateObj.getFullYear(), 0, 1);
            const week = Math.ceil((((dateObj - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
            const weekKey = `Sem. ${week}`;
            if (!weekly[weekKey]) weekly[weekKey] = 0;
            weekly[weekKey] += qty;
        }
    });

    // Atualizar KPIs
    const fmt = v => 'R$ ' + Number(window.adjC(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('mov-kpi-entrada').textContent = totIn.toLocaleString('pt-BR');
    document.getElementById('mov-kpi-saida').textContent = totOut.toLocaleString('pt-BR');
    document.getElementById('mov-kpi-entrada-val').textContent = fmt(vlrIn);
    document.getElementById('mov-kpi-saida-val').textContent = fmt(vlrOut);
    document.getElementById('mov-kpi-saldo').textContent = (totIn - totOut).toLocaleString('pt-BR');

    // Patrim├┤nio Real (Independente do filtro de data)
    const { data: currentInv } = await supabase.from(tName).select('qty, code');
    if (getEstoqueTable() !== tName) return;
    const { data: currentCosts } = await supabase.from('custos').select('code, last_cost');
    
    let totalVol = 0;
    let totalVal = 0;
    const costMap = {};
    currentCosts?.forEach(c => costMap[c.code] = c.last_cost);
    currentInv?.forEach(i => {
        totalVol += i.qty;
        totalVal += (i.qty * (costMap[i.code] || 0));
    });

    document.getElementById('mov-kpi-total-vol').textContent = totalVol.toLocaleString('pt-BR');
    document.getElementById('mov-kpi-total-val').textContent = fmt(totalVal);

    // Gr├ífico Di├írio
    const dailyLabels = Object.keys(daily).sort();
    if (chartDaily) chartDaily.destroy();
    chartDaily = new Chart(document.getElementById('chart-daily'), {
        type: 'line',
        data: {
            labels: dailyLabels,
            datasets: [
                { label: 'Entrada', data: dailyLabels.map(l => daily[l].in), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.4 },
                { label: 'Sa├¡da', data: dailyLabels.map(l => daily[l].out), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.4 }
            ]
        },
        options: { responsive: true }
    });

    // Gr├ífico Semanal
    const weeklyLabels = Object.keys(weekly);
    if (chartWeekly) chartWeekly.destroy();
    chartWeekly = new Chart(document.getElementById('chart-weekly'), {
        type: 'bar',
        data: {
            labels: weeklyLabels,
            datasets: [{ label: 'Volume Total', data: weeklyLabels.map(l => weekly[l]), backgroundColor: '#3b82f6', borderRadius: 6 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // Tabela Detalhada
    const tbody = document.getElementById('mov-tbody');
    const empty = document.getElementById('mov-empty');
    const sortedDates = Object.keys(daily).sort((a, b) => b.localeCompare(a));

    if (sortedDates.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
    } else {
        empty.style.display = 'none';
        tbody.innerHTML = sortedDates.map(dt => {
            const d = daily[dt];
            const saldo = d.in - d.out;
            return `<tr>
                <td style="font-family:var(--mono)">${dt.split('-').reverse().join('/')}</td>
                <td style="text-align:center; color:#22c55e; font-weight:bold">${d.in}</td>
                <td style="text-align:center; color:#ef4444; font-weight:bold">${d.out}</td>
                <td style="text-align:center; font-weight:bold">${saldo > 0 ? '+' : ''}${saldo}</td>
                <td style="text-align:right">${d.vlrIn > 0 ? fmt(d.vlrIn) : 'ÔÇö'}</td>
                <td style="text-align:right">${d.vlrOut > 0 ? fmt(d.vlrOut) : 'ÔÇö'}</td>
                <td style="text-align:right; font-weight:bold">${fmt(d.vlrIn + d.vlrOut)}</td>
            </tr>`;
        }).join('');
    }
};

async function gerarBackupCompleto() {
    try {
        console.log('­ƒöä Iniciando coleta de dados para backup...');
        const btn = event.target;
        const originalText = btn.innerText;
        btn.innerText = 'ÔÅ│ Coletando dados...';
        btn.disabled = true;

        const [p, e, c, h] = await Promise.all([
            supabase.from('parts').select('*'),
            supabase.from('estoque').select('*'),
            supabase.from('custos').select('*'),
            supabase.from('historico').select('*').order('ts', { ascending: false })
        ]);

        const backup = {
            data_geracao: new Date().toISOString(),
            versao: '1.0',
            tabelas: {
                parts: p.data || [],
                estoque: e.data || [],
                custos: c.data || [],
                historico: h.data || []
            }
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dataStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        a.download = `BACKUP_ESTOQUE_LAB_${dataStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        btn.innerText = originalText;
        btn.disabled = false;
        alert('Ô£à Backup conclu├¡do com sucesso! Guarde este arquivo em um local seguro (Google Drive, Pendrive, etc).');
        closeAdminMenu();
    } catch (err) {
        alert('ÔØî Erro ao gerar backup: ' + err.message);
    }
}

window.gerarBackupCompleto = gerarBackupCompleto;

// --- LOGICA BI EQUIPAMENTOS ---
window.processarBI = async (file) => {
    if (!file) return;
    const status = document.getElementById('bi-status');
    status.innerHTML = 'Ôîø Lendo arquivo...';
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            // Processamento resiliente
            const seen = new Set();
            const validRows = [];
            
            rows.forEach((r, index) => {
                // Converte a linha em uma lista de strings limpas
                const cells = r.map(c => String(c || '').trim().toUpperCase());
                
                // Tenta achar o SELB (geralmente ├® a primeira coluna ou a que tem texto curto)
                const selb = cells[0] || '';
                
                // Tenta achar o Modelo (procura nas colunas B, C ou D)
                let modelo = cells[3] || cells[2] || cells[1] || '';

                // Se a linha for o cabe├ºalho (ex: contiver a palavra SELB), pula
                if (selb === 'SELB' || selb === 'CODIGO' || !selb) return;

                // Se achou SELB mas o modelo t├í vazio, tenta pegar qualquer outra c├®lula da linha
                if (selb && !modelo) {
                    modelo = cells.find((c, i) => i > 0 && c.length > 2) || '';
                }
                
                if (selb && modelo && !seen.has(selb)) {
                    seen.add(selb);
                    validRows.push({ selb, modelo, descricao: cells[3] || cells[2] || 'IMPORTA├ç├âO MASSIVA' });
                }
            });

            if (!validRows.length) { 
                status.innerHTML = 'ÔØî Nenhum dado v├ílido encontrado.<br><small>Verifique se o SELB est├í na Coluna A.</small>'; 
                return; 
            }
            status.innerHTML = `Ôîø Enviando ${validRows.length} registros...`;

            // Envia em lotes de 500 para n├úo estourar a API
            let count = 0;
            for (let i = 0; i < validRows.length; i += 500) {
                const chunk = validRows.slice(i, i + 500);
                const { error } = await supabase.from('equipamentos').upsert(chunk);
                if (error) throw error;

                // Sincroniza o cache local Map O(1)
                chunk.forEach(item => {
                    if (item.selb) {
                        window.equipamentosCache.set(item.selb.toUpperCase().trim(), item.modelo || '');
                    }
                });

                count += chunk.length;
                status.innerHTML = `Ôîø Enviando... (${count}/${validRows.length})`;
            }

            status.innerHTML = 'Ô£à Base BI atualizada com sucesso!';
            renderEquipamentos();
        } catch (err) {
            console.error(err);
            status.innerHTML = 'ÔØî Erro: ' + err.message;
            if (err.message.includes('not found')) {
                alert('ÔÜá´©Å Tabela "equipamentos" n├úo encontrada no Supabase. Por favor, crie-a no SQL Editor primeiro.');
            }
        }
    };
    reader.readAsArrayBuffer(file);
};

async function renderEquipamentos(query = '') {
    const tbody = document.getElementById('equip-tbody');
    const totalEl = document.getElementById('equip-total');
    if (!tbody) return;

    // Busca o total real para o contador
    const { count: totalReal } = await supabase.from('equipamentos').select('*', { count: 'exact', head: true });
    if (totalEl) totalEl.textContent = `(${totalReal || 0})`;

    let q = supabase.from('equipamentos').select('*').order('selb', { ascending: true }).limit(100);
    if (query) {
        const sq = window.formatSearchQuery(query);
        q = q.or(`selb.ilike.%${sq}%,modelo.ilike.%${sq}%,descricao.ilike.%${sq}%`);
    }

    const { data } = await q;
    if (!data) return;

    tbody.innerHTML = data.map(e => `
        <tr>
            <td style="font-weight:bold; color:var(--blue)">${e.selb}</td>
            <td>${e.modelo}</td>
            <td style="font-size:0.75rem; color:var(--text-muted)">${e.descricao}</td>
        </tr>
    `).join('');
}

// --- BI EQUIPAMENTOS ---
window.renderBIList = async (query = '') => {
    const tbody = document.getElementById('equip-tbody');
    const totalEl = document.getElementById('equip-total-count');
    if (!tbody) return;

    const { count: totalReal } = await supabase.from('equipamentos').select('*', { count: 'exact', head: true });
    if (totalEl) totalEl.textContent = `(${totalReal || 0})`;

    let q = supabase.from('equipamentos').select('*').order('selb', { ascending: true }).limit(200);
    if (query) {
        const sq = window.formatSearchQuery(query);
        q = q.or(`selb.ilike.%${sq}%,modelo.ilike.%${sq}%,descricao.ilike.%${sq}%`);
    }

    const { data } = await q;
    if (!data) return;

    tbody.innerHTML = data.map(e => `
        <tr>
            <td style="font-weight:bold; color:var(--blue)">${e.selb}</td>
            <td>${e.modelo}</td>
            <td style="font-size:0.75rem; color:var(--text-muted)">${e.descricao || ''}</td>
        </tr>
    `).join('');
};

// --- LOGICA REVISADOS ---
window.renderRevisados = async () => {
    const tbody = document.getElementById('revisados-tbody');
    if (!tbody) return;

    const { data } = await supabase.from('revisados').select('*').order('ts', { ascending: false }).limit(50);
    if (!data) return;

    tbody.innerHTML = data.map(r => `
        <tr>
            <td style="font-size:0.8rem">${new Date(r.ts).toLocaleString('pt-BR')}</td>
            <td style="font-weight:bold; color:var(--green)">${r.selb}</td>
            <td style="color:var(--text-muted)">${r.user_email?.split('@')[0]}</td>
        </tr>
    `).join('');
};

window.processarRevisados = async () => {
    const textarea = document.getElementById('revisados-textarea');
    const status = document.getElementById('revisados-status');
    const raw = textarea.value.trim();
    if (!raw) return;

    const dtInput = document.getElementById('revisados-data');
    const selbData = dtInput?.value || new Date().toISOString().split('T')[0];

    status.innerHTML = 'Ôîø Gravando...';
    const selbs = raw.split(/[\n,;]+/).map(s => s.trim().toUpperCase()).filter(s => s.length >= 2);
    
    if (selbs.length === 0) {
        status.innerHTML = 'ÔØî Nenhum SELB v├ílido detectado.';
        return;
    }

    const records = selbs.map(s => ({
        selb: s,
        user_email: currentUser?.email || 'anonimo',
        ts: selbData + 'T12:00:00Z' // Usa meio-dia para evitar problemas de fuso
    }));

    const { error } = await supabase.from('revisados').upsert(records);

    if (error) {
        status.innerHTML = `<span style="color:var(--red)">ÔØî Erro: ${error.message}</span>`;
    } else {
        status.innerHTML = `<span style="color:var(--green)">Ô£à ${selbs.length} SELBs registrados!</span>`;
        textarea.value = '';
        renderRevisados();
    }
};

// --- RELAT├ôRIO CUSTO POR MODELO ---
let chartModelo = null;

window.clearModFilters = () => {
    document.getElementById('mod-busca').value = '';
    document.getElementById('mod-d1').value = '';
    document.getElementById('mod-d2').value = '';
    renderModeloCusto();
};

window.renderModeloCusto = async () => {
    const hName = getHistoricoTable();
    try {
        const d1 = document.getElementById('mod-d1')?.value;
        const d2 = document.getElementById('mod-d2')?.value;
        const query = document.getElementById('mod-busca')?.value.trim().toUpperCase();

        // Carregar Dados Iniciais (hist├│ricos, v├¡nculos de remanufatura e custos)
        const [hRes, rRes, remanuRes, custosRes] = await Promise.all([
            supabase.from(hName).select('*').eq('tipo', 'sa├¡da'),
            supabase.from('revisados').select('*'),
            supabase.from('modelos_remanu').select('*'),
            supabase.from('custos').select('*')
        ]);

        if (getHistoricoTable() !== hName) return;

        const sa├¡das = hRes.data || [];
        // A Remanufatura n├úo utiliza a tabela de revisados do Laborat├│rio
        const revisados = window.currentSector === 'REMANU' ? [] : (rRes.data || []);
        const remanuVinculos = remanuRes?.data || [];
        const custosLista = custosRes?.data || [];

        const filtrarData = (ts) => {
            if (!ts) return false; // Se n├úo tem data, n├úo entra no relat├│rio
            const dt = ts.split('T')[0];
            if (d1 && dt < d1) return false;
            if (d2 && dt > d2) return false;
            return true;
        };

        // Identificar todos os SELBs ├║nicos que est├úo no hist├│rico ativo filtrado por data
        const activeSelbs = new Set();
        sa├¡das.filter(s => filtrarData(s.ts)).forEach(s => {
            const selb = (s.selb || '').toUpperCase().trim();
            if (selb && selb !== 'S/N' && selb !== '0000') {
                activeSelbs.add(selb);
            }
        });
        revisados.filter(r => filtrarData(r.ts)).forEach(r => {
            const selb = (r.selb || '').toUpperCase().trim();
            if (selb && selb !== 'S/N' && selb !== '0000') {
                activeSelbs.add(selb);
            }
        });

        // Buscar do banco apenas as correspond├¬ncias dos SELBs ativos (consulta cir├║rgica e indexada)
        let equipamentos = [];
        if (activeSelbs.size > 0) {
            const { data: eqData, error: eqErr } = await supabase
                .from('equipamentos')
                .select('selb, modelo')
                .in('selb', Array.from(activeSelbs));
            
            if (getHistoricoTable() !== hName) return;

            if (!eqErr && eqData) {
                equipamentos = eqData;
            }
        }

        // Mapear modelo -> codigo_nova
        const remanuMap = {};
        remanuVinculos.forEach(v => {
            if (v.modelo && v.codigo_nova) {
                remanuMap[v.modelo.toUpperCase().trim()] = v.codigo_nova.toUpperCase().trim();
            }
        });

        // Mapear codigo_nova -> last_cost
        const custosMap = {};
        custosLista.forEach(c => {
            if (c.code) {
                custosMap[c.code.toUpperCase().trim()] = c.last_cost || 0;
            }
        });

        const eqMap = {};
        equipamentos.forEach(e => {
            if (e.selb) {
                const cleanSelb = e.selb.toUpperCase().trim();
                eqMap[cleanSelb] = e.modelo;
            }
        });

        // Garantir que os SELBs padr├Áes da Remanufatura sempre mapeiem corretamente para seus modelos correspondentes
        Object.entries(REMANU_SELB_MAP).forEach(([selb, modelo]) => {
            eqMap[selb] = modelo;
        });

        const byModel = {};

        // Sa├¡das (Com Pe├ºa)
        sa├¡das.filter(s => filtrarData(s.ts)).forEach(s => {
            const selb = (s.selb || '').toUpperCase().trim();
            if (!selb || selb === 'S/N' || selb === '0000') return;

            const modelo = eqMap[selb] || 'MODELO N├âO IDENTIFICADO (' + selb + ')';
            if (query && !modelo.includes(query)) return;

            if (!byModel[modelo]) byModel[modelo] = { atendimentos: 0, comPeca: new Set(), semPeca: new Set(), pecas: 0, custo: 0, vlrNovaRef: 0, vlrNovaRevs: new Set(), partsCount: {} };
            
            if (window.currentSector === 'REMANU' && s.revision_id) {
                byModel[modelo].comPeca.add(s.revision_id);
                
                // Determina o valor de custo de refer├¬ncia da pe├ºa nova
                let vlrNova = s.vlr_nova_ref || 0;
                if (!vlrNova) {
                    const linkedCode = remanuMap[modelo.toUpperCase().trim()];
                    if (linkedCode) {
                        vlrNova = custosMap[linkedCode] || 0;
                    }
                }

                // Acumula vlr_nova_ref uma vez por revision_id (n├úo por pe├ºa)
                if (vlrNova && !byModel[modelo].vlrNovaRevs.has(s.revision_id)) {
                    byModel[modelo].vlrNovaRef += vlrNova;
                    byModel[modelo].vlrNovaRevs.add(s.revision_id);
                }
            } else {
                byModel[modelo].comPeca.add(selb);
            }
            
            byModel[modelo].pecas += (s.qty || 1);
            byModel[modelo].custo += (s.vlr_total || 0);

            // Rastrear frequ├¬ncia de pe├ºas
            const pCode = (s.code || '').toUpperCase().trim();
            if (pCode) {
                if (!byModel[modelo].partsCount) byModel[modelo].partsCount = {};
                if (!byModel[modelo].partsCount[pCode]) {
                    byModel[modelo].partsCount[pCode] = { qty: 0, descricao: s.descricao || '' };
                }
                byModel[modelo].partsCount[pCode].qty += (s.qty || 1);
            }
        });

        // Revisados (Sem Pe├ºa ou Complemento)
        revisados.filter(r => filtrarData(r.ts)).forEach(r => {
            const selb = (r.selb || '').toUpperCase().trim();
            if (!selb || selb === 'S/N' || selb === '0000') return;

            const modelo = eqMap[selb] || 'MODELO N├âO IDENTIFICADO (' + selb + ')';
            if (query && !modelo.includes(query)) return;

            if (!byModel[modelo]) byModel[modelo] = { atendimentos: 0, comPeca: new Set(), semPeca: new Set(), pecas: 0, custo: 0, partsCount: {} };
            if (!byModel[modelo].comPeca.has(selb)) {
                byModel[modelo].semPeca.add(selb);
            }
        });

        const rows = Object.entries(byModel).map(([modelo, d]) => {
            const totalAtend = d.comPeca.size + d.semPeca.size;
            const economiaReal = (d.vlrNovaRef || 0) - d.custo;
            const economiaPct = (d.vlrNovaRef || 0) > 0 ? (economiaReal / d.vlrNovaRef) * 100 : 0;
            
            // Valor unit├írio da fus├úo nova para este modelo
            const linkedCode = remanuMap[modelo.toUpperCase().trim()];
            const unitVlrNova = linkedCode ? (custosMap[linkedCode] || 0) : 0;

            return {
                modelo,
                atendimentos: totalAtend,
                comPeca: d.comPeca.size,
                semPeca: d.semPeca.size,
                pecas: d.pecas,
                custo: d.custo,
                custoMedio: totalAtend > 0 ? d.custo / totalAtend : 0,
                vlrNovaRef: d.vlrNovaRef || 0,
                economiaReal: economiaReal,
                economiaPct: economiaPct,
                unitVlrNova: unitVlrNova,
                partsCount: d.partsCount || {}
            };
        }).sort((a, b) => b.custo - a.custo);

        window.currentModeloCustoRows = rows;

        const fmt = v => 'R$ ' + Number(window.adjC(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const totalCusto = rows.reduce((s, r) => s + r.custo, 0);
        const totalAtend = rows.reduce((s, r) => s + r.atendimentos, 0);

        if (window.currentSector === 'REMANU') {
            document.getElementById('kpi-container-lab').style.display = 'none';
            document.getElementById('kpi-container-remanu').style.display = 'flex';
            
            const totalEconomia = rows.reduce((s, r) => s + r.economiaReal, 0);
            const totalNova = rows.reduce((s, r) => s + r.vlrNovaRef, 0);
            const mediaEconomiaPct = totalNova > 0 ? (totalEconomia / totalNova) * 100 : 0;
            const modelosComEconomia = rows.filter(r => r.vlrNovaRef > 0).sort((a, b) => b.economiaPct - a.economiaPct);
            const melhorModelo = modelosComEconomia.length > 0 ? modelosComEconomia[0].modelo : '-';

            const top = rows[0];
            const bottom = rows.length > 1 ? rows.filter(r => r.custo > 0).pop() : (rows[0] || null);
            window.topModelData = top;
            window.bottomModelData = bottom;

            document.getElementById('remanu-kpi-economia').textContent = fmt(totalEconomia);
            document.getElementById('remanu-kpi-percentual').textContent = mediaEconomiaPct.toFixed(1) + '%';
            document.getElementById('remanu-kpi-melhor').textContent = melhorModelo.length > 25 ? melhorModelo.substring(0,25)+'...' : melhorModelo;

            document.getElementById('remanu-kpi-top').textContent = top ? top.modelo : 'ÔÇö';
            document.getElementById('remanu-kpi-top-val').textContent = top ? fmt(top.custo) : 'R$ 0,00';
            document.getElementById('remanu-kpi-bottom').textContent = bottom ? bottom.modelo : 'ÔÇö';
            document.getElementById('remanu-kpi-bottom-val').textContent = bottom ? fmt(bottom.custo) : 'R$ 0,00';

            // Render Table for Remanu
            document.getElementById('mod-thead-tr').innerHTML = `
                <th style="text-align: left; padding: 12px;">Modelo</th>
                <th class="text-center" style="padding: 12px;">Revis├Áes</th>
                <th style="text-align: right; padding: 12px;">Custo Revis├úo</th>
                <th style="text-align: right; padding: 12px;">Pre├ºo Nova (Ref)</th>
                <th style="text-align: right; padding: 12px;">Economia Gerada</th>
            `;
            document.getElementById('mod-tbody').innerHTML = rows.slice(0, 50).map((r, idx) => `
                <tr style="cursor: pointer;" onclick="window.openDetalheModelo(window.currentModeloCustoRows[${idx}])">
                    <td style="font-size: 13px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><strong>${r.modelo}</strong></td>
                    <td class="text-center" style="font-family: var(--mono);">${r.atendimentos}</td>
                    <td style="text-align:right; font-family: var(--mono);">${fmt(r.custo)}</td>
                    <td style="text-align:right; font-family: var(--mono);">${fmt(r.vlrNovaRef)}</td>
                    <td style="text-align:right; font-family: var(--mono); font-weight: bold; color: ${r.economiaReal > 0 ? 'var(--green)' : (r.economiaReal < 0 ? 'var(--red)' : 'var(--text)')}">
                        ${fmt(r.economiaReal)} (${r.economiaPct.toFixed(1)}%)
                    </td>
                </tr>
            `).join('');

        } else {
            document.getElementById('kpi-container-lab').style.display = 'grid';
            document.getElementById('kpi-container-remanu').style.display = 'none';

            const top = rows[0];
            const bottom = rows.length > 1 ? rows.filter(r => r.custo > 0).pop() : (rows[0] || null);
            window.topModelData = top;
            window.bottomModelData = bottom;

            // Atualizar Cards KPI Premium
            document.getElementById('mod-kpi-modelos').textContent = rows.length;
            document.getElementById('mod-kpi-modelos-label').textContent = `MODELOS ATENDIDOS (${totalAtend} M├üQUINAS)`;
            document.getElementById('mod-kpi-total').textContent = fmt(totalCusto);
            document.getElementById('mod-kpi-top').textContent = top ? top.modelo : 'ÔÇö';
            document.getElementById('mod-kpi-top-val').textContent = top ? fmt(top.custo) : 'R$ 0,00';
            document.getElementById('mod-kpi-bottom').textContent = bottom ? bottom.modelo : 'ÔÇö';
            document.getElementById('mod-kpi-bottom-val').textContent = bottom ? fmt(bottom.custo) : 'R$ 0,00';
            document.getElementById('mod-kpi-medio').textContent = totalAtend > 0 ? fmt(totalCusto / totalAtend) : 'R$ 0,00';

            // Tabela Compacta
            document.getElementById('mod-thead-tr').innerHTML = `
                <th style="text-align: left; padding: 12px;">Modelo</th>
                <th class="text-center" style="padding: 12px;">Atendimentos</th>
                <th class="text-center" style="padding: 12px;">Pe├ºas Usadas</th>
                <th style="text-align: right; padding: 12px;">Custo Total</th>
            `;
            document.getElementById('mod-tbody').innerHTML = rows.slice(0, 50).map((r, idx) => `
                <tr style="cursor: pointer;" onclick="window.openDetalheModelo(window.currentModeloCustoRows[${idx}])">
                    <td style="font-size: 13px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.modelo}</td>
                    <td style="text-align:center; font-family: var(--mono);">${r.atendimentos}</td>
                    <td style="text-align:center; font-family: var(--mono);">${r.pecas}</td>
                    <td style="text-align:right; font-family: var(--mono); font-weight: bold;">${fmt(r.custo)}</td>
                </tr>
            `).join('');
        }

        // GR├üFICO TOP 10 (POR CUSTO M├ëDIO)
        if (chartModelo) chartModelo.destroy();
        const ctx = document.getElementById('chart-modelo')?.getContext('2d');
        if (ctx) {
            if (window.currentSector === 'REMANU') {
                const topEconomia = rows.filter(r => r.vlrNovaRef > 0).sort((a, b) => b.economiaReal - a.economiaReal).slice(0, 10);
                document.querySelector('.chart-header').textContent = '­ƒÆ░ TOP 10 MODELOS COM MAIOR ECONOMIA GERADA';
                
                chartModelo = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: topEconomia.map(r => r.modelo.length > 35 ? r.modelo.substring(0, 35) + '...' : r.modelo),
                        datasets: [{
                            label: 'Economia (R$)',
                            data: topEconomia.map(r => r.economiaReal),
                            backgroundColor: '#10b981',
                            borderRadius: 8,
                            maxBarThickness: 30
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        onClick: (e, activeEls) => {
                            if (activeEls && activeEls.length > 0) {
                                const idx = activeEls[0].index;
                                const model = topEconomia[idx];
                                if (model) {
                                    window.openDetalheModelo(model);
                                }
                            }
                        },
                        onHover: (e, activeEls) => {
                            if (e.chart) {
                                e.chart.canvas.style.cursor = activeEls.length > 0 ? 'pointer' : 'default';
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => `Economia: ${fmt(ctx.raw)}`
                                }
                            }
                        },
                        scales: {
                            x: { 
                                beginAtZero: true, 
                                grid: { display: false },
                                ticks: { font: { size: 10 } }
                            },
                            y: { 
                                grid: { display: false },
                                ticks: { font: { size: 11, weight: '600' }, color: '#1e293b' }
                            }
                        }
                    }
                });
            } else {
                document.querySelector('.chart-header').textContent = '­ƒÆ░ TOP 10 MODELOS POR CUSTO M├ëDIO POR REVIS├âO (GERAL)';
                const top10 = [...rows].sort((a,b) => b.custoMedio - a.custoMedio).slice(0, 10);
                
                const barColors = [
                    '#ef4444', '#f87171', '#fb923c', '#fbbf24', '#facc15',
                    '#eab308', '#d9f99d', '#a3e635', '#84cc16', '#22c55e'
                ];

                chartModelo = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: top10.map(r => r.modelo.length > 35 ? r.modelo.substring(0, 35) + '...' : r.modelo),
                        datasets: [{
                            label: 'Custo M├®dio (R$)',
                            data: top10.map(r => r.custoMedio),
                            backgroundColor: top10.map((_, i) => barColors[i] || '#64748b'),
                            borderRadius: 8,
                            maxBarThickness: 30
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        onClick: (e, activeEls) => {
                            if (activeEls && activeEls.length > 0) {
                                const idx = activeEls[0].index;
                                const model = top10[idx];
                                if (model) {
                                    window.openDetalheModelo(model);
                                }
                            }
                        },
                        onHover: (e, activeEls) => {
                            if (e.chart) {
                                e.chart.canvas.style.cursor = activeEls.length > 0 ? 'pointer' : 'default';
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => `M├®dia: ${fmt(ctx.raw)}`
                                }
                            }
                        },
                        scales: {
                            x: { 
                                beginAtZero: true, 
                                grid: { display: false },
                                ticks: { font: { size: 10 } }
                            },
                            y: { 
                                grid: { display: false },
                                ticks: { font: { size: 11, weight: '600' }, color: '#1e293b' }
                            }
                        }
                    }
                });
            }
        }
    } catch (e) { console.error('ÔØî Erro Relat├│rio Custo:', e); }
};

window.exportarRelatorioModelo = () => {
    const tbody = document.getElementById('mod-tbody');
    if (!tbody || !tbody.rows.length) { alert('Gere o relat├│rio primeiro.'); return; }
    const rows = Array.from(tbody.rows).map(tr => ({
        'Modelo': tr.cells[0].innerText,
        'Atendimentos': tr.cells[1].innerText,
        'Sem Pe├ºa': tr.cells[2].innerText,
        'Qtd Pe├ºas': tr.cells[3].innerText,
        'Custo M├®dio': tr.cells[4].innerText,
        'Custo Total': tr.cells[5].innerText
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Custo por Modelo");
    XLSX.writeFile(wb, `RELATORIO_CUSTO_MODELO_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// --- MODAL DETALHE CUSTO MODELO ---
window.openDetalheModelo = (typeOrModel) => {
    let model = null;
    let type = 'expensive';
    
    if (typeof typeOrModel === 'string') {
        model = typeOrModel === 'expensive' ? window.topModelData : window.bottomModelData;
        type = typeOrModel;
    } else {
        model = typeOrModel;
        type = 'chart';
    }

    if (!model) {
        alert('Nenhum dado de modelo dispon├¡vel para exibir.');
        return;
    }

    const overlay = document.getElementById('modal-detalhe-modelo');
    const header = document.getElementById('modal-detalhe-header');
    const kicker = document.getElementById('modal-detalhe-kicker');
    const title = document.getElementById('modal-detalhe-title');
    
    // Configurar layout e textos
    if (type === 'expensive') {
        kicker.textContent = '­ƒö┤ MODELO MAIS CARO';
        header.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
    } else if (type === 'cheap') {
        kicker.textContent = '­ƒƒó MODELO MAIS BARATO';
        header.style.background = 'linear-gradient(135deg, #27ae60, #1e8449)';
    } else {
        kicker.textContent = '­ƒôè DETALHES DO MODELO';
        header.style.background = 'linear-gradient(135deg, #f39c12, #d68910)';
    }
    title.textContent = model.modelo;
    
    const fmt = v => 'R$ ' + Number(window.adjC(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtNum = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    if (window.currentSector === 'REMANU') {
        document.getElementById('detalhe-body-lab').style.display = 'none';
        document.getElementById('detalhe-body-remanu').style.display = 'grid';
        
        const recovered = model.comPeca || 0;
        const totalInvested = model.custo || 0;
        const avgCost = recovered > 0 ? totalInvested / recovered : 0;
        const avgParts = recovered > 0 ? (model.pecas || 0) / recovered : 0;
        
        let topPartCode = 'ÔÇö';
        let topPartDesc = 'Nenhuma pe├ºa consumida';
        if (model.partsCount) {
            const sortedParts = Object.entries(model.partsCount).sort((a, b) => b[1].qty - a[1].qty);
            if (sortedParts.length > 0) {
                const [code, info] = sortedParts[0];
                topPartCode = `${code} (${info.qty} un.)`;
                topPartDesc = `${code} - ${info.descricao} (${info.qty} un.)`;
            }
        }
        
        const unitVlrNova = model.unitVlrNova || 0;
        const economiaTotal = model.economiaReal || 0;

        document.getElementById('remanu-detalhe-recup').textContent = recovered;
        document.getElementById('remanu-detalhe-custo-medio').textContent = fmt(avgCost);
        document.getElementById('remanu-detalhe-media-pecas').textContent = fmtNum(avgParts);
        
        const pecaTopEl = document.getElementById('remanu-detalhe-peca-top');
        pecaTopEl.textContent = topPartCode;
        pecaTopEl.title = topPartDesc;

        document.getElementById('remanu-detalhe-vlr-nova').textContent = fmt(unitVlrNova);
        document.getElementById('remanu-detalhe-total-invest').textContent = fmt(totalInvested);
        document.getElementById('remanu-detalhe-economia-gerada').textContent = fmt(economiaTotal);
    } else {
        document.getElementById('detalhe-body-lab').style.display = 'grid';
        document.getElementById('detalhe-body-remanu').style.display = 'none';
        
        document.getElementById('detalhe-com-peca').textContent = model.comPeca;
        document.getElementById('detalhe-sem-peca').textContent = model.semPeca > 0 ? model.semPeca : 'ÔÇö';
        document.getElementById('detalhe-total-maquinas').textContent = model.atendimentos;
        document.getElementById('detalhe-pecas').textContent = model.pecas;
        document.getElementById('detalhe-custo-geral').textContent = fmt(model.custoMedio);
        document.getElementById('detalhe-custo-com-peca').textContent = model.comPeca > 0 ? fmt(model.custo / model.comPeca) : 'R$ 0,00';
        document.getElementById('detalhe-media-pecas').textContent = model.atendimentos > 0 ? fmtNum(model.pecas / model.atendimentos) : '0,00';
        
        const totalEl = document.getElementById('detalhe-custo-total');
        totalEl.textContent = fmt(model.custo);
        totalEl.style.color = type === 'expensive' ? '#e74c3c' : (type === 'cheap' ? '#27ae60' : '#f39c12');
    }

    overlay.classList.add('open');
};

window.closeDetalheModelo = () => {
    document.getElementById('modal-detalhe-modelo').classList.remove('open');
};

// Registrar fechamento por clique fora
document.getElementById('modal-detalhe-modelo')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-detalhe-modelo') {
        window.closeDetalheModelo();
    }
});

// --- INICIALIZA├ç├âO ---
init();

// --- V├ìNCULOS REMANUFATURA ---
window.openVinculosRemanu = async () => {
    try {
        const modal = document.getElementById('modal-vinculos-remanu');
        if (!modal) {
            console.error('Elemento #modal-vinculos-remanu n├úo encontrado!');
            return;
        }
        modal.classList.add('open');

        const dl = document.getElementById('list-modelos-remanu');
        const input = document.getElementById('vinc-modelo');
        
        if (input) input.value = ''; // Limpa pesquisa anterior
        
        if (dl) {
            dl.innerHTML = ''; // Limpa as op├º├Áes para inicializa├º├úo din├ómica (on-demand)
        }
    } catch (e) {
        console.error('Erro ao inicializar modal de v├¡nculos:', e);
    } finally {
        await carregarVinculosRemanu();
    }
};

window.salvarVinculoRemanu = async () => {
    const btn = document.getElementById('btn-salvar-vinculo');
    const modelo = document.getElementById('vinc-modelo').value;
    const codNova = document.getElementById('vinc-nova').value.trim().toUpperCase();
    const codRS = document.getElementById('vinc-rs').value.trim().toUpperCase();

    if (!modelo || !codNova || !codRS) {
        alert('Preencha todos os campos!');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
        // 1. Validar C├│digo Pe├ºa Nova
        const { data: pNova, error: errPNova } = await supabase
            .from('parts')
            .select('code')
            .eq('code', codNova)
            .maybeSingle();

        if (errPNova) throw new Error('Erro ao buscar pe├ºa nova: ' + errPNova.message);
        if (!pNova) {
            alert(`ÔØî O C├│digo de Pe├ºa Nova "${codNova}" n├úo existe cadastrado no sistema! Cadastre a pe├ºa no menu de engrenagem primeiro.`);
            btn.disabled = false;
            btn.textContent = 'Salvar V├¡nculo';
            return;
        }

        const { data: cNova, error: errCNova } = await supabase
            .from('custos')
            .select('last_cost')
            .eq('code', codNova)
            .maybeSingle();

        if (errCNova) throw new Error('Erro ao consultar custo da pe├ºa nova: ' + errCNova.message);
        if (!cNova || !cNova.last_cost || cNova.last_cost <= 0) {
            alert(`ÔØî A Pe├ºa Nova "${codNova}" est├í cadastrada, mas n├úo possui valor de custo agregado (Custo: R$ 0,00 ou inexistente)!`);
            btn.disabled = false;
            btn.textContent = 'Salvar V├¡nculo';
            return;
        }

        // 2. Validar C├│digo Pe├ºa RS
        const { data: pRS, error: errPRS } = await supabase
            .from('parts')
            .select('code')
            .eq('code', codRS)
            .maybeSingle();

        if (errPRS) throw new Error('Erro ao buscar pe├ºa RS: ' + errPRS.message);
        if (!pRS) {
            alert(`ÔØî O C├│digo de Pe├ºa RS "${codRS}" n├úo existe cadastrado no sistema! Cadastre a pe├ºa no menu de engrenagem primeiro.`);
            btn.disabled = false;
            btn.textContent = 'Salvar V├¡nculo';
            return;
        }

        const { data: cRS, error: errCRS } = await supabase
            .from('custos')
            .select('last_cost')
            .eq('code', codRS)
            .maybeSingle();

        if (errCRS) throw new Error('Erro ao consultar custo da pe├ºa RS: ' + errCRS.message);
        if (!cRS || !cRS.last_cost || cRS.last_cost <= 0) {
            alert(`ÔØî A Pe├ºa RS "${codRS}" est├í cadastrada, mas n├úo possui valor de custo agregado (Custo: R$ 0,00 ou inexistente)!`);
            btn.disabled = false;
            btn.textContent = 'Salvar V├¡nculo';
            return;
        }

        // 3. Salvar V├¡nculo ap├│s todas as valida├º├Áes com sucesso
        btn.textContent = 'Salvando...';
        const { error } = await supabase.from('modelos_remanu').upsert({
            modelo: modelo,
            codigo_nova: codNova,
            codigo_rs: codRS
        }, { onConflict: 'modelo' });

        if (error) {
            alert('Erro ao salvar: ' + error.message);
        } else {
            document.getElementById('vinc-nova').value = '';
            document.getElementById('vinc-rs').value = '';
            await carregarVinculosRemanu();
        }

    } catch (e) {
        console.error(e);
        alert('ÔØî Ocorreu um erro ao validar os c├│digos: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar V├¡nculo';
    }
};

window.carregarVinculosRemanu = async () => {
    const tbody = document.getElementById('tbody-vinculos-remanu');
    if (!tbody) {
        console.error('Elemento tbody-vinculos-remanu n├úo foi encontrado no DOM!');
        return;
    }
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Aguarde...</td></tr>';
    
    try {
        const { data, error } = await supabase.from('modelos_remanu').select('*').order('modelo');
        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum v├¡nculo cadastrado.</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map(v => `
            <tr>
                <td style="font-size: 11px;">${v.modelo}</td>
                <td class="text-center" style="font-weight: 500">${v.codigo_nova}</td>
                <td class="text-center" style="color: var(--primary); font-weight: 500">${v.codigo_rs}</td>
                <td class="text-center">
                    <button class="btn-cancel" onclick="deletarVinculoRemanu('${v.id}')" style="padding: 3px 8px; font-size: 11px;">Excluir</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Erro ao carregar v├¡nculos de remanufatura:', e);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color: var(--red);">ÔØî Erro ao carregar: ${e.message}</td></tr>`;
    }
};

window.deletarVinculoRemanu = async (id) => {
    if (!confirm('Deseja excluir este v├¡nculo?')) return;
    await supabase.from('modelos_remanu').delete().eq('id', id);
    await carregarVinculosRemanu();
};

// --- AUDITORIA DE INVENT├üRIO C├ìCLICO E RASTREABILIDADE (ESTOQUE CHECK) ---

window.iniciarAuditoria = async () => {
    try {
        const sectorEl = document.querySelector('input[name="audit-sector"]:checked');
        if (!sectorEl) {
            alert('ÔÜá´©Å Selecione um setor para iniciar a auditoria.');
            return;
        }
        const sector = sectorEl.value;
        const modoCego = document.getElementById('audit-blind-mode').checked;

        // 1. Prevenir colis├úo de sess├Áes ativas
        const { data: existing } = await supabase.from('auditorias')
            .select('*')
            .eq('status', 'EM_ANDAMENTO')
            .limit(1)
            .maybeSingle();

        if (existing) {
            if (confirm(`ÔÜá´©Å J├í existe uma auditoria em andamento (${existing.codigo} - Setor ${existing.setor}).\n\nDeseja retom├í-la?`)) {
                await window.retomarAuditoria(existing.id);
                return;
            }
            return;
        }

        // 2. Gerar c├│digo sequencial do dia AUD-YYYYMMDD-XXX
        const todayStr = new Date().toLocaleDateString('en-CA').replace(/-/g, '');
        const { data: todayAudits } = await supabase.from('auditorias')
            .select('codigo')
            .like('codigo', `AUD-${todayStr}-%`);
        
        let nextNum = 1;
        if (todayAudits && todayAudits.length > 0) {
            const nums = todayAudits.map(a => {
                const parts = a.codigo.split('-');
                return parseInt(parts[parts.length - 1], 10) || 0;
            });
            nextNum = Math.max(...nums) + 1;
        }
        const nextSeq = String(nextNum).padStart(3, '0');
        const auditCode = `AUD-${todayStr}-${nextSeq}`;

        // 3. Criar registro da sess├úo
        const { data: newSession, error: sErr } = await supabase.from('auditorias').insert({
            codigo: auditCode,
            usuario: currentUser?.email || 'Lucas Araujo',
            setor: sector,
            status: 'EM_ANDAMENTO',
            modo_cego: modoCego,
            total_itens: 0,
            total_divergencias: 0,
            acuracidade: 0
        }).select().single();

        if (sErr || !newSession) {
            alert('ÔØî Erro ao criar sess├úo de auditoria: ' + (sErr?.message || 'Erro desconhecido'));
            return;
        }

        // 4. Congelar saldo te├│rico (Bulk Snapshot)
        let stockItems = [];
        const tName = sector === 'LAB' ? 'estoque' : (sector === 'REMANU' ? 'estoque_remanu' : 'estoque_3d');
        try {
            // Busca as pe├ºas com saldo no estoque correspondente
            const { data: stData, error: stErr } = await supabase.from(tName).select('code, qty');
            if (stErr) throw stErr;

            if (stData && stData.length > 0) {
                // Busca as descri├º├Áes na tabela 'parts' (onde a coluna correta ├® 'descricao')
                const { data: ptData } = await supabase.from('parts').select('code, descricao');
                const partsMap = {};
                if (ptData) {
                    ptData.forEach(p => {
                        if (p.code) partsMap[p.code.toUpperCase()] = p.descricao;
                    });
                }

                stockItems = stData.map(item => {
                    const codeUpper = item.code?.trim().toUpperCase();
                    return {
                        code: item.code,
                        description: partsMap[codeUpper] || 'Pe├ºa sem descri├º├úo',
                        qty: item.qty || 0
                    };
                });
            }
        } catch (e) {
            console.error(`Erro ao congelar saldo do setor ${sector}:`, e.message);
            stockItems = [];
        }

        // Preparar linhas de bulk insert
        const bulkInsertRows = [];
        const seen = new Set();
        stockItems.forEach(item => {
            const code = item.code?.trim().toUpperCase();
            if (code && !seen.has(code)) {
                seen.add(code);
                const qty = item.qty || 0;
                bulkInsertRows.push({
                    auditoria_id: newSession.id,
                    codigo: code,
                    descricao: item.description || '',
                    saldo_teorico: qty,
                    saldo_fisico: 0,
                    divergencia: -qty,
                    status_divergencia: qty === 0 ? 'OK' : 'NAO_LOCALIZADO'
                });
            }
        });

        // Inserir os itens no Supabase
        if (bulkInsertRows.length > 0) {
            const { error: iErr } = await supabase.from('auditoria_itens').insert(bulkInsertRows);
            if (iErr) {
                console.error("Erro no bulk insert:", iErr.message);
            }
        }

        // 5. Salvar na mem├│ria do app
        activeAudit = newSession;
        activeAuditItems = {};
        bulkInsertRows.forEach(row => {
            activeAuditItems[row.codigo] = {
                codigo: row.codigo,
                descricao: row.descricao,
                saldo_teorico: row.saldo_teorico,
                saldo_fisico: 0,
                divergencia: row.divergencia,
                status_divergencia: row.status_divergencia,
                last_scanned: 0
            };
        });

        // 6. Transi├º├úo de telas
        document.getElementById('audit-panel-setup').style.display = 'none';
        document.getElementById('audit-panel-summary').style.display = 'none';
        document.getElementById('audit-panel-active').style.display = 'block';

        window.renderActiveAudit();
        
        setTimeout(() => {
            const b = document.getElementById('main-audit-bipador');
            if (b) {
                b.focus();
                b.value = '';
            }
        }, 150);

    } catch (e) {
        alert('ÔØî Ocorreu um erro ao iniciar a auditoria: ' + e.message);
    }
};

window.retomarAuditoria = async (id) => {
    try {
        const { data: audit, error } = await supabase.from('auditorias').select('*').eq('id', id).single();
        if (error || !audit) {
            alert('ÔØî Erro ao carregar auditoria: ' + error?.message);
            return;
        }

        const { data: items } = await supabase.from('auditoria_itens').select('*').eq('auditoria_id', id);

        activeAudit = audit;
        activeAuditItems = {};
        if (items) {
            items.forEach(item => {
                activeAuditItems[item.codigo] = {
                    id: item.id,
                    codigo: item.codigo,
                    descricao: item.descricao,
                    saldo_teorico: item.saldo_teorico,
                    saldo_fisico: item.saldo_fisico,
                    divergencia: item.divergencia,
                    status_divergencia: item.status_divergencia,
                    last_scanned: item.saldo_fisico > 0 ? 1 : 0
                };
            });
        }

        document.getElementById('audit-panel-setup').style.display = 'none';
        document.getElementById('audit-panel-summary').style.display = 'none';
        document.getElementById('audit-panel-active').style.display = 'block';

        window.renderActiveAudit();

        setTimeout(() => {
            const b = document.getElementById('main-audit-bipador');
            if (b) { b.focus(); b.value = ''; }
        }, 150);
    } catch(e) {
        alert('ÔØî Erro ao retomar sess├úo: ' + e.message);
    }
};

window.biparItemAuditoria = async (code) => {
    if (!activeAudit) return;
    code = code.trim().toUpperCase();
    if (!code) return;

    try {
        // Se o item j├í existia no cache (congelado ou inserido antes)
        if (activeAuditItems[code]) {
            activeAuditItems[code].saldo_fisico += 1;
            activeAuditItems[code].last_scanned = Date.now();
        } else {
            // Item Extra (n├úo existia no estoque te├│rico)
            // Buscar descri├º├úo geral no banco
            let desc = 'Pe├ºa Extra (N├úo cadastrada no setor)';
            const { data: pData } = await supabase.from('parts').select('descricao').eq('code', code).maybeSingle();
            if (pData?.descricao) {
                desc = pData.descricao;
            }

            activeAuditItems[code] = {
                codigo: code,
                descricao: desc,
                saldo_teorico: 0,
                saldo_fisico: 1,
                divergencia: 1,
                status_divergencia: 'ITEM_EXTRA',
                last_scanned: Date.now()
            };
        }

        // Recalcular diverg├¬ncia
        const row = activeAuditItems[code];
        row.divergencia = row.saldo_fisico - row.saldo_teorico;
        
        if (row.saldo_fisico === 0 && row.saldo_teorico > 0) {
            row.status_divergencia = 'NAO_LOCALIZADO';
        } else if (row.saldo_fisico > 0 && row.saldo_teorico === 0) {
            row.status_divergencia = 'ITEM_EXTRA';
        } else if (row.saldo_fisico === row.saldo_teorico) {
            row.status_divergencia = 'OK';
        } else if (row.saldo_fisico > row.saldo_teorico) {
            row.status_divergencia = 'SOBRA';
        } else if (row.saldo_fisico < row.saldo_teorico) {
            row.status_divergencia = 'FALTA';
        }

        // Upsert na tabela de itens
        await supabase.from('auditoria_itens').upsert({
            auditoria_id: activeAudit.id,
            codigo: row.codigo,
            descricao: row.descricao,
            saldo_teorico: row.saldo_teorico,
            saldo_fisico: row.saldo_fisico,
            divergencia: row.divergencia,
            status_divergencia: row.status_divergencia
        }, { onConflict: 'auditoria_id,codigo' });

        window.renderActiveAudit();

    } catch (e) {
        console.error("Erro ao bipar item:", e.message);
    }
};

window.renderActiveAudit = () => {
    if (!activeAudit) return;

    // Header info
    document.getElementById('active-audit-title').textContent = `­ƒöì Auditoria: ${activeAudit.codigo}`;
    document.getElementById('active-audit-sector').textContent = `Setor: ${activeAudit.setor}`;
    document.getElementById('active-audit-mode').textContent = `Modo: ${activeAudit.modo_cego ? 'Contagem Cega' : 'Normal/Aberto'}`;

    // Calcular contagens em tempo real
    const itemsList = Object.values(activeAuditItems);
    const totalContado = itemsList.reduce((acc, curr) => acc + curr.saldo_fisico, 0);

    let okCount = 0;
    let errCount = 0;
    itemsList.forEach(item => {
        if (item.divergencia === 0) okCount++;
        else errCount++;
    });

    document.getElementById('active-audit-total-bipado').textContent = totalContado;

    // Exibir ou ocultar no modo cego
    if (activeAudit.modo_cego) {
        document.getElementById('active-audit-total-ok').textContent = '­ƒöÆ Oculto';
        document.getElementById('active-audit-total-error').textContent = '­ƒöÆ Oculto';
    } else {
        document.getElementById('active-audit-total-ok').textContent = okCount;
        document.getElementById('active-audit-total-error').textContent = errCount;
    }

    // Configurar colunas da tabela
    const thead = document.getElementById('active-audit-thead');
    if (activeAudit.modo_cego) {
        thead.innerHTML = `
            <th style="text-align: left; padding: 12px;">C├│digo</th>
            <th style="text-align: left; padding: 12px;">Descri├º├úo</th>
            <th style="text-align: center; padding: 12px;">F├¡sico (Contado)</th>
        `;
    } else {
        thead.innerHTML = `
            <th style="text-align: left; padding: 12px;">C├│digo</th>
            <th style="text-align: left; padding: 12px;">Descri├º├úo</th>
            <th style="text-align: center; padding: 12px;">F├¡sico</th>
            <th style="text-align: center; padding: 12px;">Sistema</th>
            <th style="text-align: center; padding: 12px;">Diferen├ºa</th>
            <th style="text-align: center; padding: 12px;">Status</th>
        `;
    }

    // Renderizar linhas
    const tbody = document.getElementById('active-audit-tbody');
    tbody.innerHTML = '';

    // Filtrar e ordenar:
    // No modo cego, s├│ mostra itens fisicamente bipados (saldo_fisico > 0)
    // No modo aberto, mostra tudo que foi bipado ou que possui saldo te├│rico
    let filtered = itemsList.filter(item => {
        if (activeAudit.modo_cego) return item.saldo_fisico > 0;
        return (item.saldo_fisico > 0 || item.saldo_teorico > 0);
    });

    // Ordenar pelo mais recente scanned
    filtered.sort((a, b) => b.last_scanned - a.last_scanned);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${activeAudit.modo_cego ? 3 : 6}" class="text-center" style="padding: 40px; color: var(--text-muted);">Nenhum item contado ainda nesta sess├úo.</td></tr>`;
        return;
    }

    filtered.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid var(--border)";
        if (item.last_scanned > 0 && Date.now() - item.last_scanned < 3000) {
            tr.style.background = 'rgba(59, 130, 246, 0.08)'; // Destaque suave de 3 segundos para o rec├®m bipado
        }

        if (activeAudit.modo_cego) {
            tr.innerHTML = `
                <td style="padding: 12px; font-weight: bold; text-align: left;">${item.codigo}</td>
                <td style="padding: 12px; text-align: left; font-size: 12px; color: var(--text-muted);">${item.descricao}</td>
                <td style="text-align: center; font-size: 18px; font-weight: 800; color: var(--blue);">${item.saldo_fisico}</td>
            `;
        } else {
            const isOk = item.divergencia === 0;
            const diff = item.divergencia;
            tr.innerHTML = `
                <td style="padding: 12px; font-weight: bold; text-align: left;">${item.codigo}</td>
                <td style="padding: 12px; text-align: left; font-size: 12px; color: var(--text-muted);">${item.descricao}</td>
                <td style="text-align: center; font-size: 16px; font-weight: 700;">${item.saldo_fisico}</td>
                <td style="text-align: center; font-size: 15px; color: var(--text-muted);">${item.saldo_teorico}</td>
                <td style="text-align: center; font-weight: 800; font-size: 15px; color: ${diff > 0 ? '#22c55e' : (diff < 0 ? '#ef4444' : 'var(--text)')}">
                    ${diff > 0 ? '+' + diff : diff}
                </td>
                <td style="text-align: center;">
                    <span class="status-badge" style="padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 800; background: ${isOk ? '#dcfce7' : '#fee2e2'}; color: ${isOk ? '#166534' : '#991b1b'};">${item.status_divergencia}</span>
                </td>
            `;
        }
        tbody.appendChild(tr);
    });
};

window.cancelarAuditoria = async () => {
    if (!activeAudit) return;
    if (activeAudit.status === 'EM_ANDAMENTO') {
        if (!confirm('ÔÜá´©Å Deseja realmente ABANDONAR esta auditoria?\n\nTodos os dados contados nesta sess├úo ativa ser├úo apagados permanentemente.')) {
            return;
        }
    }

    try {
        await supabase.from('auditorias').delete().eq('id', activeAudit.id);
        activeAudit = null;
        activeAuditItems = {};

        document.getElementById('audit-panel-active').style.display = 'none';
        document.getElementById('audit-panel-summary').style.display = 'none';
        document.getElementById('audit-panel-setup').style.display = 'block';

        window.renderHistoricoAuditorias();
    } catch(e) {
        alert('Erro ao cancelar sess├úo: ' + e.message);
    }
};

window.finalizarAuditoria = async () => {
    if (!activeAudit) return;
    if (!confirm('­ƒÅü Deseja realmente finalizar esta auditoria?\n\nNovas bipagens e altera├º├Áes de contagem ser├úo bloqueadas.')) return;

    try {
        const itemsList = Object.values(activeAuditItems);
        const totalCount = itemsList.length;
        const okCount = itemsList.filter(item => item.divergencia === 0).length;
        const errCount = totalCount - okCount;
        const acuracidade = totalCount > 0 ? parseFloat(((okCount / totalCount) * 100).toFixed(2)) : 100;

        const { error } = await supabase.from('auditorias').update({
            status: 'FINALIZADA',
            data_fim: new Date().toISOString(),
            total_itens: totalCount,
            total_divergencias: errCount,
            acuracidade: acuracidade
        }).eq('id', activeAudit.id);

        if (error) {
            alert('Erro ao salvar finaliza├º├úo no banco: ' + error.message);
            return;
        }

        activeAudit.status = 'FINALIZADA';
        activeAudit.total_itens = totalCount;
        activeAudit.total_divergencias = errCount;
        activeAudit.acuracidade = acuracidade;

        // Abrir painel de resumo
        window.renderSummaryAudit();

        document.getElementById('audit-panel-active').style.display = 'none';
        document.getElementById('audit-panel-setup').style.display = 'none';
        document.getElementById('audit-panel-summary').style.display = 'block';

        window.renderHistoricoAuditorias();
    } catch (e) {
        alert('Erro ao finalizar: ' + e.message);
    }
};

window.renderSummaryAudit = () => {
    if (!activeAudit) return;

    // Header labels
    document.getElementById('summary-audit-code').textContent = activeAudit.codigo;
    document.getElementById('summary-audit-sector').textContent = `Setor: ${activeAudit.setor}`;
    
    const statusEl = document.getElementById('summary-audit-status');
    statusEl.textContent = `Status: ${activeAudit.status}`;
    if (activeAudit.status === 'AJUSTADA') {
        statusEl.style.background = '#dcfce7';
        statusEl.style.color = '#166534';
        document.getElementById('btn-sync-estoque-trigger').style.display = 'none';
    } else {
        statusEl.style.background = '#fee2e2';
        statusEl.style.color = '#991b1b';
        document.getElementById('btn-sync-estoque-trigger').style.display = 'inline-flex';
    }

    // KPIs
    document.getElementById('summary-audit-acuracidade').textContent = `${activeAudit.acuracidade || 0}%`;
    document.getElementById('summary-audit-total-divergentes').textContent = activeAudit.total_divergencias || 0;

    const itemsList = Object.values(activeAuditItems);
    const faltasCount = itemsList.filter(i => i.divergencia < 0).reduce((acc, curr) => acc + Math.abs(curr.divergencia), 0);
    const sobrasCount = itemsList.filter(i => i.divergencia > 0).reduce((acc, curr) => acc + curr.divergencia, 0);

    document.getElementById('summary-audit-total-faltas').textContent = `${faltasCount} un`;
    document.getElementById('summary-audit-total-sobras').textContent = `${sobrasCount} un`;

    // Render list (Revelada 100%, mesmo que fosse blind)
    const tbody = document.getElementById('summary-audit-tbody');
    tbody.innerHTML = '';

    // Ordena├º├úo especial: Maior diverg├¬ncia absoluta no topo
    itemsList.sort((a, b) => Math.abs(b.divergencia) - Math.abs(a.divergencia));

    itemsList.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        
        const isOk = item.divergencia === 0;
        const diff = item.divergencia;

        // Tooltip descritiva para a classifica├º├úo
        let descTooltip = '';
        if (item.status_divergencia === 'OK') descTooltip = 'Saldo F├¡sico ├® igual ao do Sistema';
        else if (item.status_divergencia === 'SOBRA') descTooltip = 'F├¡sico maior que o Sistema (Sobra detectada)';
        else if (item.status_divergencia === 'FALTA') descTooltip = 'F├¡sico menor que o Sistema (Falta detectada)';
        else if (item.status_divergencia === 'NAO_LOCALIZADO') descTooltip = 'Saldo no Sistema mas zero contagem f├¡sica';
        else if (item.status_divergencia === 'ITEM_EXTRA') descTooltip = 'F├¡sico contado mas saldo do Sistema era zero';

        tr.innerHTML = `
            <td style="padding: 12px; font-weight: bold; text-align: left;">${item.codigo}</td>
            <td style="padding: 12px; text-align: left; font-size: 12px; color: var(--text-muted);">${item.descricao}</td>
            <td style="text-align: center; font-size: 14px; color: var(--text-muted);">${item.saldo_teorico}</td>
            <td style="text-align: center; font-size: 15px; font-weight: 700;">${item.saldo_fisico}</td>
            <td style="text-align: center; font-weight: 800; font-size: 15px; color: ${diff > 0 ? '#22c55e' : (diff < 0 ? '#ef4444' : 'var(--text)')}">
                ${diff > 0 ? '+' + diff : diff}
            </td>
            <td style="text-align: center;">
                <span class="status-badge" title="${descTooltip}" style="padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 800; background: ${isOk ? '#dcfce7' : (item.divergencia > 0 ? '#ebf5fb' : '#fee2e2')}; color: ${isOk ? '#166534' : (item.divergencia > 0 ? 'var(--blue)' : '#991b1b')}; cursor: help;">
                    ${item.status_divergencia}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.renderHistoricoAuditorias = async () => {
    const tbody = document.getElementById('audit-history-tbody');
    if (!tbody) return;

    try {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 20px;">Carregando hist├│rico...</td></tr>';
        const { data, error } = await supabase.from('auditorias')
            .select('*')
            .order('created_at', { ascending: false });

        if (error || !data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 40px; color: var(--text-muted);">Nenhuma auditoria registrada.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(aud => {
            const dataStr = new Date(aud.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            const isEmAndamento = aud.status === 'EM_ANDAMENTO';
            
            let badgeStyle = '';
            if (aud.status === 'EM_ANDAMENTO') badgeStyle = 'background: #fef3c7; color: #d97706;';
            else if (aud.status === 'FINALIZADA') badgeStyle = 'background: #fee2e2; color: #991b1b;';
            else badgeStyle = 'background: #dcfce7; color: #166534;'; // AJUSTADA

            return `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 10px; font-weight: bold; text-align: left;">${aud.codigo}</td>
                    <td style="text-align: center; font-weight: 700; color: var(--blue); font-size: 11px;">${aud.setor}</td>
                    <td style="text-align: center; color: var(--text-muted);">${dataStr}</td>
                    <td style="text-align: center; font-weight: 800;">
                        ${isEmAndamento ? `<span style="color:#d97706">Andamento</span>` : `${aud.acuracidade}%`}
                    </td>
                    <td style="text-align: center; padding: 8px 10px;">
                        ${isEmAndamento 
                            ? `<button class="btn-admin" onclick="window.retomarAuditoria('${aud.id}')" style="padding: 4px 10px; font-size: 11px; background:#d97706;">ÔÜí Retomar</button>` 
                            : `<button class="btn-confirm" onclick="window.visualizarDetalhesAuditoria('${aud.id}')" style="padding: 4px 10px; font-size: 11px; background:var(--blue); border-color:var(--blue);">­ƒöì Detalhes</button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 20px; color: var(--red);">Erro ao buscar hist├│rico.</td></tr>';
    }
};

window.visualizarDetalhesAuditoria = async (id) => {
    try {
        const { data: audit, error } = await supabase.from('auditorias').select('*').eq('id', id).single();
        if (error || !audit) {
            alert('ÔØî Erro ao buscar auditoria: ' + error?.message);
            return;
        }

        const { data: items } = await supabase.from('auditoria_itens').select('*').eq('auditoria_id', id);

        activeAudit = audit;
        activeAuditItems = {};
        if (items) {
            items.forEach(item => {
                activeAuditItems[item.codigo] = {
                    codigo: item.codigo,
                    descricao: item.descricao,
                    saldo_teorico: item.saldo_teorico,
                    saldo_fisico: item.saldo_fisico,
                    divergencia: item.divergencia,
                    status_divergencia: item.status_divergencia
                };
            });
        }

        // Abrir painel
        window.renderSummaryAudit();

        document.getElementById('audit-panel-setup').style.display = 'none';
        document.getElementById('audit-panel-active').style.display = 'none';
        document.getElementById('audit-panel-summary').style.display = 'block';

    } catch (e) {
        alert('Erro ao carregar detalhes: ' + e.message);
    }
};

window.fecharResumoAuditoria = () => {
    activeAudit = null;
    activeAuditItems = {};
    document.getElementById('audit-panel-summary').style.display = 'none';
    document.getElementById('audit-panel-active').style.display = 'none';
    document.getElementById('audit-panel-setup').style.display = 'block';
    window.renderHistoricoAuditorias();
};

window.openModalAjuste = () => {
    document.getElementById('audit-ajuste-senha').value = '';
    document.getElementById('audit-ajuste-err').textContent = '';
    document.getElementById('modal-audit-ajuste').classList.add('open');
};

window.confirmarAjusteEstoque = async () => {
    const password = document.getElementById('audit-ajuste-senha').value;
    const errEl = document.getElementById('audit-ajuste-err');

    if (password !== 'Selbetti30') {
        errEl.textContent = 'ÔØî Senha de auditoria incorreta!';
        return;
    }

    const btn = document.querySelector('#modal-audit-ajuste .btn-confirm');
    const originalText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando...'; }

    try {
        const sector = activeAudit.setor;
        const stockTable = sector === 'REMANU' ? 'estoque_remanu' : (sector === '3D' ? 'estoque_3d' : 'estoque');
        const historyTable = sector === 'REMANU' ? 'historico_remanu' : (sector === '3D' ? 'historico_3d' : 'historico');

        const divergentItems = Object.values(activeAuditItems).filter(item => item.divergencia !== 0);

        let adjustedCount = 0;
        const promises = divergentItems.map(async (item) => {
            // 1. Atualizar estoque te├│rico no banco para se igualar ao f├¡sico
            await supabase.from(stockTable).upsert({
                code: item.codigo,
                qty: item.saldo_fisico
            }, { onConflict: 'code' });

            // 2. Registrar movimenta├º├úo oficial no hist├│rico (Traceability)
            const diff = item.divergencia;
            const diffAbs = Math.abs(diff);
            const obsText = `AJUSTE AUTOM├üTICO INVENT├üRIO ${activeAudit.codigo}: ${item.status_divergencia} (Qtd: ${item.saldo_teorico} Ô×í´©Å ${item.saldo_fisico})`;

            await supabase.from(historyTable).insert({
                tipo: 'ajuste',
                code: item.codigo,
                qty: diffAbs,
                vlr_unit: 0,
                vlr_total: 0,
                selb: 'AJUSTE',
                descricao: obsText,
                user_email: currentUser?.email || 'lucas.araujo@selbetti.com.br',
                ts: new Date().toISOString()
            });

            adjustedCount++;
        });

        await Promise.all(promises);

        // 3. Atualizar status da auditoria para AJUSTADA
        await supabase.from('auditorias').update({
            status: 'AJUSTADA'
        }).eq('id', activeAudit.id);

        activeAudit.status = 'AJUSTADA';
        
        // UI reset
        document.getElementById('modal-audit-ajuste').classList.remove('open');
        window.renderSummaryAudit();
        await window.renderHistoricoAuditorias();

        alert(`­ƒÄë Estoque do sistema atualizado com sucesso!\n\n${adjustedCount} itens divergentes foram corrigidos e auditados no hist├│rico.`);

    } catch (e) {
        alert('ÔØî Erro durante o processo de ajuste autom├ítico: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
};

window.exportarPlanilhaAuditoria = () => {
    if (!activeAudit) return;
    try {
        const rows = Object.values(activeAuditItems).map(item => ({
            'C├│digo Pe├ºa': item.codigo,
            'Descri├º├úo': item.descricao,
            'Saldo Sistema (Te├│rico)': item.saldo_teorico,
            'Saldo F├¡sico': item.saldo_fisico,
            'Diferen├ºa': item.divergencia,
            'Classifica├º├úo': item.status_divergencia
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Confer├¬ncia");
        
        // Baixar arquivo excel
        XLSX.writeFile(wb, `Inventario_${activeAudit.codigo}_${activeAudit.setor}.xlsx`);
    } catch (e) {
        alert('Erro ao exportar planilha excel: ' + e.message);
    }
};

// Expose rendering and setup functions for Debug Observability
window.renderEstoque = renderEstoque;
window.renderHistorico = renderHistorico;
window.updateDashboard = updateDashboard;


