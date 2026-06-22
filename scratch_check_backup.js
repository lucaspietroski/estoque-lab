import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkBackup() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    // Pegar os alterados hoje
    const { data: recent, error } = await supabase
        .from('equipamentos')
        .select('*')
        .gte('updated_at', startOfDay.toISOString());
        
    console.log(`Buscando ${recent.length} registros no backup...`);
    
    // Ler o backup
    console.log("Lendo arquivo de backup...");
    const backupData = JSON.parse(fs.readFileSync('BACKUP_ESTOQUE_LAB_05-06-2026.json', 'utf8'));
    // Depending on the structure of the backup (array or object)
    let backupMap = new Map();
    
    // Find the 'equipamentos' array in the backup
    let equipArray = [];
    if (Array.isArray(backupData)) equipArray = backupData;
    else if (backupData.equipamentos) equipArray = backupData.equipamentos;
    // or maybe the backup is firebase export format
    else if (backupData.selb_data) {
        equipArray = Object.values(backupData.selb_data);
    } else {
        // Just try to find anything that looks like equipments
        const keys = Object.keys(backupData);
        for(const k of keys) {
             if(Array.isArray(backupData[k]) && backupData[k].length > 0 && backupData[k][0].selb) {
                 equipArray = backupData[k]; break;
             }
        }
    }
    
    console.log(`Encontrados ${equipArray.length} equipamentos no backup.`);
    
    for (const eq of equipArray) {
        if (eq.selb || eq.codigo) {
            backupMap.set(eq.selb || eq.codigo, eq);
        }
    }
    
    let toRestore = [];
    let isNew = [];
    
    for (const r of recent) {
        if (backupMap.has(r.selb)) {
            const b = backupMap.get(r.selb);
            toRestore.push({ selb: r.selb, old_modelo: r.modelo, backup_modelo: b.modelo || b.descricao || b.MODELO });
        } else {
            isNew.push(r.selb);
        }
    }
    
    console.log(`\nDos ${recent.length} equipamentos alterados hoje:`);
    console.log(`- ${toRestore.length} existiam no backup e tiveram seus nomes sobrescritos.`);
    console.log(`- ${isNew.length} não existiam no backup (são novos de hoje).`);
    
    if (toRestore.length > 0) {
        console.log("Exemplo de equipamentos para restaurar:");
        console.table(toRestore.slice(0, 5));
    }
}

checkBackup().catch(console.error);
