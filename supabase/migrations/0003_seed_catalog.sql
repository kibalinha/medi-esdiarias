-- 0003_seed_catalog.sql
-- Seed idempotente do catálogo completo de setores, 53 medidores de entrada bruta e limites (SPEC.md seção 3.1)

-- 1. Grupos / Setores da Ronda
insert into public.meter_groups (slug, name, display_order, is_active_in_field, allow_batch_photo)
values
  ('agua', 'Água', 1, true, false),
  ('temp_externa', 'Temperatura Externa', 2, true, false),
  ('temp_jockey', 'Temperaturas — Nível Joquey', 3, true, false),
  ('temp_guaiba', 'Temperaturas — Nível Guaíba', 4, true, false),
  ('bss_1', 'BSS 1 — Energia Elétrica', 5, true, true),
  ('bss_2', 'BSS 2 — Energia Elétrica', 6, true, true),
  ('bss_3', 'BSS 3 — Energia Elétrica', 7, true, true),
  ('bss_4', 'BSS 4 — Energia Elétrica', 8, true, true),
  ('chiller_1', 'Chiller 1', 9, false, true),
  ('chiller_2', 'Chiller 2', 10, false, true),
  ('cag', 'CAG — Central de Água Gelada', 11, true, false)
on conflict (slug) do update
set
  name = excluded.name,
  display_order = excluded.display_order,
  is_active_in_field = excluded.is_active_in_field,
  allow_batch_photo = excluded.allow_batch_photo;

