const API_URL = import.meta.env ? import.meta.env.VITE_API_URL || 'http://localhost:3000' : 'http://localhost:3000';

export async function runSecurityAudit() {
    const btn = document.getElementById('btn-run-audit');
    const resultsContainer = document.getElementById('audit-results');
    const scoreVal = document.getElementById('audit-score-val');
    
    btn.disabled = true;
    btn.innerHTML = '⏳ Escaneando projeto...';
    
    try {
        const res = await fetch(`${API_URL}/api/audit/inventory`);
        if (!res.ok) throw new Error('Falha ao comunicar com o Audit Core');
        
        const data = await res.json();
        
        // Calcular um score de risco básico
        let riskScore = 100;
        let riskAlerts = 0;
        
        if (data.riskIndicators.hasEnv) riskAlerts++;
        if (data.riskIndicators.hasScripts) riskAlerts++;
        riskAlerts += data.riskIndicators.sensitiveFiles.length;
        
        riskScore = Math.max(0, 100 - (riskAlerts * 8));
        
        // Atualizar UI
        scoreVal.textContent = `${riskScore}/100`;
        scoreVal.style.color = riskScore > 80 ? 'var(--green)' : (riskScore > 50 ? '#f59e0b' : '#ef4444');
        
        // Montar cards de resultado
        let html = '';
        
        // Tech
        if (data.technologies.frontend) html += `<div class="audit-card check">✔ Frontend detectado: ${data.technologies.frontend}</div>`;
        if (data.technologies.backend) html += `<div class="audit-card check">✔ Backend detectado: ${data.technologies.backend}</div>`;
        if (data.technologies.database) html += `<div class="audit-card check">✔ Banco detectado: ${data.technologies.database}</div>`;
        if (data.technologies.hasDocker) html += `<div class="audit-card check">✔ Docker detectado</div>`;
        
        // Risks
        if (data.riskIndicators.hasEnv) html += `<div class="audit-card warn">⚠ Arquivos .env encontrados</div>`;
        if (data.riskIndicators.hasScripts) html += `<div class="audit-card warn">⚠ Scripts shell encontrados</div>`;
        
        if (data.riskIndicators.sensitiveFiles.length > 0) {
            html += `<div class="audit-card warn">⚠ ${data.riskIndicators.sensitiveFiles.length} arquivos sensíveis expostos</div>`;
            html += `<pre class="audit-logs">${data.riskIndicators.sensitiveFiles.join('\n')}</pre>`;
        }
        
        html += `<div class="audit-card info">ℹ Total mapeado: ${data.inventory.files.length} arquivos em ${data.inventory.folders.length} pastas</div>`;
        
        resultsContainer.innerHTML = html;
        
    } catch (error) {
        resultsContainer.innerHTML = `<div class="audit-card error">❌ Erro: ${error.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🚀 Executar Inventário';
    }
}
