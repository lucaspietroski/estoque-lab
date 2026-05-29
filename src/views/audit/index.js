const API_URL = import.meta.env ? import.meta.env.VITE_API_URL || 'http://localhost:3000' : 'http://localhost:3000';

export async function runSecurityAudit() {
    const btn = document.getElementById('btn-run-audit');
    const btnAnalysis = document.getElementById('btn-run-analysis');
    const resultsContainer = document.getElementById('audit-results');
    const scoreVal = document.getElementById('audit-score-val');
    
    btn.disabled = true;
    btn.innerHTML = '⏳ Escaneando projeto...';
    
    try {
        const res = await fetch(`${API_URL}/api/audit/inventory`);
        if (!res.ok) throw new Error('Falha ao comunicar com o Audit Core');
        
        const data = await res.json();
        
        scoreVal.textContent = 'Inventário Concluído';
        scoreVal.style.color = 'var(--green)';
        
        let html = '';
        html += `<div class="audit-card info">ℹ Inventário estrutural mapeou ${data.inventory.files.length} arquivos elegíveis.</div>`;
        html += `<div class="audit-card info">ℹ Clique em "Analisar Arquivos" para executar o Evidence Engine.</div>`;
        
        resultsContainer.innerHTML = html;
        btnAnalysis.style.display = 'inline-flex';
        
    } catch (error) {
        resultsContainer.innerHTML = `<div class="audit-card error">❌ Erro: ${error.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🚀 Executar Inventário';
    }
}

export async function runFileAnalysis() {
    const btn = document.getElementById('btn-run-analysis');
    const resultsContainer = document.getElementById('audit-results');
    const scoreVal = document.getElementById('audit-score-val');
    
    btn.disabled = true;
    btn.innerHTML = '⏳ Executando Evidence Engine...';
    
    try {
        const res = await fetch(`${API_URL}/api/audit/analyze`);
        if (!res.ok) throw new Error('Falha ao comunicar com o Analyzer Engine');
        
        const data = await res.json();
        
        scoreVal.textContent = 'Análise Concluída';
        scoreVal.style.color = '#8b5cf6';
        
        let html = '';
        
        // Bloco 1: Resumo Estatístico
        html += `<div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <div style="flex: 1; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: 800; color: var(--text);">${data.stats.totalAnalyzed}</div>
                <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-top: 5px;">Arquivos Analisados</div>
            </div>
            <div style="flex: 1; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: 800; color: var(--text);">${data.findings.length}</div>
                <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-top: 5px;">Achados Encontrados</div>
            </div>
        </div>`;
        
        // Bloco 2 e 3: Categorias e Severidades
        html += `<div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <div style="flex: 1; padding: 20px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px;">
                <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 15px;">Por Categoria</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; font-weight: 600;">
                    <div>💻 Frontend: ${data.stats.categories.frontend}</div>
                    <div>⚙️ Backend: ${data.stats.categories.backend}</div>
                    <div>🗄️ SQL: ${data.stats.categories.sql}</div>
                    <div>📄 Configs: ${data.stats.categories.configs}</div>
                    <div>📜 Scripts: ${data.stats.categories.scripts}</div>
                </div>
            </div>
            <div style="flex: 1; padding: 20px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px;">
                <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 15px;">Por Severidade</div>
                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px; font-weight: 700;">
                    ${data.stats.findingsBySeverity.critical > 0 ? `<div style="color: #991b1b;">🚨 Crítica (${data.stats.findingsBySeverity.critical})</div>` : ''}
                    <div style="color: #ef4444;">🔴 Alta (${data.stats.findingsBySeverity.high})</div>
                    <div style="color: #f59e0b;">🟡 Média (${data.stats.findingsBySeverity.medium})</div>
                    <div style="color: #10b981;">🟢 Baixa (${data.stats.findingsBySeverity.low})</div>
                    ${data.stats.findingsBySeverity.info > 0 ? `<div style="color: #3b82f6;">🔵 Info (${data.stats.findingsBySeverity.info})</div>` : ''}
                </div>
            </div>
        </div>`;
        
        // Bloco de Ignorados (Apenas um indicativo de rastreabilidade)
        if (data.ignoredFindings && data.ignoredFindings.length > 0) {
             html += `<div style="margin-bottom: 20px; font-size: 12px; color: var(--text-muted); text-align: right;">
                 * ${data.ignoredFindings.length} ações ignoradas deliberadamente (Filtros Anti-Ruído).
             </div>`;
        }
        
        // Bloco 4: Evidências (Findings)
        if (data.findings.length > 0) {
            html += `<h3 style="margin-top: 10px; margin-bottom: 15px; font-size: 16px; border-bottom: 2px solid var(--border); padding-bottom: 10px;">Evidências Encontradas (Findings)</h3>`;
            html += `<div style="display: flex; flex-direction: column; gap: 15px;">`;
            
            data.findings.forEach(f => {
                let badgeColor = f.severity === 'critical' ? '#991b1b' : (f.severity === 'high' ? '#ef4444' : (f.severity === 'medium' ? '#f59e0b' : (f.severity === 'info' ? '#3b82f6' : '#10b981')));
                let aiBadge = f.sendToAI ? `<span style="background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 10px;">✨ IA Target</span>` : '';
                let reasonBadge = f.reason ? `<span style="background: var(--surface); color: var(--text-muted); border: 1px solid var(--border); padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 10px;">${f.reason}</span>` : '';
                
                html += `
                <div style="border: 1px solid var(--border); border-left: 4px solid ${badgeColor}; border-radius: 8px; padding: 15px; background: white;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <div style="font-weight: 800; font-family: var(--mono); color: var(--text); font-size: 14px;">[${f.id}] ${f.type.toUpperCase().replace(/_/g, ' ')}${aiBadge}${reasonBadge}</div>
                            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Confiança: ${f.confidence.toUpperCase()} | Severidade: ${f.severity.toUpperCase()}</div>
                        </div>
                    </div>
                    <div style="background: var(--bg); padding: 10px; border-radius: 6px; border: 1px solid var(--border2); font-size: 13px;">
                        <div style="margin-bottom: 5px;"><strong>Arquivo:</strong> <span style="font-family: var(--mono);">${f.file}</span></div>
                        ${f.line ? `<div style="margin-bottom: 5px;"><strong>Linha:</strong> <span style="font-family: var(--mono);">${f.line}</span></div>` : ''}
                        ${f.snippet ? `<div style="background: #1e293b; color: #e2e8f0; font-family: var(--mono); padding: 8px; border-radius: 4px; margin-top: 10px; overflow-x: auto; white-space: pre-wrap;">${f.snippet}</div>` : ''}
                    </div>
                </div>`;
            });
            html += `</div>`;
        }
        
        resultsContainer.innerHTML = html;
        
    } catch (error) {
        resultsContainer.innerHTML = `<div class="audit-card error">❌ Erro: ${error.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔍 Analisar Arquivos';
    }
}
window.runFileAnalysis = runFileAnalysis;
