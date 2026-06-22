import fs from 'fs';

function find64() {
  console.log("Reading backup...");
  const backupStr = fs.readFileSync('BACKUP_ESTOQUE_LAB_05-06-2026.json', 'utf8');
  const backup = JSON.parse(backupStr);
  
  const bHistorico = backup.tabelas.historico || [];
  const bCustos = backup.tabelas.custos || [];
  const bParts = backup.tabelas.parts || [];
  
  // parts map
  const partsMap = {};
  bParts.forEach(p => partsMap[p.code] = p.description);

  // current backup custos
  const currentCostMap = {};
  bCustos.forEach(c => currentCostMap[c.code] = c.last_cost);

  // history from backup
  const historyByCode = {};
  bHistorico.forEach(h => {
    if (h.tipo === 'entrada') {
       if (!historyByCode[h.code]) historyByCode[h.code] = [];
       historyByCode[h.code].push(h);
    }
  });
  
  let found = [];
  
  // No backup de 5 de junho, essas peças já tinham um current_cost BAIXO (porque as notas já tinham sido importadas pelo Protheus), 
  // MAS o histórico delas ainda tinha as entradas antigas com custo ALTO. 
  // Quando o usuário clicou em 'Corrigir', o histórico delas no Supabase foi apagado (sobrescrito com o custo baixo).
  // Mas no backup, o histórico tem o custo alto.
  // Então, basta achar peças no backup onde o max(vlr_unit) do histórico é bem maior que o last_cost da tabela custos do backup!

  for (const c of bCustos) {
    const code = c.code;
    const currentCost = c.last_cost;
    const hist = historyByCode[code] || [];
    
    if (hist.length > 0) {
      const maxBackupHist = Math.max(...hist.map(h => h.vlr_unit || 0));
      // Se no dia do backup, o custo já estava corrigido (caiu > 5%)
      if (currentCost < maxBackupHist * 0.95) {
         found.push({ code, desc: partsMap[code] || '', currentCost, oldCost: maxBackupHist });
      }
    }
  }
  
  console.log(`Found ${found.length} items from backup logic!`);
  fs.writeFileSync('pecas_recuperadas_64.json', JSON.stringify(found, null, 2));
  
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Peças Recuperadas</title></head><body style="font-family:sans-serif; padding: 20px;">`;
  html += `<h2>As ${found.length} peças que tiveram o histórico corrigido:</h2><table border="1" cellpadding="8" style="border-collapse: collapse;">`;
  html += `<tr><th>Código</th><th>Descrição</th><th>Preço Antigo (Venda)</th><th>Custo Real (Atualizado)</th></tr>`;
  found.forEach(f => {
    html += `<tr><td><b>${f.code}</b></td><td>${f.desc}</td><td>R$ ${f.oldCost}</td><td style="color:green;">R$ ${f.currentCost}</td></tr>`;
  });
  html += `</table></body></html>`;
  fs.writeFileSync('pecas_recuperadas_64.html', html);
  console.log("Saved to pecas_recuperadas_64.html");
}

find64();
