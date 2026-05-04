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

console.log('🔥 Iniciando conexão...');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCollections() {
    const colNames = ['movimentacoes', 'historico', 'log', 'movLog'];
    for (const name of colNames) {
        console.log(`Verificando coleção: ${name}...`);
        try {
            const snap = await getDocs(collection(db, name));
            console.log(`  -> ${snap.docs.length} registros encontrados.`);
        } catch(e) {
            console.log(`  -> Erro ao acessar: ${e.message}`);
        }
    }
    process.exit(0);
}
checkCollections();
