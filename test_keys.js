import { createClient } from "@supabase/supabase-js";

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjU2NjcsImV4cCI6MjA5MzI0MTY2N30.L4hV7YM9yjdOOW9zBl84L-1si2DU8nBI3J1WgmW02lY';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2NTY2NywiZXhwIjoyMDkzMjQxNjY3fQ.YR1d6swxo1BbQ3ixTYB43KtZL5ure__R4wuqAkd7by4';

async function testKeys() {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { count: anonCount, error: anonErr } = await anonClient.from('estoque').select('*', { count: 'exact', head: true });
    console.log('Anon count:', anonCount, 'Error:', anonErr);

    const { count: serviceCount, error: serviceErr } = await serviceClient.from('estoque').select('*', { count: 'exact', head: true });
    console.log('Service count:', serviceCount, 'Error:', serviceErr);
}

testKeys();
