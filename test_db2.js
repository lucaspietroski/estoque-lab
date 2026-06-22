import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjU2NjcsImV4cCI6MjA5MzI0MTY2N30.L4hV7YM9yjdOOW9zBl84L-1si2DU8nBI3J1WgmW02lY';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data: hData, error: hError } = await supabase.from('historico').select('*').limit(2);
  console.log('Historico table:', hData, hError);
  
  // also let's check what other tables exist by querying information_schema
  // wait we can just check what columns are in historico
}
test();
