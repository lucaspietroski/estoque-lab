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

async function migrarHistorico() {
    try {
        console.log('\n📜 Buscando histórico no Firebase (pode levar alguns segundos)...');
        const historicoSnap = await getDocs(collection(db, "historico"));
        const historicoData = [];

        historicoSnap.docs.forEach(doc => {
            const data = doc.data();
            
            // Format Firebase Timestamp
            let createdAt = new Date();
            if (data.ts && typeof data.ts.toDate === 'function') {
                createdAt = data.ts.toDate();
            } else if (data.ts && data.ts.seconds) {
                createdAt = new Date(data.ts.seconds * 1000);
            }
            
            historicoData.push({
                tipo: data.tipo || 'saída',
                code: data.code || '',
                descricao: data.desc || data.descricao || '',
                qty: parseInt(data.qty) || 1,
                user_email: data.user || 'migrado_firebase',
                selb: data.selb || '',
                vlr_unit: parseFloat(data.vlr_unit) || parseFloat(data.vlrUnit) || 0,
                vlr_total: parseFloat(data.vlr_total) || parseFloat(data.vlrTotal) || parseFloat(data.vlr_unit) * parseInt(data.qty) || parseFloat(data.vlrUnit) * parseInt(data.qty) || 0,
                ts: createdAt.toISOString()
            });
        });

        console.log(`📊 Encontrados ${historicoData.length} registros no histórico do Firebase.`);

        if (historicoData.length > 0) {
            // Em Supabase, insert em chunks de 500 para evitar timeout/payload too large
            const chunkSize = 500;
            let successCount = 0;
            for (let i = 0; i < historicoData.length; i += chunkSize) {
                const chunk = historicoData.slice(i, i + chunkSize);
                console.log(`Enviando lote ${Math.floor(i/chunkSize)+1} de ${Math.ceil(historicoData.length/chunkSize)}...`);
                const { error } = await supabase
                    .from('historico')
                    .insert(chunk);
                
                if (error) {
                    console.error('❌ Erro no lote:', error.message);
                } else {
                    successCount += chunk.length;
                }
            }
            console.log(`✅ ${successCount} registros de histórico migrados com sucesso!`);
        } else {
            console.log('⚠ Nenhum registro encontrado no Firebase para migrar.');
        }

        console.log('\n✨ MIGRAÇÃO DE HISTÓRICO CONCLUÍDA!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Erro fatal durante a migração:', err);
        process.exit(1);
    }
}

migrarHistorico();
