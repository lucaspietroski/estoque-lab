import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { createClient } from "@supabase/supabase-js";

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAjxhYEf5z_BG_ciqPQUuqW8ar1VKrjJfk",
  authDomain: "estoque-laboratorio.firebaseapp.com",
  projectId: "estoque-laboratorio",
  storageBucket: "estoque-laboratorio.firebasestorage.app",
  messagingSenderId: "358346799293",
  appId: "1:358346799293:web:93a51ede8e17082a2e9fd4",
  measurementId: "G-THZPKPPT3S"
};

// --- CONFIGURAÇÃO SUPABASE ---
const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';

console.log('🔥 Iniciando conexão com Firebase e Supabase...');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrarTudo() {
    try {
        // 1. MIGRAR ESTOQUE (SALDO)
        console.log('\n📦 Buscando saldos no Firebase...');
        const estoqueSnap = await getDocs(collection(db, "estoque"));
        const estoqueData = estoqueSnap.docs.map(doc => ({
            code: doc.id,
            qty: doc.data().qty || 0
        }));

        console.log(`📊 Encontrados ${estoqueData.length} itens com saldo.`);

        if (estoqueData.length > 0) {
            const { error: errEstoque } = await supabase
                .from('estoque')
                .upsert(estoqueData, { onConflict: 'code' });
            
            if (errEstoque) console.error('❌ Erro ao salvar estoque no Supabase:', errEstoque.message);
            else console.log('✅ Saldos migrados com sucesso!');
        }

        // 2. MIGRAR CUSTOS (PREÇOS)
        console.log('\n💰 Buscando custos no Firebase...');
        const custosSnap = await getDocs(collection(db, "custos"));
        const custosData = custosSnap.docs.map(doc => ({
            code: doc.id,
            last_cost: doc.data().lastCost || 0
        }));

        console.log(`💵 Encontrados ${custosData.length} registros de custo.`);

        if (custosData.length > 0) {
            const { error: errCustos } = await supabase
                .from('custos')
                .upsert(custosData, { onConflict: 'code' });
            
            if (errCustos) console.error('❌ Erro ao salvar custos no Supabase:', errCustos.message);
            else console.log('✅ Custos migrados com sucesso!');
        }

        console.log('\n✨ TRANSFERÊNCIA CONCLUÍDA!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Erro fatal durante a migração:', err);
        process.exit(1);
    }
}

migrarTudo();
