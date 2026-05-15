import { supabase } from './supabase.js'

// --- ESTADO GLOBAL ---
let currentUser = null;
let currentTab = 'dashboard';
let searchTimeout = null;
let saidaItems = []; // Carrinho de saída SELB
window.currentSector = 'LAB'; // Setor atual (LAB ou REMANU)

window.changeSector = (sector) => {
    window.currentSector = sector;
    
    // Atualiza botões
    const btnLab = document.getElementById('btn-sector-lab');
    const btnRemanu = document.getElementById('btn-sector-remanu');
    if (btnLab) btnLab.classList.toggle('active', sector === 'LAB');
    if (btnRemanu) btnRemanu.classList.toggle('active', sector === 'REMANU');
    
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

// --- MODO CUSTO REAL ---
window.adjC = (val) => {
    const active = localStorage.getItem('mode_custo_ativo') === '1';
    return active ? Number(val) / 1.90 : Number(val);
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

    // Botão no menu admin
    if (!btn) return;
    if (active) {
        btn.style.background = '#10b981';
        btn.style.color = '#ffffff';
        btn.textContent = '💲 Modo Custo Real (ATIVADO)';
    } else {
        btn.style.background = 'var(--bg-hover)';
        btn.style.color = 'var(--text)';
        btn.textContent = '💲 Modo Custo Real (DESATIVADO)';
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

// --- INICIALIZAÇÃO ---
async function init() {
    console.log('🚀 Inicializando sistema...');
    renderChips();
    window.updateModeCustoBtn();

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
}

// --- AUTENTICAÇÃO ---
async function doLogin() {
    const email = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    if (!email || !pass) { loginErr.textContent = '❌ Preencha todos os campos'; return; }
    loginErr.textContent = '⌛ Autenticando...';
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) loginErr.textContent = '❌ ' + error.message;
}

async function doModalLogin() {
    const email = document.getElementById('modal-login-user').value;
    const pass = document.getElementById('modal-login-pass').value;
    const err = document.getElementById('modal-login-err');
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
        if (currentUser.email.endsWith('@selbetti.com.br')) adminBadge.style.display = 'inline-flex';
        if (currentUser.email === 'lucas.araujo@selbetti.com.br') {
            const ss = document.getElementById('sector-switcher');
            if (ss) ss.style.display = 'inline-flex';
        }
    } else {
        authScreen.style.display = 'flex';
        appShell.style.display = 'none';
        btnLogout.style.display = 'none';
        btnLoginArea.style.display = 'inline-flex';
        adminBadge.style.display = 'none';
        const ss = document.getElementById('sector-switcher');
        if (ss) ss.style.display = 'none';
    }
}

// --- NAVEGAÇÃO ---
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
}

async function loadInitialData() {
    updateDashboard();
}

let dashFilterLow = false;

