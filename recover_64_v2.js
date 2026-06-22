import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjU2NjcsImV4cCI6MjA5MzI0MTY2N30.L4hV7YM9yjdOOW9zBl84L-1si2DU8nBI3J1WgmW02lY';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function find64() {
  console.log("Reading backup...");
  const backupStr = fs.readFileSync('BACKUP_ESTOQUE_LAB_05-06-2026.json', 'utf8');
  const backup = JSON.parse(backupStr);
  
  const bHistorico = backup.tabelas.historico || [];
  const bParts = backup.tabelas.parts || [];
  
  const partsMap = {};
  bParts.forEach(p => partsMap[p.code] = p.description);

  // Group history from backup by code (only entradas)
  const historyByCode = {};
  bHistorico.forEach(h => {
    if (h.tipo === 'entrada') {
       if (!historyByCode[h.code]) historyByCode[h.code] = [];
       historyByCode[h.code].push(h);
    }
  });
  
  console.log("Fetching current costs from Supabase...");
  const { data: custos, error } = await supabase.from('custos').select('code, last_cost');
  if (error) { console.error("Error fetching custos:", error); return; }
  
  let found = [];
  
  for (const c of (custos || [])) {
    const code = c.code;
    const currentCost = c.last_cost;
    const hist = historyByCode[code] || [];
    
    if (hist.length > 0) {
      const maxBackupHist = Math.max(...hist.map(h => h.vlr_unit || 0));
      // Se o custo ATUAL for menor que o custo máximo histórico registrado no BACKUP:
      if (currentCost < maxBackupHist * 0.95) {
         found.push({ code, desc: partsMap[code] || 'Sem descrição', currentCost, oldCost: maxBackupHist });
      }
    }
  }
  
  console.log(`Found ${found.length} items combining Supabase and Backup!`);
  
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
