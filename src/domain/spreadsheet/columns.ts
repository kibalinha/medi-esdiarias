import type {
  MeterDto,
  SpreadsheetColumnDefDto,
  SpreadsheetColumnKind,
} from "@/types/contracts";

export interface CanonicalColumnSpec {
  key: string;
  col_letter_2026: string;
  col_index: number;
  header: string;
  group_slug: string;
  group_name: string;
  kind: SpreadsheetColumnKind;
  meter_code: string | null;
  unit: string | null;
  sort_order: number;
}

export function columnIndexToLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export const CANONICAL_COLUMNS_2026: CanonicalColumnSpec[] = [
  // A..L: Data & Água
  { key: "data", col_letter_2026: "A", col_index: 1, header: "Data", group_slug: "agua", group_name: "Água", kind: "KEY", meter_code: null, unit: null, sort_order: 1 },
  { key: "agua_hidrometro_geral", col_letter_2026: "B", col_index: 2, header: "Água - Hidrometro Geral", group_slug: "agua", group_name: "Água", kind: "INPUT", meter_code: "agua_hidrometro_geral", unit: "m³", sort_order: 2 },
  { key: "calc_agua_consumo_geral", col_letter_2026: "C", col_index: 3, header: "Água - Consumo geral (m³)", group_slug: "agua", group_name: "Água", kind: "CALCULATED", meter_code: "agua_hidrometro_geral", unit: "m³", sort_order: 3 },
  { key: "yoy_agua_consumo_geral", col_letter_2026: "D", col_index: 4, header: "Água - Média consumo geral ano anterior (m³)", group_slug: "agua", group_name: "Água", kind: "REFERENCE_YOY", meter_code: "agua_hidrometro_geral", unit: "m³", sort_order: 4 },
  { key: "calc_agua_abastecimento_cisternas", col_letter_2026: "E", col_index: 5, header: "Água - Abastecimento Cisternas", group_slug: "agua", group_name: "Água", kind: "CALCULATED", meter_code: "agua_horas_carregamento", unit: null, sort_order: 5 },
  { key: "agua_horas_carregamento", col_letter_2026: "F", col_index: 6, header: "Horas de carregamento", group_slug: "agua", group_name: "Água", kind: "INPUT", meter_code: "agua_horas_carregamento", unit: "h", sort_order: 6 },
  { key: "agua_reuso", col_letter_2026: "G", col_index: 7, header: "Reuso (Estação Elevatória)", group_slug: "agua", group_name: "Água", kind: "INPUT", meter_code: "agua_reuso", unit: "m³", sort_order: 7 },
  { key: "calc_agua_consumo_reuso", col_letter_2026: "H", col_index: 8, header: "Água - Consumo Reuso (m³)", group_slug: "agua", group_name: "Água", kind: "CALCULATED", meter_code: "agua_reuso", unit: "m³", sort_order: 8 },
  { key: "agua_muro_verde", col_letter_2026: "I", col_index: 9, header: "Muro verde Barracadabra", group_slug: "agua", group_name: "Água", kind: "INPUT", meter_code: "agua_muro_verde", unit: "m³", sort_order: 9 },
  { key: "calc_agua_consumo_muro_verde", col_letter_2026: "J", col_index: 10, header: "Água - Consumo muro verde (m³)", group_slug: "agua", group_name: "Água", kind: "CALCULATED", meter_code: "agua_muro_verde", unit: "m³", sort_order: 10 },
  { key: "agua_irrigacao_calcadao", col_letter_2026: "K", col_index: 11, header: "Irrigação Calçadão (m³)", group_slug: "agua", group_name: "Água", kind: "INPUT", meter_code: "agua_irrigacao_calcadao", unit: "m³", sort_order: 11 },
  { key: "calc_agua_consumo_calcadao", col_letter_2026: "L", col_index: 12, header: "Água - Consumo calçadão (m³)", group_slug: "agua", group_name: "Água", kind: "CALCULATED", meter_code: "agua_irrigacao_calcadao", unit: "m³", sort_order: 12 },

  // M..AC: Temperaturas
  { key: "temp_externa", col_letter_2026: "M", col_index: 13, header: "Temperatura - Externa (°C)", group_slug: "temp_externa", group_name: "Temperatura Externa", kind: "INPUT", meter_code: "temp_externa", unit: "°C", sort_order: 13 },
  { key: "calc_temp_media_jockey", col_letter_2026: "N", col_index: 14, header: "Temperatura - Média Nível Jockey (°C)", group_slug: "temp_jockey", group_name: "Temperaturas — Nível Joquey", kind: "CALCULATED", meter_code: null, unit: "°C", sort_order: 14 },
  { key: "calc_temp_media_guaiba", col_letter_2026: "O", col_index: 15, header: "Temperatura - Média Nível Guaíba (°C)", group_slug: "temp_guaiba", group_name: "Temperaturas — Nível Guaíba", kind: "CALCULATED", meter_code: null, unit: "°C", sort_order: 15 },
  { key: "temp_jockey_01_gt_renner", col_letter_2026: "P", col_index: 16, header: "1 - GT Renner (Joquey)", group_slug: "temp_jockey", group_name: "Temperaturas — Nível Joquey", kind: "INPUT", meter_code: "temp_jockey_01_gt_renner", unit: "°C", sort_order: 16 },
  { key: "temp_jockey_02_opasta", col_letter_2026: "Q", col_index: 17, header: "2 - Expansão O'pasta (Joquey)", group_slug: "temp_jockey", group_name: "Temperaturas — Nível Joquey", kind: "INPUT", meter_code: "temp_jockey_02_opasta", unit: "°C", sort_order: 17 },
  { key: "temp_jockey_03_ville_grill", col_letter_2026: "R", col_index: 18, header: "3 - Ville Grill (Joquey)", group_slug: "temp_jockey", group_name: "Temperaturas — Nível Joquey", kind: "INPUT", meter_code: "temp_jockey_03_ville_grill", unit: "°C", sort_order: 18 },
  { key: "temp_jockey_04_severo_burger", col_letter_2026: "S", col_index: 19, header: "4 - Expansão Severo Burger (Joquey)", group_slug: "temp_jockey", group_name: "Temperaturas — Nível Joquey", kind: "INPUT", meter_code: "temp_jockey_04_severo_burger", unit: "°C", sort_order: 19 },
  { key: "temp_jockey_05_pet_jolie", col_letter_2026: "T", col_index: 20, header: "5 - Pet Jolie (Joquey)", group_slug: "temp_jockey", group_name: "Temperaturas — Nível Joquey", kind: "INPUT", meter_code: "temp_jockey_05_pet_jolie", unit: "°C", sort_order: 20 },
  { key: "temp_jockey_06_press_cafe", col_letter_2026: "U", col_index: 21, header: "6 - Press Café (Joquey)", group_slug: "temp_jockey", group_name: "Temperaturas — Nível Joquey", kind: "INPUT", meter_code: "temp_jockey_06_press_cafe", unit: "°C", sort_order: 21 },
  { key: "temp_jockey_07_cacau_show", col_letter_2026: "V", col_index: 22, header: "7 - Cacau Show (Joquey)", group_slug: "temp_jockey", group_name: "Temperaturas — Nível Joquey", kind: "INPUT", meter_code: "temp_jockey_07_cacau_show", unit: "°C", sort_order: 22 },
  { key: "temp_jockey_15_petiskeira", col_letter_2026: "W", col_index: 23, header: "15- Petiskeira (Joquey)", group_slug: "temp_jockey", group_name: "Temperaturas — Nível Joquey", kind: "INPUT", meter_code: "temp_jockey_15_petiskeira", unit: "°C", sort_order: 23 },
  { key: "temp_guaiba_08_gt_renner", col_letter_2026: "X", col_index: 24, header: "8 - GT Renner (Guaíba)", group_slug: "temp_guaiba", group_name: "Temperaturas — Nível Guaíba", kind: "INPUT", meter_code: "temp_guaiba_08_gt_renner", unit: "°C", sort_order: 24 },
  { key: "temp_guaiba_10_sommelier", col_letter_2026: "Y", col_index: 25, header: "10 - Sommelier (Guaíba)", group_slug: "temp_guaiba", group_name: "Temperaturas — Nível Guaíba", kind: "INPUT", meter_code: "temp_guaiba_10_sommelier", unit: "°C", sort_order: 25 },
  { key: "temp_guaiba_11_bacio", col_letter_2026: "Z", col_index: 26, header: "11 - Bacio (Guaíba)", group_slug: "temp_guaiba", group_name: "Temperaturas — Nível Guaíba", kind: "INPUT", meter_code: "temp_guaiba_11_bacio", unit: "°C", sort_order: 26 },
  { key: "temp_guaiba_12_mahogany", col_letter_2026: "AA", col_index: 27, header: "12 - Mahogany (Guaíba)", group_slug: "temp_guaiba", group_name: "Temperaturas — Nível Guaíba", kind: "INPUT", meter_code: "temp_guaiba_12_mahogany", unit: "°C", sort_order: 27 },
  { key: "temp_guaiba_13_vivo", col_letter_2026: "AB", col_index: 28, header: "13 - Vivo (Guaíba)", group_slug: "temp_guaiba", group_name: "Temperaturas — Nível Guaíba", kind: "INPUT", meter_code: "temp_guaiba_13_vivo", unit: "°C", sort_order: 28 },
  { key: "temp_guaiba_14_cobasi", col_letter_2026: "AC", col_index: 29, header: "14 - Cobasi (Guaíba)", group_slug: "temp_guaiba", group_name: "Temperaturas — Nível Guaíba", kind: "INPUT", meter_code: "temp_guaiba_14_cobasi", unit: "°C", sort_order: 29 },

  // AD..AX: Energia Consumo BSS 1..4 + Total
  { key: "calc_bss1_consumo_geral", col_letter_2026: "AD", col_index: 30, header: "Consumo BSS 1 - Geral (kWh)", group_slug: "bss_1", group_name: "BSS 1 — Energia Elétrica", kind: "CALCULATED", meter_code: null, unit: "kWh", sort_order: 30 },
  { key: "bss1_consumo_fp", col_letter_2026: "AE", col_index: 31, header: "Consumo BSS 1 - Fora Ponta (kWh)", group_slug: "bss_1", group_name: "BSS 1 — Energia Elétrica", kind: "INPUT", meter_code: "bss1_consumo_fp", unit: "kWh", sort_order: 31 },
  { key: "bss1_consumo_p", col_letter_2026: "AF", col_index: 32, header: "Consumo BSS 1 - Ponta (kWh)", group_slug: "bss_1", group_name: "BSS 1 — Energia Elétrica", kind: "INPUT", meter_code: "bss1_consumo_p", unit: "kWh", sort_order: 32 },
  { key: "calc_bss1_media_mes", col_letter_2026: "AG", col_index: 33, header: "Média consumo mês - BSS 1", group_slug: "bss_1", group_name: "BSS 1 — Energia Elétrica", kind: "CALCULATED", meter_code: null, unit: "kWh", sort_order: 33 },
  { key: "yoy_bss1_media_ano_anterior", col_letter_2026: "AH", col_index: 34, header: "Consumo BSS 1 - Média ano anterior (kWh)", group_slug: "bss_1", group_name: "BSS 1 — Energia Elétrica", kind: "REFERENCE_YOY", meter_code: null, unit: "kWh", sort_order: 34 },

  { key: "calc_bss2_consumo_geral", col_letter_2026: "AI", col_index: 35, header: "Consumo BSS 2 - Geral (kWh)", group_slug: "bss_2", group_name: "BSS 2 — Energia Elétrica", kind: "CALCULATED", meter_code: null, unit: "kWh", sort_order: 35 },
  { key: "bss2_consumo_fp", col_letter_2026: "AJ", col_index: 36, header: "Consumo BSS 2 - Fora Ponta (kWh)", group_slug: "bss_2", group_name: "BSS 2 — Energia Elétrica", kind: "INPUT", meter_code: "bss2_consumo_fp", unit: "kWh", sort_order: 36 },
  { key: "bss2_consumo_p", col_letter_2026: "AK", col_index: 37, header: "Consumo BSS 2 - Ponta (kWh)", group_slug: "bss_2", group_name: "BSS 2 — Energia Elétrica", kind: "INPUT", meter_code: "bss2_consumo_p", unit: "kWh", sort_order: 37 },
  { key: "calc_bss2_media_mes", col_letter_2026: "AL", col_index: 38, header: "Média consumo mês - BSS 2", group_slug: "bss_2", group_name: "BSS 2 — Energia Elétrica", kind: "CALCULATED", meter_code: null, unit: "kWh", sort_order: 38 },
  { key: "yoy_bss2_media_ano_anterior", col_letter_2026: "AM", col_index: 39, header: "Consumo BSS 2 - Média ano anterior (kWh)", group_slug: "bss_2", group_name: "BSS 2 — Energia Elétrica", kind: "REFERENCE_YOY", meter_code: null, unit: "kWh", sort_order: 39 },

  { key: "calc_bss3_consumo_geral", col_letter_2026: "AN", col_index: 40, header: "Consumo BSS 3 - Geral (kWh)", group_slug: "bss_3", group_name: "BSS 3 — Energia Elétrica", kind: "CALCULATED", meter_code: null, unit: "kWh", sort_order: 40 },
  { key: "bss3_consumo_fp", col_letter_2026: "AO", col_index: 41, header: "Consumo BSS 3 - Fora Ponta (kWh)", group_slug: "bss_3", group_name: "BSS 3 — Energia Elétrica", kind: "INPUT", meter_code: "bss3_consumo_fp", unit: "kWh", sort_order: 41 },
  { key: "bss3_consumo_p", col_letter_2026: "AP", col_index: 42, header: "Consumo BSS 3 - Ponta (kWh)", group_slug: "bss_3", group_name: "BSS 3 — Energia Elétrica", kind: "INPUT", meter_code: "bss3_consumo_p", unit: "kWh", sort_order: 42 },
  { key: "calc_bss3_media_mes", col_letter_2026: "AQ", col_index: 43, header: "Média consumo mês - BSS 3", group_slug: "bss_3", group_name: "BSS 3 — Energia Elétrica", kind: "CALCULATED", meter_code: null, unit: "kWh", sort_order: 43 },
  { key: "yoy_bss3_media_ano_anterior", col_letter_2026: "AR", col_index: 44, header: "Consumo BSS 3 - Média ano anterior (kWh)", group_slug: "bss_3", group_name: "BSS 3 — Energia Elétrica", kind: "REFERENCE_YOY", meter_code: null, unit: "kWh", sort_order: 44 },

  { key: "calc_bss4_consumo_geral", col_letter_2026: "AS", col_index: 45, header: "Consumo BSS 4 - Geral (kWh)", group_slug: "bss_4", group_name: "BSS 4 — Energia Elétrica", kind: "CALCULATED", meter_code: null, unit: "kWh", sort_order: 45 },
  { key: "bss4_consumo_fp", col_letter_2026: "AT", col_index: 46, header: "Consumo BSS 4 - Fora Ponta (kWh)", group_slug: "bss_4", group_name: "BSS 4 — Energia Elétrica", kind: "INPUT", meter_code: "bss4_consumo_fp", unit: "kWh", sort_order: 46 },
  { key: "bss4_consumo_p", col_letter_2026: "AU", col_index: 47, header: "Consumo BSS 4 - Ponta (kWh)", group_slug: "bss_4", group_name: "BSS 4 — Energia Elétrica", kind: "INPUT", meter_code: "bss4_consumo_p", unit: "kWh", sort_order: 47 },
  { key: "calc_bss4_media_mes", col_letter_2026: "AV", col_index: 48, header: "Média consumo mês - BSS 4", group_slug: "bss_4", group_name: "BSS 4 — Energia Elétrica", kind: "CALCULATED", meter_code: null, unit: "kWh", sort_order: 48 },
  { key: "yoy_bss4_media_ano_anterior", col_letter_2026: "AW", col_index: 49, header: "Consumo BSS 4 - Média ano anterior (kWh)", group_slug: "bss_4", group_name: "BSS 4 — Energia Elétrica", kind: "REFERENCE_YOY", meter_code: null, unit: "kWh", sort_order: 49 },

  { key: "calc_energia_consumo_total", col_letter_2026: "AX", col_index: 50, header: "Consumo Total (kWh)", group_slug: "bss_total", group_name: "Energia Total", kind: "CALCULATED", meter_code: null, unit: "kWh", sort_order: 50 },

  // AY..BK: Demanda BSS 1..4 e Tetos
  { key: "bss1_demanda_fp", col_letter_2026: "AY", col_index: 51, header: "Demanda BSS 1 - Fora Ponta (kW)", group_slug: "bss_1", group_name: "BSS 1 — Energia Elétrica", kind: "INPUT", meter_code: "bss1_demanda_fp", unit: "kW", sort_order: 51 },
  { key: "cfg_bss1_teto_fp", col_letter_2026: "AZ", col_index: 52, header: "Demanda BSS 1 - Teto Fora Ponta (kW)", group_slug: "bss_1", group_name: "BSS 1 — Energia Elétrica", kind: "CONFIG", meter_code: "bss1_demanda_fp", unit: "kW", sort_order: 52 },
  { key: "bss1_demanda_p", col_letter_2026: "BA", col_index: 53, header: "Demanda BSS 1 - Ponta (kW)", group_slug: "bss_1", group_name: "BSS 1 — Energia Elétrica", kind: "INPUT", meter_code: "bss1_demanda_p", unit: "kW", sort_order: 53 },
  { key: "cfg_bss1_teto_p", col_letter_2026: "BB", col_index: 54, header: "Demanda BSS 1 - Teto Ponta (kW)", group_slug: "bss_1", group_name: "BSS 1 — Energia Elétrica", kind: "CONFIG", meter_code: "bss1_demanda_p", unit: "kW", sort_order: 54 },

  { key: "bss2_demanda_fp", col_letter_2026: "BC", col_index: 55, header: "Demanda BSS 2 - Fora Ponta (kW)", group_slug: "bss_2", group_name: "BSS 2 — Energia Elétrica", kind: "INPUT", meter_code: "bss2_demanda_fp", unit: "kW", sort_order: 55 },
  { key: "cfg_bss2_teto", col_letter_2026: "BD", col_index: 56, header: "Demanda BSS 2 - Teto (Fora Ponta e Ponta) (kW)", group_slug: "bss_2", group_name: "BSS 2 — Energia Elétrica", kind: "CONFIG", meter_code: "bss2_demanda_fp", unit: "kW", sort_order: 56 },
  { key: "bss2_demanda_p", col_letter_2026: "BE", col_index: 57, header: "Demanda BSS 2 - Ponta (kW)", group_slug: "bss_2", group_name: "BSS 2 — Energia Elétrica", kind: "INPUT", meter_code: "bss2_demanda_p", unit: "kW", sort_order: 57 },

  { key: "bss3_demanda_fp", col_letter_2026: "BF", col_index: 58, header: "Demanda BSS 3 - Fora Ponta (kW)", group_slug: "bss_3", group_name: "BSS 3 — Energia Elétrica", kind: "INPUT", meter_code: "bss3_demanda_fp", unit: "kW", sort_order: 58 },
  { key: "cfg_bss3_teto", col_letter_2026: "BG", col_index: 59, header: "Demanda BSS 3 - Teto (Fora Ponta e Ponta) (kW)", group_slug: "bss_3", group_name: "BSS 3 — Energia Elétrica", kind: "CONFIG", meter_code: "bss3_demanda_fp", unit: "kW", sort_order: 59 },
  { key: "bss3_demanda_p", col_letter_2026: "BH", col_index: 60, header: "Demanda BSS 3 - Ponta (kW)", group_slug: "bss_3", group_name: "BSS 3 — Energia Elétrica", kind: "INPUT", meter_code: "bss3_demanda_p", unit: "kW", sort_order: 60 },

  { key: "bss4_demanda_fp", col_letter_2026: "BI", col_index: 61, header: "Demanda BSS 4 - Fora Ponta (kW)", group_slug: "bss_4", group_name: "BSS 4 — Energia Elétrica", kind: "INPUT", meter_code: "bss4_demanda_fp", unit: "kW", sort_order: 61 },
  { key: "cfg_bss4_teto", col_letter_2026: "BJ", col_index: 62, header: "Demanda BSS 4 - Teto (Fora Ponta e Ponta) (kW)", group_slug: "bss_4", group_name: "BSS 4 — Energia Elétrica", kind: "CONFIG", meter_code: "bss4_demanda_fp", unit: "kW", sort_order: 62 },
  { key: "bss4_demanda_p", col_letter_2026: "BK", col_index: 63, header: "Demanda BSS 4 - Ponta (kW)", group_slug: "bss_4", group_name: "BSS 4 — Energia Elétrica", kind: "INPUT", meter_code: "bss4_demanda_p", unit: "kW", sort_order: 63 },

  // BL..BW: Chillers 1 e 2
  { key: "chiller1_setpoint_cag", col_letter_2026: "BL", col_index: 64, header: "Chiller 1 - Set Point CAG (°C)", group_slug: "chiller_1", group_name: "Chiller 1", kind: "INPUT", meter_code: "chiller1_setpoint_cag", unit: "°C", sort_order: 64 },
  { key: "chiller1_temp_saida_ag", col_letter_2026: "BM", col_index: 65, header: "Chiller 1 - Temp. Saída água gelada (°C)", group_slug: "chiller_1", group_name: "Chiller 1", kind: "INPUT", meter_code: "chiller1_temp_saida_ag", unit: "°C", sort_order: 65 },
  { key: "chiller1_aproach_evap", col_letter_2026: "BN", col_index: 66, header: "Chiller 1 - Aproach Evaporador", group_slug: "chiller_1", group_name: "Chiller 1", kind: "INPUT", meter_code: "chiller1_aproach_evap", unit: "°C", sort_order: 66 },
  { key: "chiller1_aproach_cond", col_letter_2026: "BO", col_index: 67, header: "Chiller 1 - Aproach Condensador", group_slug: "chiller_1", group_name: "Chiller 1", kind: "INPUT", meter_code: "chiller1_aproach_cond", unit: "°C", sort_order: 67 },
  { key: "chiller1_motor_pct", col_letter_2026: "BP", col_index: 68, header: "Chiller 1 - Motor %", group_slug: "chiller_1", group_name: "Chiller 1", kind: "INPUT", meter_code: "chiller1_motor_pct", unit: "%", sort_order: 68 },
  { key: "chiller1_tempo_operacao", col_letter_2026: "BQ", col_index: 69, header: "Chiller 1 - Tempo total de operação", group_slug: "chiller_1", group_name: "Chiller 1", kind: "INPUT", meter_code: "chiller1_tempo_operacao", unit: "h", sort_order: 69 },

  { key: "chiller2_setpoint_cag", col_letter_2026: "BR", col_index: 70, header: "Chiller 2 - Set Point CAG (°C)", group_slug: "chiller_2", group_name: "Chiller 2", kind: "INPUT", meter_code: "chiller2_setpoint_cag", unit: "°C", sort_order: 70 },
  { key: "chiller2_temp_saida_ag", col_letter_2026: "BS", col_index: 71, header: "Chiller 2 - Temp. Saída água gelada (°C)", group_slug: "chiller_2", group_name: "Chiller 2", kind: "INPUT", meter_code: "chiller2_temp_saida_ag", unit: "°C", sort_order: 71 },
  { key: "chiller2_aproach_evap", col_letter_2026: "BT", col_index: 72, header: "Chiller 2 - Aproach Evaporador", group_slug: "chiller_2", group_name: "Chiller 2", kind: "INPUT", meter_code: "chiller2_aproach_evap", unit: "°C", sort_order: 72 },
  { key: "chiller2_aproach_cond", col_letter_2026: "BU", col_index: 73, header: "Chiller 2 - Aproach Condensador", group_slug: "chiller_2", group_name: "Chiller 2", kind: "INPUT", meter_code: "chiller2_aproach_cond", unit: "°C", sort_order: 73 },
  { key: "chiller2_motor_pct", col_letter_2026: "BV", col_index: 74, header: "Chiller 2 - Motor %", group_slug: "chiller_2", group_name: "Chiller 2", kind: "INPUT", meter_code: "chiller2_motor_pct", unit: "%", sort_order: 74 },
  { key: "chiller2_tempo_operacao", col_letter_2026: "BW", col_index: 75, header: "Chiller 2 - Tempo total de operação", group_slug: "chiller_2", group_name: "Chiller 2", kind: "INPUT", meter_code: "chiller2_tempo_operacao", unit: "h", sort_order: 75 },

  // BX..CM: CAG
  { key: "cag_medidor_kwh", col_letter_2026: "BX", col_index: 76, header: "CAG - Leitura do medidor (kWh)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "INPUT", meter_code: "cag_medidor_kwh", unit: "kWh", sort_order: 76 },
  { key: "calc_cag_consumo_kwh", col_letter_2026: "BY", col_index: 77, header: "CAG - Consumo 01/25(kWh)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "CALCULATED", meter_code: "cag_medidor_kwh", unit: "kWh", sort_order: 77 },
  { key: "calc_cag_media_mes_kwh", col_letter_2026: "BZ", col_index: 78, header: "CAG - Média de consumo mês (kWh)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "CALCULATED", meter_code: null, unit: "kWh", sort_order: 78 },
  { key: "yoy_cag_media_ano_anterior_kwh", col_letter_2026: "CA", col_index: 79, header: "CAG - Média de consumo ano anterior (kWh)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "REFERENCE_YOY", meter_code: null, unit: "kWh", sort_order: 79 },
  { key: "calc_cag_pct_energia", col_letter_2026: "CB", col_index: 80, header: "CAG - % Consumo de Energia", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "CALCULATED", meter_code: null, unit: "%", sort_order: 80 },
  { key: "cag_medidor_m3", col_letter_2026: "CC", col_index: 81, header: "CAG - Leitura do medidor (m³)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "INPUT", meter_code: "cag_medidor_m3", unit: "m³", sort_order: 81 },
  { key: "calc_cag_consumo_m3", col_letter_2026: "CD", col_index: 82, header: "CAG - Consumo (m³)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "CALCULATED", meter_code: "cag_medidor_m3", unit: "m³", sort_order: 82 },
  { key: "calc_cag_media_mes_m3", col_letter_2026: "CE", col_index: 83, header: "CAG - Média de consumo mês (m³)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "CALCULATED", meter_code: null, unit: "m³", sort_order: 83 },
  { key: "yoy_cag_media_ano_anterior_m3", col_letter_2026: "CF", col_index: 84, header: "CAG - Média de consumo ano anterior (m³)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "REFERENCE_YOY", meter_code: null, unit: "m³", sort_order: 84 },
  { key: "calc_cag_pct_agua", col_letter_2026: "CG", col_index: 85, header: "CAG - % Consumo de Água", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "CALCULATED", meter_code: null, unit: "%", sort_order: 85 },
  { key: "cag_dreno_torre", col_letter_2026: "CH", col_index: 86, header: "CAG - Dreno da Torre (m³)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "INPUT", meter_code: "cag_dreno_torre", unit: "m³", sort_order: 86 },
  { key: "calc_cag_agua_drenada", col_letter_2026: "CI", col_index: 87, header: "CAG - Água drenada (m³)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "CALCULATED", meter_code: "cag_dreno_torre", unit: "m³", sort_order: 87 },
  { key: "yoy_cag_media_drenada_ano_anterior", col_letter_2026: "CJ", col_index: 88, header: "CAG - Média drenada ano anterior (m³)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "REFERENCE_YOY", meter_code: null, unit: "m³", sort_order: 88 },
  { key: "cag_ladrao_torre", col_letter_2026: "CK", col_index: 89, header: "CAG - Ladrão da Torre (m³)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "INPUT", meter_code: "cag_ladrao_torre", unit: "m³", sort_order: 89 },
  { key: "calc_cag_agua_ladrao", col_letter_2026: "CL", col_index: 90, header: "CAG - Água pelo ladrão (m³)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "CALCULATED", meter_code: "cag_ladrao_torre", unit: "m³", sort_order: 90 },
  { key: "cag_condutivimetro", col_letter_2026: "CM", col_index: 91, header: "CAG - Condutivimetro (< 700 ok; 700 >= 1000 alto; > 1000 critico)", group_slug: "cag", group_name: "CAG — Central de Água Gelada", kind: "INPUT", meter_code: "cag_condutivimetro", unit: "µS/cm", sort_order: 91 },
];

export function matchesGroupFilter(
  colGroupSlug: string,
  filterGroup: string | undefined,
): boolean {
  if (!filterGroup || filterGroup === "all") return true;
  if (colGroupSlug === filterGroup) return true;
  if (filterGroup === "temperaturas") {
    return (
      colGroupSlug === "temp_externa" ||
      colGroupSlug === "temp_jockey" ||
      colGroupSlug === "temp_guaiba"
    );
  }
  if (filterGroup === "energia_bss") {
    return (
      colGroupSlug === "bss_1" ||
      colGroupSlug === "bss_2" ||
      colGroupSlug === "bss_3" ||
      colGroupSlug === "bss_4" ||
      colGroupSlug === "bss_total"
    );
  }
  if (filterGroup === "chillers") {
    return colGroupSlug === "chiller_1" || colGroupSlug === "chiller_2";
  }
  return false;
}

export function buildSpreadsheetColumns(
  meters: MeterDto[],
  groupFilter?: string,
): SpreadsheetColumnDefDto[] {
  const meterByCode = new Map(meters.map((m) => [m.code, m]));
  const canonicalCodes = new Set(
    CANONICAL_COLUMNS_2026.map((c) => c.meter_code).filter(Boolean) as string[],
  );

  const cols: SpreadsheetColumnDefDto[] = CANONICAL_COLUMNS_2026.map((spec) => {
    const meter = spec.meter_code ? meterByCode.get(spec.meter_code) : undefined;
    return {
      key: spec.key,
      col_letter_2026: spec.col_letter_2026,
      col_index: spec.col_index,
      header: spec.header,
      group_slug: spec.group_slug,
      group_name: spec.group_name,
      kind: spec.kind,
      meter_id: spec.kind === "INPUT" && meter ? meter.id : null,
      meter_code: spec.meter_code,
      unit: meter?.unit ?? spec.unit,
      reading_kind:
        spec.kind === "INPUT" && meter ? meter.reading_kind : null,
      sort_order: spec.sort_order,
      // Strict SPEC rule: never allow overwriting calculated/reference/config cells
      editable: spec.kind === "INPUT",
    };
  });

  // Append any custom meters added dynamically via Catalog Manager
  let nextIdx = cols.length + 1;
  for (const m of meters) {
    if (!m.is_active_in_sheet) continue;
    if (canonicalCodes.has(m.code)) continue;
    cols.push({
      key: m.code,
      col_letter_2026: columnIndexToLetter(nextIdx),
      col_index: nextIdx,
      header: m.excel_header || m.label,
      group_slug: m.group_slug,
      group_name: m.group_slug,
      kind: "INPUT",
      meter_id: m.id,
      meter_code: m.code,
      unit: m.unit,
      reading_kind: m.reading_kind,
      sort_order: nextIdx,
      editable: true,
    });
    nextIdx += 1;
  }

  if (!groupFilter || groupFilter === "all") {
    return cols;
  }

  return cols.filter(
    (c) => c.kind === "KEY" || matchesGroupFilter(c.group_slug, groupFilter),
  );
}
