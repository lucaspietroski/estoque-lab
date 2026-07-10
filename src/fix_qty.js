import fs from 'fs';

const path = 'c:\\\\Users\\\\lucas.araujo\\\\Downloads\\\\ESTOQUE-LAB-SUPABASE\\\\src\\\\main.js';
let content = fs.readFileSync(path, 'utf8');

const groupRegex = /smartManagerData\.forEach\(item => \{[\s\S]*?\}\);/m;
const groupReplacement = `
        const activeSelbs = new Set();
        smartManagerData.forEach(item => {
            if (item.ts >= SMART_MANAGER_GO_LIVE_DATE && item.tipo !== 'sm_obs') {
                const selb = (item.selb || '').toUpperCase().trim();
                if (selb && selb !== 'S/N' && selb !== '0000' && selb !== 'DEFE') {
                    activeSelbs.add(selb);
                }
            }
        });

        smartManagerData.forEach(item => {
            const selb = (item.selb || '').toUpperCase().trim();
            if (!selb || selb === 'S/N' || selb === '0000' || selb === 'DEFE') return;
            if (!activeSelbs.has(selb)) return; // Ignora se o SELB não tem movimento pós Go-Live

            if (!selbGroups[selb]) {
                selbGroups[selb] = {
                    modelo: eqMap[selb] || 'NÃO IDENTIFICADO',
                    lastMov: item.ts,
                    items: [],
                    pendentes: 0,
                    sincronizadas: 0,
                    osSet: new Set(),
                    lastSyncAt: null,
                    lastSyncUser: null,
                    obs: ''
                };
            }

            selbGroups[selb].items.push(item);
            if (item.ts > selbGroups[selb].lastMov) selbGroups[selb].lastMov = item.ts;

            if (item.tipo === 'sm_obs') {
                if (!selbGroups[selb].obs || item.ts >= selbGroups[selb].lastMov) {
                    selbGroups[selb].obs = item.descricao;
                }
                return;
            }

            const q = Number(item.qty || 1);

            if (item.manager_sync) {
                totalIntegradas += q;
                if (item.manager_sync_at && item.manager_sync_at.startsWith(hojeStr)) {
                    integracoesHoje += q;
                }
                selbGroups[selb].sincronizadas += q;
                if (item.os_manager) selbGroups[selb].osSet.add(item.os_manager);
                
                if (!selbGroups[selb].lastSyncAt || item.manager_sync_at > selbGroups[selb].lastSyncAt) {
                    selbGroups[selb].lastSyncAt = item.manager_sync_at;
                    selbGroups[selb].lastSyncUser = item.manager_sync_user;
                }
            } else {
                totalPendentes += q;
                selbGroups[selb].pendentes += q;
                
                if (!pendenciaMaisAntigaTs || item.ts < pendenciaMaisAntigaTs) {
                    pendenciaMaisAntigaTs = item.ts;
                }
            }
        });`;

content = content.replace(groupRegex, groupReplacement.trim());

// Let's also check if modal stats regex matched before
const modalStatsRegex = /document\.getElementById\('sm-modal-stats'\)\.innerText = `\$\{items\.length\}.*?;/g;
if (content.match(modalStatsRegex)) {
    const modalStatsReplacement = `
    let sumPendentes = 0;
    pendentes.forEach(i => sumPendentes += Number(i.qty || 1));
    let sumSincronizadas = 0;
    sincronizadas.forEach(i => sumSincronizadas += Number(i.qty || 1));
    let totalPecas = sumPendentes + sumSincronizadas;

    document.getElementById('sm-modal-stats').innerText = \`Peças: \${totalPecas} (Sincronizadas: \${sumSincronizadas} | Pendentes: \${sumPendentes})\`;`;
    content = content.replace(modalStatsRegex, modalStatsReplacement.trim());
} else {
    console.log("Modal stats regex did not match!");
}

fs.writeFileSync(path, content, 'utf8');
console.log('File successfully updated!');
