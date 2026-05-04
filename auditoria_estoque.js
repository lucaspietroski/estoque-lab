import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

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

// ⚠️ COLE SUA CHAVE AQUI DENTRO DAS ASPAS SIMPLES:
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getAllSupabase(table) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    return data || [];
}

async function runAudit() {
    if (!supabaseServiceKey || supabaseServiceKey.length < 20) {
        console.error('❌ ERRO: Você esqueceu de colar a chave!');
        process.exit(1);
    }

    console.log('🔍 Iniciando auditoria comparativa entre Firebase e Supabase...');

    console.log('📦 Coletando dados do Firebase...');
    const fbCustosSnap = await getDocs(collection(db, "custos"));
    const fbEstoqueSnap = await getDocs(collection(db, "estoque"));

    const fbCustos = {};
    fbCustosSnap.docs.forEach(d => fbCustos[d.id] = d.data().lastCost || 0);
    
    const fbEstoque = {};
    fbEstoqueSnap.docs.forEach(d => fbEstoque[d.id] = d.data().qty || 0);

    console.log('📦 Coletando dados do Supabase...');
    const sbCustosData = await getAllSupabase('custos');
    const sbEstoqueData = await getAllSupabase('estoque');

    const sbCustos = {};
    sbCustosData.forEach(d => sbCustos[d.code] = d.last_cost || 0);

    const sbEstoque = {};
    sbEstoqueData.forEach(d => sbEstoque[d.code] = d.qty || 0);

    const relatorio = {
        total_firebase_custos: Object.keys(fbCustos).length,
        total_supabase_custos: Object.keys(sbCustos).length,
        total_firebase_estoque: Object.keys(fbEstoque).length,
        total_supabase_estoque: Object.keys(sbEstoque).length,
        falta_no_supabase_custos: [],
        falta_no_supabase_estoque: [],
        diferenca_de_preco: []
    };

    // Auditar Custos
    for (const [code, fCost] of Object.entries(fbCustos)) {
        if (sbCustos[code] === undefined) {
            relatorio.falta_no_supabase_custos.push(code);
        } else if (Math.abs(sbCustos[code] - fCost) > 0.01) {
            relatorio.diferenca_de_preco.push({ code, firebase: fCost, supabase: sbCustos[code] });
        }
    }

    // Auditar Estoque
    for (const [code, fQty] of Object.entries(fbEstoque)) {
        if (sbEstoque[code] === undefined) {
            relatorio.falta_no_supabase_estoque.push({ code, firebase_qty: fQty });
        }
    }

    console.log('\n================ RELATÓRIO ================');
    console.log(`Preços no Firebase: ${relatorio.total_firebase_custos}`);
    console.log(`Preços no Supabase: ${relatorio.total_supabase_custos}`);
    console.log(`Saldos no Firebase: ${relatorio.total_firebase_estoque}`);
    console.log(`Saldos no Supabase: ${relatorio.total_supabase_estoque}`);
    console.log('-------------------------------------------');

    if (relatorio.falta_no_supabase_custos.length === 0 && relatorio.diferenca_de_preco.length === 0) {
        console.log('✅ SUCESSO: Todos os preços (custos) do Firebase migraram perfeitamente para o Supabase!');
    } else {
        console.log(`❌ ALERTA: Faltam ${relatorio.falta_no_supabase_custos.length} preços no Supabase.`);
        if (relatorio.diferenca_de_preco.length > 0) console.log(`❌ ALERTA: Existem ${relatorio.diferenca_de_preco.length} preços diferentes entre os bancos.`);
    }

    if (relatorio.falta_no_supabase_estoque.length === 0) {
        console.log('✅ SUCESSO: Todos os códigos com saldo no Firebase estão no Supabase!');
    } else {
        console.log(`❌ ALERTA: Faltam ${relatorio.falta_no_supabase_estoque.length} saldos no Supabase.`);
    }
    
    if (relatorio.falta_no_supabase_custos.length > 0 || relatorio.falta_no_supabase_estoque.length > 0 || relatorio.diferenca_de_preco.length > 0) {
        fs.writeFileSync('relatorio_divergencias.json', JSON.stringify(relatorio, null, 2));
        console.log('\n📄 Detalhes salvos no arquivo "relatorio_divergencias.json".');
    }

    console.log('===========================================\n');
    process.exit(0);
}

runAudit();
