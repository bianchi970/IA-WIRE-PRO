"use strict";
/**
 * calcEngine.js — ROCCO CALC ENGINE v1.0
 * FASE 2: Tool di calcolo autonomi (CEI 64-8, CEI-UNEL 35024/1, DM 37/08)
 *
 * Zero AI • Zero API • Zero internet • Sempre disponibile
 *
 * Esportazioni principali:
 *   calcola_ib()               → corrente di impiego
 *   calcola_sezione()          → sezione minima cavo
 *   verifica_coordinamento()   → OK/KO coordinamento protezioni
 *   calcola_dv()               → caduta di tensione %
 *   calcola_icc()              → corrente di cortocircuito
 *   calcola_pe()               → sezione conduttore PE
 *   seleziona_differenziale()  → tipo + Idn
 *   seleziona_curva()          → curva interruttore
 *   calcola_terra()            → resistenza dispersore
 *   verifica_obbligo_progetto()→ DM 37/08
 *   runCalcEngine()            → dispatcher automatico (ingresso: messaggio utente)
 */

// ─────────────────────────────────────────────────────────────────────────────
// COSTANTI
// ─────────────────────────────────────────────────────────────────────────────
var RHO_CU  = 0.0175;        // Ω·mm²/m rame  70°C
var RHO_AL  = 0.0291;        // Ω·mm²/m allum 70°C
var SQRT3   = Math.sqrt(3);  // 1.7320...

// Sezioni commerciali standard (mm²)
var SEZIONI = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];

// ─────────────────────────────────────────────────────────────────────────────
// TABELLE PORTATE RAME PVC 70°C  (CEI-UNEL 35024/1)
// [sezione_mm2, Iz_mono(2cond), Iz_tri(3cond)]
// ─────────────────────────────────────────────────────────────────────────────
var PORTATE = {
  // Metodo B1 — tubo incassato in parete (più comune residenziale)
  B1: [
    [1.5,  13.5, 13],   [2.5,  18,   17.5], [4,    24,   23],
    [6,    31,   29],   [10,   42,   39],   [16,   56,   52],
    [25,   73,   68],   [35,   89,   83],   [50,  108,   99],
    [70,  136,  125],   [95,  164,  150],   [120, 188,  172],
    [150, 216,  196],   [185, 245,  223],   [240, 286,  261]
  ],
  // Metodo B2 — tubo incassato in parete isolante
  B2: [
    [1.5,  12,   11.5], [2.5,  16,   15],   [4,    22,   21],
    [6,    28,   26],   [10,   38,   35],   [16,   50,   47],
    [25,   66,   60],   [35,   80,   74],   [50,   96,   87],
    [70,  120,  110],   [95,  145,  133],   [120, 166,  153],
    [150, 189,  175],   [185, 215,  197],   [240, 252,  230]
  ],
  // Metodo C — posa superficiale su parete (multipolare)
  C: [
    [1.5,  17.5, 15.5], [2.5,  24,   21],   [4,    32,   28],
    [6,    41,   36],   [10,   57,   50],   [16,   76,   66],
    [25,  101,   88],   [35,  125,  110],   [50,  151,  133],
    [70,  192,  168],   [95,  232,  201],   [120, 269,  232],
    [150, 300,  258],   [185, 341,  294],   [240, 400,  344]
  ],
  // Metodo E — aria libera (passerella, canalina aperta)
  E: [
    [1.5,  22,   19.5], [2.5,  30,   27],   [4,    40,   36],
    [6,    51,   46],   [10,   70,   63],   [16,   94,   85],
    [25,  119,  107],   [35,  147,  133],   [50,  179,  162],
    [70,  229,  207],   [95,  278,  251],   [120, 322,  292],
    [150, 371,  335],   [185, 424,  382],   [240, 500,  450]
  ],
  // Metodo D — interrato (CEI-UNEL 35026, 20°C, resistività 1 K·m/W)
  D: [
    [1.5,  26,  22],  [2.5,  34,  29],  [4,    44,  38],
    [6,    56,  48],  [10,   73,  64],  [16,   95,  83],
    [25,  121, 106],  [35,  146, 128],  [50,  173, 153],
    [70,  213, 189],  [95,  252, 224],  [120, 287, 255],
    [150, 323, 288],  [185, 363, 324],  [240, 416, 372]
  ]
};

// Fattori K1 temperatura ambiente (PVC) — CEI-UNEL 35024/1 Tab.A
var K_TEMP = {
  10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06,
  30: 1.00, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71
};

