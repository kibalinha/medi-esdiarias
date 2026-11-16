import type {
  MeterDto,
  MeterGroupDto,
  MeterThresholdDto,
  ReadingKind,
} from "@/types/contracts";

function makeUuid(prefix: string, index: number): string {
  const hex = index.toString(16).padStart(12, "0");
  return `${prefix}-0000-4000-8000-${hex}`;
}

export const INITIAL_LOCAL_GROUPS: MeterGroupDto[] = [
  { id: makeUuid("10000000", 1), slug: "agua", name: "Água", display_order: 1, is_active_in_field: true, allow_batch_photo: false },
  { id: makeUuid("10000000", 2), slug: "temp_externa", name: "Temperatura Externa", display_order: 2, is_active_in_field: true, allow_batch_photo: false },
  { id: makeUuid("10000000", 3), slug: "temp_jockey", name: "Temperaturas — Nível Joquey", display_order: 3, is_active_in_field: true, allow_batch_photo: false },
  { id: makeUuid("10000000", 4), slug: "temp_guaiba", name: "Temperaturas — Nível Guaíba", display_order: 4, is_active_in_field: true, allow_batch_photo: false },
  { id: makeUuid("10000000", 5), slug: "bss_1", name: "BSS 1 — Energia Elétrica", display_order: 5, is_active_in_field: true, allow_batch_photo: true },
  { id: makeUuid("10000000", 6), slug: "bss_2", name: "BSS 2 — Energia Elétrica", display_order: 6, is_active_in_field: true, allow_batch_photo: true },
  { id: makeUuid("10000000", 7), slug: "bss_3", name: "BSS 3 — Energia Elétrica", display_order: 7, is_active_in_field: true, allow_batch_photo: true },
  { id: makeUuid("10000000", 8), slug: "bss_4", name: "BSS 4 — Energia Elétrica", display_order: 8, is_active_in_field: true, allow_batch_photo: true },
  { id: makeUuid("10000000", 9), slug: "chiller_1", name: "Chiller 1", display_order: 9, is_active_in_field: false, allow_batch_photo: true },
  { id: makeUuid("10000000", 10), slug: "chiller_2", name: "Chiller 2", display_order: 10, is_active_in_field: false, allow_batch_photo: true },
  { id: makeUuid("10000000", 11), slug: "cag", name: "CAG — Central de Água Gelada", display_order: 11, is_active_in_field: true, allow_batch_photo: false },
];

const groupIdBySlug = new Map(INITIAL_LOCAL_GROUPS.map((g) => [g.slug, g.id]));

interface SeedMeterSpec {
  group_slug: string;
  code: string;
  excel_header: string;
  label: string;
  unit: string | null;
  reading_kind: ReadingKind;
  multiplier_factor: number;
  dial_capacity: number | null;
  photo_required: boolean;
  is_active_in_field: boolean;
  sort_order: number;
  ocr_hint: string;
  threshold?: {
    warning_min: number | null;
    critical_min: number | null;
    teto_value: number | null;
  };
}