-- 2. Medidores de Entrada Bruta (53 entradas correspondentes às abas 2025 e 2026)
with group_map as (
  select id, slug from public.meter_groups
),
meter_rows (
  group_slug, code, excel_header, label, unit, reading_kind,
  multiplier_factor, dial_capacity, photo_required,
  is_active_in_field, is_active_in_sheet, sort_order, ocr_hint
) as (
  values
    -- A. Água (5 entradas)
    ('agua', 'agua_hidrometro_geral', 'Água - Hidrometro Geral', 'Hidrômetro Geral', 'm³', 'cumulative', 1, null::numeric, true, true, true, 1, 'Visor numérico acumulado do hidrômetro geral em m³ (6 dígitos inteiros)'),
    ('agua', 'agua_horas_carregamento', 'Horas de carregamento', 'Horas de Carregamento (Cisternas)', 'h', 'hours', 1, null::numeric, false, true, true, 2, 'Quantidade de horas inteiras ou decimais de carregamento das cisternas'),
    ('agua', 'agua_reuso', 'Reuso (Estação Elevatória)', 'Reuso (Estação Elevatória)', 'm³', 'cumulative', 1, 10000::numeric, true, true, true, 3, 'Hidrômetro de 4 dígitos (capacidade 10000) em m³ da Estação Elevatória de Reuso'),
    ('agua', 'agua_muro_verde', 'Muro verde Barracadabra', 'Muro Verde Barracadabra', 'm³', 'cumulative', 1, null::numeric, true, true, true, 4, 'Hidrômetro acumulado em m³ do Muro Verde Barracadabra'),
    ('agua', 'agua_irrigacao_calcadao', 'Irrigação Calçadão (m³)', 'Irrigação Calçadão', 'm³', 'cumulative', 1, null::numeric, true, true, true, 5, 'Hidrômetro acumulado em m³ da Irrigação Calçadão'),

    -- B1. Temperatura Externa (1 entrada)
    ('temp_externa', 'temp_externa', 'Temperatura - Externa (°C)', 'Temperatura Externa', '°C', 'temperature', 1, null::numeric, false, true, true, 1, 'Temperatura externa ambiente em °C'),

    -- B2. Temperaturas — Nível Joquey (8 lojas)
    ('temp_jockey', 'temp_jockey_01_gt_renner', '1 - GT Renner (Joquey)', '1 - GT Renner', '°C', 'temperature', 1, null::numeric, false, true, true, 1, 'Temperatura ambiente em °C da loja 1 - GT Renner (Joquey)'),
    ('temp_jockey', 'temp_jockey_02_opasta', '2 - Expansão O''pasta (Joquey)', '2 - Expansão O''pasta', '°C', 'temperature', 1, null::numeric, false, true, true, 2, 'Temperatura ambiente em °C da loja 2 - Expansão O''pasta (Joquey)'),
    ('temp_jockey', 'temp_jockey_03_ville_grill', '3 - Ville Grill (Joquey)', '3 - Ville Grill', '°C', 'temperature', 1, null::numeric, false, true, true, 3, 'Temperatura ambiente em °C da loja 3 - Ville Grill (Joquey)'),
    ('temp_jockey', 'temp_jockey_04_severo_burger', '4 - Expansão Severo Burger (Joquey)', '4 - Expansão Severo Burger', '°C', 'temperature', 1, null::numeric, false, true, true, 4, 'Temperatura ambiente em °C da loja 4 - Expansão Severo Burger (Joquey)'),
    ('temp_jockey', 'temp_jockey_05_pet_jolie', '5 - Pet Jolie (Joquey)', '5 - Pet Jolie', '°C', 'temperature', 1, null::numeric, false, true, true, 5, 'Temperatura ambiente em °C da loja 5 - Pet Jolie (Joquey)'),
    ('temp_jockey', 'temp_jockey_06_press_cafe', '6 - Press Café (Joquey)', '6 - Press Café', '°C', 'temperature', 1, null::numeric, false, true, true, 6, 'Temperatura ambiente em °C da loja 6 - Press Café (Joquey)'),
    ('temp_jockey', 'temp_jockey_07_cacau_show', '7 - Cacau Show (Joquey)', '7 - Cacau Show', '°C', 'temperature', 1, null::numeric, false, true, true, 7, 'Temperatura ambiente em °C da loja 7 - Cacau Show (Joquey)'),
    ('temp_jockey', 'temp_jockey_15_petiskeira', '15- Petiskeira (Joquey)', '15 - Petiskeira', '°C', 'temperature', 1, null::numeric, false, true, true, 8, 'Temperatura ambiente em °C da loja 15 - Petiskeira (Joquey)'),

    -- B3. Temperaturas — Nível Guaíba (6 lojas)
    ('temp_guaiba', 'temp_guaiba_08_gt_renner', '8 - GT Renner (Guaíba)', '8 - GT Renner', '°C', 'temperature', 1, null::numeric, false, true, true, 1, 'Temperatura ambiente em °C da loja 8 - GT Renner (Guaíba)'),
    ('temp_guaiba', 'temp_guaiba_10_sommelier', '10 - Sommelier (Guaíba)', '10 - Sommelier', '°C', 'temperature', 1, null::numeric, false, true, true, 2, 'Temperatura ambiente em °C da loja 10 - Sommelier (Guaíba)'),
    ('temp_guaiba', 'temp_guaiba_11_bacio', '11 - Bacio (Guaíba)', '11 - Bacio', '°C', 'temperature', 1, null::numeric, false, true, true, 3, 'Temperatura ambiente em °C da loja 11 - Bacio (Guaíba)'),
    ('temp_guaiba', 'temp_guaiba_12_mahogany', '12 - Mahogany (Guaíba)', '12 - Mahogany', '°C', 'temperature', 1, null::numeric, false, true, true, 4, 'Temperatura ambiente em °C da loja 12 - Mahogany (Guaíba)'),
    ('temp_guaiba', 'temp_guaiba_13_vivo', '13 - Vivo (Guaíba)', '13 - Vivo', '°C', 'temperature', 1, null::numeric, false, true, true, 5, 'Temperatura ambiente em °C da loja 13 - Vivo (Guaíba)'),
    ('temp_guaiba', 'temp_guaiba_14_cobasi', '14 - Cobasi (Guaíba)', '14 - Cobasi', '°C', 'temperature', 1, null::numeric, false, true, true, 6, 'Temperatura ambiente em °C da loja 14 - Cobasi (Guaíba)'),

    -- C & D. Energia Elétrica — BSS 1..4 (16 entradas: Consumo FP/P + Demanda FP/P)
    ('bss_1', 'bss1_consumo_fp', 'Consumo BSS 1 - Fora Ponta (kWh)', 'Consumo Fora Ponta', 'kWh', 'instant', 1, null::numeric, true, true, true, 1, 'Display multimedidor BSS 1: Consumo diário Fora Ponta em kWh'),
    ('bss_1', 'bss1_consumo_p', 'Consumo BSS 1 - Ponta (kWh)', 'Consumo Ponta', 'kWh', 'instant', 1, null::numeric, true, true, true, 2, 'Display multimedidor BSS 1: Consumo diário Ponta em kWh (0 em fins de semana/feriados)'),
    ('bss_1', 'bss1_demanda_fp', 'Demanda BSS 1 - Fora Ponta (kW)', 'Demanda Fora Ponta', 'kW', 'instant', 1, null::numeric, true, true, true, 3, 'Display multimedidor BSS 1: Demanda máxima Fora Ponta em kW (teto 2800 kW)'),
    ('bss_1', 'bss1_demanda_p', 'Demanda BSS 1 - Ponta (kW)', 'Demanda Ponta', 'kW', 'instant', 1, null::numeric, true, true, true, 4, 'Display multimedidor BSS 1: Demanda máxima Ponta em kW (teto 2600 kW)'),

    ('bss_2', 'bss2_consumo_fp', 'Consumo BSS 2 - Fora Ponta (kWh)', 'Consumo Fora Ponta', 'kWh', 'instant', 1, null::numeric, true, true, true, 1, 'Display multimedidor BSS 2: Consumo diário Fora Ponta em kWh'),
    ('bss_2', 'bss2_consumo_p', 'Consumo BSS 2 - Ponta (kWh)', 'Consumo Ponta', 'kWh', 'instant', 1, null::numeric, true, true, true, 2, 'Display multimedidor BSS 2: Consumo diário Ponta em kWh'),
    ('bss_2', 'bss2_demanda_fp', 'Demanda BSS 2 - Fora Ponta (kW)', 'Demanda Fora Ponta', 'kW', 'instant', 1, null::numeric, true, true, true, 3, 'Display multimedidor BSS 2: Demanda máxima Fora Ponta em kW (teto 500 kW)'),
    ('bss_2', 'bss2_demanda_p', 'Demanda BSS 2 - Ponta (kW)', 'Demanda Ponta', 'kW', 'instant', 1, null::numeric, true, true, true, 4, 'Display multimedidor BSS 2: Demanda máxima Ponta em kW (teto 500 kW)'),

    ('bss_3', 'bss3_consumo_fp', 'Consumo BSS 3 - Fora Ponta (kWh)', 'Consumo Fora Ponta', 'kWh', 'instant', 1, null::numeric, true, true, true, 1, 'Display multimedidor BSS 3: Consumo diário Fora Ponta em kWh'),
    ('bss_3', 'bss3_consumo_p', 'Consumo BSS 3 - Ponta (kWh)', 'Consumo Ponta', 'kWh', 'instant', 1, null::numeric, true, true, true, 2, 'Display multimedidor BSS 3: Consumo diário Ponta em kWh'),
    ('bss_3', 'bss3_demanda_fp', 'Demanda BSS 3 - Fora Ponta (kW)', 'Demanda Fora Ponta', 'kW', 'instant', 1, null::numeric, true, true, true, 3, 'Display multimedidor BSS 3: Demanda máxima Fora Ponta em kW (teto 200 kW)'),
    ('bss_3', 'bss3_demanda_p', 'Demanda BSS 3 - Ponta (kW)', 'Demanda Ponta', 'kW', 'instant', 1, null::numeric, true, true, true, 4, 'Display multimedidor BSS 3: Demanda máxima Ponta em kW (teto 200 kW)'),

    ('bss_4', 'bss4_consumo_fp', 'Consumo BSS 4 - Fora Ponta (kWh)', 'Consumo Fora Ponta', 'kWh', 'instant', 1, null::numeric, true, true, true, 1, 'Display multimedidor BSS 4: Consumo diário Fora Ponta em kWh'),
    ('bss_4', 'bss4_consumo_p', 'Consumo BSS 4 - Ponta (kWh)', 'Consumo Ponta', 'kWh', 'instant', 1, null::numeric, true, true, true, 2, 'Display multimedidor BSS 4: Consumo diário Ponta em kWh'),
    ('bss_4', 'bss4_demanda_fp', 'Demanda BSS 4 - Fora Ponta (kW)', 'Demanda Fora Ponta', 'kW', 'instant', 1, null::numeric, true, true, true, 3, 'Display multimedidor BSS 4: Demanda máxima Fora Ponta em kW (teto 340 kW)'),
    ('bss_4', 'bss4_demanda_p', 'Demanda BSS 4 - Ponta (kW)', 'Demanda Ponta', 'kW', 'instant', 1, null::numeric, true, true, true, 4, 'Display multimedidor BSS 4: Demanda máxima Ponta em kW (teto 340 kW)'),

    -- E. Chillers 1 e 2 (12 entradas — iniciam inativos no Modo Campo: is_active_in_field = false)
    ('chiller_1', 'chiller1_setpoint_cag', 'Chiller 1 - Set Point CAG (°C)', 'Set Point CAG', '°C', 'temperature', 1, null::numeric, true, false, true, 1, 'Tela HMI Chiller 1: Set Point CAG em °C'),
    ('chiller_1', 'chiller1_temp_saida_ag', 'Chiller 1 - Temp. Saída água gelada (°C)', 'Temp. Saída Água Gelada', '°C', 'temperature', 1, null::numeric, true, false, true, 2, 'Tela HMI Chiller 1: Temperatura de saída da água gelada em °C'),
    ('chiller_1', 'chiller1_aproach_evap', 'Chiller 1 - Aproach Evaporador', 'Aproach Evaporador', '°C', 'temperature', 1, null::numeric, true, false, true, 3, 'Tela HMI Chiller 1: Approach do Evaporador'),
    ('chiller_1', 'chiller1_aproach_cond', 'Chiller 1 - Aproach Condensador', 'Aproach Condensador', '°C', 'temperature', 1, null::numeric, true, false, true, 4, 'Tela HMI Chiller 1: Approach do Condensador'),
    ('chiller_1', 'chiller1_motor_pct', 'Chiller 1 - Motor %', 'Motor (%)', '%', 'instant', 1, null::numeric, true, false, true, 5, 'Tela HMI Chiller 1: Percentual de carga do motor (%)'),
    ('chiller_1', 'chiller1_tempo_operacao', 'Chiller 1 - Tempo total de operação', 'Tempo Total de Operação', 'h', 'hours', 1, null::numeric, true, false, true, 6, 'Tela HMI Chiller 1: Tempo total de operação em horas'),

    ('chiller_2', 'chiller2_setpoint_cag', 'Chiller 2 - Set Point CAG (°C)', 'Set Point CAG', '°C', 'temperature', 1, null::numeric, true, false, true, 1, 'Tela HMI Chiller 2: Set Point CAG em °C'),
    ('chiller_2', 'chiller2_temp_saida_ag', 'Chiller 2 - Temp. Saída água gelada (°C)', 'Temp. Saída Água Gelada', '°C', 'temperature', 1, null::numeric, true, false, true, 2, 'Tela HMI Chiller 2: Temperatura de saída da água gelada em °C'),
    ('chiller_2', 'chiller2_aproach_evap', 'Chiller 2 - Aproach Evaporador', 'Aproach Evaporador', '°C', 'temperature', 1, null::numeric, true, false, true, 3, 'Tela HMI Chiller 2: Approach do Evaporador'),
    ('chiller_2', 'chiller2_aproach_cond', 'Chiller 2 - Aproach Condensador', 'Aproach Condensador', '°C', 'temperature', 1, null::numeric, true, false, true, 4, 'Tela HMI Chiller 2: Approach do Condensador'),
    ('chiller_2', 'chiller2_motor_pct', 'Chiller 2 - Motor %', 'Motor (%)', '%', 'instant', 1, null::numeric, true, false, true, 5, 'Tela HMI Chiller 2: Percentual de carga do motor (%)'),
    ('chiller_2', 'chiller2_tempo_operacao', 'Chiller 2 - Tempo total de operação', 'Tempo Total de Operação', 'h', 'hours', 1, null::numeric, true, false, true, 6, 'Tela HMI Chiller 2: Tempo total de operação em horas'),

    -- F. CAG — Central de Água Gelada (5 entradas)
    ('cag', 'cag_medidor_kwh', 'CAG - Leitura do medidor (kWh)', 'Leitura do Medidor (kWh)', 'kWh', 'cumulative', 1000, null::numeric, true, true, true, 1, 'Medidor acumulado de energia da CAG (fator multiplicador x1000 no consumo)'),
    ('cag', 'cag_medidor_m3', 'CAG - Leitura do medidor (m³)', 'Leitura do Medidor (m³)', 'm³', 'cumulative', 1, null::numeric, true, true, true, 2, 'Hidrômetro acumulado de reposição de água da CAG em m³'),
    ('cag', 'cag_dreno_torre', 'CAG - Dreno da Torre (m³)', 'Dreno da Torre', 'm³', 'cumulative', 1, null::numeric, true, true, true, 3, 'Hidrômetro acumulado de dreno da torre em m³'),
    ('cag', 'cag_ladrao_torre', 'CAG - Ladrão da Torre (m³)', 'Ladrão da Torre', 'm³', 'cumulative', 1, null::numeric, true, true, true, 4, 'Hidrômetro acumulado do ladrão da torre em m³'),
    ('cag', 'cag_condutivimetro', 'CAG - Condutivimetro (< 700 ok; 700 >= 1000 alto; > 1000 critico)', 'Condutivímetro', 'µS/cm', 'quality', 1, null::numeric, true, true, true, 5, 'Visor digital do condutivímetro da CAG em µS/cm (<700 OK, 700..1000 Alto, >1000 Crítico)')
)
insert into public.meters (
  group_id, code, excel_header, label, unit, reading_kind,
  multiplier_factor, dial_capacity, photo_required,
  is_active_in_field, is_active_in_sheet, sort_order, ocr_hint
)
select
  g.id, r.code, r.excel_header, r.label, r.unit, r.reading_kind,
  r.multiplier_factor, r.dial_capacity, r.photo_required,
  r.is_active_in_field, r.is_active_in_sheet, r.sort_order, r.ocr_hint