// --- DASHBOARD ---
async function updateDashboard() {
    try {
        console.log('📊 Atualizando Dashboard...');
        const { count: totalParts } = await supabase.from('parts').select('*', { count: 'exact', head: true });
        
        const { data: stockData } = await supabase.from(getEstoqueTable()).select('qty').gt('qty', 0);
        const inStockCount = stockData?.length || 0;
        const volTotal = stockData?.reduce((acc, curr) => acc + curr.qty, 0) || 0;

        const { count: lowCount } = await supabase.from(getEstoqueTable()).select('*', { count: 'exact', head: true }).lt('qty', 5).gt('qty', 0);

        document.getElementById('dash-total').textContent = (totalParts || 0).toLocaleString('pt-BR');
        document.getElementById('dash-instock').textContent = inStockCount.toLocaleString('pt-BR');
        document.getElementById('dash-vol-total').textContent = volTotal.toLocaleString('pt-BR');
        document.getElementById('dash-low-count').textContent = (lowCount || 0).toLocaleString('pt-BR');

        if (document.getElementById('stat-in-stock')) document.getElementById('stat-in-stock').textContent = volTotal;
        if (document.getElementById('stat-zero')) {
             const { count: zeroCount } = await supabase.from(getEstoqueTable()).select('*', { count: 'exact', head: true }).eq('qty', 0);
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
            .select('qty, parts!inner(code, descricao)')
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
        const ts = new Date().toISOString();

        for (const item of saidaItems) {
            // 1) Baixa o estoque
            const { data: cur } = await supabase.from(getEstoqueTable()).select('qty').eq('code', item.code).single();
            const newQty = Math.max(0, (cur?.qty || 0) - item.qty);
            const { error: estoqueErr } = await supabase.from(getEstoqueTable()).upsert({ code: item.code, qty: newQty });
            if (estoqueErr) throw new Error(`Erro ao baixar estoque de ${item.code}: ${estoqueErr.message}`);

            // 2) Grava no histórico COM vlr_unit e vlr_total
            const { error: histErr } = await supabase.from(getHistoricoTable()).insert({
                tipo: 'sa\u00edda',
                code: item.code,
                descricao: item.descricao,
                qty: item.qty,
                vlr_unit: item.vlrUnit,
                vlr_total: item.vlrTotal,
                selb: selb,
                user_email: currentUser.email,
                ts: ts
            });
            if (histErr) throw new Error(`Erro ao gravar hist\u00f3rico de ${item.code}: ${histErr.message}`);
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
    document.getElementById('saida-total').textContent = 'R$ ' + window.adjC(saidaItems.reduce((s, i) => s + i.vlrTotal, 0)).toFixed(2);
    tbody.innerHTML = saidaItems.map((item, idx) => `<tr><td>${item.code}</td><td>${item.descricao}</td><td class="text-center">${item.qty}</td><td class="text-right">R$ ${window.adjC(item.vlrTotal).toFixed(2)}</td><td><button onclick="window.removeSaidaItem(${idx})">❌</button></td></tr>`).join('');
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

        const formatChange = `AJUSTE MANUAL: ${obs} (Qtd: ${currentEditPrevQty} ➡️ ${qty} | Preço: R$ ${currentEditPrevPrice.toFixed(2)} ➡️ R$ ${price.toFixed(2)})`;

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

    const { data } = await q;
    if (!data) return;

    document.getElementById('hist-count').textContent = `${data.length} registros (limite de visualização)`;
    tbody.innerHTML = data.map(h => `
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
                ${h.tipo === 'ajuste' ? `<div style="font-size: 0.7rem; color: var(--text-muted); line-height:1.2">${h.descricao}</div>` : ''}
            </td>
            <td>
                ${currentUser.email === 'lucas.araujo@selbetti.com.br' ? `<button class="btn-edit-hist" onclick="openAjusteHistorico('${h.id}')" title="Ajustar Registro">✏️</button>` : ''}
            </td>
        </tr>
    `).join('');
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

            let colProduto = -1, colQtd = -1, colVlrUnit = -1;
            let dataStartIdx = -1;

            for (let ri = 0; ri < Math.min(rows.length, 100); ri++) {
                const cells = rows[ri].querySelectorAll('Cell');
                const texts = Array.from(cells).map(c => c.querySelector('Data')?.textContent.trim().toUpperCase() || '');
                if (texts.some(t => t.includes('PRODUTO') || t === 'COD. PRODUTO')) {
                    texts.forEach((t, i) => {
                        if (t.includes('PRODUTO') && colProduto < 0) colProduto = i;
                        if ((t.includes('QUANTIDADE') || t === 'QTD') && colQtd < 0) colQtd = i;
                        if (t.includes('UNIT') && colVlrUnit < 0) colVlrUnit = i;
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

                if (!itemsMap[rawCode]) itemsMap[rawCode] = { qty: 0, vlrUnit: vlrUnit };
                itemsMap[rawCode].qty += qty;
            }

            const keys = Object.keys(itemsMap);
            if (keys.length === 0) { alert('Nenhum item válido encontrado.'); return; }

            document.getElementById('xml-drop-area').innerHTML = `<h3 style="color:#2e7d32;text-align:center">Processando ${keys.length} itens no banco de dados... Aguarde.</h3>`;

            let processados = 0;
            const targetSector = document.querySelector('input[name="xml-sector"]:checked').value;
            const tableEstoque = targetSector === 'REMANU' ? 'estoque_remanu' : 'estoque';
            const tableHist = targetSector === 'REMANU' ? 'historico_remanu' : 'historico';

            for (const code of keys) {
                const { qty, vlrUnit } = itemsMap[code];

                const { data: cur } = await supabase.from(tableEstoque).select('qty').eq('code', code).single();
                const newQty = (cur?.qty || 0) + qty;

                await supabase.from(tableEstoque).upsert({ code, qty: newQty });
                if (vlrUnit > 0) {
                    await supabase.from('custos').upsert({ code, last_cost: vlrUnit });
                }

                if (currentUser) {
                    await supabase.from(tableHist).insert({
                        tipo: 'entrada', code, descricao: 'Entrada Lote XML', qty,
                        user_email: currentUser.email, dt: new Date().toLocaleString('pt-BR'),
                        vlr_unit: vlrUnit, vlr_total: vlrUnit * qty
                    });
                }
                processados++;
            }

            alert(`Importação concluída! ${processados} itens processados com sucesso.`);
            window.location.reload();
        } catch (err) {
            alert('Erro na importação: ' + err.message);
            window.location.reload();
        }
    };
    reader.readAsText(file, 'utf-8');
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

    const { data } = await q;
    if (!data) return;

    let totIn = 0, totOut = 0, vlrIn = 0, vlrOut = 0;
    const daily = {};
    const weekly = {};

    data.forEach(h => {
        const qty = h.qty || 0;
        const vlr = h.vlr_total || 0;
        const dt = h.ts ? h.ts.split('T')[0] : 'Sem Data';

        if (h.tipo === 'entrada') { totIn += qty; vlrIn += vlr; }
        else if (h.tipo === 'saída' || h.tipo === 'saida') { totOut += qty; vlrOut += vlr; }

        if (dt !== 'Sem Data') {
            if (!daily[dt]) daily[dt] = { in: 0, out: 0, vlrIn: 0, vlrOut: 0 };
            if (h.tipo === 'entrada') { daily[dt].in += qty; daily[dt].vlrIn += vlr; }
            else if (h.tipo === 'saída' || h.tipo === 'saida') { daily[dt].out += qty; daily[dt].vlrOut += vlr; }

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
window.processarBI = async (file) => {
    if (!file) return;
    const status = document.getElementById('bi-status');
    status.innerHTML = '⌛ Lendo arquivo...';
    
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
                
                // Tenta achar o SELB (geralmente é a primeira coluna ou a que tem texto curto)
                const selb = cells[0] || '';
                
                // Tenta achar o Modelo (procura nas colunas B, C ou D)
                let modelo = cells[3] || cells[2] || cells[1] || '';

                // Se a linha for o cabeçalho (ex: contiver a palavra SELB), pula
                if (selb === 'SELB' || selb === 'CODIGO' || !selb) return;

                // Se achou SELB mas o modelo tá vazio, tenta pegar qualquer outra célula da linha
                if (selb && !modelo) {
                    modelo = cells.find((c, i) => i > 0 && c.length > 2) || '';
                }
                
                if (selb && modelo && !seen.has(selb)) {
                    seen.add(selb);
                    validRows.push({ selb, modelo, descricao: cells[3] || cells[2] || 'IMPORTAÇÃO MASSIVA' });
                }
            });

            if (!validRows.length) { 
                status.innerHTML = '❌ Nenhum dado válido encontrado.<br><small>Verifique se o SELB está na Coluna A.</small>'; 
                return; 
            }
            status.innerHTML = `⌛ Enviando ${validRows.length} registros...`;

            // Envia em lotes de 500 para não estourar a API
            let count = 0;
            for (let i = 0; i < validRows.length; i += 500) {
                const chunk = validRows.slice(i, i + 500);
                const { error } = await supabase.from('equipamentos').upsert(chunk);
                if (error) throw error;
                count += chunk.length;
                status.innerHTML = `⌛ Enviando... (${count}/${validRows.length})`;
            }

            status.innerHTML = '✅ Base BI atualizada com sucesso!';
            renderEquipamentos();
        } catch (err) {
            console.error(err);
            status.innerHTML = '❌ Erro: ' + err.message;
            if (err.message.includes('not found')) {
                alert('⚠️ Tabela "equipamentos" não encontrada no Supabase. Por favor, crie-a no SQL Editor primeiro.');
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
            supabase.from(getHistoricoTable()).select('*').eq('tipo', 'saída'),
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

        // Saídas (Com Peça)
        saídas.filter(s => filtrarData(s.ts)).forEach(s => {
            const selb = (s.selb || '').toUpperCase().trim();
            if (!selb || selb === 'S/N' || selb === '0000') return;

            const modelo = eqMap[selb] || 'MODELO NÃO IDENTIFICADO (' + selb + ')';
            if (query && !modelo.includes(query)) return;

            if (!byModel[modelo]) byModel[modelo] = { atendimentos: 0, comPeca: new Set(), semPeca: new Set(), pecas: 0, custo: 0 };
            byModel[modelo].comPeca.add(selb);
            byModel[modelo].pecas += (s.qty || 1);
            byModel[modelo].custo += (s.vlr_total || 0);
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

        const rows = Object.entries(byModel).map(([modelo, d]) => {
            const totalAtend = d.comPeca.size + d.semPeca.size;
            return {
                modelo,
                atendimentos: totalAtend,
                comPeca: d.comPeca.size,
                semPeca: d.semPeca.size,
                pecas: d.pecas,
                custo: d.custo,
                custoMedio: totalAtend > 0 ? d.custo / totalAtend : 0
            };
        }).sort((a, b) => b.custo - a.custo);

        const fmt = v => 'R$ ' + Number(window.adjC(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const top = rows[0];
        const bottom = rows.length > 1 ? rows.filter(r => r.custo > 0).pop() : (rows[0] || null);
        window.topModelData = top;
        window.bottomModelData = bottom;
        const totalCusto = rows.reduce((s, r) => s + r.custo, 0);
        const totalAtend = rows.reduce((s, r) => s + r.atendimentos, 0);

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
        const tbody = document.getElementById('mod-tbody');
        tbody.innerHTML = rows.slice(0, 50).map(r => `
            <tr>
                <td style="font-size: 13px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.modelo}</td>
                <td style="text-align:center; font-family: var(--mono);">${r.atendimentos}</td>
                <td style="text-align:center; font-family: var(--mono);">${r.pecas}</td>
                <td style="text-align:right; font-family: var(--mono); font-weight: bold;">${fmt(r.custo)}</td>
            </tr>
        `).join('');

        // GRÁFICO TOP 10 (POR CUSTO MÉDIO)
        if (chartModelo) chartModelo.destroy();
        const ctx = document.getElementById('chart-modelo')?.getContext('2d');
        if (ctx) {
            const top10 = [...rows].sort((a,b) => b.custoMedio - a.custoMedio).slice(0, 10);
            
            // Gradiente do Vermelho ao Verde
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
    } catch (e) { console.error('❌ Erro Relatório Custo:', e); }
};

window.exportarRelatorioModelo = () => {
    const tbody = document.getElementById('mod-tbody');
    if (!tbody || !tbody.rows.length) { alert('Gere o relatório primeiro.'); return; }
    const rows = Array.from(tbody.rows).map(tr => ({
        'Modelo': tr.cells[0].innerText,
        'Atendimentos': tr.cells[1].innerText,
        'Sem Peça': tr.cells[2].innerText,
        'Qtd Peças': tr.cells[3].innerText,
        'Custo Médio': tr.cells[4].innerText,
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
    
    const fmt = v => 'R$ ' + Number(window.adjC(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtNum = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    document.getElementById('detalhe-com-peca').textContent = model.comPeca;
    document.getElementById('detalhe-sem-peca').textContent = model.semPeca > 0 ? model.semPeca : '—';
    document.getElementById('detalhe-total-maquinas').textContent = model.atendimentos;
    document.getElementById('detalhe-pecas').textContent = model.pecas;
    document.getElementById('detalhe-custo-geral').textContent = fmt(model.custoMedio);
    document.getElementById('detalhe-custo-com-peca').textContent = model.comPeca > 0 ? fmt(model.custo / model.comPeca) : 'R$ 0,00';
    document.getElementById('detalhe-media-pecas').textContent = model.atendimentos > 0 ? fmtNum(model.pecas / model.atendimentos) : '0,00';
    
    const totalEl = document.getElementById('detalhe-custo-total');
    totalEl.textContent = fmt(model.custo);
    totalEl.style.color = type === 'expensive' ? '#e74c3c' : (type === 'cheap' ? '#27ae60' : '#f39c12');

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

// --- INICIALIZAÇÃO ---
init();