const SEED_METERS: SeedMeterSpec[] = [
  { group_slug: "agua", code: "agua_hidrometro_geral", excel_header: "Água - Hidrometro Geral", label: "Hidrômetro Geral", unit: "m³", reading_kind: "cumulative", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 1, ocr_hint: "Visor numérico acumulado do hidrômetro geral em m³ (6 dígitos inteiros)" },
  { group_slug: "agua", code: "agua_horas_carregamento", excel_header: "Horas de carregamento", label: "Horas de Carregamento (Cisternas)", unit: "h", reading_kind: "hours", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 2, ocr_hint: "Quantidade de horas inteiras ou decimais de carregamento das cisternas" },
  { group_slug: "agua", code: "agua_reuso", excel_header: "Reuso (Estação Elevatória)", label: "Reuso (Estação Elevatória)", unit: "m³", reading_kind: "cumulative", multiplier_factor: 1, dial_capacity: 10000, photo_required: true, is_active_in_field: true, sort_order: 3, ocr_hint: "Hidrômetro de 4 dígitos (capacidade 10000) em m³ da Estação Elevatória de Reuso" },
  { group_slug: "agua", code: "agua_muro_verde", excel_header: "Muro verde Barracadabra", label: "Muro Verde Barracadabra", unit: "m³", reading_kind: "cumulative", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 4, ocr_hint: "Hidrômetro acumulado em m³ do Muro Verde Barracadabra" },
  { group_slug: "agua", code: "agua_irrigacao_calcadao", excel_header: "Irrigação Calçadão (m³)", label: "Irrigação Calçadão", unit: "m³", reading_kind: "cumulative", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 5, ocr_hint: "Hidrômetro acumulado em m³ da Irrigação Calçadão" },

  { group_slug: "temp_externa", code: "temp_externa", excel_header: "Temperatura - Externa (°C)", label: "Temperatura Externa", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 1, ocr_hint: "Temperatura externa ambiente em °C" },

  { group_slug: "temp_jockey", code: "temp_jockey_01_gt_renner", excel_header: "1 - GT Renner (Joquey)", label: "1 - GT Renner", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 1, ocr_hint: "Temperatura ambiente em °C da loja 1 - GT Renner (Joquey)" },
  { group_slug: "temp_jockey", code: "temp_jockey_02_opasta", excel_header: "2 - Expansão O'pasta (Joquey)", label: "2 - Expansão O'pasta", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 2, ocr_hint: "Temperatura ambiente em °C da loja 2 - Expansão O'pasta (Joquey)" },
  { group_slug: "temp_jockey", code: "temp_jockey_03_ville_grill", excel_header: "3 - Ville Grill (Joquey)", label: "3 - Ville Grill", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 3, ocr_hint: "Temperatura ambiente em °C da loja 3 - Ville Grill (Joquey)" },
  { group_slug: "temp_jockey", code: "temp_jockey_04_severo_burger", excel_header: "4 - Expansão Severo Burger (Joquey)", label: "4 - Expansão Severo Burger", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 4, ocr_hint: "Temperatura ambiente em °C da loja 4 - Expansão Severo Burger (Joquey)" },
  { group_slug: "temp_jockey", code: "temp_jockey_05_pet_jolie", excel_header: "5 - Pet Jolie (Joquey)", label: "5 - Pet Jolie", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 5, ocr_hint: "Temperatura ambiente em °C da loja 5 - Pet Jolie (Joquey)" },
  { group_slug: "temp_jockey", code: "temp_jockey_06_press_cafe", excel_header: "6 - Press Café (Joquey)", label: "6 - Press Café", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 6, ocr_hint: "Temperatura ambiente em °C da loja 6 - Press Café (Joquey)" },
  { group_slug: "temp_jockey", code: "temp_jockey_07_cacau_show", excel_header: "7 - Cacau Show (Joquey)", label: "7 - Cacau Show", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 7, ocr_hint: "Temperatura ambiente em °C da loja 7 - Cacau Show (Joquey)" },
  { group_slug: "temp_jockey", code: "temp_jockey_15_petiskeira", excel_header: "15- Petiskeira (Joquey)", label: "15 - Petiskeira", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 8, ocr_hint: "Temperatura ambiente em °C da loja 15 - Petiskeira (Joquey)" },

  { group_slug: "temp_guaiba", code: "temp_guaiba_08_gt_renner", excel_header: "8 - GT Renner (Guaíba)", label: "8 - GT Renner", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 1, ocr_hint: "Temperatura ambiente em °C da loja 8 - GT Renner (Guaíba)" },
  { group_slug: "temp_guaiba", code: "temp_guaiba_10_sommelier", excel_header: "10 - Sommelier (Guaíba)", label: "10 - Sommelier", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 2, ocr_hint: "Temperatura ambiente em °C da loja 10 - Sommelier (Guaíba)" },
  { group_slug: "temp_guaiba", code: "temp_guaiba_11_bacio", excel_header: "11 - Bacio (Guaíba)", label: "11 - Bacio", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 3, ocr_hint: "Temperatura ambiente em °C da loja 11 - Bacio (Guaíba)" },
  { group_slug: "temp_guaiba", code: "temp_guaiba_12_mahogany", excel_header: "12 - Mahogany (Guaíba)", label: "12 - Mahogany", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 4, ocr_hint: "Temperatura ambiente em °C da loja 12 - Mahogany (Guaíba)" },
  { group_slug: "temp_guaiba", code: "temp_guaiba_13_vivo", excel_header: "13 - Vivo (Guaíba)", label: "13 - Vivo", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 5, ocr_hint: "Temperatura ambiente em °C da loja 13 - Vivo (Guaíba)" },
  { group_slug: "temp_guaiba", code: "temp_guaiba_14_cobasi", excel_header: "14 - Cobasi (Guaíba)", label: "14 - Cobasi", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: false, is_active_in_field: true, sort_order: 6, ocr_hint: "Temperatura ambiente em °C da loja 14 - Cobasi (Guaíba)" },

  { group_slug: "bss_1", code: "bss1_consumo_fp", excel_header: "Consumo BSS 1 - Fora Ponta (kWh)", label: "Consumo Fora Ponta", unit: "kWh", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 1, ocr_hint: "Display multimedidor BSS 1: Consumo diário Fora Ponta em kWh" },
  { group_slug: "bss_1", code: "bss1_consumo_p", excel_header: "Consumo BSS 1 - Ponta (kWh)", label: "Consumo Ponta", unit: "kWh", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 2, ocr_hint: "Display multimedidor BSS 1: Consumo diário Ponta em kWh" },
  { group_slug: "bss_1", code: "bss1_demanda_fp", excel_header: "Demanda BSS 1 - Fora Ponta (kW)", label: "Demanda Fora Ponta", unit: "kW", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 3, ocr_hint: "Display multimedidor BSS 1: Demanda máxima Fora Ponta em kW", threshold: { warning_min: 2520, critical_min: 2800, teto_value: 2800 } },
  { group_slug: "bss_1", code: "bss1_demanda_p", excel_header: "Demanda BSS 1 - Ponta (kW)", label: "Demanda Ponta", unit: "kW", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 4, ocr_hint: "Display multimedidor BSS 1: Demanda máxima Ponta em kW", threshold: { warning_min: 2340, critical_min: 2600, teto_value: 2600 } },

  { group_slug: "bss_2", code: "bss2_consumo_fp", excel_header: "Consumo BSS 2 - Fora Ponta (kWh)", label: "Consumo Fora Ponta", unit: "kWh", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 1, ocr_hint: "Display multimedidor BSS 2: Consumo diário Fora Ponta em kWh" },
  { group_slug: "bss_2", code: "bss2_consumo_p", excel_header: "Consumo BSS 2 - Ponta (kWh)", label: "Consumo Ponta", unit: "kWh", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 2, ocr_hint: "Display multimedidor BSS 2: Consumo diário Ponta em kWh" },
  { group_slug: "bss_2", code: "bss2_demanda_fp", excel_header: "Demanda BSS 2 - Fora Ponta (kW)", label: "Demanda Fora Ponta", unit: "kW", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 3, ocr_hint: "Display multimedidor BSS 2: Demanda máxima Fora Ponta em kW", threshold: { warning_min: 450, critical_min: 500, teto_value: 500 } },
  { group_slug: "bss_2", code: "bss2_demanda_p", excel_header: "Demanda BSS 2 - Ponta (kW)", label: "Demanda Ponta", unit: "kW", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 4, ocr_hint: "Display multimedidor BSS 2: Demanda máxima Ponta em kW", threshold: { warning_min: 450, critical_min: 500, teto_value: 500 } },

  { group_slug: "bss_3", code: "bss3_consumo_fp", excel_header: "Consumo BSS 3 - Fora Ponta (kWh)", label: "Consumo Fora Ponta", unit: "kWh", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 1, ocr_hint: "Display multimedidor BSS 3: Consumo diário Fora Ponta em kWh" },
  { group_slug: "bss_3", code: "bss3_consumo_p", excel_header: "Consumo BSS 3 - Ponta (kWh)", label: "Consumo Ponta", unit: "kWh", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 2, ocr_hint: "Display multimedidor BSS 3: Consumo diário Ponta em kWh" },
  { group_slug: "bss_3", code: "bss3_demanda_fp", excel_header: "Demanda BSS 3 - Fora Ponta (kW)", label: "Demanda Fora Ponta", unit: "kW", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 3, ocr_hint: "Display multimedidor BSS 3: Demanda máxima Fora Ponta em kW", threshold: { warning_min: 180, critical_min: 200, teto_value: 200 } },
  { group_slug: "bss_3", code: "bss3_demanda_p", excel_header: "Demanda BSS 3 - Ponta (kW)", label: "Demanda Ponta", unit: "kW", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 4, ocr_hint: "Display multimedidor BSS 3: Demanda máxima Ponta em kW", threshold: { warning_min: 180, critical_min: 200, teto_value: 200 } },

  { group_slug: "bss_4", code: "bss4_consumo_fp", excel_header: "Consumo BSS 4 - Fora Ponta (kWh)", label: "Consumo Fora Ponta", unit: "kWh", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 1, ocr_hint: "Display multimedidor BSS 4: Consumo diário Fora Ponta em kWh" },
  { group_slug: "bss_4", code: "bss4_consumo_p", excel_header: "Consumo BSS 4 - Ponta (kWh)", label: "Consumo Ponta", unit: "kWh", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 2, ocr_hint: "Display multimedidor BSS 4: Consumo diário Ponta em kWh" },
  { group_slug: "bss_4", code: "bss4_demanda_fp", excel_header: "Demanda BSS 4 - Fora Ponta (kW)", label: "Demanda Fora Ponta", unit: "kW", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 3, ocr_hint: "Display multimedidor BSS 4: Demanda máxima Fora Ponta em kW", threshold: { warning_min: 306, critical_min: 340, teto_value: 340 } },
  { group_slug: "bss_4", code: "bss4_demanda_p", excel_header: "Demanda BSS 4 - Ponta (kW)", label: "Demanda Ponta", unit: "kW", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 4, ocr_hint: "Display multimedidor BSS 4: Demanda máxima Ponta em kW", threshold: { warning_min: 306, critical_min: 340, teto_value: 340 } },

  { group_slug: "chiller_1", code: "chiller1_setpoint_cag", excel_header: "Chiller 1 - Set Point CAG (°C)", label: "Set Point CAG", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 1, ocr_hint: "Tela HMI Chiller 1: Set Point CAG em °C" },
  { group_slug: "chiller_1", code: "chiller1_temp_saida_ag", excel_header: "Chiller 1 - Temp. Saída água gelada (°C)", label: "Temp. Saída Água Gelada", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 2, ocr_hint: "Tela HMI Chiller 1: Temperatura de saída da água gelada em °C" },
  { group_slug: "chiller_1", code: "chiller1_aproach_evap", excel_header: "Chiller 1 - Aproach Evaporador", label: "Aproach Evaporador", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 3, ocr_hint: "Tela HMI Chiller 1: Approach do Evaporador" },
  { group_slug: "chiller_1", code: "chiller1_aproach_cond", excel_header: "Chiller 1 - Aproach Condensador", label: "Aproach Condensador", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 4, ocr_hint: "Tela HMI Chiller 1: Approach do Condensador" },
  { group_slug: "chiller_1", code: "chiller1_motor_pct", excel_header: "Chiller 1 - Motor %", label: "Motor (%)", unit: "%", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 5, ocr_hint: "Tela HMI Chiller 1: Percentual de carga do motor (%)" },
  { group_slug: "chiller_1", code: "chiller1_tempo_operacao", excel_header: "Chiller 1 - Tempo total de operação", label: "Tempo Total de Operação", unit: "h", reading_kind: "hours", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 6, ocr_hint: "Tela HMI Chiller 1: Tempo total de operação em horas" },

  { group_slug: "chiller_2", code: "chiller2_setpoint_cag", excel_header: "Chiller 2 - Set Point CAG (°C)", label: "Set Point CAG", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 1, ocr_hint: "Tela HMI Chiller 2: Set Point CAG em °C" },
  { group_slug: "chiller_2", code: "chiller2_temp_saida_ag", excel_header: "Chiller 2 - Temp. Saída água gelada (°C)", label: "Temp. Saída Água Gelada", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 2, ocr_hint: "Tela HMI Chiller 2: Temperatura de saída da água gelada em °C" },
  { group_slug: "chiller_2", code: "chiller2_aproach_evap", excel_header: "Chiller 2 - Aproach Evaporador", label: "Aproach Evaporador", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 3, ocr_hint: "Tela HMI Chiller 2: Approach do Evaporador" },
  { group_slug: "chiller_2", code: "chiller2_aproach_cond", excel_header: "Chiller 2 - Aproach Condensador", label: "Aproach Condensador", unit: "°C", reading_kind: "temperature", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 4, ocr_hint: "Tela HMI Chiller 2: Approach do Condensador" },
  { group_slug: "chiller_2", code: "chiller2_motor_pct", excel_header: "Chiller 2 - Motor %", label: "Motor (%)", unit: "%", reading_kind: "instant", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 5, ocr_hint: "Tela HMI Chiller 2: Percentual de carga do motor (%)" },
  { group_slug: "chiller_2", code: "chiller2_tempo_operacao", excel_header: "Chiller 2 - Tempo total de operação", label: "Tempo Total de Operação", unit: "h", reading_kind: "hours", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: false, sort_order: 6, ocr_hint: "Tela HMI Chiller 2: Tempo total de operação em horas" },

  { group_slug: "cag", code: "cag_medidor_kwh", excel_header: "CAG - Leitura do medidor (kWh)", label: "Leitura do Medidor (kWh)", unit: "kWh", reading_kind: "cumulative", multiplier_factor: 1000, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 1, ocr_hint: "Medidor acumulado de energia da CAG (fator multiplicador x1000 no consumo)" },
  { group_slug: "cag", code: "cag_medidor_m3", excel_header: "CAG - Leitura do medidor (m³)", label: "Leitura do Medidor (m³)", unit: "m³", reading_kind: "cumulative", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 2, ocr_hint: "Hidrômetro acumulado de reposição de água da CAG em m³" },
  { group_slug: "cag", code: "cag_dreno_torre", excel_header: "CAG - Dreno da Torre (m³)", label: "Dreno da Torre", unit: "m³", reading_kind: "cumulative", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 3, ocr_hint: "Hidrômetro acumulado de dreno da torre em m³" },
  { group_slug: "cag", code: "cag_ladrao_torre", excel_header: "CAG - Ladrão da Torre (m³)", label: "Ladrão da Torre", unit: "m³", reading_kind: "cumulative", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 4, ocr_hint: "Hidrômetro acumulado do ladrão da torre em m³" },
  { group_slug: "cag", code: "cag_condutivimetro", excel_header: "CAG - Condutivimetro (< 700 ok; 700 >= 1000 alto; > 1000 critico)", label: "Condutivímetro", unit: "µS/cm", reading_kind: "quality", multiplier_factor: 1, dial_capacity: null, photo_required: true, is_active_in_field: true, sort_order: 5, ocr_hint: "Visor digital do condutivímetro da CAG em µS/cm", threshold: { warning_min: 700, critical_min: 1000, teto_value: null } },
];

export const INITIAL_LOCAL_METERS: MeterDto[] = SEED_METERS.map((s, idx) => {
  const id = makeUuid("20000000", idx + 1);
  const threshold: MeterThresholdDto | null = s.threshold
    ? {
        id: makeUuid("30000000", idx + 1),
        meter_id: id,
        warning_min: s.threshold.warning_min,
        critical_min: s.threshold.critical_min,
        teto_value: s.threshold.teto_value,
        effective_from: "2025-01-01",
        updated_by: null,
        updated_at: "2025-01-01T00:00:00.000Z",
      }
    : null;

  return {
    id,
    group_id: groupIdBySlug.get(s.group_slug)!,
    group_slug: s.group_slug,
    code: s.code,
    excel_header: s.excel_header,
    label: s.label,
    unit: s.unit,
    reading_kind: s.reading_kind,
    multiplier_factor: s.multiplier_factor,
    dial_capacity: s.dial_capacity,
    photo_required: s.photo_required,
    is_active_in_field: s.is_active_in_field,
    is_active_in_sheet: true,
    sort_order: s.sort_order,
    ocr_hint: s.ocr_hint,
    threshold,
  };
});