// Fattori K2 raggruppamento circuiti — CEI-UNEL 35024/1 Tab.B
var K_RAGGR = {
  1: 1.00, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60,
  6: 0.57, 7: 0.54, 8: 0.52, 9: 0.50, 10: 0.48, 12: 0.45, 14: 0.43, 16: 0.41, 20: 0.38
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNI
// ─────────────────────────────────────────────────────────────────────────────
function round2(v) { return Math.round(v * 100) / 100; }
function round1(v) { return Math.round(v * 10)  / 10; }

/** Restituisce il fattore K1 temperatura più vicino */
function getKtemp(temp) {
  var t = Number(temp) || 30;
  var temps = Object.keys(K_TEMP).map(Number).sort(function(a,b){ return a-b; });
  var closest = temps.reduce(function(prev, curr) {
    return Math.abs(curr - t) < Math.abs(prev - t) ? curr : prev;
  });
  return K_TEMP[closest];
}

/** Restituisce il fattore K2 raggruppamento */
function getKraggr(n) {
  var num = Math.max(1, Math.round(Number(n) || 1));
  var keys = Object.keys(K_RAGGR).map(Number).sort(function(a,b){ return a-b; });
  var closest = keys.reduce(function(prev, curr) {
    return Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev;
  });
  return K_RAGGR[closest];
}

/** Restituisce la sezione commerciale successiva più grande */
function sezioneSucessiva(val) {
  for (var i = 0; i < SEZIONI.length; i++) {
    if (SEZIONI[i] >= val) return SEZIONI[i];
  }
  return SEZIONI[SEZIONI.length - 1];
}

/** Cerca Iz in tabella per metodo e sezione */
function getIzTabella(metodo, sez, fasi) {
  var tab = PORTATE[metodo] || PORTATE.B1;
  var colIdx = (fasi === 1 || fasi === "mono") ? 1 : 2; // 1=mono, 2=tri
  for (var i = 0; i < tab.length; i++) {
    if (tab[i][0] === sez) return tab[i][colIdx];
  }
  return null;
}

/** Trova la sezione minima dove Iz_corretto >= Ib_richiesto */
function trovaSezioneMinima(Ib_richiesta, metodo, fasi, K_tot) {
  var tab = PORTATE[metodo] || PORTATE.B1;
  var colIdx = (fasi === 1 || fasi === "mono") ? 1 : 2;
  var k = K_tot || 1.0;
  for (var i = 0; i < tab.length; i++) {
    var Iz_corretto = tab[i][colIdx] * k;
    if (Iz_corretto >= Ib_richiesta) {
      return { sez: tab[i][0], Iz: round1(tab[i][colIdx]), Iz_corretto: round1(Iz_corretto) };
    }
  }
  return null; // sezione > 240mm²
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 1 — calcola_ib
// Corrente di impiego (CEI 64-8 Art.433)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {number} P_W       potenza attiva in Watt
 * @param {number} V         tensione nominale (230 mono / 400 tri)
 * @param {number} [cosphi]  fattore di potenza (default 0.9)
 * @param {number} [eta]     rendimento (default 1.0 — per carichi resistivi e circuiti)
 * @param {number} [fasi]    1=monofase, 3=trifase (default 1)
 * @returns {{ Ib: number, formula: string, note: string }}
 */
function calcola_ib(P_W, V, cosphi, eta, fasi) {
  var P    = Number(P_W)   || 0;
  var Vn   = Number(V)     || 230;
  var cphi = Number(cosphi) || 0.9;
  var eff  = Number(eta)   || 1.0;
  var f    = Number(fasi)  || 1;

  if (P <= 0) return { ok: false, error: "Potenza non valida" };
  if (cphi <= 0 || cphi > 1) return { ok: false, error: "cosφ non valido (0..1)" };

  var Ib, formula;
  if (f === 3) {
    Ib      = P / (SQRT3 * Vn * cphi * eff);
    formula = "Ib = P / (√3 × V × cosφ × η) = " + P + " / (" + round2(SQRT3) + " × " + Vn + " × " + cphi + " × " + eff + ")";
  } else {
    Ib      = P / (Vn * cphi * eff);
    formula = "Ib = P / (V × cosφ × η) = " + P + " / (" + Vn + " × " + cphi + " × " + eff + ")";
  }

  return {
    ok:      true,
    Ib:      round2(Ib),
    formula: formula,
    note:    (f === 3 ? "Trifase" : "Monofase") + " | V=" + Vn + "V | cosφ=" + cphi + " | η=" + eff
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 2 — calcola_sezione
// Sezione minima cavo (CEI-UNEL 35024/1)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {number} Ib          corrente di impiego (A)
 * @param {string} [metodo]    B1|B2|C|E|D  (default B1)
 * @param {number} [temp]      temperatura ambiente °C (default 30)
 * @param {number} [n_circuiti]numero circuiti raggruppati (default 1)
 * @param {number} [fasi]      1=mono, 3=tri (default 1)
 * @returns {{ sez: number, Iz: number, K_tot: number, metodo: string, note: string }}
 */
function calcola_sezione(Ib, metodo, temp, n_circuiti, fasi) {
  var ib  = Number(Ib) || 0;
  var met = String(metodo || "B1").toUpperCase();
  var K1  = getKtemp(temp);
  var K2  = getKraggr(n_circuiti);
  var K   = round2(K1 * K2);
  var f   = Number(fasi) || 1;

  if (ib <= 0) return { ok: false, error: "Ib non valida" };
  if (!PORTATE[met]) { met = "B1"; }

  var risultato = trovaSezioneMinima(ib, met, f, K);
  if (!risultato) {
    return { ok: false, error: "Sezione necessaria > 240mm² — verificare il dimensionamento" };
  }

  return {
    ok:        true,
    sez:       risultato.sez,
    Iz:        risultato.Iz,
    Iz_ridotto: risultato.Iz_corretto,
    K1:        K1,
    K2:        K2,
    K_tot:     K,
    metodo:    met,
    note:      "Metodo " + met + " | T=" + (temp||30) + "°C | " + (f===3?"Trifase":"Monofase") + " | " + (n_circuiti||1) + " circuiti raggruppati"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 3 — verifica_coordinamento
// Coordinamento protezioni (CEI 64-8 Art.433)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {number} Ib    corrente impiego (A)
 * @param {number} In    corrente nominale interruttore (A)
 * @param {number} Iz    portata cavo (A)
 * @param {number} [If]  corrente fusione interruttore (default 1.45×In per MT, 1.9×In per fus)
 * @returns {{ ok: boolean, esito: string, checks: string[] }}
 */
function verifica_coordinamento(Ib, In, Iz, If) {
  var ib = Number(Ib);
  var In_ = Number(In);
  var iz = Number(Iz);
  var If_ = Number(If) || (1.45 * In_);

  var checks = [];
  var tutto_ok = true;

  // Condizione 1: Ib ≤ In
  if (ib <= In_) {
    checks.push("✅ Ib (" + ib + "A) ≤ In (" + In_ + "A)");
  } else {
    checks.push("❌ Ib (" + ib + "A) > In (" + In_ + "A) — interruttore sottodimensionato");
    tutto_ok = false;
  }

  // Condizione 2: In ≤ Iz
  if (In_ <= iz) {
    checks.push("✅ In (" + In_ + "A) ≤ Iz (" + iz + "A)");
  } else {
    checks.push("❌ In (" + In_ + "A) > Iz (" + iz + "A) — cavo non protetto da sovraccarico");
    tutto_ok = false;
  }

  // Condizione 3: If ≤ 1.45 × Iz
  var lim = round2(1.45 * iz);
  if (If_ <= lim) {
    checks.push("✅ If (" + round2(If_) + "A) ≤ 1.45×Iz (" + lim + "A)");
  } else {
    checks.push("❌ If (" + round2(If_) + "A) > 1.45×Iz (" + lim + "A) — coordinamento non soddisfatto");
    tutto_ok = false;
  }

  return {
    ok:     tutto_ok,
    esito:  tutto_ok ? "COORDINAMENTO OK" : "COORDINAMENTO KO — correggere i punti segnalati",
    checks: checks
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 4 — calcola_dv
// Caduta di tensione (CEI 64-8 Art.525)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {number} S_mm2   sezione cavo mm²
 * @param {number} L_m     lunghezza tratta (m)
 * @param {number} Ib      corrente di impiego (A)
 * @param {number} [cosphi]fattore di potenza (default 0.9)
 * @param {number} [V]     tensione (default 230V)
 * @param {number} [fasi]  1=mono, 3=tri (default 1)
 * @param {string} [mat]   "cu" rame (default) | "al" alluminio
 * @returns {{ dv_V: number, dv_perc: number, ok: boolean, limite: string }}
 */
function calcola_dv(S_mm2, L_m, Ib, cosphi, V, fasi, mat) {
  var S    = Number(S_mm2) || 0;
  var L    = Number(L_m)   || 0;
  var ib   = Number(Ib)    || 0;
  var cphi = Number(cosphi) || 0.9;
  var Vn   = Number(V)     || 230;
  var f    = Number(fasi)  || 1;
  var rho  = (String(mat||"cu").toLowerCase() === "al") ? RHO_AL : RHO_CU;

  if (S <= 0 || L <= 0 || ib <= 0) return { ok: false, error: "Parametri non validi" };

  // Formula semplificata (X trascurabile per S ≤ 35mm²)
  var dv_V, formula;
  if (f === 3) {
    dv_V    = (SQRT3 * rho * L * ib) / S;
    formula = "ΔV = √3 × ρ × L × Ib / S";
  } else {
    dv_V    = (2 * rho * L * ib) / S;
    formula = "ΔV = 2 × ρ × L × Ib / S";
  }

  var dv_perc = (dv_V / Vn) * 100;

  // Limiti CEI 64-8 Art.525:
  // 4% per utenza singola / 3% raccomandato per lighting
  var limite_perc = 4.0;
  var ok_4 = dv_perc <= 4.0;
  var ok_3 = dv_perc <= 3.0;

  return {
    ok:       ok_4,
    dv_V:     round2(dv_V),
    dv_perc:  round2(dv_perc),
    formula:  formula,
    entro_3:  ok_3,
    entro_4:  ok_4,
    limite:   ok_3 ? "✅ Entro 3% (ottimale)"
              : ok_4 ? "⚠️ Tra 3% e 4% (accettabile, verificare)"
              : "❌ Supera 4% — sezione insufficiente (CEI 64-8 Art.525)",
    note:     (f===3?"Trifase":"Monofase") + " | " + (mat==="al"?"Alluminio":"Rame") + " | S=" + S + "mm² | L=" + L + "m"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 5 — calcola_icc
// Corrente di cortocircuito nel punto (approssimata)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {number} Sn_kVA    potenza trasformatore (kVA). Se 0 usa Icc_BUS diretto.
 * @param {number} Vcc_perc  tensione di cortocircuito % (tipico 4-6%)
 * @param {number} [L_m]     lunghezza linea da trafo a punto (m)
 * @param {number} [S_mm2]   sezione cavo linea (mm²)
 * @param {number} [Icc_BUS] Icc noto alla barra (kA) — se non si conosce il trafo
 * @returns {{ Icc_trafo: number, Icc_punto: number, Zloop: number }}
 */
function calcola_icc(Sn_kVA, Vcc_perc, L_m, S_mm2, Icc_BUS) {
  var Sn   = Number(Sn_kVA)  || 0;
  var Vcc  = Number(Vcc_perc)|| 4;
  var L    = Number(L_m)     || 0;
  var S    = Number(S_mm2)   || 0;
  var Vn   = 400; // BT trifase standard

  var Icc_trafo;
  if (Icc_BUS) {
    Icc_trafo = Number(Icc_BUS) * 1000; // converti da kA ad A
  } else if (Sn > 0) {
    var In_tr = (Sn * 1000) / (SQRT3 * Vn);
    Icc_trafo = In_tr / (Vcc / 100);
  } else {
    return { ok: false, error: "Inserire Sn trasformatore o Icc barra" };
  }

  // Icc al punto: calcolo semplificato con Zloop
  var Icc_punto = Icc_trafo;
  var Zloop_mOhm = 0;
  if (L > 0 && S > 0) {
    // Z_loop = (R_fase + R_PE) con PE = sezione fase (per S ≤ 16mm²)
    var R_km = (RHO_CU * 1000) / S;  // mΩ/m
    Zloop_mOhm = 2 * R_km * L;       // andata + ritorno
    var Zloop_Ohm = Zloop_mOhm / 1000;
    Icc_punto = (0.95 * 230) / (SQRT3 * Zloop_Ohm); // formula approssimata
    Icc_punto = Math.min(Icc_punto, Icc_trafo);      // non può superare Icc barra
  }

  return {
    ok:         true,
    Icc_trafo:  round1(Icc_trafo),
    Icc_punto:  round1(Icc_punto),
    Icc_kA:     round2(Icc_punto / 1000),
    Zloop_mOhm: round2(Zloop_mOhm),
    note:       "Icc alla barra: " + round1(Icc_trafo/1000) + " kA | Icc al punto (" + L + "m, " + S + "mm²): " + round2(Icc_punto/1000) + " kA"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 6 — calcola_pe
// Sezione conduttore PE (CEI 64-8 Tab.54F)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {number} S_fase sezione del conduttore di fase (mm²)
 * @returns {{ pe: number, regola: string }}
 */
function calcola_pe(S_fase) {
  var S = Number(S_fase);
  if (S <= 0 || isNaN(S)) return { ok: false, error: "Sezione fase non valida" };

  var pe, regola;
  if (S <= 16) {
    pe     = S;
    regola = "S_fase ≤ 16mm² → PE = S_fase";
  } else if (S <= 35) {
    pe     = 16;
    regola = "16 < S_fase ≤ 35mm² → PE = 16mm²";
  } else {
    pe     = sezioneSucessiva(S / 2);
    regola = "S_fase > 35mm² → PE = S/2 (arrotondato alla sez. commerciale)";
  }

  return {
    ok:     true,
    pe:     pe,
    regola: regola,
    note:   "Fase " + S + "mm² → PE " + pe + "mm²"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 7 — seleziona_differenziale
// Tipo differenziale + Idn (CEI 64-8 + ROCCO_KNOWLEDGE v3 Regola 1)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} carico  descrizione del carico (testo libero)
 * @param {string} locale  tipo di locale (testo libero)
 * @returns {{ tipo: string, Idn: number, motivazione: string, norma: string }}
 */
function seleziona_differenziale(carico, locale) {
  var c = String(carico || "").toLowerCase();
  var l = String(locale  || "").toLowerCase();
  var testo = c + " " + l;

  // Tipo B — obbligatorio EV/wallbox
  if (/wallbox|colonnin|ev\b|veicolo elettr|ricarica auto|sez.?722|722/.test(testo)) {
    return {
      ok:          true,
      tipo:        "B",
      Idn:         30,
      motivazione: "Carico EV/Wallbox — CEI 64-8 Sez.722 obbliga Tipo B per correnti CC residue",
      norma:       "CEI 64-8 Sez.722"
    };
  }

  // Tipo F — inverter monofase, VFD, lavatrice a inverter
  if (/vfd|variatore|inverter monof|pompa.*inverter|lavatrice.*inverter|inverter.*lavatrice|soft.?start/.test(testo)) {
    return {
      ok:          true,
      tipo:        "F",
      Idn:         30,
      motivazione: "Inverter monofase / VFD — correnti di guasto miste a freq. variabile (10Hz-1kHz)",
      norma:       "CEI 64-8 IX ed. art.531.3.3"
    };
  }

  // Tipo A — carichi con correnti pulsanti (motori, UPS, pompe di calore, PV)
  if (/pompa di calore|pompa calore|pdc|ups\b|fotovolt|fv\b|inverter|motor|compressore|pompa\b/.test(testo)) {
    return {
      ok:          true,
      tipo:        "A",
      Idn:         30,
      motivazione: "Carico con correnti pulsanti DC — differenziale AC non sufficiente",
      norma:       "CEI 64-8 art.531.3.1"
    };
  }

  // Luoghi speciali — bagno, 30mA obbligatorio
  if (/bagno|doccia|vasca|piscina|cantiere|esterno|giardino/.test(testo)) {
    return {
      ok:          true,
      tipo:        "A",
      Idn:         30,
      motivazione: "Locale speciale: differenziale 30mA obbligatorio CEI 64-8",
      norma:       "CEI 64-8 Sez.701/704"
    };
  }

  // Luoghi medici
  if (/medic|ambulat|clinica|ospedale|infermeria/.test(testo)) {
    return {
      ok:          true,
      tipo:        "A",
      Idn:         10,
      motivazione: "Luogo medico Gruppo 1/2: Idn ≤ 30mA, limite tensione contatto 25V",
      norma:       "CEI 64-8 Sez.710"
    };
  }

  // Default — luci, prese standard, riscaldamento resistivo
  return {
    ok:          true,
    tipo:        "AC",
    Idn:         30,
    motivazione: "Carichi standard resistivi/illuminazione — Tipo AC sufficiente",
    norma:       "CEI 64-8 art.531"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 8 — seleziona_curva
// Curva magnetotermica (ROCCO_KNOWLEDGE v3 Regola 4)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} carico descrizione del carico
 * @returns {{ curva: string, range_Irm: string, motivazione: string }}
 */
function seleziona_curva(carico) {
  var c = String(carico || "").toLowerCase();

  if (/plc|inverter|ups\b|elettronic|strumentaz|sensore|azionamento|variatore/.test(c)) {
    return { ok: true, curva: "Z", range_Irm: "2-3×In",  motivazione: "Dispositivi elettronici sensibili — massima protezione" };
  }
  if (/motore|pompa.*diretto|compressore|trasformatore|avviam/.test(c)) {
    return { ok: true, curva: "D", range_Irm: "10-20×In", motivazione: "Motori/trasformatori — alta corrente di spunto avviamento" };
  }
  if (/motore.*industriale|alta.*inerzia/.test(c)) {
    return { ok: true, curva: "K", range_Irm: "8-15×In",  motivazione: "Motori industriali alta inerzia — protezione ottimizzata" };
  }
  if (/luce|illuminazione|presa|resistenza|scalda|stufa|riscaldamento/.test(c)) {
    return { ok: true, curva: "B", range_Irm: "3-5×In",   motivazione: "Carichi resistivi/illuminazione — bassa corrente di spunto" };
  }
  // Default residenziale/commerciale
  return { ok: true, curva: "C", range_Irm: "5-10×In",  motivazione: "Uso generale residenziale/commerciale (default)" };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 9 — calcola_terra
// Resistenza dispersore (CEI 64-8 art.413 + ROCCO_KNOWLEDGE v4 Parte 16)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {number} rho            resistività terreno (Ω·m)
 * @param {string} [tipo]         picchetto | anello | fondazione
 * @param {number} [L_o_diam]     lunghezza picchetto (m) o diametro fondazione (m)
 * @returns {{ RE: number, verifica_TT: object, note: string }}
 */
function calcola_terra(rho, tipo, L_o_diam) {
  var r   = Number(rho)     || 50;  // tipico Italia
  var ld  = Number(L_o_diam)|| 2;
  var t   = String(tipo || "picchetto").toLowerCase();

  var RE, formula;
  if (t === "picchetto") {
    RE      = r / ld;
    formula = "RE ≈ ρ/L = " + r + "/" + ld;
  } else if (t === "anello") {
    RE      = r / (2 * ld);
    formula = "RE ≈ ρ/(2×d) = " + r + "/(2×" + ld + ")";
  } else { // fondazione / trefolo
    RE      = r / 12; // approssimazione edificio 10×10m
    formula = "RE ≈ ρ/12 (trefolo fondazione)";
  }
  RE = round1(RE);

  // Verifica CEI 64-8 art.413 — sistema TT
  var ok_30mA  = RE * 0.030  <= 50;
  var ok_300mA = RE * 0.300  <= 50;
  var ok_500mA = RE * 0.500  <= 50;

  return {
    ok:      true,
    RE:      RE,
    formula: formula,
    verifica_TT: {
      "30mA":  { RE_lim: round1(50/0.030),  ok: ok_30mA,  msg: ok_30mA  ? "OK" : "KO" },
      "300mA": { RE_lim: round1(50/0.300),  ok: ok_300mA, msg: ok_300mA ? "OK" : "KO" },
      "500mA": { RE_lim: round1(50/0.500),  ok: ok_500mA, msg: ok_500mA ? "OK" : "KO" }
    },
    note: tipo + " | ρ=" + r + " Ω·m | " + (t==="picchetto"?"L":"d") + "=" + ld + "m → RE=" + RE + "Ω"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 10 — verifica_obbligo_progetto
// DM 37/08 art.5 — obbligo progetto firmato
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {number} potenza_kW   potenza contrattuale kW
 * @param {number} superficie_m2 superficie m²
 * @param {string} tipo          residenziale | commerciale | industriale
 * @returns {{ obbligo: boolean, motivo: string[], norma: string }}
 */
function verifica_obbligo_progetto(potenza_kW, superficie_m2, tipo) {
  var P = Number(potenza_kW)   || 0;
  var S = Number(superficie_m2)|| 0;
  var t = String(tipo || "residenziale").toLowerCase();

  var motivi = [];
  var soglia_sup = t === "residenziale" ? 400 : 200;

  if (P > 6)         motivi.push("Potenza > 6 kW (" + P + " kW)");
  if (S > soglia_sup)motivi.push("Superficie > " + soglia_sup + " m² (" + S + " m²)");

  // Sempre obbligatorio
  if (/condomini|medic|atex|esplosion|fulmine|lps/.test(t)) {
    motivi.push("Tipologia a rischio: sempre obbligatorio");
  }

  return {
    ok:       true,
    obbligo:  motivi.length > 0,
    motivo:   motivi.length > 0 ? motivi : ["Nessun obbligo — firma responsabile tecnico impresa sufficiente"],
    norma:    "DM 37/08 art.5 comma 2"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 11 — calcola_sezione_da_dv
// Sezione minima da vincolo ΔV% (inverso di calcola_dv)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {number} Ib      corrente di impiego (A)
 * @param {number} L_m     lunghezza (m)
 * @param {number} dv_max  ΔV% max ammesso (default 4)
 * @param {number} [V]     tensione (default 230)
 * @param {number} [fasi]  1|3 (default 1)
 * @returns {{ sez: number, S_calcolata: number }}
 */
function calcola_sezione_da_dv(Ib, L_m, dv_max, V, fasi) {
  var ib   = Number(Ib)    || 0;
  var L    = Number(L_m)   || 0;
  var dvp  = Number(dv_max)|| 4.0;
  var Vn   = Number(V)     || 230;
  var f    = Number(fasi)  || 1;

  if (ib <= 0 || L <= 0) return { ok: false, error: "Parametri non validi" };

  // S_min = (2 × ρ × L × Ib) / (ΔV%/100 × V)  [mono]
  // S_min = (√3 × ρ × L × Ib) / (ΔV%/100 × V) [tri]
  var k    = f === 3 ? SQRT3 : 2;
  var S_calc = (k * RHO_CU * L * ib) / ((dvp / 100) * Vn);
  var S_comm = sezioneSucessiva(S_calc);

  return {
    ok:         true,
    S_calcolata: round2(S_calc),
    sez:        S_comm,
    note:       "Da ΔV≤" + dvp + "% con Ib=" + ib + "A, L=" + L + "m → S≥" + round2(S_calc) + "mm² → commerciale: " + S_comm + "mm²"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCHER AUTOMATICO — runCalcEngine
// Legge il messaggio utente, rileva parametri elettrici, esegue i calcoli
// rilevanti e restituisce un blocco testo pronto per il system prompt.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} message      messaggio utente
 * @param {object} [numericValues] valori già estratti da numericRecognizer
 * @returns {{ hasCalc: boolean, context: string, results: object }}
 */
function runCalcEngine(message, numericValues) {
  var msg = String(message || "").toLowerCase();
  var nv  = numericValues || {};
  var calcs = {};
  var lines = [];

  // ── Estrazione parametri dal testo (regex robusti) ──────────────────────

  // Potenza: "3kW", "3.5 kW", "3500W", "3500 watt"
  var matchP = msg.match(/(\d+(?:[.,]\d+)?)\s*kw\b/i) ||
               msg.match(/(\d{3,})\s*w\b/i);
  var P_W = matchP ? parseFloat(matchP[1].replace(",",".")) * (msg.match(/kw/i) ? 1000 : 1) : 0;

  // Tensione
  var matchV = msg.match(/(\d+)\s*v\b/i);
  var V_n = matchV ? parseInt(matchV[1]) : (nv.voltages && nv.voltages.length ? nv.voltages[0] : 0);
  if (!V_n) V_n = /trifase|400v?/i.test(msg) ? 400 : 230;

  // Fasi
  var fasi = /trifase|3\s*fas|tri.?fase/.test(msg) ? 3 : 1;

  // Lunghezza: "20m", "20 metri", "20ml"
  var matchL = msg.match(/(\d+(?:[.,]\d+)?)\s*(?:m\b|metri\b|ml\b)/i);
  var L_m = matchL ? parseFloat(matchL[1]) : 0;

  // Sezione: "2.5mm2", "2.5 mm²", "6mmq"
  var matchS = msg.match(/(\d+(?:[.,]\d+)?)\s*mm[²2q]/i);
  var S_mm2 = matchS ? parseFloat(matchS[1]) : 0;

  // cosφ
  var matchCos = msg.match(/cos[φf]?\s*[=:]?\s*0[.,](\d+)/i);
  var cosphi = matchCos ? parseFloat("0." + matchCos[1]) : 0.9;

  // ── Calcoli se dati sufficienti ──────────────────────────────────────────

  // Calcolo Ib (se c'è la potenza)
  if (P_W > 0) {
    var res_ib = calcola_ib(P_W, V_n, cosphi, 1.0, fasi);
    if (res_ib.ok) {
      calcs.ib = res_ib;
      lines.push("Ib calcolata: " + res_ib.Ib + " A | " + res_ib.note);
    }
  }

  // Calcolo sezione (se c'è Ib)
  var Ib_eff = (calcs.ib && calcs.ib.Ib) || (nv.currents && nv.currents[0]) || 0;
  if (Ib_eff > 0) {
    var metodo = /interrato|sotterraneo/.test(msg) ? "D"
               : /aria.*libera|passerella|canalina/.test(msg) ? "E"
               : /superficiale|fissato/.test(msg) ? "C" : "B1";
    var res_sez = calcola_sezione(Ib_eff, metodo, 30, 1, fasi);
    if (res_sez.ok) {
      calcs.sezione = res_sez;
      lines.push("Sezione minima (metodo " + metodo + "): " + res_sez.sez + " mm² | Iz=" + res_sez.Iz + "A");
      // Calcola anche PE
      var res_pe = calcola_pe(res_sez.sez);
      if (res_pe.ok) {
        calcs.pe = res_pe;
        lines.push("Conduttore PE: " + res_pe.pe + " mm² | " + res_pe.regola);
      }
    }
  }

  // Caduta di tensione (se ho sezione E lunghezza)
  var S_calc = S_mm2 || (calcs.sezione && calcs.sezione.sez) || 0;
  if (S_calc > 0 && L_m > 0 && Ib_eff > 0) {
    var res_dv = calcola_dv(S_calc, L_m, Ib_eff, cosphi, V_n, fasi);
    if (res_dv.ok !== false) {
      calcs.dv = res_dv;
      lines.push("Caduta tensione: " + res_dv.dv_perc + "% (" + res_dv.dv_V + "V) — " + res_dv.limite);
    }
  }

  // Sezione da ΔV (se ho solo lunghezza e Ib)
  if (L_m > 0 && Ib_eff > 0 && !S_calc) {
    var res_sdv = calcola_sezione_da_dv(Ib_eff, L_m, 4, V_n, fasi);
    if (res_sdv.ok) {
      calcs.sezione_dv = res_sdv;
      lines.push("Sezione da ΔV≤4%: " + res_sdv.sez + " mm² | " + res_sdv.note);
    }
  }

  // Tipo differenziale (sempre — da parole chiave)
  var res_diff = seleziona_differenziale(msg, msg);
  if (res_diff.ok) {
    calcs.differenziale = res_diff;
    // Includi solo se non è il default banale o se c'è qualcosa di specifico
    if (res_diff.tipo !== "AC" || /differenzial|rcd|salvavita/.test(msg)) {
      lines.push("Differenziale: Tipo " + res_diff.tipo + " Idn=" + res_diff.Idn + "mA | " + res_diff.motivazione);
    }
  }

  // Curva interruttore
  var res_curva = seleziona_curva(msg);
  if (res_curva.ok && /interruttore|magnetoterm|mt\b|mcb|curva/i.test(msg)) {
    calcs.curva = res_curva;
    lines.push("Curva interruttore: " + res_curva.curva + " (" + res_curva.range_Irm + ") | " + res_curva.motivazione);
  }

  // Verifica coordinamento (se ho Ib, In, Iz)
  var In_txt = msg.match(/(\d+)\s*a\b.*(?:interruttore|mt\b|mcb)/i) ||
               msg.match(/interruttore.*?(\d+)\s*a\b/i);
  if (In_txt && Ib_eff > 0 && S_calc > 0) {
    var In_val = parseFloat(In_txt[1]);
    var Iz_val = getIzTabella("B1", S_calc, fasi) || 0;
    if (In_val > 0 && Iz_val > 0) {
      var res_coord = verifica_coordinamento(Ib_eff, In_val, Iz_val);
      calcs.coordinamento = res_coord;
      lines.push("Coordinamento (" + Ib_eff + "A/" + In_val + "A/" + Iz_val + "A): " + res_coord.esito);
    }
  }

  var context = "";
  if (lines.length > 0) {
    context = "═══ CALCOLI AUTOMATICI ROCCO (senza AI) ═══\n" +
              lines.join("\n") + "\n" +
              "⚡ Questi valori sono calcolati in tempo reale. Usali come base per la risposta.\n";
  }

  return {
    hasCalc:  lines.length > 0,
    context:  context,
    results:  calcs,
    params:   { P_W: P_W, V_n: V_n, fasi: fasi, L_m: L_m, S_mm2: S_mm2, cosphi: cosphi, Ib_eff: Ib_eff }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  // Tool singoli (usabili via /api/calc)
  calcola_ib:                calcola_ib,
  calcola_sezione:           calcola_sezione,
  verifica_coordinamento:    verifica_coordinamento,
  calcola_dv:                calcola_dv,
  calcola_icc:               calcola_icc,
  calcola_pe:                calcola_pe,
  seleziona_differenziale:   seleziona_differenziale,
  seleziona_curva:           seleziona_curva,
  calcola_terra:             calcola_terra,
  verifica_obbligo_progetto: verifica_obbligo_progetto,
  calcola_sezione_da_dv:     calcola_sezione_da_dv,
  // Dispatcher automatico (usato da server.js nel flusso chat)
  runCalcEngine:             runCalcEngine,
  // Costanti esposte
  SEZIONI:                   SEZIONI,
  PORTATE:                   PORTATE
};