from meter_rows r
join group_map g on g.slug = r.group_slug
on conflict (code) do update
set
  group_id = excluded.group_id,
  excel_header = excluded.excel_header,
  label = excluded.label,
  unit = excluded.unit,
  reading_kind = excluded.reading_kind,
  multiplier_factor = excluded.multiplier_factor,
  dial_capacity = excluded.dial_capacity,
  photo_required = excluded.photo_required,
  is_active_in_field = excluded.is_active_in_field,
  is_active_in_sheet = excluded.is_active_in_sheet,
  sort_order = excluded.sort_order,
  ocr_hint = excluded.ocr_hint;

-- 3. Limites e Tetos configuráveis (BSS 1..4 e Condutivímetro CAG)
with threshold_rows (meter_code, warning_min, critical_min, teto_value, effective_from) as (
  values
    ('bss1_demanda_fp', 2520::numeric, 2800::numeric, 2800::numeric, date '2025-01-01'),
    ('bss1_demanda_p',  2340::numeric, 2600::numeric, 2600::numeric, date '2025-01-01'),
    ('bss2_demanda_fp',  450::numeric,  500::numeric,  500::numeric, date '2025-01-01'),
    ('bss2_demanda_p',   450::numeric,  500::numeric,  500::numeric, date '2025-01-01'),
    ('bss3_demanda_fp',  180::numeric,  200::numeric,  200::numeric, date '2025-01-01'),
    ('bss3_demanda_p',   180::numeric,  200::numeric,  200::numeric, date '2025-01-01'),
    ('bss4_demanda_fp',  306::numeric,  340::numeric,  340::numeric, date '2025-01-01'),
    ('bss4_demanda_p',   306::numeric,  340::numeric,  340::numeric, date '2025-01-01'),
    ('cag_condutivimetro', 700::numeric, 1000::numeric, null::numeric, date '2025-01-01')
)
insert into public.meter_thresholds (meter_id, warning_min, critical_min, teto_value, effective_from)
select
  m.id, t.warning_min, t.critical_min, t.teto_value, t.effective_from
from threshold_rows t
join public.meters m on m.code = t.meter_code
on conflict (meter_id, effective_from) do update
set
  warning_min = excluded.warning_min,
  critical_min = excluded.critical_min,
  teto_value = excluded.teto_value;
