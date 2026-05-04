import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Substitua pelas suas credenciais do projeto Supabase (Project Settings > API)
const supabaseUrl = 'https://idpmrjjalhnpsxpfugph.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG1yamphbGhucHN4cGZ1Z3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjU2NjcsImV4cCI6MjA5MzI0MTY2N30.L4hV7YM9yjdOOW9zBl84L-1si2DU8nBI3J1WgmW02lY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
