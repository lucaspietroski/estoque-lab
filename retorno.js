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
            `<span style="background: #8b5cf6; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px;">SOBRA</span>` : 
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

