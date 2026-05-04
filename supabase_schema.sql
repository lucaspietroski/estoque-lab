-- Schema para o Sistema de Estoque Lab (Supabase/PostgreSQL)

-- 1. Tabela de Peças (Substitui o RAW.js no futuro)
CREATE TABLE IF NOT EXISTS parts (
    code TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Estoque (Saldos Atuais)
CREATE TABLE IF NOT EXISTS inventory (
    part_code TEXT PRIMARY KEY REFERENCES parts(code) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Histórico de Movimentações
CREATE TABLE IF NOT EXISTS history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('entrada', 'saída')),
    part_code TEXT REFERENCES parts(code),
    quantity INTEGER NOT NULL,
    selb TEXT,
    user_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB -- Para guardar informações extras como loteId ou justificativa
);

-- 4. Tabela de Custos
CREATE TABLE IF NOT EXISTS costs (
    part_code TEXT PRIMARY KEY REFERENCES parts(code),
    unit_cost DECIMAL(12,2) DEFAULT 0,
    total_value_received DECIMAL(15,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabela de WMS / Equipamentos
CREATE TABLE IF NOT EXISTS wms_equipments (
    selb TEXT PRIMARY KEY,
    model TEXT,
    description TEXT,
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Configuração de Row Level Security (RLS)
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;
ALTER TABLE costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wms_equipments ENABLE ROW LEVEL SECURITY;

-- Regras: Qualquer usuário autenticado pode ler, mas apenas admins podem escrever
-- (Nota: No Supabase Auth, o e-mail do usuário está em auth.jwt() -> 'email')

CREATE POLICY "Leitura livre para autenticados" ON parts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Escrita para admins" ON parts FOR ALL TO authenticated USING (auth.jwt() ->> 'email' LIKE '%@estoque-laboratorio.local');

CREATE POLICY "Leitura livre para autenticados" ON inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Escrita para admins" ON inventory FOR ALL TO authenticated USING (auth.jwt() ->> 'email' LIKE '%@estoque-laboratorio.local');

CREATE POLICY "Leitura livre para autenticados" ON history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Escrita para todos autenticados" ON history FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Leitura livre para autenticados" ON costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Escrita para admins" ON costs FOR ALL TO authenticated USING (auth.jwt() ->> 'email' LIKE '%@estoque-laboratorio.local');
