import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { createClient } from "@supabase/supabase-js";

const firebaseConfig = {
  apiKey: "AIzaSyAjxhYEf5z_BG_ciqPQUuqW8ar1VKrjJfk",
  authDomain: "estoque-laboratorio.firebaseapp.com",
  projectId: "estoque-laboratorio",
  storageBucket: "estoque-laboratorio.firebasestorage.app",
  messagingSenderId: "358346799293",
  appId: "1:358346799293:web:93a51ede8e17082a2e9fd4",
  measurementId: "G-THZPKPPT3S"
};

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncHistorico() {
    console.log('🔥 Iniciando sincronização inteligente do histórico...');

    // 1. Fetch todos os custos atuais para preencher as saídas
    const { data: custosDb } = await supabase.from('custos').select('code, last_cost');
    const custosMap = {};
    if (custosDb) custosDb.forEach(c => custosMap[c.code] = c.last_cost);

    // 2. Fetch histórico do Firebase
    console.log('Buscando Firebase...');
    const snap = await getDocs(collection(db, "historico"));
    
    // 3. Fetch histórico atual do Supabase para não duplicar
    console.log('Buscando Supabase...');
    const { data: supaHist } = await supabase.from('historico').select('id, ts, code, qty, tipo');
    
    // Set for deduplication (naively based on ts + code + qty)
    const existing = new Set();
    if (supaHist) {
        supaHist.forEach(h => {
            const d = new Date(h.ts).toISOString();
            existing.add(`${d}_${h.code}_${h.qty}_${h.tipo}`);
        });
    }

    const toInsert = [];
    
    snap.docs.forEach(doc => {
        const data = doc.data();
        
        // Parse date reliably
        let firebaseTs = data.ts || data.timestamp;
        let createdAt = null;
        
        if (firebaseTs && typeof firebaseTs.toDate === 'function') {
            createdAt = firebaseTs.toDate();
        } else if (firebaseTs && firebaseTs.seconds) {
            createdAt = new Date(firebaseTs.seconds * 1000);
        } else if (data.dt) {
            // dt string format usually "DD/MM/YYYY HH:MM:SS"
            const parts = data.dt.split(/[\s/:]+/);
            if (parts.length >= 3) {
                // assume DD MM YYYY
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1;
                const year = parseInt(parts[2]);
                const h = parts[3] ? parseInt(parts[3]) : 0;
                const m = parts[4] ? parseInt(parts[4]) : 0;
                const s = parts[5] ? parseInt(parts[5]) : 0;
                createdAt = new Date(year, month, day, h, m, s);
            }
        }
        
        if (!createdAt || isNaN(createdAt.getTime())) {
            createdAt = new Date(); // fallback
        }

        const isoDate = createdAt.toISOString();
        const tipo = data.tipo || 'saída';
        const code = data.code || '';
        const qty = parseInt(data.qty) || 1;
        
        // Check if exists
        const key = `${isoDate}_${code}_${qty}_${tipo}`;
        if (existing.has(key)) return; // already in supabase

        // Calc costs
        let vUnit = parseFloat(data.vlr_unit) || parseFloat(data.vlrUnit) || 0;
        let vTot = parseFloat(data.vlr_total) || parseFloat(data.vlrTotal) || 0;

        if (tipo === 'saída' && vTot === 0) {
            vUnit = custosMap[code] || 0;
            vTot = vUnit * qty;
        }

        toInsert.push({
            tipo, code, 
            descricao: data.desc || data.descricao || '',
            qty, 
            user_email: data.user || 'migrado',
            selb: data.selb || '',
            vlr_unit: vUnit,
            vlr_total: vTot,
            ts: isoDate
        });
    });

    console.log(`Encontrados ${toInsert.length} novos registros para inserir (ausentes no Supabase ou com data corrigida).`);

    if (toInsert.length > 0) {
        const chunkSize = 500;
        let ok = 0;
        for (let i = 0; i < toInsert.length; i += chunkSize) {
            const chunk = toInsert.slice(i, i + chunkSize);
            const { error } = await supabase.from('historico').insert(chunk);
            if (error) console.error('Erro:', error.message);
            else ok += chunk.length;
        }
        console.log(`✅ ${ok} registros inseridos!`);
    }

    // 4. Update existing records in Supabase that have vlr_total = 0 for saídas
    console.log('Atualizando saídas existentes sem valor...');
    const { data: toUpdate } = await supabase.from('historico').select('*').eq('tipo', 'saída').or('vlr_total.eq.0,vlr_total.is.null');
    
    if (toUpdate && toUpdate.length > 0) {
        let updated = 0;
        for (const record of toUpdate) {
            const cost = custosMap[record.code] || 0;
            if (cost > 0) {
                const newTot = cost * record.qty;
                await supabase.from('historico').update({ vlr_unit: cost, vlr_total: newTot }).eq('id', record.id);
                updated++;
            }
        }
        console.log(`✅ ${updated} registros atualizados com os custos atuais!`);
    }

    console.log('✨ Fim do processo.');
    process.exit(0);
}

syncHistorico();
