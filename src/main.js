import { supabase } from './supabase.js'

// --- ESTADO GLOBAL ---
let currentUser = null;
let currentTab = 'dashboard';
let searchTimeout = null;
let saidaItems = []; // Carrinho de saída SELB
window.currentSector = 'LAB'; // Setor atual (LAB ou REMANU)
let activeAudit = null;
let activeAuditItems = {};

window.changeSector = (sector) => {
    window.currentSector = sector;
    
    // Atualiza botões
    const btnLab = document.getElementById('btn-sector-lab');
    const btnRemanu = document.getElementById('btn-sector-remanu');
    if (btnLab) btnLab.classList.toggle('active', sector === 'LAB');
    if (btnRemanu) btnRemanu.classList.toggle('active', sector === 'REMANU');
    
    const btnVinculos = document.getElementById('btn-remanu-vinculos');
    if (btnVinculos) btnVinculos.style.display = sector === 'REMANU' ? 'inline-block' : 'none';

    // Limpa pesquisa
    const searchInp = document.getElementById('search-main');
    if (searchInp) searchInp.value = '';
    
    // Recarrega aba atual
    if (currentTab === 'dashboard') updateDashboard();
    else if (currentTab === 'estoque') { renderChips(); renderEstoque(); }
    else if (currentTab === 'historico') renderHistorico();
    else if (currentTab === 'movimentacoes') renderMovDashboard();
};

const getEstoqueTable = () => window.currentSector === 'REMANU' ? 'estoque_remanu' : 'estoque';
const getHistoricoTable = () => window.currentSector === 'REMANU' ? 'historico_remanu' : 'historico';

// --- HELPER DE BUSCA ---
window.formatSearchQuery = (val) => {
    if (!val) return '';
    let safeVal = val.replace(/,/g, ' ');
    if (safeVal.includes('%')) {
        return safeVal.split('%').map(p => p.trim()).filter(p => p.length > 0).join('%');
    }
    return safeVal;
};

// --- MODO CUSTO REAL PERMANENTE ---

window.getDisplayValue = (item, valKey) => {
    if (!item) return 0;
    return Number(item[valKey]) || 0;
};

// Retrocompatibilidade temporária para código que passava apenas o número
window.adjC = (val) => {
    return Number(val);
};

// --- ELEMENTOS DOM ---
const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const loginErr = document.getElementById('login-err');
const btnAuthSubmit = document.getElementById('auth-submit');
const btnLogout = document.getElementById('btn-logout');
const btnLoginArea = document.getElementById('btn-login');
const adminBadge = document.getElementById('admin-badge');

// --- INICIALIZAÇÃO ---
async function init() {
    console.log('🚀 Inicializando sistema...');
    renderChips();

    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;
    updateUIForAuth();

    if (currentUser) {
        loadInitialData();
    }

    supabase.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        updateUIForAuth();
        if (currentUser && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
            loadInitialData();
        }
    });

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

        if (selb.length === 4) {
            // Validação Remanufatura
            if (window.currentSector === 'REMANU') {
                const allowed = ['RI43', 'RK55', 'RI37', 'KY40', 'DEFE', 'SA70', 'SEMP', 'EXPE'];
                if (!allowed.includes(selb)) {
                    infoDiv.style.display = 'block';
                    infoDiv.style.background = '#fee2e2';
                    infoDiv.style.color = '#991b1b';
                    infoDiv.innerHTML = `⚠️ SELB Bloqueado! A Remanufatura só pode utilizar: ${allowed.join(', ')}`;
                    return;
                }
            }

            infoDiv.style.display = 'block';
            infoDiv.style.background = 'var(--bg-hover)';
            infoDiv.style.color = 'var(--text-muted)';
            infoDiv.innerHTML = '⌛ Buscando SELB no banco de dados...';

            const { data, error } = await supabase.from('equipamentos').select('modelo').eq('selb', selb).maybeSingle();
            if (error) {
                console.error('Erro ao buscar SELB:', error.message);
                infoDiv.style.background = '#fee2e2';
                infoDiv.style.color = '#991b1b';
                infoDiv.innerHTML = `❌ Erro ao verificar SELB: ${error.message}`;
            } else if (data) {
                infoDiv.style.background = '#dcfce7';
                infoDiv.style.color = '#166534';
                infoDiv.innerHTML = `✅ <strong>Modelo:</strong> ${data.modelo}`;
            } else {
                infoDiv.style.background = '#fee2e2';
                infoDiv.style.color = '#991b1b';
                infoDiv.innerHTML = `⚠️ SELB incorreto! Caso esteja correto, solicite ao administrador para cadastrar.`;
                alert(`❌ SELB incorreto!\n\nEste SELB não foi encontrado no banco de dados. Caso o SELB esteja correto, solicite ao administrador que realize o cadastro no sistema.`);
            }
        } else {
            infoDiv.style.display = 'none';
            infoDiv.innerHTML = '';
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
}

// --- AUTENTICAÇÃO ---
async function doLogin() {
    let email = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    if (!email || !pass) { loginErr.textContent = '❌ Preencha todos os campos'; return; }
    
    // Auto-completar domínio corporativo
    if (!email.includes('@')) {
        email += '@selbetti.com.br';
    }

    loginErr.textContent = '⌛ Autenticando...';
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) loginErr.textContent = '❌ ' + error.message;
}

async function doModalLogin() {
    let email = document.getElementById('modal-login-user').value.trim();
    const pass = document.getElementById('modal-login-pass').value;
    const err = document.getElementById('modal-login-err');
    if (!email || !pass) { err.textContent = '❌ Preencha todos os campos'; return; }

    // Auto-completar domínio corporativo
    if (!email.includes('@')) {
        email += '@selbetti.com.br';
    }

    err.textContent = '⌛ Verificando...';
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) err.textContent = '❌ ' + error.message;
    else document.getElementById('modal-login-overlay').classList.remove('open');
}


function updateUIForAuth() {
    if (currentUser) {
        authScreen.style.display = 'none';
        appShell.style.display = 'flex';
        btnLogout.style.display = 'inline-flex';
        btnLoginArea.style.display = 'none';
        if (currentUser.email.endsWith('@selbetti.com.br')) {
            adminBadge.style.display = 'inline-flex';
            const secAuditTab = document.getElementById('tab-btn-sec-audit');
            if (secAuditTab) secAuditTab.style.display = 'inline-block';
        }
        
        const isLucas = currentUser.email === 'lucas.araujo@selbetti.com.br';
        const remanuOnlyUsers = ['carlos.nogueira@selbetti.com.br', 'andrio.rockenbach@selbetti.com.br', 'bernardo.voit@selbetti.com.br'];
        const isRemanuOnly = remanuOnlyUsers.includes(currentUser.email);

        const ss = document.getElementById('sector-switcher');
        if (ss) ss.style.display = isLucas ? 'inline-flex' : 'none';
        
        const tabAudit = document.getElementById('tab-btn-auditoria');
        if (tabAudit) tabAudit.style.display = isLucas ? 'inline-flex' : 'none';

        if (isRemanuOnly) {
            window.changeSector('REMANU');
            if (adminBadge) adminBadge.style.display = 'none'; // Bloqueia configs globais
        }
    } else {
        authScreen.style.display = 'flex';
        appShell.style.display = 'none';
        btnLogout.style.display = 'none';
        btnLoginArea.style.display = 'inline-flex';
        adminBadge.style.display = 'none';
        
        const ss = document.getElementById('sector-switcher');
        if (ss) ss.style.display = 'none';
        
        const tabAudit = document.getElementById('tab-btn-auditoria');
        if (tabAudit) tabAudit.style.display = 'none';
    }
}

// --- NAVEGAÇÃO ---
function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${tabId}`));
    if (tabId === 'dashboard') updateDashboard();
    if (tabId === 'smartmanager') window.renderSmartManager();
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
    if (tabId === 'retorno') renderRetornoTab();
    if (tabId === 'resumo') window.renderResumoOperacao();
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
    try {
        console.log('📊 Atualizando Dashboard...');
        const { count: totalParts } = await supabase.from('parts').select('*', { count: 'exact', head: true }).neq('code', 'SEMPEÇA').neq('code', 'SEMPECA');
        
        const { data: stockData } = await supabase.from(getEstoqueTable()).select('qty, code').gt('qty', 0).neq('code', 'SEMPEÇA').neq('code', 'SEMPECA');
        const inStockCount = stockData?.length || 0;
        const volTotal = stockData?.reduce((acc, curr) => acc + curr.qty, 0) || 0;

        const { count: lowCount } = await supabase.from(getEstoqueTable()).select('*', { count: 'exact', head: true }).lt('qty', 5).gt('qty', 0).neq('code', 'SEMPEÇA').neq('code', 'SEMPECA');

        document.getElementById('dash-total').textContent = (totalParts || 0).toLocaleString('pt-BR');
        document.getElementById('dash-instock').textContent = inStockCount.toLocaleString('pt-BR');
        document.getElementById('dash-vol-total').textContent = volTotal.toLocaleString('pt-BR');
        document.getElementById('dash-low-count').textContent = (lowCount || 0).toLocaleString('pt-BR');

        if (document.getElementById('stat-in-stock')) document.getElementById('stat-in-stock').textContent = volTotal;
        if (document.getElementById('stat-zero')) {
             const { count: zeroCount } = await supabase.from(getEstoqueTable()).select('*', { count: 'exact', head: true }).eq('qty', 0).neq('code', 'SEMPEÇA').neq('code', 'SEMPECA');
             document.getElementById('stat-zero').textContent = zeroCount || 0;
        }

        renderChips();
        renderDashTable();
    } catch (e) { console.error('❌ Erro dashboard:', e.message); }
}

window.toggleLowStockFilter = () => {
    dashFilterLow = !dashFilterLow;
    const card = document.getElementById('card-low-stock');
    if (dashFilterLow) {
        card.style.boxShadow = '0 0 0 3px var(--red)';
        card.style.transform = 'scale(1.02)';
        document.querySelector('.dash-section-title').textContent = '⚠️ Itens com Estoque Crítico (< 5)';
    } else {
        card.style.boxShadow = '';
        card.style.transform = '';
        document.querySelector('.dash-section-title').textContent = 'Itens com Saldo em Estoque';
    }
    renderDashTable();
};

async function renderDashTable() {
    try {
        const tbody = document.getElementById('dash-tbody');
        if (!tbody) return;

        let query = supabase.from(getEstoqueTable())
            .select('qty, code, parts!inner(code, descricao)')
            .neq('code', 'SEMPEÇA')
            .neq('code', 'SEMPECA')
            .order('qty', { ascending: false });

        if (dashFilterLow) {
            query = query.lt('qty', 5).gt('qty', 0);
        } else {
            query = query.gt('qty', 0);
        }

        const { data, error } = await query;
        if (error) throw error;

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
                    <td><span class="status-ok">✔ OK</span></td>
                </tr>
            `;
        }).join('');

        // Adiciona rodapé de total
        html += `
            <tr style="background: rgba(59, 130, 246, 0.05); font-weight: bold;">
                <td colspan="2" style="text-align: right; padding: 15px; color: #64748b;">TOTAL DE PEÇAS EM ESTOQUE:</td>
                <td style="font-size: 1.1rem; color: #2563eb; padding: 15px;">${totalQty}</td>
                <td></td>
            </tr>
        `;

        tbody.innerHTML = html;
    } catch (e) {
        console.error('❌ Erro renderDashTable:', e.message);
    }
}

// --- MARCAS / FILTROS ---
const MARCAS = ['HP', 'RICOH', 'XEROX', 'ZEBRA', 'EPSON', 'BROTHER', 'LEXMARK', 'SAMSUNG', 'CANON', 'DATACARD', 'DATAMAX', 'CITIZEN', 'GODEX', 'ARGOX', 'TSC', 'AVISION', 'TOSHIBA', 'SHARP', 'OKI', 'KYOCERA', 'KONICA', 'MIMAKI'];
let currentFilter = '';

async function renderChips() {
    const el = document.getElementById('brand-chips');
    if (!el) return;

    // Busca todas as peças com estoque para calcular os totais lendo a descrição
    const tName = getEstoqueTable();
    const { data } = await supabase.from('parts')
        .select(`descricao, ${tName}!inner(qty)`)
        .gt(`${tName}.qty`, 0);

    const totals = {};
    if (data) {
        data.forEach(p => {
            const desc = (p.descricao || '').toUpperCase();
            // Identifica a marca dentro do texto da descrição
            const brand = MARCAS.find(m => desc.includes(m)) || 'OUTROS';
            const qty = p[tName]?.qty ?? p[tName]?.[0]?.qty ?? 0;
            totals[brand] = (totals[brand] || 0) + qty;
        });
    }

    // Só mostra marcas com saldo > 0 e ordena (Marcas conhecidas primeiro, depois OUTROS)
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
        
        // Se não estiver pesquisando um código específico, usamos inner join para trazer só o que tem saldo
        const tName = getEstoqueTable();
        const relEstoque = isSearchActive ? `${tName}!left(qty)` : `${tName}!inner(qty)`;

        let dbQuery = supabase.from('parts').select(`code, descricao, marca, ${relEstoque}, custos!left(last_cost)`);

        // Regra: Se NÃO estiver pesquisando um código/termo específico, filtramos SÓ o que tem saldo
        if (!isSearchActive) {
            dbQuery = dbQuery.gt(`${tName}.qty`, 0);
        }

        if (currentFilter) {
            if (currentFilter === 'OUTROS') {
                // Filtro para OUTROS: descrições que não contêm nenhuma das marcas conhecidas
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

        if (!rawData || rawData.length === 0) {
            tbody.innerHTML = ''; countEl.textContent = '0'; document.getElementById('empty-state').style.display = 'block'; return;
        }

        // Ordenação por maior volume (físico) primeiro
        const data = rawData.filter(p => p.code !== 'SEMPEÇA' && p.code !== 'SEMPECA').sort((a, b) => {
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
                    <td style="text-align:right">R$ ${Number(window.getDisplayValue({ valor: cost, custo_real: p.custo_real }, 'valor')).toFixed(2)}</td>
                    <td class="td-actions">
                        <button class="btn-sm btn-set" onclick="openEditModal('${p.code}', '${p.descricao.replace(/'/g, "\\'")}')">✏</button>
                        <button class="btn-sm btn-minus" onclick="openSaidaModal('${p.code}')">➖</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) { console.error('❌ Erro busca:', e.message); }
}

// --- LOGICA DE ENTRADA (LOTE) ---
async function processarEntrada() {
    const textarea = document.getElementById('entrada-textarea');
    const lines = textarea.value.split('\n').map(l => l.trim().toUpperCase()).filter(Boolean);
    const resultDiv = document.getElementById('entrada-result');
    if (!lines.length) return;

    resultDiv.innerHTML = '⌛ Processando...';
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
    resultDiv.innerHTML = '✅ Entradas registradas!';
    updateDashboard();
}

// --- LOGICA DE SAÍDA (SELB) ---
window.buscarPecaPorDesc = async (val) => {
    const list = document.getElementById('pecas-sugestoes-custom');
    if (!list) return;

    if (!val || val.length < 2) { 
        list.style.display = 'none'; 
        list.innerHTML = ''; 
        return; 
    }

    // Lógica do Coringa %
    let queryVal = val.trim().toUpperCase();
    
    // Se o usuário selecionou uma opção completa da lista (ex: "DESC [CODE]")
    if (queryVal.includes(' [') && queryVal.endsWith(']')) {
        const code = queryVal.split(' [').pop().replace(']', '');
        document.getElementById('saida-peca').value = code;
        list.style.display = 'none';
        return;
    }

    let q = supabase.from('parts').select('code, descricao').limit(20);
    
    const safeQuery = window.formatSearchQuery(queryVal);
    q = q.ilike('descricao', `%${safeQuery}%`);

    const { data } = await q;
    if (data && data.length > 0) {
        list.innerHTML = data.map(p => {
            const descSanitized = p.descricao.replace(/'/g, "\\'");
            return `<div class="custom-datalist-item" onclick="window.selecionarPeca('${descSanitized}', '${p.code}')">${p.descricao} <span style="color:var(--text-muted);font-size:0.75rem;">[${p.code}]</span></div>`;
        }).join('');
        list.style.display = 'block';
    } else {
        list.innerHTML = '<div style="padding:10px 15px;color:var(--text-muted);font-size:12px;">Nenhuma peça encontrada...</div>';
        list.style.display = 'block';
    }
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
    if (selb.length !== 4 || !saidaItems.length) { alert('Verifique o SELB e as peças.'); return; }

    if (window.currentSector === 'REMANU') {
        const allowed = ['RI43', 'RK55', 'RI37', 'KY40', 'DEFE', 'SA70', 'SEMP', 'EXPE'];
        if (!allowed.includes(selb)) {
            alert(`❌ SELB Inválido para a Remanufatura!\n\nEste setor está restrito aos seguintes modelos:\n${allowed.join(', ')}`);
            return;
        }
    }

    const btn = document.getElementById('saida-confirm-btn');
    btn.disabled = true; btn.textContent = 'Verificando SELB...';

    // Dupla validação do SELB no banco de dados para segurança extra
    const { data: equip, error: equipErr } = await supabase.from('equipamentos').select('modelo').eq('selb', selb).maybeSingle();
    if (equipErr) {
        alert('❌ Erro ao verificar o SELB: ' + equipErr.message);
        btn.disabled = false; btn.textContent = 'Finalizar Baixa';
        return;
    }

    if (!equip) {
        alert(`❌ SELB incorreto!\n\nEste SELB não foi encontrado no banco de dados. Caso o SELB esteja correto, solicite ao administrador que realize o cadastro no sistema.`);
        btn.disabled = false; btn.textContent = 'Finalizar Baixa';
        return;
    }

    btn.textContent = 'Gravando...';

    try {
        // Validação preventiva: impede baixar itens que não possuem saldo em estoque
        for (const item of saidaItems) {
            const { data: cur } = await supabase.from(getEstoqueTable()).select('qty').eq('code', item.code).maybeSingle();
            const currentQty = cur?.qty || 0;
            if (currentQty < item.qty) {
                throw new Error(`Saldo insuficiente para a peça ${item.code} (${item.descricao || 'Sem descrição'}). Saldo atual em estoque: ${currentQty}, solicitado para baixa: ${item.qty}.`);
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

        const obsEl = document.getElementById('saida-obs');
        const customObs = obsEl ? obsEl.value.trim() : '';

        for (const item of saidaItems) {
            // 1) Baixa o estoque
            const { data: cur } = await supabase.from(getEstoqueTable()).select('qty').eq('code', item.code).single();
            const newQty = (cur?.qty || 0) - item.qty;
            const { error: estoqueErr } = await supabase.from(getEstoqueTable()).upsert({ code: item.code, qty: newQty });
            if (estoqueErr) throw new Error(`Erro ao baixar estoque de ${item.code}: ${estoqueErr.message}`);

            const finalDesc = customObs ? `${item.descricao} (${customObs})` : item.descricao;

            // 2) Grava no histórico COM vlr_unit e vlr_total
            const histPayload = {
                tipo: 'saída',
                code: item.code,
                descricao: finalDesc,
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
            if (histErr) throw new Error(`Erro ao gravar histórico de ${item.code}: ${histErr.message}`);
        }

        alert('\u2705 Baixa conclu\u00edda!');
        closeSaidaModal();
        updateDashboard();
    } catch (err) {
        alert('\u274c ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Finalizar Baixa';
    }
}

function openSaidaModal(code) {
    saidaItems = [];
    document.getElementById('saida-selb').value = '';
    const obsEl = document.getElementById('saida-obs');
    if (obsEl) obsEl.value = '';
    
    const infoDiv = document.getElementById('saida-selb-info');
    if (infoDiv) {
        infoDiv.style.display = 'none';
        infoDiv.innerHTML = '';
    }

    document.getElementById('saida-peca').value = code || '';
    document.getElementById('saida-busca-desc').value = '';
    renderSaidaItems();
    document.getElementById('modal-saida-overlay').classList.add('open');
}

async function addSaidaItem() {
    const code = document.getElementById('saida-peca').value.trim().toUpperCase();
    const qty = parseInt(document.getElementById('saida-qtd').value) || 1;
    if (!code) { alert('Selecione uma peça primeiro pesquisando pela descrição.'); return; }

    // TRAVA DE ESTOQUE: Verifica saldo antes de adicionar
    const { data: st } = await supabase.from(getEstoqueTable()).select('qty').eq('code', code).single();
    const currentStock = st?.qty || 0;

    // Verifica se já tem esse item no lote atual
    const inBatch = saidaItems.find(i => i.code === code)?.qty || 0;

    if (currentStock < (qty + inBatch)) {
        alert(`❌ SALDO INSUFICIENTE!\nEstoque atual: ${currentStock}\nVocê já adicionou ${inBatch} e está tentando adicionar mais ${qty}.`);
        return;
    }

    supabase.from('parts').select('descricao, custos(last_cost)').eq('code', code).single().then(({ data }) => {
        if (!data) { alert('Peça não encontrada no cadastro.'); return; }
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
    document.getElementById('saida-total').textContent = 'R$ ' + saidaItems.reduce((s, i) => s + window.getDisplayValue(i, 'vlrTotal'), 0).toFixed(2);
    tbody.innerHTML = saidaItems.map((item, idx) => `<tr><td>${item.code}</td><td>${item.descricao}</td><td class="text-center">${item.qty}</td><td class="text-right">R$ ${window.getDisplayValue(item, 'vlrTotal').toFixed(2)}</td><td><button onclick="window.removeSaidaItem(${idx})">❌</button></td></tr>`).join('');
}

// --- AJUSTE MANUAL ---
let currentEditCode = '';
let currentEditPrevQty = 0;
let currentEditPrevPrice = 0;

function openEditModal(code, desc) {
    currentEditCode = code;
    document.getElementById('modal-code').textContent = code;
    document.getElementById('modal-desc').textContent = desc;
    document.getElementById('modal-obs').value = ''; // Limpa observação anterior

    supabase.from(getEstoqueTable()).select('qty').eq('code', code).single().then(({ data }) => {
        currentEditPrevQty = data?.qty || 0;
        document.getElementById('modal-qty').value = currentEditPrevQty;
    });
    supabase.from('custos').select('last_cost').eq('code', code).single().then(({ data }) => {
        currentEditPrevPrice = data?.last_cost || 0;
        document.getElementById('modal-price').value = currentEditPrevPrice;
    });
    document.getElementById('modal-overlay').classList.add('open');
}

window.syncHistoricoCustos = async (code, newPrice) => {
    try {
        const updateHistForTable = async (tableName) => {
            const { data: hist } = await supabase.from(tableName).select('id, qty, vlr_unit').eq('code', code);
            if (hist && hist.length > 0) {
                for (const h of hist) {
                    if (h.vlr_unit !== newPrice) {
                        await supabase.from(tableName).update({
                            vlr_unit: newPrice,
                            vlr_total: h.qty * newPrice
                        }).eq('id', h.id);
                    }
                }
            }
        };
        await updateHistForTable('historico');
        await updateHistForTable('historico_remanu');
        await updateHistForTable('historico_3d');
    } catch (e) {
        console.error("Erro ao sincronizar historico para o code " + code, e);
    }
};

async function savePriceModal() {
    if (!currentUser || currentUser.email !== 'lucas.araujo@selbetti.com.br') {
        alert('❌ Permissão negada! Apenas o usuário lucas.araujo@selbetti.com.br pode realizar ajustes manuais.');
        return;
    }

    const qty = parseInt(document.getElementById('modal-qty').value) || 0;
    const price = parseFloat(document.getElementById('modal-price').value) || 0;
    const obs = document.getElementById('modal-obs').value.trim();

    if (!obs) {
        alert('⚠️ A observação é obrigatória para registrar o histórico do ajuste.');
        return;
    }

    const btn = document.querySelector('#modal-overlay .btn-confirm');
    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Gravando...'; }

    try {
        await supabase.from(getEstoqueTable()).upsert({ code: currentEditCode, qty });
        await supabase.from('custos').upsert({ code: currentEditCode, last_cost: price });
        await window.syncHistoricoCustos(currentEditCode, price);

        const formatChange = `AJUSTE MANUAL: ${obs} (Qtd: ${currentEditPrevQty} ➡️ ${qty} | Preço: R$ ${currentEditPrevPrice.toFixed(2)} ➡️ R$ ${price.toFixed(2)})`;

        const diffQty = qty - currentEditPrevQty;
        let tipoMovimento = 'ajuste';
        let recordedQty = 0;
        
        if (diffQty > 0) {
            tipoMovimento = 'entrada';
            recordedQty = diffQty;
        } else if (diffQty < 0) {
            tipoMovimento = 'saída';
            recordedQty = Math.abs(diffQty);
        }

        await supabase.from(getHistoricoTable()).insert({
            tipo: tipoMovimento,
            code: currentEditCode,
            qty: recordedQty,
            vlr_unit: price,
            vlr_total: recordedQty * price,
            selb: 'AJUSTE',
            descricao: formatChange,
            user_email: currentUser.email,
            ts: new Date().toISOString()
        });

        document.getElementById('modal-overlay').classList.remove('open');
        renderEstoque(); 
        updateDashboard();
        alert('✅ Ajuste realizado e registrado no histórico com sucesso!');
    } catch (err) {
        alert('❌ Erro ao salvar o ajuste: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
}

// --- HISTÓRICO ---
async function renderHistorico() {
    const tbody = document.getElementById('hist-tbody');
    const searchQ = document.getElementById('hist-search')?.value.trim().toUpperCase() || '';
    const tipoF = document.getElementById('hist-tipo')?.value || '';
    const d1Str = document.getElementById('hist-d1')?.value || '';
    const d2Str = document.getElementById('hist-d2')?.value || '';

    let q = supabase.from(getHistoricoTable()).select('*').order('ts', { ascending: false }).limit(200);

    if (tipoF) q = q.eq('tipo', tipoF);
    if (searchQ) {
        const sq = window.formatSearchQuery(searchQ);
        q = q.or(`code.ilike.%${sq}%,descricao.ilike.%${sq}%,selb.ilike.%${sq}%`);
    }
    if (d1Str) q = q.gte('ts', d1Str + 'T00:00:00Z');
    if (d2Str) q = q.lte('ts', d2Str + 'T23:59:59.999Z');

    const { data: rawData } = await q;
    if (!rawData) return;
    const data = rawData.filter(h => {
        if (h.code === 'SEMPEÇA' || h.code === 'SEMPECA') {
            return h.tipo === 'saída' || h.tipo === 'saida' || h.tipo === 'REVISÃO';
        }
        return true;
    });

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

    document.getElementById('hist-count').textContent = `${displayData.length} registros (limite de visualização)`;

    tbody.innerHTML = displayData.map(h => {
        if (h.isGroup) {
            return `
            <tr style="background-color: var(--bg-hover);">
                <td>${new Date(h.ts).toLocaleString()}</td>
                <td class="td-code" style="font-size: 0.75rem; color: var(--primary)">${h.revision_id}</td>
                <td>
                    <span class="hist-badge badge-saida" style="background:#6366f1; color:white">REVISÃO</span>
                </td>
                <td class="text-center">${h.items.length} itens</td>
                <td style="text-align:right; color: var(--text-muted)">-</td>
                <td style="text-align:right; font-weight: bold;">${h.vlr_total ? 'R$ ' + window.getDisplayValue(h, 'vlr_total').toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                <td>${h.user_email?.split('@')[0] || ''}</td>
                <td style="font-size: 0.85rem;">
                    <strong>${h.selb || ''}</strong>
                    <details style="margin-top: 5px; cursor: pointer;">
                        <summary style="color: var(--primary); font-weight: 500; font-size: 0.75rem;">Ver Peças (${h.items.length})</summary>
                        <ul style="margin: 5px 0; padding-left: 15px; font-size: 0.7rem; color: var(--text-muted);">
                            ${h.items.map(i => `<li style="margin-bottom:4px;">${i.code} (Qtd: ${i.qty}) - R$ ${window.getDisplayValue(i, 'vlr_total').toLocaleString('pt-BR', {minimumFractionDigits: 2})} ${i.manager_sync ? `<br><span style="color:#6366f1; font-weight:bold; font-size: 0.65rem;">🔗 OS ${i.os_manager}</span>` : ''}</li>`).join('')}
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
            <td style="text-align:right; color: var(--text-muted)">${h.vlr_unit ? 'R$ ' + window.getDisplayValue(h, 'vlr_unit').toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
            <td style="text-align:right; font-weight: bold;">${h.vlr_total ? 'R$ ' + window.getDisplayValue(h, 'vlr_total').toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
            <td>${h.user_email?.split('@')[0] || ''}</td>
            <td style="font-size: 0.85rem;">
                <strong>${h.selb || ''}</strong>
                ${h.descricao && h.descricao !== h.selb ? `<div style="font-size: 0.7rem; color: var(--text-muted); line-height:1.2">${h.descricao}</div>` : ''}
            </td>
            <td>
                ${currentUser.email === 'lucas.araujo@selbetti.com.br' ? `<button class="btn-edit-hist" onclick="openAjusteHistorico('${h.id}')" title="Ajustar Registro">✏️</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

// --- AJUSTE DE HISTÓRICO (SOMENTE LUCAS) ---
window.openAjusteHistorico = async (id) => {
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
    const id = document.getElementById('ajuste-id').value;
    const newSelb = document.getElementById('ajuste-selb').value.trim().toUpperCase();
    const newCode = document.getElementById('ajuste-code').value.trim().toUpperCase();
    const obs = document.getElementById('ajuste-obs').value.trim();
    const status = document.getElementById('ajuste-status');

    if (!newCode || !obs) {
        status.innerHTML = '<span style="color:var(--red)">⚠️ Informe o código e o motivo.</span>';
        return;
    }

    status.innerHTML = '⌛ Processando ajuste...';

    // 1. Pegar registro original
    const { data: original } = await supabase.from(getHistoricoTable()).select('*').eq('id', id).single();
    if (!original) return;

    // 2. Buscar o preço da peça (seja a antiga ou a nova)
    const { data: costData } = await supabase.from('custos').select('last_cost').eq('code', newCode).single();
    const newPrice = costData?.last_cost || original.vlr_unit || 0;
    const newTotal = newPrice * original.qty;

    // 3. Se mudou o código, ajusta o estoque
    if (original.code !== newCode) {
        // Devolve o antigo
        const factor = (original.tipo === 'saída' || original.tipo === 'saida') ? 1 : -1;
        
        // Atualiza estoque da peça antiga (devolvendo/revertendo)
        const { data: stOld } = await supabase.from(getEstoqueTable()).select('qty').eq('code', original.code).single();
        await supabase.from(getEstoqueTable()).upsert({ code: original.code, qty: (stOld?.qty || 0) + (original.qty * factor) });

        // Atualiza estoque da peça nova (retirando/aplicando)
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
        status.innerHTML = '❌ Erro ao atualizar: ' + errUpdate.message;
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

    status.innerHTML = '<span style="color:var(--green)">✅ Ajuste concluído com sucesso!</span>';
    setTimeout(() => {
        closeAjusteHistorico();
        renderHistorico();
        updateDashboard();
    }, 1500);
};

window.anularRegistroHistorico = async () => {
    const id = document.getElementById('ajuste-id').value;
    const obs = document.getElementById('ajuste-obs').value.trim();
    const status = document.getElementById('ajuste-status');

    if (!confirm("⚠️ ATENÇÃO: Tem certeza que deseja CANCELAR este registro?\\nEle continuará no histórico como CANCELADO, mas não será mais considerado nos cálculos de custos e o estoque será revertido.")) return;

    if (!obs) {
        status.innerHTML = '<span style="color:var(--red)">⚠️ Informe o motivo do cancelamento na observação.</span>';
        return;
    }

    status.innerHTML = '⌛ Cancelando registro...';

    // 1. Pegar registro original
    const { data: original } = await supabase.from(getHistoricoTable()).select('*').eq('id', id).single();
    if (!original) return;

    // 2. Reverte o estoque
    const factor = (original.tipo === 'saída' || original.tipo === 'saida') ? 1 : -1;
    const { data: stOld } = await supabase.from(getEstoqueTable()).select('qty').eq('code', original.code).single();
    await supabase.from(getEstoqueTable()).upsert({ code: original.code, qty: (stOld?.qty || 0) + (original.qty * factor) });

    // 3. Marca como CANCELADO
    const { error: errUpdate } = await supabase.from(getHistoricoTable()).update({
        tipo: 'CANCELADO',
        descricao: `CANCELADO: ${obs} (Original: ${original.tipo})`
    }).eq('id', id);

    if (errUpdate) {
        status.innerHTML = '❌ Erro ao cancelar: ' + errUpdate.message;
        return;
    }

    // 4. Cria registro de auditoria (TIPO AJUSTE)
    await supabase.from(getHistoricoTable()).insert({
        tipo: 'ajuste',
        code: original.code,
        qty: original.qty,
        vlr_unit: original.vlr_unit,
        vlr_total: original.vlr_total,
        selb: original.selb,
        descricao: `CANCELAMENTO DE REGISTRO: ${obs}`,
        user_email: currentUser.email,
        ts: new Date().toISOString()
    });

    status.innerHTML = '<span style="color:var(--green)">✅ Registro cancelado com sucesso!</span>';
    setTimeout(() => {
        closeAjusteHistorico();
        renderHistorico();
        updateDashboard();
    }, 1500);
};

// --- EXPOR PARA GLOBAL (BOTÕES HTML) ---
window.switchTab = switchTab;
window.processarEntrada = processarEntrada;

// Função para abrir o menu de engrenagem
window.openAdminMenu = () => {
    const menu = document.getElementById('admin-menu-overlay');
    if (menu) menu.classList.add('open');
};
window.closeAdminMenu = () => {
    const menu = document.getElementById('admin-menu-overlay');
    if (menu) menu.classList.remove('open');
};

window.openSaidaModal = openSaidaModal;
window.closeSaidaModal = () => document.getElementById('modal-saida-overlay').classList.remove('open');
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
    
    // Carregar sugestões de modelos existentes para o datalist
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
        status.innerHTML = '<span style="color:var(--red)">⚠️ Preencha todos os campos.</span>';
        return;
    }

    status.innerHTML = '⌛ Salvando...';
    
    const { error } = await supabase.from('equipamentos').upsert({
        selb,
        modelo,
        descricao: 'VÍNCULO MANUAL'
    });

    if (error) {
        status.innerHTML = `<span style="color:var(--red)">❌ Erro: ${error.message}</span>`;
    } else {
        status.innerHTML = `<span style="color:var(--green)">✅ SELB ${selb} vinculado com sucesso!</span>`;
        setTimeout(() => {
            closeManualSELBModal();
            renderModeloCusto(); // Atualiza o relatório se estiver aberto
        }, 1500);
    }
};

// Facilitar navegação do menu admin
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

            // 1. Busca o número do pedido globalmente nas primeiras 15 linhas do XML
            let globalPedido = '';
            for (let ri = 0; ri < Math.min(rows.length, 15); ri++) {
                const cells = rows[ri].querySelectorAll('Cell');
                for (const cell of cells) {
                    const txt = cell.querySelector('Data')?.textContent.trim() || '';
                    const upperTxt = txt.toUpperCase();
                    if (upperTxt.includes('PEDIDO') || upperTxt.includes('PED.COMPRA') || upperTxt.includes('PED. COMPRA')) {
                        const match = txt.match(/(?:PEDIDO|PED\.COMPRA|PED\. COMPRA)(?:\s+(?:DE\s+COMPRA|Nº|NUM\.?|N\.?))?[\s.:#-]+([A-Z0-9]+)/i);
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
                        if ((t.includes('PEDIDO') || t.includes('PED.COMPRA') || t.includes('PED. COMPRA') || t === 'PED' || t.includes('DOCTO')) && colPedido < 0) colPedido = i;
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

                // Captura o número do pedido por linha (se existir a coluna) ou usa o global
                const rowPedido = colPedido >= 0 ? getCell(colPedido).trim() : '';
                const orderNum = rowPedido || globalPedido || '';

                if (!itemsMap[rawCode]) {
                    itemsMap[rawCode] = { qty: 0, vlrUnit: vlrUnit, pedido: orderNum };
                }
                itemsMap[rawCode].qty += qty;
                if (orderNum && !itemsMap[rawCode].pedido) {
                    itemsMap[rawCode].pedido = orderNum;
                }
            }

            const keys = Object.keys(itemsMap);
            if (keys.length === 0) { alert('Nenhum item válido encontrado.'); return; }

            const targetSector = document.querySelector('input[name="xml-sector"]:checked').value;
            const sectorName = targetSector === 'REMANU' ? 'Remanufatura' : 'Laboratório';

            // Armazena na memória para a confirmação
            window.pendingXmlImport = {
                keys,
                itemsMap,
                targetSector
            };

            document.getElementById('xml-preview-sector-label').textContent = sectorName;
            document.getElementById('xml-preview-count').textContent = keys.length;
            
            const tbody = document.getElementById('xml-preview-tbody');
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">⌛ Buscando descrições no banco...</td></tr>';
            
            // Abre o modal
            document.getElementById('xml-preview-modal').classList.add('open');

            // Busca as descrições em lote para exibir na prévia
            let html = '';
            for (const code of keys) {
                const item = itemsMap[code];
                const { data: pCheck } = await supabase.from('parts').select('descricao').eq('code', code).maybeSingle();
                const desc = pCheck?.descricao ? pCheck.descricao : `PEÇA IMPORTADA VIA XML (${code})`;
                
                // Armazena a descrição encontrada para evitar buscar de novo depois
                item.descInfo = desc;
                item.isNew = !pCheck;

                html += `
                  <tr>
                    <td style="font-family:var(--mono); font-weight:600;">${code}</td>
                    <td>${desc}</td>
                    <td style="text-align:center; font-weight:bold;">${item.qty}</td>
                    <td style="text-align:right">R$ ${item.vlrUnit.toFixed(2).replace('.', ',')}</td>
                    <td style="text-align:center; color:var(--text-muted);">${item.pedido || '-'}</td>
                  </tr>
                `;
            }

            tbody.innerHTML = html;
            
            // Limpa o input file para permitir selecionar o mesmo arquivo novamente se o usuário cancelar
            document.getElementById('xml-file-input').value = '';

        } catch (err) {
            console.error(err);
            alert('Erro ao ler XML: ' + err.message);
            document.getElementById('xml-file-input').value = '';
        }
    };
    reader.readAsText(file, "ISO-8859-1");
};

window.fecharModalXML = () => {
    document.getElementById('xml-preview-modal').classList.remove('open');
    window.pendingXmlImport = null;
    document.getElementById('xml-preview-status').innerHTML = '';
};

window.confirmarImportacaoXML = async () => {
    if (!window.pendingXmlImport) return;

    const btn = document.getElementById('xml-confirm-btn');
    const status = document.getElementById('xml-preview-status');
    const origBtnText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '⌛ Salvando...';
    status.innerHTML = '<span style="color:var(--orange)">Processando itens no banco de dados... Aguarde.</span>';

    try {
        const { keys, itemsMap, targetSector } = window.pendingXmlImport;
        const tableEstoque = targetSector === 'REMANU' ? 'estoque_remanu' : 'estoque';
        const tableHist = targetSector === 'REMANU' ? 'historico_remanu' : 'historico';

        let processados = 0;

        for (const code of keys) {
            const { qty, vlrUnit, pedido, descInfo, isNew } = itemsMap[code];

            if (isNew) {
                const { error: pErr } = await supabase.from('parts').insert({
                    code: code,
                    descricao: descInfo,
                    marca: 'OUTROS'
                });
                if (pErr) console.warn(`Aviso ao cadastrar peça ${code}:`, pErr.message);
            }

            const { data: cur } = await supabase.from(tableEstoque).select('qty').eq('code', code).single();
            const newQty = (cur?.qty || 0) + qty;

            const { error: errEst } = await supabase.from(tableEstoque).upsert({ code, qty: newQty });
            if (errEst) throw new Error(`Estoque: ${errEst.message}`);
            
            if (vlrUnit > 0) {
                const { error: errCust } = await supabase.from('custos').upsert({ code, last_cost: vlrUnit });
                if (errCust) throw new Error(`Custos: ${errCust.message}`);
                
                // Nova Regra: Atualiza todo o histórico passado com o novo custo real
                await window.syncHistoricoCustos(code, vlrUnit);
            }

            if (currentUser) {
                const selbHist = pedido ? `XML | Pedido: ${pedido}` : 'Entrada Lote XML';
                const { error: errHist } = await supabase.from(tableHist).insert({
                    tipo: 'entrada', code, descricao: descInfo, qty,
                    selb: selbHist,
                    user_email: currentUser.email, ts: new Date().toISOString(),
                    vlr_unit: vlrUnit, vlr_total: vlrUnit * qty
                });
                if (errHist) throw new Error(`Histórico: ${errHist.message}`);
            }
            processados++;
        }

        status.innerHTML = `<span style="color:var(--green)">✅ ${processados} itens processados com sucesso!</span>`;
        setTimeout(() => {
            window.fecharModalXML();
            window.location.reload();
        }, 1500);

    } catch (err) {
        console.error(err);
        status.innerHTML = `<span style="color:var(--red)">❌ Erro: ${err.message}</span>`;
        btn.disabled = false;
        btn.innerHTML = origBtnText;
    }
};

// --- MOVIMENTAÇÕES DASHBOARD ---
let chartDaily = null;
let chartWeekly = null;

window.renderMovDashboard = async () => {
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

    let q = supabase.from(getHistoricoTable()).select('*').order('ts', { ascending: true });
    if (tipoF) q = q.eq('tipo', tipoF);
    if (prodF) {
        const sq = window.formatSearchQuery(prodF);
        q = q.or(`code.ilike.%${sq}%,descricao.ilike.%${sq}%`);
    }
    if (d1) q = q.gte('ts', d1 + 'T00:00:00Z');
    if (d2) q = q.lte('ts', d2 + 'T23:59:59Z');

    const { data: rawData } = await q;
    if (!rawData) return;
    const data = rawData.filter(h => {
        if (h.code === 'SEMPEÇA' || h.code === 'SEMPECA') {
            return h.tipo === 'saída' || h.tipo === 'saida' || h.tipo === 'REVISÃO';
        }
        return true;
    });

    let totIn = 0, totOut = 0, vlrIn = 0, vlrOut = 0;
    const daily = {};
    const weekly = {};

    data.forEach(h => {
        const qty = h.qty || 0;
        const vlr = h.vlr_total || 0;
        const dt = h.ts ? h.ts.split('T')[0] : 'Sem Data';

        if (h.tipo === 'entrada') { totIn += qty; vlrIn += vlr; }
        else if (h.tipo === 'saída' || h.tipo === 'saida') { totOut += qty; vlrOut += vlr; }
        else if (h.tipo === 'retorno_sobra') { totIn -= qty; vlrIn -= vlr; }
        else if (h.tipo === 'retorno_garantia') { totOut -= qty; vlrOut -= vlr; vlrIn -= vlr; }

        if (dt !== 'Sem Data') {
            if (!daily[dt]) daily[dt] = { in: 0, out: 0, vlrIn: 0, vlrOut: 0 };
            if (h.tipo === 'entrada') { daily[dt].in += qty; daily[dt].vlrIn += vlr; }
            else if (h.tipo === 'saída' || h.tipo === 'saida') { daily[dt].out += qty; daily[dt].vlrOut += vlr; }
            else if (h.tipo === 'retorno_sobra') { daily[dt].in -= qty; daily[dt].vlrIn -= vlr; }
            else if (h.tipo === 'retorno_garantia') { daily[dt].out -= qty; daily[dt].vlrOut -= vlr; daily[dt].vlrIn -= vlr; }

            const dateObj = new Date(h.ts);
            const startOfYear = new Date(dateObj.getFullYear(), 0, 1);
            const week = Math.ceil((((dateObj - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
            const weekKey = `Sem. ${week}`;
            if (!weekly[weekKey]) weekly[weekKey] = 0;
            weekly[weekKey] += qty;
        }
    });

    // Atualizar KPIs
    const fmt = v => 'R$ ' + Number(window.getDisplayValue({v}, 'v')).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('mov-kpi-entrada').textContent = totIn.toLocaleString('pt-BR');
    document.getElementById('mov-kpi-saida').textContent = totOut.toLocaleString('pt-BR');
    document.getElementById('mov-kpi-entrada-val').textContent = fmt(vlrIn);
    document.getElementById('mov-kpi-saida-val').textContent = fmt(vlrOut);
    document.getElementById('mov-kpi-saldo').textContent = (totIn - totOut).toLocaleString('pt-BR');

    // Patrimônio Real (Independente do filtro de data)
    const { data: currentInv } = await supabase.from(getEstoqueTable()).select('qty, code');
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

    // Gráfico Diário
    const dailyLabels = Object.keys(daily).sort();
    if (chartDaily) chartDaily.destroy();
    chartDaily = new Chart(document.getElementById('chart-daily'), {
        type: 'line',
        data: {
            labels: dailyLabels,
            datasets: [
                { label: 'Entrada', data: dailyLabels.map(l => daily[l].in), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.4 },
                { label: 'Saída', data: dailyLabels.map(l => daily[l].out), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.4 }
            ]
        },
        options: { responsive: true }
    });

    // Gráfico Semanal
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
                <td style="text-align:right">${d.vlrIn > 0 ? fmt(d.vlrIn) : '—'}</td>
                <td style="text-align:right">${d.vlrOut > 0 ? fmt(d.vlrOut) : '—'}</td>
                <td style="text-align:right; font-weight:bold">${fmt(d.vlrIn + d.vlrOut)}</td>
            </tr>`;
        }).join('');
    }
};

async function gerarBackupCompleto() {
    try {
        console.log('🔄 Iniciando coleta de dados para backup...');
        const btn = event.target;
        const originalText = btn.innerText;
        btn.innerText = '⏳ Coletando dados...';
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
        alert('✅ Backup concluído com sucesso! Guarde este arquivo em um local seguro (Google Drive, Pendrive, etc).');
        closeAdminMenu();
    } catch (err) {
        alert('❌ Erro ao gerar backup: ' + err.message);
    }
}

window.gerarBackupCompleto = gerarBackupCompleto;

// --- LOGICA BI EQUIPAMENTOS ---
window.pendingBiImportData = [];

window.closeBiPreviewModal = () => {
    document.getElementById('bi-preview-modal').classList.remove('open');
    window.pendingBiImportData = [];
    document.getElementById('bi-status').innerHTML = '❌ Importação cancelada pelo usuário.';
};

window.confirmBiImport = async () => {
    if (!window.pendingBiImportData || window.pendingBiImportData.length === 0) return;
    
    const status = document.getElementById('bi-preview-status');
    const btn = document.getElementById('bi-confirm-btn');
    status.innerHTML = '⌛ Enviando registros...';
    btn.disabled = true;

    try {
        let count = 0;
        const total = window.pendingBiImportData.length;
        
        for (let i = 0; i < total; i += 500) {
            const chunk = window.pendingBiImportData.slice(i, i + 500);
            const { error } = await supabase.from('equipamentos').upsert(chunk);
            if (error) throw error;
            count += chunk.length;
            status.innerHTML = `⌛ Enviando... (${count}/${total})`;
        }

        document.getElementById('bi-status').innerHTML = '✅ Base BI atualizada com sucesso!';
        renderEquipamentos();
        
        // Fechar modal após 1 segundo de sucesso
        setTimeout(() => {
            document.getElementById('bi-preview-modal').classList.remove('open');
            window.pendingBiImportData = [];
            btn.disabled = false;
            status.innerHTML = '';
        }, 1000);

    } catch (err) {
        console.error(err);
        status.innerHTML = `<span style="color:var(--red)">❌ Erro: ${err.message}</span>`;
        btn.disabled = false;
    }
};

window.processarBI = async (file) => {
    if (!file) return;
    const status = document.getElementById('bi-status');
    status.innerHTML = '⌛ Lendo arquivo e buscando colunas...';
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            if (rows.length < 2) {
                status.innerHTML = '❌ Arquivo vazio ou sem dados suficientes.';
                return;
            }

            // 1. Procurar a linha de cabeçalho e identificar os índices
            let headerRowIndex = -1;
            let colSelb = -1;
            let colModelo = -1;

            for (let i = 0; i < Math.min(10, rows.length); i++) {
                const row = rows[i] || [];
                const rowTexts = row.map(c => String(c || '').trim().toUpperCase());
                
                // Encontrar o índice da coluna SELB
                const sIdx = rowTexts.findIndex(t => t === 'SELB' || t === 'CÓDIGO' || t === 'CODIGO' || t.includes('SELB'));
                
                // Encontrar o índice da coluna Modelo/Produto
                const mIdx = rowTexts.findIndex(t => t === 'MODELO' || t === 'PRODUTO' || t.includes('MODELO') || t.includes('PRODUTO'));

                if (sIdx >= 0 && mIdx >= 0) {
                    headerRowIndex = i;
                    colSelb = sIdx;
                    colModelo = mIdx;
                    break;
                }
            }

            if (colSelb === -1 || colModelo === -1) {
                status.innerHTML = `<span style="color:var(--red)">❌ Erro: Colunas "SELB" ou "MODELO" não encontradas automaticamente no cabeçalho do arquivo.</span>`;
                return;
            }

            const seen = new Set();
            const validRows = [];
            
            // 2. Extrair dados com base nos índices corretos
            for (let i = headerRowIndex + 1; i < rows.length; i++) {
                const cells = rows[i] || [];
                
                const rawSelb = String(cells[colSelb] || '').trim().toUpperCase();
                const rawModelo = String(cells[colModelo] || '').trim().toUpperCase();
                
                if (!rawSelb || rawSelb === 'TOTAL') continue;

                // Tenta buscar a Situação WMS ou similar para colocar na descrição
                const situacao = cells.find(c => String(c).toUpperCase() === 'LIBERADO' || String(c).toUpperCase() === 'BLOQUEADO');
                const desc = situacao ? `Importação Excel (${situacao})` : 'Importação Excel';

                if (rawSelb && rawModelo && !seen.has(rawSelb)) {
                    seen.add(rawSelb);
                    validRows.push({ 
                        selb: rawSelb, 
                        modelo: rawModelo, 
                        descricao: desc 
                    });
                }
            }

            if (!validRows.length) { 
                status.innerHTML = '❌ Nenhum dado válido encontrado após o cabeçalho.'; 
                return; 
            }

            // 3. Preparar e exibir o Modal de Preview
            window.pendingBiImportData = validRows;
            
            const tbody = document.getElementById('bi-preview-tbody');
            tbody.innerHTML = validRows.map(r => `
                <tr>
                    <td style="font-weight:bold; color:var(--blue)">${r.selb}</td>
                    <td>${r.modelo}</td>
                    <td style="font-size:0.75rem; color:var(--text-muted)">${r.descricao}</td>
                </tr>
            `).join('');
            
            document.getElementById('bi-preview-count').textContent = validRows.length;
            document.getElementById('bi-preview-status').innerHTML = '';
            document.getElementById('bi-confirm-btn').disabled = false;
            
            status.innerHTML = 'Aguardando confirmação do usuário...';
            document.getElementById('bi-preview-modal').classList.add('open');

        } catch (err) {
            console.error(err);
            status.innerHTML = '❌ Erro ao processar arquivo: ' + err.message;
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

    const filtroData = document.getElementById('filtro-data-revisados')?.value;
    let q = supabase.from('revisados').select('*').order('ts', { ascending: false });
    if (filtroData) {
        q = q.gte('ts', filtroData + 'T00:00:00Z').lte('ts', filtroData + 'T23:59:59Z');
    } else {
        q = q.limit(200);
    }
    const { data } = await q;
    if (!data) return;

    tbody.innerHTML = data.map(r => `
        <tr>
            <td style="text-align: center;"><input type="checkbox" class="rev-chk" value="${r.id}"></td>
            <td style="font-size:0.8rem">${new Date(r.ts).toLocaleString('pt-BR')}</td>
            <td style="font-weight:bold; color:var(--green)">${r.selb}</td>
            <td style="color:var(--text-muted)">${r.user_email?.split('@')[0]}</td>
        </tr>
    `).join('');
};

window.toggleAllRevisados = (checked) => {
    document.querySelectorAll('.rev-chk').forEach(c => c.checked = checked);
};

window.excluirRevisadosSelecionados = async () => {
    const checks = document.querySelectorAll('.rev-chk:checked');
    if (checks.length === 0) return alert('Nenhum registro selecionado.');
    
    if (!confirm(`Tem certeza que deseja EXCLUIR ${checks.length} registro(s) de revisão? Esta ação abaterá do gráfico da dashboard.`)) return;

    const ids = Array.from(checks).map(c => parseInt(c.value));
    
    document.getElementById('revisados-status').innerHTML = '⌛ Excluindo...';
    
    const { error } = await supabase.from('revisados').delete().in('id', ids);
    if (error) {
        alert('Erro ao excluir: ' + error.message);
        document.getElementById('revisados-status').innerHTML = '';
    } else {
        document.getElementById('revisados-status').innerHTML = `<span style="color:var(--green)">✅ ${checks.length} registros excluídos com sucesso!</span>`;
        const selAll = document.getElementById('rev-sel-all');
        if(selAll) selAll.checked = false;
        renderRevisados();
        renderMovDashboard(); // Atualiza painel caso impacte
    }
};

window.processarRevisados = async () => {
    const textarea = document.getElementById('revisados-textarea');
    const status = document.getElementById('revisados-status');
    const raw = textarea.value.trim();
    if (!raw) return;

    const dtInput = document.getElementById('revisados-data');
    const selbData = dtInput?.value || new Date().toISOString().split('T')[0];

    // --- VALIDAÇÃO DE DATA ---
    const dataSelecionada = new Date(selbData + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    if (dataSelecionada > hoje) {
        status.innerHTML = '❌ Erro: Não é permitido lançar SELBs com data futura.';
        return;
    }
    // -------------------------

    status.innerHTML = '⌛ Gravando...';
    const selbs = raw.split(/[\n,;]+/).map(s => s.trim().toUpperCase()).filter(s => s.length >= 2);
    
    if (selbs.length === 0) {
        status.innerHTML = '❌ Nenhum SELB válido detectado.';
        return;
    }

    const records = selbs.map(s => ({
        selb: s,
        user_email: currentUser?.email || 'anonimo',
        ts: selbData + 'T12:00:00Z' // Usa meio-dia para evitar problemas de fuso
    }));

    const { error } = await supabase.from('revisados').upsert(records);

    if (error) {
        status.innerHTML = `<span style="color:var(--red)">❌ Erro: ${error.message}</span>`;
    } else {
        status.innerHTML = `<span style="color:var(--green)">✅ ${selbs.length} SELBs registrados!</span>`;
        textarea.value = '';
        renderRevisados();
    }
};

// --- RELATÓRIO CUSTO POR MODELO ---
let chartModelo = null;

window.clearModFilters = () => {
    document.getElementById('mod-busca').value = '';
    document.getElementById('mod-d1').value = '';
    document.getElementById('mod-d2').value = '';
    renderModeloCusto();
};

window.renderModeloCusto = async () => {
    try {
        const d1 = document.getElementById('mod-d1')?.value;
        const d2 = document.getElementById('mod-d2')?.value;
        const query = document.getElementById('mod-busca')?.value.trim().toUpperCase();

        // Carregar Dados
        const [hRes, rRes, eRes] = await Promise.all([
            supabase.from(getHistoricoTable()).select('*').in('tipo', ['saída', 'saida', 'retorno_garantia']),
            supabase.from('revisados').select('*'),
            supabase.from('equipamentos').select('selb, modelo')
        ]);

        const saídas = hRes.data || [];
        // A Remanufatura não utiliza a tabela de revisados do Laboratório
        const revisados = window.currentSector === 'REMANU' ? [] : (rRes.data || []);
        const equipamentos = eRes.data || [];

        const eqMap = {};
        equipamentos.forEach(e => {
            const cleanSelb = e.selb.toUpperCase().trim();
            eqMap[cleanSelb] = e.modelo;
        });

        const filtrarData = (ts) => {
            if (!ts) return false; // Se não tem data, não entra no relatório
            const dt = ts.split('T')[0];
            if (d1 && dt < d1) return false;
            if (d2 && dt > d2) return false;
            return true;
        };

        const byModel = {};
        window.statsDefeitoData = { pecas: 0, custo: 0, counts: {} };

        // Saídas (Com Peça e Tratamento Especial de Sem Peça)
        saídas.filter(s => filtrarData(s.ts)).forEach(s => {
            const selb = (s.selb || '').toUpperCase().trim();
            if (!selb || selb === 'S/N' || selb === '0000') return;

            if (selb === 'DEFE') {
                const signal = (s.tipo === 'retorno_garantia') ? -1 : 1;
                window.statsDefeitoData.pecas += ((s.qty || 1) * signal);
                window.statsDefeitoData.custo += ((s.vlr_total || 0) * signal);
                if (s.code) {
                    window.statsDefeitoData.counts[s.code] = window.statsDefeitoData.counts[s.code] || { qtd: 0, desc: s.descricao };
                    window.statsDefeitoData.counts[s.code].qtd += ((s.qty || 1) * signal);
                }
                return; // Ignora DEFE nas estatísticas de modelos
            }

            const modelo = eqMap[selb] || 'MODELO NÃO IDENTIFICADO (' + selb + ')';
            if (query && !modelo.includes(query)) return;

            if (!byModel[modelo]) byModel[modelo] = { atendimentos: 0, comPeca: new Set(), semPeca: new Set(), pecas: 0, custo: 0, vlrNovaRef: 0, vlrNovaRevs: new Set() };
            
            // Lógica para registrar as revisões que usaram a peça SEMPEÇA
            if (s.code === 'SEMPEÇA' || s.code === 'SEMPECA') {
                if (window.currentSector === 'REMANU' && s.revision_id) {
                    byModel[modelo].semPeca.add(s.revision_id);
                    // Acumula a referência de valor da máquina nova se houver
                    if (s.vlr_nova_ref && !byModel[modelo].vlrNovaRevs.has(s.revision_id)) {
                        byModel[modelo].vlrNovaRef += s.vlr_nova_ref;
                        byModel[modelo].vlrNovaRevs.add(s.revision_id);
                    }
                } else {
                    byModel[modelo].semPeca.add(selb);
                }
                return; // Encerra o loop aqui (não computa custo ou qty de peças)
            }
            if (window.currentSector === 'REMANU' && s.revision_id) {
                byModel[modelo].comPeca.add(s.revision_id);
                // Acumula vlr_nova_ref uma vez por revision_id (não por peça)
                if (s.vlr_nova_ref && !byModel[modelo].vlrNovaRevs.has(s.revision_id)) {
                    byModel[modelo].vlrNovaRef += s.vlr_nova_ref;
                    byModel[modelo].vlrNovaRevs.add(s.revision_id);
                }
            } else {
                byModel[modelo].comPeca.add(selb);
            }
            
            if (s.tipo === 'retorno_garantia') {
                byModel[modelo].pecas -= (s.qty || 0);
                byModel[modelo].custo -= (s.vlr_total || 0);
            } else {
                byModel[modelo].pecas += (s.qty || 1);
                byModel[modelo].custo += (s.vlr_total || 0);
            }
        });

        // Revisados (Sem Peça ou Complemento)
        revisados.filter(r => filtrarData(r.ts)).forEach(r => {
            const selb = (r.selb || '').toUpperCase().trim();
            if (!selb || selb === 'S/N' || selb === '0000') return;

            const modelo = eqMap[selb] || 'MODELO NÃO IDENTIFICADO (' + selb + ')';
            if (query && !modelo.includes(query)) return;

            if (!byModel[modelo]) byModel[modelo] = { atendimentos: 0, comPeca: new Set(), semPeca: new Set(), pecas: 0, custo: 0 };
            if (!byModel[modelo].comPeca.has(selb)) {
                byModel[modelo].semPeca.add(selb);
            }
        });

        // Garante que, se uma mesma revisão (SELB ou revision_id) teve SEMPEÇA mas também peças reais,
        // ela seja contada APENAS como "Com Peça" (evitando que Atendimentos fique duplicado)
        Object.values(byModel).forEach(d => {
            d.comPeca.forEach(rev => d.semPeca.delete(rev));
        });

        const rows = Object.entries(byModel).map(([modelo, d]) => {
            const totalAtend = d.comPeca.size + d.semPeca.size;
            const economiaReal = (d.vlrNovaRef || 0) - d.custo;
            const economiaPct = (d.vlrNovaRef || 0) > 0 ? (economiaReal / d.vlrNovaRef) * 100 : 0;
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
                economiaPct: economiaPct
            };
        }).sort((a, b) => b.custo - a.custo);

        const fmt = v => 'R$ ' + Number(window.getDisplayValue({v}, 'v')).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
            
            document.getElementById('remanu-kpi-top').textContent = top ? top.modelo : '—';
            document.getElementById('remanu-kpi-top-val').textContent = top ? fmt(top.custo) : 'R$ 0,00';
            document.getElementById('remanu-kpi-bottom').textContent = bottom ? bottom.modelo : '—';
            document.getElementById('remanu-kpi-bottom-val').textContent = bottom ? fmt(bottom.custo) : 'R$ 0,00';
            
            if (window.statsDefeitoData) {
                document.getElementById('remanu-kpi-defeito-val').textContent = fmt(window.statsDefeitoData.custo);
            }

            // Render Table for Remanu
            document.getElementById('mod-thead-tr').innerHTML = `
                <th style="text-align: left; padding: 12px;">Modelo</th>
                <th class="text-center" style="padding: 12px;">Revisões</th>
                <th style="text-align: right; padding: 12px;">Custo Revisão</th>
                <th style="text-align: right; padding: 12px;">Preço Nova (Ref)</th>
                <th style="text-align: right; padding: 12px;">Economia Gerada</th>
            `;
            document.getElementById('mod-tbody').innerHTML = rows.slice(0, 50).map(r => `
                <tr style="cursor:default">
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
            document.getElementById('mod-kpi-modelos-label').textContent = `MODELOS ATENDIDOS (${totalAtend} MÁQUINAS)`;
            document.getElementById('mod-kpi-total').textContent = fmt(totalCusto);
            document.getElementById('mod-kpi-top').textContent = top ? top.modelo : '—';
            document.getElementById('mod-kpi-top-val').textContent = top ? fmt(top.custo) : 'R$ 0,00';
            document.getElementById('mod-kpi-bottom').textContent = bottom ? bottom.modelo : '—';
            document.getElementById('mod-kpi-bottom-val').textContent = bottom ? fmt(bottom.custo) : 'R$ 0,00';
            document.getElementById('mod-kpi-medio').textContent = totalAtend > 0 ? fmt(totalCusto / totalAtend) : 'R$ 0,00';

            // Tabela Compacta
            document.getElementById('mod-thead-tr').innerHTML = `
                <th style="text-align: left; padding: 12px;">Modelo</th>
                <th class="text-center" style="padding: 12px;">Atendimentos</th>
                <th class="text-center" style="padding: 12px;">Peças Usadas</th>
                <th style="text-align: right; padding: 12px;">Custo Total</th>
            `;
            document.getElementById('mod-tbody').innerHTML = rows.slice(0, 50).map(r => `
                <tr>
                    <td style="font-size: 13px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.modelo}</td>
                    <td style="text-align:center; font-family: var(--mono);">${r.atendimentos}</td>
                    <td style="text-align:center; font-family: var(--mono);">${r.pecas}</td>
                    <td style="text-align:right; font-family: var(--mono); font-weight: bold;">${fmt(r.custo)}</td>
                </tr>
            `).join('');
        }

        // GRÁFICO TOP 10 (POR CUSTO MÉDIO)
        if (chartModelo) chartModelo.destroy();
        const ctx = document.getElementById('chart-modelo')?.getContext('2d');
        if (ctx) {
            if (window.currentSector === 'REMANU') {
                const topEconomia = rows.filter(r => r.vlrNovaRef > 0).sort((a, b) => b.economiaReal - a.economiaReal).slice(0, 10);
                document.querySelector('.chart-header').textContent = '💰 TOP 10 MODELOS COM MAIOR ECONOMIA GERADA';
                
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
                        maintainAspectRatio: false
                    }
                });
            } else {
                document.querySelector('.chart-header').textContent = '💰 TOP 10 MODELOS POR CUSTO MÉDIO POR REVISÃO (GERAL)';
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
                            label: 'Custo Médio (R$)',
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
                                    label: (ctx) => `Média: ${fmt(ctx.raw)}`
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
    } catch (e) { console.error('❌ Erro Relatório Custo:', e); }
};

window.exportarRelatorioModelo = () => {
    const tbody = document.getElementById('mod-tbody');
    const thead = document.getElementById('mod-thead-tr');
    if (!tbody || !tbody.rows.length) { alert('Gere o relatório primeiro.'); return; }
    
    const headers = Array.from(thead.cells).map(th => th.innerText);
    const rows = Array.from(tbody.rows).map(tr => {
        let rowObj = {};
        Array.from(tr.cells).forEach((td, index) => {
            if (headers[index]) {
                rowObj[headers[index]] = td.innerText;
            }
        });
        return rowObj;
    });
    
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
        alert('Nenhum dado de modelo disponível para exibir.');
        return;
    }

    const overlay = document.getElementById('modal-detalhe-modelo');
    const header = document.getElementById('modal-detalhe-header');
    const kicker = document.getElementById('modal-detalhe-kicker');
    const title = document.getElementById('modal-detalhe-title');
    
    // Configurar layout e textos
    if (type === 'expensive') {
        kicker.textContent = '🔴 MODELO MAIS CARO';
        header.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
    } else if (type === 'cheap') {
        kicker.textContent = '🟢 MODELO MAIS BARATO';
        header.style.background = 'linear-gradient(135deg, #27ae60, #1e8449)';
    } else {
        kicker.textContent = '📊 DETALHES DO MODELO';
        header.style.background = 'linear-gradient(135deg, #f39c12, #d68910)';
    }
    title.textContent = model.modelo;
    
    const fmt = v => 'R$ ' + Number(window.getDisplayValue({v}, 'v')).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtNum = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    document.getElementById('detalhe-com-peca').textContent = model.comPeca;
    document.getElementById('detalhe-sem-peca').textContent = model.semPeca > 0 ? model.semPeca : '—';
    document.getElementById('detalhe-total-maquinas').textContent = model.atendimentos;
    document.getElementById('detalhe-pecas').textContent = model.pecas;
    document.getElementById('detalhe-custo-geral').textContent = fmt(model.custoMedio);
    document.getElementById('detalhe-custo-com-peca').textContent = model.comPeca > 0 ? fmt(model.custo / model.comPeca) : 'R$ 0,00';
    document.getElementById('detalhe-media-pecas').textContent = model.atendimentos > 0 ? fmtNum(model.pecas / model.atendimentos) : '0,00';
    
    // Atualiza Labels baseadas no setor (Remanufatura trata "Peças" e não "Máquinas")
    const lblTotal = document.getElementById('detalhe-total-maquinas').previousElementSibling;
    const lblMedia = document.getElementById('detalhe-media-pecas').previousElementSibling;
    if (window.currentSector === 'REMANU') {
        lblTotal.textContent = 'Total de Peças/Kits Revistos';
        lblMedia.textContent = 'Média de Componentes Utilizados';
    } else {
        lblTotal.textContent = 'Total de Máquinas';
        lblMedia.textContent = 'Média de Peças por Máquina';
    }
    
    const totalEl = document.getElementById('detalhe-custo-total');
    totalEl.textContent = fmt(model.custo);
    totalEl.style.color = type === 'expensive' ? '#e74c3c' : (type === 'cheap' ? '#27ae60' : '#f39c12');

    overlay.classList.add('open');
};

window.closeDetalheModelo = () => {
    document.getElementById('modal-detalhe-modelo').classList.remove('open');
};

// --- MODAL DETALHE DEFEITOS ---
window.openDetalheDefeito = () => {
    const data = window.statsDefeitoData;
    if (!data) return;

    const fmt = v => 'R$ ' + Number(window.getDisplayValue({v}, 'v')).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    document.getElementById('defeito-total-pecas').textContent = data.pecas;
    document.getElementById('defeito-custo-total').textContent = fmt(data.custo);

    let maxQtd = 0;
    let worstCode = '—';
    let worstDesc = 'Nenhum dado registrado';
    
    for (const [code, info] of Object.entries(data.counts)) {
        if (info.qtd > maxQtd) {
            maxQtd = info.qtd;
            worstCode = code;
            worstDesc = info.desc;
        }
    }

    document.getElementById('defeito-peca-problematica').textContent = worstCode;
    document.getElementById('defeito-peca-qtd').textContent = maxQtd + ' ocorrências';
    document.getElementById('defeito-peca-desc').textContent = worstDesc;

    document.getElementById('modal-detalhe-defeito').classList.add('open');
};

window.closeDetalheDefeito = () => {
    document.getElementById('modal-detalhe-defeito').classList.remove('open');
};

// --- MODAL EXPLICAÇÃO DE CÁLCULOS ---
window.openModalExplicacao = (type) => {
    const titleEl = document.getElementById('modal-exp-title');
    const contentEl = document.getElementById('modal-exp-content');
    const headerEl = document.getElementById('modal-exp-header');

    if (type === 'economia') {
        headerEl.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        titleEl.textContent = 'ECONOMIA GERADA TOTAL';
        contentEl.innerHTML = `
            <p style="margin-top:0;"><strong>Como este valor é calculado?</strong></p>
            <p>O sistema avalia cada modelo de peça individualmente e realiza a seguinte conta matemática:</p>
            <div style="background: var(--surface2); padding: 12px; border-radius: 8px; margin: 10px 0; font-family: var(--mono); color: var(--text);">
                Economia = (Preço da Peça Nova) - (Custo Total das Revisões)
            </div>
            <p>Se o custo gasto para consertar todas as peças daquele modelo for <strong>menor</strong> do que comprar as mesmas peças novas, essa diferença é considerada "Economia".</p>
            <p style="margin-bottom:0;">O valor exibido no card é o <strong>somatório total</strong> da economia de todos os modelos que possuíam preço de referência cadastrado no período pesquisado.</p>
        `;
    } else if (type === 'margem') {
        headerEl.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
        titleEl.textContent = 'MARGEM MÉDIA DE ECONOMIA';
        contentEl.innerHTML = `
            <p style="margin-top:0;"><strong>Como esta porcentagem é calculada?</strong></p>
            <p>A margem média representa o percentual de dinheiro salvo em relação ao valor que seria gasto comprando peças novas.</p>
            <div style="background: var(--surface2); padding: 12px; border-radius: 8px; margin: 10px 0; font-family: var(--mono); color: var(--text);">
                Margem (%) = (Soma de Todas as Economias) ÷ (Soma de Todos os Preços de Peça Nova) × 100
            </div>
            <p>Exemplo: Se você economizou R$ 8.000 e o custo para comprar todas as peças novas seria de R$ 10.000, a margem de economia é de <strong>80%</strong>.</p>
            <p style="margin-bottom:0;">Isso mostra a eficiência financeira e a saúde do setor de remanufatura como um todo.</p>
        `;
    }

    document.getElementById('modal-explicacao').classList.add('open');
};

window.closeModalExplicacao = () => {
    document.getElementById('modal-explicacao').classList.remove('open');
};

document.getElementById('modal-explicacao')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-explicacao') {
        window.closeModalExplicacao();
    }
});

// Registrar fechamento por clique fora
document.getElementById('modal-detalhe-modelo')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-detalhe-modelo') {
        window.closeDetalheModelo();
    }
});
document.getElementById('modal-detalhe-defeito')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-detalhe-defeito') {
        window.closeDetalheDefeito();
    }
});

// --- INICIALIZAÇÃO ---
init();

// --- VÍNCULOS REMANUFATURA ---
window.openVinculosRemanu = async () => {
    document.getElementById('modal-vinculos-remanu').classList.add('open');
    const dl = document.getElementById('list-modelos-remanu');
    const input = document.getElementById('vinc-modelo');
    
    input.value = ''; // Limpa pesquisa anterior
    dl.innerHTML = '<option value="Aguarde, carregando modelos...">';
    const { data: equip } = await supabase.from('equipamentos').select('modelo').order('modelo');
    if (equip) {
        const unique = [...new Set(equip.map(e => e.modelo))];
        dl.innerHTML = unique.map(m => `<option value="${m}">`).join('');
    }
    
    await carregarVinculosRemanu();
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
    btn.textContent = 'Salvando...';

    const { error } = await supabase.from('modelos_remanu').upsert({
        modelo: modelo,
        codigo_nova: codNova,
        codigo_rs: codRS
    }, { onConflict: 'modelo' });
    
    btn.disabled = false;
    btn.textContent = 'Salvar Vínculo';

    if (error) {
        alert('Erro ao salvar: ' + error.message);
    } else {
        document.getElementById('vinc-nova').value = '';
        document.getElementById('vinc-rs').value = '';
        await carregarVinculosRemanu();
    }
};

window.carregarVinculosRemanu = async () => {
    const tbody = document.getElementById('tbody-vinculos-remanu');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Aguarde...</td></tr>';
    
    const { data, error } = await supabase.from('modelos_remanu').select('*').order('modelo');
    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum vínculo cadastrado.</td></tr>';
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
};

window.deletarVinculoRemanu = async (id) => {
    if (!confirm('Deseja excluir este vínculo?')) return;
    await supabase.from('modelos_remanu').delete().eq('id', id);
    await carregarVinculosRemanu();
};

// --- AUDITORIA DE INVENTÁRIO CÍCLICO E RASTREABILIDADE (ESTOQUE CHECK) ---

window.iniciarAuditoria = async () => {
    try {
        const sectorEl = document.querySelector('input[name="audit-sector"]:checked');
        if (!sectorEl) {
            alert('⚠️ Selecione um setor para iniciar a auditoria.');
            return;
        }
        const sector = sectorEl.value;
        const modoCego = document.getElementById('audit-blind-mode').checked;

        // 1. Prevenir colisão de sessões ativas
        const { data: existing } = await supabase.from('auditorias')
            .select('*')
            .eq('status', 'EM_ANDAMENTO')
            .limit(1)
            .maybeSingle();

        if (existing) {
            if (confirm(`⚠️ Já existe uma auditoria em andamento (${existing.codigo} - Setor ${existing.setor}).\n\nDeseja retomá-la?`)) {
                await window.retomarAuditoria(existing.id);
                return;
            }
            return;
        }

        // 2. Gerar código sequencial do dia AUD-YYYYMMDD-XXX
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

        // 3. Criar registro da sessão
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
            alert('❌ Erro ao criar sessão de auditoria: ' + (sErr?.message || 'Erro desconhecido'));
            return;
        }

        // 4. Congelar saldo teórico (Bulk Snapshot)
        let stockItems = [];
        const tName = sector === 'LAB' ? 'estoque' : (sector === 'REMANU' ? 'estoque_remanu' : 'estoque_3d');
        try {
            // Busca as peças com saldo no estoque correspondente
            const { data: stData, error: stErr } = await supabase.from(tName).select('code, qty');
            if (stErr) throw stErr;

            if (stData && stData.length > 0) {
                // Busca as descrições na tabela 'parts' (onde a coluna correta é 'descricao')
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
                        description: partsMap[codeUpper] || 'Peça sem descrição',
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

        // 5. Salvar na memória do app
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

        // 6. Transição de telas
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
        alert('❌ Ocorreu um erro ao iniciar a auditoria: ' + e.message);
    }
};

window.retomarAuditoria = async (id) => {
    try {
        const { data: audit, error } = await supabase.from('auditorias').select('*').eq('id', id).single();
        if (error || !audit) {
            alert('❌ Erro ao carregar auditoria: ' + error?.message);
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
        alert('❌ Erro ao retomar sessão: ' + e.message);
    }
};

window.biparItemAuditoria = async (code) => {
    if (!activeAudit) return;
    code = code.trim().toUpperCase();
    if (!code) return;

    try {
        // Se o item já existia no cache (congelado ou inserido antes)
        if (activeAuditItems[code]) {
            activeAuditItems[code].saldo_fisico += 1;
            activeAuditItems[code].last_scanned = Date.now();
        } else {
            // Item Extra (não existia no estoque teórico)
            // Buscar descrição geral no banco
            let desc = 'Peça Extra (Não cadastrada no setor)';
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

        // Recalcular divergência
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
    document.getElementById('active-audit-title').textContent = `🔍 Auditoria: ${activeAudit.codigo}`;
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
        document.getElementById('active-audit-total-ok').textContent = '🔒 Oculto';
        document.getElementById('active-audit-total-error').textContent = '🔒 Oculto';
    } else {
        document.getElementById('active-audit-total-ok').textContent = okCount;
        document.getElementById('active-audit-total-error').textContent = errCount;
    }

    // Configurar colunas da tabela
    const thead = document.getElementById('active-audit-thead');
    if (activeAudit.modo_cego) {
        thead.innerHTML = `
            <th style="text-align: left; padding: 12px;">Código</th>
            <th style="text-align: left; padding: 12px;">Descrição</th>
            <th style="text-align: center; padding: 12px;">Físico (Contado)</th>
        `;
    } else {
        thead.innerHTML = `
            <th style="text-align: left; padding: 12px;">Código</th>
            <th style="text-align: left; padding: 12px;">Descrição</th>
            <th style="text-align: center; padding: 12px;">Físico</th>
            <th style="text-align: center; padding: 12px;">Sistema</th>
            <th style="text-align: center; padding: 12px;">Diferença</th>
            <th style="text-align: center; padding: 12px;">Status</th>
        `;
    }

    // Renderizar linhas
    const tbody = document.getElementById('active-audit-tbody');
    tbody.innerHTML = '';

    // Filtrar e ordenar:
    // No modo cego, só mostra itens fisicamente bipados (saldo_fisico > 0)
    // No modo aberto, mostra tudo que foi bipado ou que possui saldo teórico
    let filtered = itemsList.filter(item => {
        if (activeAudit.modo_cego) return item.saldo_fisico > 0;
        return (item.saldo_fisico > 0 || item.saldo_teorico > 0);
    });

    // Ordenar pelo mais recente scanned
    filtered.sort((a, b) => b.last_scanned - a.last_scanned);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${activeAudit.modo_cego ? 3 : 6}" class="text-center" style="padding: 40px; color: var(--text-muted);">Nenhum item contado ainda nesta sessão.</td></tr>`;
        return;
    }

    filtered.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid var(--border)";
        if (item.last_scanned > 0 && Date.now() - item.last_scanned < 3000) {
            tr.style.background = 'rgba(59, 130, 246, 0.08)'; // Destaque suave de 3 segundos para o recém bipado
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
        if (!confirm('⚠️ Deseja realmente ABANDONAR esta auditoria?\n\nTodos os dados contados nesta sessão ativa serão apagados permanentemente.')) {
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
        alert('Erro ao cancelar sessão: ' + e.message);
    }
};

window.finalizarAuditoria = async () => {
    if (!activeAudit) return;
    if (!confirm('🏁 Deseja realmente finalizar esta auditoria?\n\nNovas bipagens e alterações de contagem serão bloqueadas.')) return;

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
            alert('Erro ao salvar finalização no banco: ' + error.message);
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

    // Ordenação especial: Maior divergência absoluta no topo
    itemsList.sort((a, b) => Math.abs(b.divergencia) - Math.abs(a.divergencia));

    itemsList.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        
        const isOk = item.divergencia === 0;
        const diff = item.divergencia;

        // Tooltip descritiva para a classificação
        let descTooltip = '';
        if (item.status_divergencia === 'OK') descTooltip = 'Saldo Físico é igual ao do Sistema';
        else if (item.status_divergencia === 'SOBRA') descTooltip = 'Físico maior que o Sistema (Sobra detectada)';
        else if (item.status_divergencia === 'FALTA') descTooltip = 'Físico menor que o Sistema (Falta detectada)';
        else if (item.status_divergencia === 'NAO_LOCALIZADO') descTooltip = 'Saldo no Sistema mas zero contagem física';
        else if (item.status_divergencia === 'ITEM_EXTRA') descTooltip = 'Físico contado mas saldo do Sistema era zero';

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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 20px;">Carregando histórico...</td></tr>';
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
                            ? `<button class="btn-admin" onclick="window.retomarAuditoria('${aud.id}')" style="padding: 4px 10px; font-size: 11px; background:#d97706;">⚡ Retomar</button>` 
                            : `<button class="btn-confirm" onclick="window.visualizarDetalhesAuditoria('${aud.id}')" style="padding: 4px 10px; font-size: 11px; background:var(--blue); border-color:var(--blue);">🔍 Detalhes</button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 20px; color: var(--red);">Erro ao buscar histórico.</td></tr>';
    }
};

window.visualizarDetalhesAuditoria = async (id) => {
    try {
        const { data: audit, error } = await supabase.from('auditorias').select('*').eq('id', id).single();
        if (error || !audit) {
            alert('❌ Erro ao buscar auditoria: ' + error?.message);
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
        errEl.textContent = '❌ Senha de auditoria incorreta!';
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
            // 1. Atualizar estoque teórico no banco para se igualar ao físico
            await supabase.from(stockTable).upsert({
                code: item.codigo,
                qty: item.saldo_fisico
            }, { onConflict: 'code' });

            // 2. Registrar movimentação oficial no histórico (Traceability)
            const diff = item.divergencia;
            const diffAbs = Math.abs(diff);
            const obsText = `AJUSTE AUTOMÁTICO INVENTÁRIO ${activeAudit.codigo}: ${item.status_divergencia} (Qtd: ${item.saldo_teorico} ➡️ ${item.saldo_fisico})`;

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

        alert(`🎉 Estoque do sistema atualizado com sucesso!\n\n${adjustedCount} itens divergentes foram corrigidos e auditados no histórico.`);

    } catch (e) {
        alert('❌ Erro durante o processo de ajuste automático: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
};

window.exportarPlanilhaAuditoria = () => {
    if (!activeAudit) return;
    try {
        const rows = Object.values(activeAuditItems).map(item => ({
            'Código Peça': item.codigo,
            'Descrição': item.descricao,
            'Saldo Sistema (Teórico)': item.saldo_teorico,
            'Saldo Físico': item.saldo_fisico,
            'Diferença': item.divergencia,
            'Classificação': item.status_divergencia
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Conferência");
        
        // Baixar arquivo excel
        XLSX.writeFile(wb, `Inventario_${activeAudit.codigo}_${activeAudit.setor}.xlsx`);
    } catch (e) {
        alert('Erro ao exportar planilha excel: ' + e.message);
    }
};

// --- CADASTRO DE PEÇA NOVA ---
window.openCadastroPecaModal = () => {
    if (!currentUser || currentUser.email !== 'lucas.araujo@selbetti.com.br') {
        alert('❌ Permissão negada! Apenas o administrador pode cadastrar peças novas.');
        return;
    }
    document.getElementById('cad-code').value = '';
    document.getElementById('cad-desc').value = '';
    document.getElementById('cad-marca').value = 'OUTROS';
    document.getElementById('cad-custo').value = '';
    
    const preview = document.getElementById('cad-custo-preview');
    if(preview) preview.innerHTML = '';
    
    document.getElementById('cadastro-peca-status').innerHTML = '';
    
    const inputCusto = document.getElementById('cad-custo');
    inputCusto.removeEventListener('input', updateCadastroPricePreview);
    inputCusto.addEventListener('input', updateCadastroPricePreview);
    
    document.getElementById('modal-cadastro-peca').classList.add('open');
    if (window.closeAdminMenu) window.closeAdminMenu();
};

function updateCadastroPricePreview() {
    window.updatePricePreview('cad-custo', 'cad-custo-preview');
}

window.closeCadastroPecaModal = () => {
    document.getElementById('modal-cadastro-peca').classList.remove('open');
};

window.saveCadastroPeca = async () => {
    if (!currentUser || currentUser.email !== 'lucas.araujo@selbetti.com.br') {
        alert('❌ Permissão negada! Apenas o administrador pode cadastrar peças novas.');
        return;
    }

    const code = document.getElementById('cad-code').value.trim().toUpperCase();
    const desc = document.getElementById('cad-desc').value.trim().toUpperCase();
    const marca = document.getElementById('cad-marca').value.trim().toUpperCase() || 'OUTROS';
    
    // Obtém o valor comercial digitado
    const custoString = document.getElementById('cad-custo').value;
    const custo = parseFloat(custoString);
    const status = document.getElementById('cadastro-peca-status');

    if (!code || !desc || custoString === '' || isNaN(custo) || custo < 0) {
        status.innerHTML = '<span style="color:var(--red)">⚠️ Código, descrição e valor (0 ou maior) são obrigatórios!</span>';
        return;
    }

    status.innerHTML = '⌛ Cadastrando peça no banco de dados...';
    
    const btnConfirm = document.querySelector('#modal-cadastro-peca .btn-confirm');
    btnConfirm.disabled = true;

    try {
        // 1. Verificar se a peça já existe
        const { data: checkPart, error: checkErr } = await supabase
            .from('parts')
            .select('code')
            .eq('code', code)
            .maybeSingle();

        if (checkErr) throw checkErr;
        if (checkPart) {
            status.innerHTML = '<span style="color:var(--red)">❌ Código de peça já cadastrado!</span>';
            btnConfirm.disabled = false;
            return;
        }

        // 2. Cadastrar na tabela parts
        const { error: partErr } = await supabase.from('parts').insert({
            code: code,
            descricao: desc,
            marca: marca
        });
        if (partErr) throw partErr;

        // 3. Cadastrar na tabela custos (inserindo o custo como VENDA / last_cost)
        const { error: costErr } = await supabase.from('custos').upsert({
            code: code,
            last_cost: custo
        });
        if (costErr) throw costErr;

        // 4. Inicializar saldos com 0 nas tabelas de estoque (LAB, REMANU e 3D)
        await supabase.from('estoque').upsert({ code: code, qty: 0 });
        await supabase.from('estoque_remanu').upsert({ code: code, qty: 0 });
        await supabase.from('estoque_3d').upsert({ code: code, qty: 0 });

        status.innerHTML = '<span style="color:var(--green)">✅ Peça cadastrada com sucesso em todos os setores!</span>';
        
        setTimeout(() => {
            window.closeCadastroPecaModal();
            
            // Recarrega se estiver na aba de estoque
            if (typeof currentTab !== 'undefined' && currentTab === 'estoque') {
                const search = document.getElementById('search-main')?.value || '';
                renderEstoque(search);
            }
        }, 1500);

    } catch (e) {
        console.error(e);
        status.innerHTML = `<span style="color:var(--red)">❌ Erro: ${e.message}</span>`;
    } finally {
        btnConfirm.disabled = false;
    }
};
// --- MÓDULO DE RETORNO (REVERSA) ---

let retornoItems = [];

window.openRetornoModal = () => {
    retornoItems = [];
    document.getElementById('retorno-peca').value = '';
    document.getElementById('retorno-qtd').value = '1';
    document.getElementById('retorno-busca-desc').value = '';
    document.getElementById('retorno-pecas-sugestoes').style.display = 'none';
    document.getElementById('retorno-os-input').value = '';
    document.getElementById('retorno-obs-input').value = '';
    document.getElementById('retorno-tipo-select').value = 'retorno_sobra';
    document.getElementById('retorno-selb-input').value = '';
    window.toggleRetornoFields();
    renderRetornoCart();
    document.getElementById('modal-retorno-overlay').classList.add('open');
};

window.closeRetornoModal = () => {
    document.getElementById('modal-retorno-overlay').classList.remove('open');
};

window.toggleRetornoFields = () => {
    const tipo = document.getElementById('retorno-tipo-select').value;
    const selbContainer = document.getElementById('retorno-selb-container');
    if (tipo === 'retorno_garantia') {
        selbContainer.style.display = 'block';
    } else {
        selbContainer.style.display = 'none';
    }
};

window.buscarPecaPorDescRetorno = async (term) => {
    const box = document.getElementById('retorno-pecas-sugestoes');
    if (!term || term.length < 3) {
        box.style.display = 'none';
        return;
    }
    
    const formattedTerm = window.formatSearchQuery(term);
    const { data } = await supabase.from(getEstoqueTable()).select('code, descricao, qty').ilike('descricao', `%${formattedTerm}%`).limit(15);
    
    if (data && data.length > 0) {
        box.innerHTML = data.map(p => `
            <div style="padding: 8px 12px; border-bottom: 1px solid var(--border); cursor: pointer;" 
                 onclick="document.getElementById('retorno-peca').value='${p.code}'; document.getElementById('retorno-pecas-sugestoes').style.display='none'; document.getElementById('retorno-busca-desc').value='${p.descricao}';">
                <strong>${p.code}</strong> - ${p.descricao} (Estoque: ${p.qty})
            </div>
        `).join('');
        box.style.display = 'block';
    } else {
        box.innerHTML = '<div style="padding: 8px 12px; color: var(--text-muted);">Nenhuma peça encontrada.</div>';
        box.style.display = 'block';
    }
};

window.addRetornoItem = async () => {
    const code = document.getElementById('retorno-peca').value.trim().toUpperCase();
    const qty = parseInt(document.getElementById('retorno-qtd').value);
    const tipo = document.getElementById('retorno-tipo-select').value;

    if (!code || isNaN(qty) || qty <= 0) {
        alert('Preencha código válido e quantidade maior que 0.');
        return;
    }

    // Buscar peça no estoque/custos
    const { data: est } = await supabase.from(getEstoqueTable()).select('descricao, qty').eq('code', code).maybeSingle();
    const { data: custo } = await supabase.from('custos').select('last_cost').eq('code', code).maybeSingle();

    if (!est) {
        alert('❌ Peça não encontrada no estoque.');
        return;
    }

    // Se for SOBRA, valida o saldo existente
    if (tipo === 'retorno_sobra') {
        const currentQtyInCart = retornoItems.filter(i => i.code === code).reduce((acc, curr) => acc + curr.qty, 0);
        if (est.qty < (qty + currentQtyInCart)) {
            alert(`❌ Saldo Insuficiente para Sobra!\n\nA peça ${code} (${est.descricao}) possui apenas ${est.qty} no estoque. Você está tentando devolver ${qty + currentQtyInCart}.`);
            return;
        }
    }

    const valUnit = custo?.last_cost || 0;
    const vlrTotal = valUnit * qty;

    retornoItems.push({
        code,
        descricao: est.descricao,
        qty,
        vlrUnit: valUnit,
        vlrTotal
    });

    document.getElementById('retorno-peca').value = '';
    document.getElementById('retorno-qtd').value = '1';
    document.getElementById('retorno-busca-desc').value = '';
    renderRetornoCart();
};

window.removeRetornoItem = (idx) => {
    retornoItems.splice(idx, 1);
    renderRetornoCart();
};

window.renderRetornoCart = () => {
    const tbody = document.getElementById('retorno-tbody');
    const fmt = v => 'R$ ' + Number(window.getDisplayValue({v}, 'v')).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    if (retornoItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 15px;">Nenhuma peça adicionada.</td></tr>';
        document.getElementById('retorno-count').textContent = '0';
        document.getElementById('retorno-total').textContent = 'R$ 0,00';
        return;
    }

    tbody.innerHTML = retornoItems.map((item, i) => `
        <tr>
            <td style="font-weight: bold; color: var(--blue);">${item.code}</td>
            <td style="font-size: 11px;">${item.descricao}</td>
            <td style="text-align:center; font-weight: bold;">${item.qty}</td>
            <td style="text-align:right; color: #10b981; font-weight: bold;">${fmt(item.vlrTotal)}</td>
            <td style="text-align:center">
                <button onclick="window.removeRetornoItem(${i})" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:16px;">🗑️</button>
            </td>
        </tr>
    `).join('');

    const totQtd = retornoItems.reduce((acc, curr) => acc + curr.qty, 0);
    const totVlr = retornoItems.reduce((acc, curr) => acc + curr.vlrTotal, 0);

    document.getElementById('retorno-count').textContent = totQtd;
    document.getElementById('retorno-total').textContent = fmt(totVlr);
};

window.confirmarRetorno = async () => {
    const tipo = document.getElementById('retorno-tipo-select').value;
    const os = document.getElementById('retorno-os-input').value.trim();
    const selb = document.getElementById('retorno-selb-input').value.trim().toUpperCase();
    const obs = document.getElementById('retorno-obs-input').value.trim();

    if (retornoItems.length === 0) {
        alert('Adicione pelo menos uma peça para devolver.');
        return;
    }

    if (!os) {
        alert('❌ O número da OS de Reversa é obrigatório!');
        return;
    }

    if (tipo === 'retorno_garantia') {
        if (selb.length !== 4) {
            alert('❌ Para garantia, você deve informar o SELB exato (4 caracteres) de onde a peça foi retirada.');
            return;
        }

        // Dupla checagem: o selb tem que existir nas máquinas ou no histórico?
        const { data: equip } = await supabase.from('equipamentos').select('modelo').eq('selb', selb).maybeSingle();
        if (!equip) {
            alert('❌ SELB não encontrado no cadastro de equipamentos.');
            return;
        }
    }

    const btn = document.getElementById('retorno-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Gravando...';

    try {
        const ts = new Date().toISOString();
        const obsFinal = obs ? `OS: ${os} - ${obs}` : `OS: ${os}`;

        for (const item of retornoItems) {
            // Se for sobra, subtrai o estoque (pois a peça está saindo do lab de volta pra logistica)
            if (tipo === 'retorno_sobra') {
                const { data: cur } = await supabase.from(getEstoqueTable()).select('qty').eq('code', item.code).single();
                const newQty = (cur?.qty || 0) - item.qty;
                if (newQty < 0) throw new Error(`Saldo negativo gerado para ${item.code}! Operação cancelada.`);
                const { error: estErr } = await supabase.from(getEstoqueTable()).upsert({ code: item.code, qty: newQty });
                if (estErr) throw estErr;
            }

            // Se for garantia, não mexe no saldo (a peça já saiu do estoque antes)

            // Grava no histórico (isso vai gerar o crédito financeiro)
            const histPayload = {
                tipo: tipo,
                code: item.code,
                descricao: item.descricao,
                qty: item.qty,
                vlr_unit: item.vlrUnit,
                vlr_total: item.vlrTotal,
                user_email: currentUser.email,
                ts: ts,
                observacao: obsFinal
            };
            
            if (tipo === 'retorno_garantia') {
                histPayload.selb = selb;
            }

            const { error: histErr } = await supabase.from(getHistoricoTable()).insert([histPayload]);
            if (histErr) throw histErr;
        }

        alert('✅ Devolução registrada com sucesso!');
        window.closeRetornoModal();
        if (currentTab === 'retorno') renderRetornoTab();
        if (currentTab === 'dashboard') updateDashboard();
        if (currentTab === 'estoque') { renderChips(); renderEstoque(); }

    } catch (e) {
        console.error(e);
        alert('❌ Erro ao gravar devolução: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar Devolução no Sistema';
    }
};

window.renderRetornoTab = async () => {
    const search = document.getElementById('ret-search')?.value.trim();
    const tipo = document.getElementById('ret-tipo')?.value;

    let q = supabase.from(getHistoricoTable()).select('*').in('tipo', ['retorno_sobra', 'retorno_garantia']).order('ts', { ascending: false });
    
    if (tipo) q = q.eq('tipo', tipo);
    if (search) {
        const sq = window.formatSearchQuery(search);
        q = q.or(`code.ilike.%${sq}%,descricao.ilike.%${sq}%,selb.ilike.%${sq}%,observacao.ilike.%${sq}%`);
    }

    const { data } = await q;
    
    const tbody = document.getElementById('ret-tbody');
    const fmt = v => 'R$ ' + Number(window.getDisplayValue({v}, 'v')).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhuma devolução encontrada.</td></tr>';
        document.getElementById('ret-kpi-sobra').textContent = 'R$ 0,00';
        document.getElementById('ret-kpi-garantia').textContent = 'R$ 0,00';
        document.getElementById('ret-kpi-total').textContent = 'R$ 0,00';
        return;
    }

    let totSobra = 0;
    let totGarantia = 0;

    tbody.innerHTML = data.map(d => {
        const dt = new Date(d.ts).toLocaleString('pt-BR');
        let osVal = '-';
        if (d.observacao && d.observacao.includes('OS: ')) {
            const m = d.observacao.match(/OS:\s*(\d+)/);
            if (m) osVal = m[1];
        }
        
        const isSobra = d.tipo === 'retorno_sobra';
        if (isSobra) totSobra += d.vlr_total;
        else totGarantia += d.vlr_total;

        const badgeTipo = isSobra ? 
            `<span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px;">SOBRA</span>` : 
            `<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px;">GARANTIA</span>`;

        return `<tr>
            <td style="font-size: 11px;">${dt}</td>
            <td style="font-weight: bold; font-family: var(--mono);">${osVal}</td>
            <td>${badgeTipo}</td>
            <td style="font-weight: bold;">${d.selb || '-'}</td>
            <td style="color: var(--blue); font-weight: bold;">${d.code}</td>
            <td style="font-size: 11px;">${d.descricao}</td>
            <td style="text-align:center;">${d.qty}</td>
            <td style="text-align:right; font-weight: bold; color: #10b981;">${fmt(d.vlr_total)}</td>
            <td style="font-size: 10px;">${d.user_email?.split('@')[0] || '-'}</td>
        </tr>`;
    }).join('');

    document.getElementById('ret-kpi-sobra').textContent = fmt(totSobra);
    document.getElementById('ret-kpi-garantia').textContent = fmt(totGarantia);
    document.getElementById('ret-kpi-total').textContent = fmt(totSobra + totGarantia);
};

// Setup search listeners
document.getElementById('ret-search')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(window.renderRetornoTab, 300);
});
document.getElementById('ret-tipo')?.addEventListener('change', window.renderRetornoTab);



// ==========================================
// ABA RESUMO DA OPERAÇÃO
// ==========================================
let chartResumoCusto = null;
let chartResumoQtd = null;

window.resumoSetFilter = (type) => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000; 
    let d1 = new Date(today.getTime() - tzOffset);
    let d2 = new Date(today.getTime() - tzOffset);

    if (type === 'today') {
        // mantém hoje
    } else if (type === 'yesterday') {
        d1.setDate(d1.getDate() - 1);
        d2.setDate(d2.getDate() - 1);
    } else if (type === 'week') {
        d1.setDate(d1.getDate() - 7);
    } else if (type === 'month') {
        d1.setDate(d1.getDate() - 30);
    }
    
    document.getElementById('resumo-d1').value = d1.toISOString().split('T')[0];
    document.getElementById('resumo-d2').value = d2.toISOString().split('T')[0];
    window.renderResumoOperacao();
};

window.renderResumoOperacao = async () => {
    try {
        let d1 = document.getElementById('resumo-d1')?.value;
        let d2 = document.getElementById('resumo-d2')?.value;
        
        // Se ambos vazios, puxa padrão de ontem
        if (!d1 && !d2) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const tzOffset = yesterday.getTimezoneOffset() * 60000;
            const iso = new Date(yesterday.getTime() - tzOffset).toISOString().split('T')[0];
            document.getElementById('resumo-d1').value = iso;
            document.getElementById('resumo-d2').value = iso;
            d1 = iso;
            d2 = iso;
        }
        
        const filtrarData = (ts) => {
            if (!ts) return false;
            const dt = ts.split('T')[0];
            if (d1 && dt < d1) return false;
            if (d2 && dt > d2) return false;
            return true;
        };

        const [hRes, rRes, eRes] = await Promise.all([
            supabase.from(getHistoricoTable()).select('*').in('tipo', ['saída', 'saida', 'retorno_garantia']),
            supabase.from('revisados').select('*'),
            supabase.from('equipamentos').select('selb, modelo')
        ]);

        const saídas = (hRes.data || []).filter(s => filtrarData(s.ts));
        const revisados = window.currentSector === 'REMANU' ? [] : (rRes.data || []).filter(r => filtrarData(r.ts));
        const equipamentos = eRes.data || [];

        const eqMap = {};
        equipamentos.forEach(e => {
            eqMap[e.selb.toUpperCase().trim()] = e.modelo;
        });

        const byModel = {};
        let totalCusto = 0;
        let pecasCount = {}; // Para achar a peça mais consumida
        
        const validSelbsLab = new Set();
        revisados.forEach(r => {
            const selb = (r.selb || '').toUpperCase().trim();
            if (selb && selb !== 'S/N' && selb !== '0000') {
                validSelbsLab.add(selb);
            }
        });

        saídas.forEach(s => {
            const selb = (s.selb || '').toUpperCase().trim();
            if (!selb || selb === 'S/N' || selb === '0000') return;

            if (selb === 'DEFE') {
                // não conta em modelos
                return;
            }

            // SE FOR LAB: só conta se o SELB foi explicitamente marcado como revisado no dia (está na tabela revisados)
            if (window.currentSector === 'LAB' && !validSelbsLab.has(selb)) {
                return;
            }

            const modelo = eqMap[selb] || 'MODELO NÃO IDENTIFICADO';
            if (!byModel[modelo]) byModel[modelo] = { comPeca: new Set(), semPeca: new Set(), custo: 0 };
            
            if (s.code === 'SEMPEÇA' || s.code === 'SEMPECA') {
                if (window.currentSector === 'REMANU' && s.revision_id) byModel[modelo].semPeca.add(s.revision_id);
                else byModel[modelo].semPeca.add(selb);
                return;
            }

            // Conta uso de peça
            const signal = (s.tipo === 'retorno_garantia') ? -1 : 1;
            if (s.code && s.code !== 'SEMPEÇA' && s.code !== 'SEMPECA') {
                pecasCount[s.code] = pecasCount[s.code] || { desc: s.descricao, qty: 0 };
                pecasCount[s.code].qty += ((s.qty || 1) * signal);
            }

            if (window.currentSector === 'REMANU' && s.revision_id) {
                byModel[modelo].comPeca.add(s.revision_id);
            } else {
                byModel[modelo].comPeca.add(selb);
            }
            
            const custoItem = (s.vlr_total || 0) * signal;
            byModel[modelo].custo += custoItem;
            totalCusto += custoItem;
        });

        // Revisados (Sem peça lab)
        revisados.forEach(r => {
            const selb = (r.selb || '').toUpperCase().trim();
            if (!selb || selb === 'S/N' || selb === '0000') return;
            const modelo = eqMap[selb] || 'MODELO NÃO IDENTIFICADO';
            if (!byModel[modelo]) byModel[modelo] = { comPeca: new Set(), semPeca: new Set(), custo: 0 };
            
            if (!byModel[modelo].comPeca.has(selb)) {
                byModel[modelo].semPeca.add(selb);
            }
        });

        // Garante intersecção vazia
        Object.values(byModel).forEach(d => {
            d.comPeca.forEach(rev => d.semPeca.delete(rev));
        });

        let eqComPeca = 0;
        let eqSemPeca = 0;
        const rows = Object.entries(byModel).map(([modelo, d]) => {
            const com = d.comPeca.size;
            const sem = d.semPeca.size;
            const totalAtend = com + sem;
            eqComPeca += com;
            eqSemPeca += sem;
            return {
                modelo,
                atendimentos: totalAtend,
                comPeca: com,
                semPeca: sem,
                custo: d.custo,
                custoMedio: totalAtend > 0 ? d.custo / totalAtend : 0
            };
        }).filter(r => r.atendimentos > 0); // ignora se = 0
        
        let totalRevisados = eqComPeca + eqSemPeca;
        let custoMedioGeral = totalRevisados > 0 ? totalCusto / totalRevisados : 0;
        
        // Top peca
        let topPecaNome = "-";
        let topPecaQtd = 0;
        Object.values(pecasCount).forEach(p => {
            if (p.qty > topPecaQtd) {
                topPecaQtd = p.qty;
                topPecaNome = p.desc;
            }
        });

        // Atualizar Cards
        document.getElementById('resumo-total-rev').textContent = totalRevisados;
        document.getElementById('resumo-com-peca').textContent = eqComPeca;
        document.getElementById('resumo-sem-peca').textContent = eqSemPeca;
        
        document.getElementById('resumo-custo-total').textContent = totalCusto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('resumo-custo-medio').textContent = custoMedioGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        document.getElementById('resumo-modelos-unicos').textContent = rows.length;
        document.getElementById('resumo-top-peca-nome').textContent = topPecaNome;
        document.getElementById('resumo-top-peca-qtd').textContent = topPecaQtd;

        // Renderizar Tabela
        // ordena por revisados DESC
        rows.sort((a,b) => b.atendimentos - a.atendimentos);
        
        const tbody = document.getElementById('resumo-tbody');
        if(tbody) {
            tbody.innerHTML = rows.map(r => `
                <tr>
                    <td style="font-weight:bold;">${r.modelo}</td>
                    <td style="text-align:center;">${r.atendimentos}</td>
                    <td style="text-align:center; color: var(--blue)">${r.comPeca}</td>
                    <td style="text-align:center; color: var(--orange)">${r.semPeca}</td>
                    <td style="text-align:right">${r.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td style="text-align:right">${r.custoMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                </tr>
            `).join('');
        }

        // Gráficos (Top 10)
        let topCusto = [...rows].sort((a,b) => b.custo - a.custo).slice(0, 10);
        let topQtd = [...rows].sort((a,b) => b.atendimentos - a.atendimentos).slice(0, 10);

        if (chartResumoCusto) chartResumoCusto.destroy();
        if (chartResumoQtd) chartResumoQtd.destroy();

        if (window.ApexCharts) {
            chartResumoCusto = new ApexCharts(document.getElementById('chart-resumo-custo'), {
                series: [{ name: 'Custo', data: topCusto.map(r => r.custo) }],
                chart: { type: 'bar', height: 300, toolbar: { show: false }, fontFamily: 'Inter' },
                colors: ['#E63946'],
                plotOptions: { bar: { horizontal: true, borderRadius: 4, dataLabels: { position: 'top' } } },
                dataLabels: {
                    enabled: true,
                    offsetX: 20,
                    style: { fontSize: '10px', colors: ['#333'] },
                    formatter: (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                },
                xaxis: { categories: topCusto.map(r => r.modelo.substring(0, 20)), labels: { formatter: (val) => 'R$ ' + val } },
                yaxis: { max: Math.max(...topCusto.map(r => r.custo)) * 1.2 }
            });
            chartResumoCusto.render();

            chartResumoQtd = new ApexCharts(document.getElementById('chart-resumo-qtd'), {
                series: [{ name: 'Revisados', data: topQtd.map(r => r.atendimentos) }],
                chart: { type: 'bar', height: 300, toolbar: { show: false }, fontFamily: 'Inter' },
                colors: ['#1D3557'],
                plotOptions: { bar: { horizontal: true, borderRadius: 4, dataLabels: { position: 'top' } } },
                dataLabels: {
                    enabled: true,
                    offsetX: 20,
                    style: { fontSize: '10px', colors: ['#333'] }
                },
                xaxis: { categories: topQtd.map(r => r.modelo.substring(0, 20)) },
                yaxis: { max: Math.max(...topQtd.map(r => r.atendimentos)) * 1.2 }
            });
            chartResumoQtd.render();
        }

    } catch (e) {
        console.error("Erro renderResumoOperacao", e);
    }
};

// ==========================================
// ABA SMARTMANAGER PENDÊNCIAS
// ==========================================
const SMART_MANAGER_GO_LIVE_DATE = '2026-07-08T00:00:00-03:00';
const SMART_MANAGER_WINDOW_DAYS = 30;
let smartManagerData = [];

window.renderSmartManager = async () => {
    try {
        const today = new Date();
        const d30 = new Date();
        d30.setDate(today.getDate() - SMART_MANAGER_WINDOW_DAYS);
        const windowDate = d30.toISOString();
        
        // Determinar a data de corte efetiva: a mais recente entre Go-Live e 30 dias atrás
        const limitDate = (windowDate > SMART_MANAGER_GO_LIVE_DATE) ? windowDate : SMART_MANAGER_GO_LIVE_DATE;

        const table = window.currentSector === 'REMANU' ? 'historico_remanu' : getHistoricoTable();
        const { data, error } = await supabase.from(table)
            .select('*')
            .in('tipo', ['saída', 'saida', 'retorno_garantia'])
            .gte('ts', limitDate);

        if (error) throw error;
        smartManagerData = data || [];

        // Fetch equipamentos for models
        const { data: eqData } = await supabase.from('equipamentos').select('selb, modelo');
        const eqMap = {};
        (eqData || []).forEach(e => { eqMap[e.selb.toUpperCase().trim()] = e.modelo; });

        let totalPendentes = 0;
        let totalIntegradas = 0;
        let selbsPendentesCount = 0;
        let integracoesHoje = 0;
        let pendenciaMaisAntigaTs = null;

        const selbGroups = {};

        const hojeStr = new Date().toISOString().split('T')[0];

        smartManagerData.forEach(item => {
            const selb = (item.selb || '').toUpperCase().trim();
            if (!selb || selb === 'S/N' || selb === '0000' || selb === 'DEFE') return;

            if (item.manager_sync) {
                totalIntegradas++;
                if (item.manager_sync_at && item.manager_sync_at.startsWith(hojeStr)) {
                    integracoesHoje++;
                }
            } else {
                totalPendentes++;
                if (!pendenciaMaisAntigaTs || item.ts < pendenciaMaisAntigaTs) {
                    pendenciaMaisAntigaTs = item.ts;
                }
            }

            if (!selbGroups[selb]) {
                selbGroups[selb] = {
                    modelo: eqMap[selb] || 'NÃO IDENTIFICADO',
                    lastMov: item.ts,
                    items: [],
                    pendentes: 0,
                    sincronizadas: 0,
                    osSet: new Set(),
                    lastSyncAt: null,
                    lastSyncUser: null
                };
            }

            selbGroups[selb].items.push(item);
            if (item.ts > selbGroups[selb].lastMov) selbGroups[selb].lastMov = item.ts;

            if (item.manager_sync) {
                selbGroups[selb].sincronizadas++;
                if (item.os_manager) selbGroups[selb].osSet.add(item.os_manager);
                if (!selbGroups[selb].lastSyncAt || item.manager_sync_at > selbGroups[selb].lastSyncAt) {
                    selbGroups[selb].lastSyncAt = item.manager_sync_at;
                    selbGroups[selb].lastSyncUser = item.manager_sync_user;
                }
            } else {
                selbGroups[selb].pendentes++;
            }
        });

        const tbody = document.getElementById('sm-table-body');
        tbody.innerHTML = '';

        const selbsList = Object.keys(selbGroups).map(selb => ({ selb, ...selbGroups[selb] }));
        selbsList.sort((a, b) => b.lastMov.localeCompare(a.lastMov));

        selbsList.forEach(g => {
            if (g.pendentes > 0) selbsPendentesCount++;

            let statusIcon = '🟢';
            let situacao = 'Concluído';
            let color = 'var(--text-light)';
            if (g.pendentes > 0 && g.sincronizadas > 0) {
                statusIcon = '🟡';
                situacao = `${g.sincronizadas}/${g.sincronizadas + g.pendentes} sincronizadas`;
                color = 'var(--orange)';
            } else if (g.pendentes > 0 && g.sincronizadas === 0) {
                statusIcon = '🔴';
                situacao = `${g.pendentes} pendentes`;
                color = 'var(--red)';
            }

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.onclick = () => window.openSmartModal(g.selb);
            tr.innerHTML = `
                <td style="text-align:center; font-size: 16px;">${statusIcon}</td>
                <td style="font-weight: 700;">${g.selb}</td>
                <td>${g.modelo}</td>
                <td>${formatDateBR(g.lastMov)}</td>
                <td style="color: ${color}; font-weight: 600;">${situacao}</td>
            `;
            tbody.appendChild(tr);
        });

        // Atualizar Cards
        document.getElementById('sm-pecas-pendentes').innerText = totalPendentes;
        document.getElementById('sm-pecas-integradas').innerText = totalIntegradas;
        document.getElementById('sm-selbs-pendentes').innerText = selbsPendentesCount;
        document.getElementById('sm-integracoes-hoje').innerText = integracoesHoje;
        
        let diasMaisAntiga = 0;
        if (pendenciaMaisAntigaTs) {
            const msAntiga = new Date(pendenciaMaisAntigaTs).getTime();
            diasMaisAntiga = Math.floor((today.getTime() - msAntiga) / (1000 * 60 * 60 * 24));
        }
        document.getElementById('sm-pendencia-antiga').innerHTML = `${diasMaisAntiga} <span style="font-size:14px; color:#a1a1aa;">dias</span>`;

    } catch (e) {
        console.error(e);
        alert('Erro ao carregar Pendências SmartManager.');
    }
};

window.openSmartModal = (selb) => {
    // Filtrar dados do SELB da lista que já foi carregada
    const items = smartManagerData.filter(i => (i.selb || '').toUpperCase().trim() === selb);
    if (items.length === 0) return;

    const osSet = new Set();
    const pendentes = [];
    const sincronizadas = [];
    let lastSyncAt = null;
    let lastSyncUser = null;
    let lastMov = null;

    items.forEach(i => {
        if (!lastMov || i.ts > lastMov) lastMov = i.ts;
        if (i.manager_sync) {
            sincronizadas.push(i);
            if (i.os_manager) osSet.add(i.os_manager);
            if (!lastSyncAt || i.manager_sync_at > lastSyncAt) {
                lastSyncAt = i.manager_sync_at;
                lastSyncUser = i.manager_sync_user;
            }
        } else {
            pendentes.push(i);
        }
    });

    const osArray = Array.from(osSet);

    document.getElementById('sm-modal-selb').innerText = 'SELB ' + selb;
    document.getElementById('sm-modal-modelo').innerText = (items[0].modelo_cache || 'VERIFICAR'); // simplificando se não achar eq
    document.getElementById('sm-modal-last-mov').innerText = lastMov ? formatDateBR(lastMov) : '-';
    document.getElementById('sm-modal-stats').innerText = `${items.length} (Sincronizadas: ${sincronizadas.length} | Pendentes: ${pendentes.length})`;
    document.getElementById('sm-modal-os-used').innerText = osArray.length > 0 ? osArray.join(', ') : 'Nenhuma';

    if (lastSyncAt) {
        document.getElementById('sm-modal-last-sync').innerHTML = `Última sincronização<br><strong style="color:white">${formatDateBR(lastSyncAt)} - ${lastSyncUser || 'Auto'}</strong>`;
    } else {
        document.getElementById('sm-modal-last-sync').innerHTML = `Última sincronização<br>-`;
    }

    const sBody = document.getElementById('sm-modal-synced-body');
    sBody.innerHTML = '';
    sincronizadas.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i.code}</td>
            <td>${i.descricao || ''}</td>
            <td>${i.qty}</td>
            <td>${formatDateBR(i.manager_sync_at)}</td>
            <td style="font-weight: 700; color: #6366f1;">${i.os_manager || ''}</td>
        `;
        sBody.appendChild(tr);
    });

    const pBody = document.getElementById('sm-modal-pending-body');
    pBody.innerHTML = '';
    pendentes.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold;">${i.code}</td>
            <td>${i.descricao || ''}</td>
            <td>${i.qty}</td>
            <td>${formatDateBR(i.ts)}</td>
        `;
        pBody.appendChild(tr);
    });

    const osInput = document.getElementById('sm-modal-os-input');
    osInput.value = '';
    osInput.dataset.selb = selb;
    
    // Auto-preenchimento
    if (osArray.length === 1) {
        osInput.value = osArray[0];
    }

    document.getElementById('modal-smartmanager').style.display = 'flex';
};

window.vincularPendenciasSmart = async () => {
    const selb = document.getElementById('sm-modal-os-input').dataset.selb;
    const osVal = document.getElementById('sm-modal-os-input').value.trim();

    if (!osVal || osVal.length !== 8) {
        alert('Por favor, informe uma OS válida com exatos 8 números.');
        return;
    }

    const items = smartManagerData.filter(i => (i.selb || '').toUpperCase().trim() === selb);
    const pendentes = items.filter(i => !i.manager_sync);
    const sincronizadas = items.filter(i => i.manager_sync);

    if (pendentes.length === 0) {
        alert('Não existem pendências para vincular neste SELB.');
        return;
    }

    // Validação Inteligente: Mesma peça já foi vinculada à mesma OS neste SELB?
    let hasDuplicate = false;
    let duplicateCode = '';
    for (let p of pendentes) {
        if (sincronizadas.some(s => s.code === p.code && s.os_manager === osVal)) {
            hasDuplicate = true;
            duplicateCode = p.code;
            break;
        }
    }

    if (hasDuplicate) {
        const conf = confirm(`Atenção: A peça ${duplicateCode} já foi vinculada anteriormente à OS ${osVal} neste SELB.\n\nDeseja vinculá-la novamente mesmo assim?`);
        if (!conf) return;
    }

    const idsToUpdate = pendentes.map(p => p.id);
    const table = window.currentSector === 'REMANU' ? 'historico_remanu' : getHistoricoTable();

    try {
        const tsNow = new Date().toISOString();
        const { error } = await supabase.from(table).update({
            os_manager: osVal,
            manager_sync: true,
            manager_sync_at: tsNow,
            manager_sync_user: currentUser.email
        }).in('id', idsToUpdate);

        if (error) throw error;

        // Atualizar aba Histórico caso esteja renderizada e dar feedback visual
        alert('Pendências vinculadas com sucesso!');
        document.getElementById('modal-smartmanager').style.display = 'none';
        
        // Refresh local array
        pendentes.forEach(p => {
            p.manager_sync = true;
            p.os_manager = osVal;
            p.manager_sync_at = tsNow;
            p.manager_sync_user = currentUser.email;
        });

        window.renderSmartManager();
        if (typeof window.renderHistorico === 'function') window.renderHistorico();

    } catch (e) {
        console.error(e);
        alert('Erro ao vincular OS.');
    }
};

// Funcao auxiliar de formatacao (se não houver no main)
function formatDateBR(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return isoString;
    }
}
