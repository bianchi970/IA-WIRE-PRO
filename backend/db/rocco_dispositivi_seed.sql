-- ROCCO — Seed dati dispositivi elettrici reali
-- Dati solo se tabella vuota (idempotente)

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM rocco_dispositivi) = 0 THEN

    -- ═══ MCB — Magnetotermici ═══════════════════════════════════════════════

    INSERT INTO rocco_dispositivi (codice, famiglia, sottofamiglia, nome, marca, tensione_nominale_V, corrente_nominale_A, potere_interruzione_kA, applicazione, note_normative) VALUES
    ('MCB-6C',   'MCB', 'curva_C',  'Magnetotermico 6A Curva C',   'Hager',   230, 6,   6, 'Circuiti luce, prese',                          'CEI EN 60898-1, CEI 64-8 art.433'),
    ('MCB-10C',  'MCB', 'curva_C',  'Magnetotermico 10A Curva C',  'Hager',   230, 10,  6, 'Luce + prese, forni piccoli',                   'CEI EN 60898-1'),
    ('MCB-16C',  'MCB', 'curva_C',  'Magnetotermico 16A Curva C',  'ABB',     230, 16,  6, 'Prese, lavatrice, lavastoviglie',               'CEI EN 60898-1'),
    ('MCB-20C',  'MCB', 'curva_C',  'Magnetotermico 20A Curva C',  'ABB',     230, 20,  6, 'Forno elettrico, piano cottura',               'CEI EN 60898-1'),
    ('MCB-25C',  'MCB', 'curva_C',  'Magnetotermico 25A Curva C',  'Schneider',230, 25, 6, 'Impianto cucina, condizionatore',              'CEI EN 60898-1'),
    ('MCB-32C',  'MCB', 'curva_C',  'Magnetotermico 32A Curva C',  'Schneider',230, 32, 6, 'Colonne montanti, sub-quadri',                 'CEI EN 60898-1'),
    ('MCB-16D',  'MCB', 'curva_D',  'Magnetotermico 16A Curva D',  'ABB',     400, 16, 10, 'Motori, trasformatori, avviamento DOL',        'CEI EN 60898-1, DM 37/08'),
    ('MCB-25D',  'MCB', 'curva_D',  'Magnetotermico 25A Curva D',  'Hager',   400, 25, 10, 'Pompe, compressori, avviamento pesante',       'CEI EN 60898-1');

    -- ═══ RCCB — Differenziali puri ══════════════════════════════════════════

    INSERT INTO rocco_dispositivi (codice, famiglia, sottofamiglia, nome, marca, tensione_nominale_V, corrente_nominale_A, corrente_differenziale_mA, tipo_differenziale, applicazione, note_normative) VALUES
    ('RCCB-25-30AC',  'RCCB', 'tipo_AC', 'Differenziale 25A 30mA AC',  'Hager',    230, 25, 30,  'AC', 'Circuiti luce/prese impianti civili senza inverter',        'CEI EN 61008-1, CEI 64-8 art.413'),
    ('RCCB-40-30AC',  'RCCB', 'tipo_AC', 'Differenziale 40A 30mA AC',  'ABB',      230, 40, 30,  'AC', 'Circuiti misti civili, sub-quadri piccoli',                 'CEI EN 61008-1'),
    ('RCCB-63-30AC',  'RCCB', 'tipo_AC', 'Differenziale 63A 30mA AC',  'Schneider',230, 63, 30,  'AC', 'Quadro principale abitazione, colonna 6kW',                'CEI EN 61008-1'),
    ('RCCB-40-30A',   'RCCB', 'tipo_A',  'Differenziale 40A 30mA Tipo A', 'ABB',   230, 40, 30,  'A',  'Inverter, pompe calore, VFD, carichi con componente DC',   'CEI EN 61008-1, CEI 64-8'),
    ('RCCB-63-30A',   'RCCB', 'tipo_A',  'Differenziale 63A 30mA Tipo A', 'Hager', 230, 63, 30,  'A',  'Quadri con inverter, FV, pompe calore',                    'CEI EN 61008-1'),
    ('RCCB-40-300AC', 'RCCB', 'tipo_AC', 'Differenziale 40A 300mA AC (selettivo)', 'ABB', 400, 40, 300, 'AC', 'Protezione di rifasamento, antincendio',             'CEI EN 61008-1'),
    ('RCCB-25-30F',   'RCCB', 'tipo_F',  'Differenziale 25A 30mA Tipo F', 'Schneider', 230, 25, 30, 'F', 'Pompe calore ad alta frequenza, VFD compressori',        'CEI EN 61008-1');

    -- ═══ RCBO — Differenziali magnetotermici ════════════════════════════════

    INSERT INTO rocco_dispositivi (codice, famiglia, sottofamiglia, nome, marca, tensione_nominale_V, corrente_nominale_A, corrente_differenziale_mA, tipo_differenziale, potere_interruzione_kA, applicazione, note_normative) VALUES
    ('RCBO-16C-30AC', 'RCBO', 'curva_C_AC', 'RCBO 16A Curva C 30mA AC',  'Hager',    230, 16, 30, 'AC', 4.5, 'Prese/luce con protezione integrata, spazi ridotti',  'CEI EN 61009-1'),
    ('RCBO-20C-30AC', 'RCBO', 'curva_C_AC', 'RCBO 20A Curva C 30mA AC',  'ABB',      230, 20, 30, 'AC', 4.5, 'Forni, lavatrice con protezione integrata',           'CEI EN 61009-1'),
    ('RCBO-25C-30A',  'RCBO', 'curva_C_A',  'RCBO 25A Curva C 30mA Tipo A','Hager',  230, 25, 30, 'A',  6,   'Circuiti con pompe, inverter singolo',               'CEI EN 61009-1');

    -- ═══ MCCB — Scatolati ═══════════════════════════════════════════════════

    INSERT INTO rocco_dispositivi (codice, famiglia, sottofamiglia, nome, marca, tensione_nominale_V, corrente_nominale_A, potere_interruzione_kA, applicazione, note_normative) VALUES
    ('MCCB-63',  'MCCB', 'scatolato',  'MCCB 63A 25kA',  'Schneider', 400, 63,  25, 'Quadri industriali, protezione linee principali BT',  'CEI EN 60947-2'),
    ('MCCB-100', 'MCCB', 'scatolato',  'MCCB 100A 36kA', 'ABB',       400, 100, 36, 'Cabine MT/BT, quadri di distribuzione industriali',  'CEI EN 60947-2'),
    ('MCCB-160', 'MCCB', 'scatolato',  'MCCB 160A 50kA', 'ABB',       400, 160, 50, 'Trasformatori fino a 100kVA, quadri generali',       'CEI EN 60947-2');

    -- ═══ MOTORI ASINCRONI ═══════════════════════════════════════════════════

    INSERT INTO rocco_dispositivi (codice, famiglia, sottofamiglia, nome, tensione_nominale_V, corrente_nominale_A, applicazione, note_normative) VALUES
    ('MOT-037',  'MOTORE', 'asincrono_trifase', 'Motore asincrono 0.37kW IE2', 400, 1.1,  'Pompe piccole, ventilatori, nastri leggeri',         'CEI EN 60034, IE2'),
    ('MOT-075',  'MOTORE', 'asincrono_trifase', 'Motore asincrono 0.75kW IE2', 400, 2.0,  'Pompe circolatori, ventilatori leggeri',             'CEI EN 60034, IE2'),
    ('MOT-150',  'MOTORE', 'asincrono_trifase', 'Motore asincrono 1.5kW IE2',  400, 3.7,  'Pompe centrifughe, compressori piccoli',             'CEI EN 60034, IE2'),
    ('MOT-300',  'MOTORE', 'asincrono_trifase', 'Motore asincrono 3kW IE2',    400, 6.8,  'Pompe, compressori, nastri trasportatori',           'CEI EN 60034, IE2'),
    ('MOT-550',  'MOTORE', 'asincrono_trifase', 'Motore asincrono 5.5kW IE2',  400, 12.0, 'Compressori, macchine utensili, pompe industriali', 'CEI EN 60034, IE2'),
    ('MOT-1100', 'MOTORE', 'asincrono_trifase', 'Motore asincrono 11kW IE2',   400, 22.0, 'Compressori aria, pompe alta portata',              'CEI EN 60034, IE2'),
    ('MOT-2200', 'MOTORE', 'asincrono_trifase', 'Motore asincrono 22kW IE3',   400, 41.0, 'Ventilatori industriali, pompe grosse',             'CEI EN 60034, IE3');

    -- ═══ CONTATTORI ═════════════════════════════════════════════════════════

    INSERT INTO rocco_dispositivi (codice, famiglia, sottofamiglia, nome, tensione_nominale_V, corrente_nominale_A, applicazione, note_normative) VALUES
    ('CONT-9AC3',  'CONTATTORE', 'AC3',  'Contattore 9A AC-3 (bobina 230Vac)',  400, 9,   'Motori fino 4kW, avviamento diretto DOL',    'CEI EN 60947-4-1, AC-3'),
    ('CONT-18AC3', 'CONTATTORE', 'AC3',  'Contattore 18A AC-3 (bobina 230Vac)', 400, 18,  'Motori fino 7.5kW, avviamento diretto DOL', 'CEI EN 60947-4-1, AC-3'),
    ('CONT-32AC3', 'CONTATTORE', 'AC3',  'Contattore 32A AC-3 (bobina 24Vac)',  400, 32,  'Motori fino 15kW, avviamento stella-delta', 'CEI EN 60947-4-1, AC-3'),
    ('CONT-65AC3', 'CONTATTORE', 'AC3',  'Contattore 65A AC-3 (bobina 24Vac)',  400, 65,  'Motori fino 30kW, industria pesante',       'CEI EN 60947-4-1, AC-3');

    -- ═══ TRASFORMATORI ══════════════════════════════════════════════════════

    INSERT INTO rocco_dispositivi (codice, famiglia, sottofamiglia, nome, tensione_nominale_V, applicazione, note_normative) VALUES
    ('TRASF-63',  'TRASFORMATORE', 'distribuzione', 'Trasformatore MT/BT 63kVA 20kV/400V',  400, 'Cabina condominiale, piccola industria',      'CEI EN 60076, CEI 11-35'),
    ('TRASF-160', 'TRASFORMATORE', 'distribuzione', 'Trasformatore MT/BT 160kVA 20kV/400V', 400, 'Capannone industriale, centro commerciale',  'CEI EN 60076, CEI 11-35'),
    ('TRASF-400', 'TRASFORMATORE', 'distribuzione', 'Trasformatore MT/BT 400kVA 20kV/400V', 400, 'Grande industria, edificio terziario',       'CEI EN 60076, CEI 11-35');

  END IF;
END $$;

-- ─── GUASTI ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM rocco_guasti) = 0 THEN

    -- GUASTI DIFFERENZIALE (RCCB)
    INSERT INTO rocco_guasti (dispositivo_codice, famiglia, sintomo, causa_probabile, probabilita, verifica, strumento, valore_atteso, rischio, riferimento_norma) VALUES
    ('RCCB-40-30AC', 'RCCB', 'Differenziale scatta immediatamente al riarmo', 'Dispersione verso terra su carico o cavo sempre presente', 'Alta', 'Scollegare tutti i carichi → riarmare. Se rimane su → dispersione nei cavi. Ricollegare uno per uno.', 'Megaohmmetro 500Vdc', 'Riso > 1MΩ (CEI), ottimo > 100MΩ', 'Folgorazione se non si individua la fonte', 'CEI 64-8 art.413'),
    ('RCCB-40-30AC', 'RCCB', 'Differenziale scatta solo con carichi collegati', 'Dispersione in uno specifico apparecchio o cavo', 'Alta', 'Scollegare un carico alla volta. Quando rimuovendo un carico il diff rimane su → quello è il responsabile.', 'Nessuno nella fase esclusione — megaohmmetro per conferma', 'Diff non scatta a vuoto', 'Guasto apparecchio responsabile della dispersione', 'CEI 64-8 art.413'),
    ('RCCB-40-30AC', 'RCCB', 'Differenziale scatta solo con umidità o pioggia', 'Infiltrazione acqua nell isolamento o in scatole derivazione', 'Alta', 'Ispezionare scatole derivazione esterne, condutture, canaline. Misurare Riso con umidità.', 'Megaohmmetro 500Vdc + ispezione visiva', 'Riso > 1MΩ con impianto asciutto. Calare con umidità indica infiltrazione.', 'Rischio dispersione progressiva, possibile incendio', 'CEI 64-8, CEI 20-45'),
    ('RCCB-40-30AC', 'RCCB', 'Differenziale scatta sommando più carichi ma ognuno da solo è ok', 'Dispersione cumulativa: ogni carico ha piccola perdita, insieme superano 30mA', 'Media', 'Misurare corrente di dispersione di ogni singolo carico con pinza differenziale. Sommare i valori.', 'Pinza amperometrica differenziale (risoluzione 1mA)', 'Ogni carico singolo < 10mA. Somma > 30mA causa scatto', 'Degrado progressivo isolamento — intervento necessario', 'CEI 64-8 art.413'),
    ('RCCB-40-30AC', 'RCCB', 'Differenziale nuovissimo scatta a vuoto senza carichi', 'Diff difettoso oppure dispersione nel cablaggio del quadro', 'Media', 'Sostituire il differenziale con uno funzionante. Se scatta ancora → dispersione nei cavi del quadro.', 'Megaohmmetro 500Vdc sui cavi dal quadro', 'Nuovo diff non deve scattare a vuoto su impianto sano', 'Possibile cavo pinzato nello stipite o giunzione difettosa', 'CEI 64-8'),

    -- GUASTI MCB
    ('MCB-16C', 'MCB', 'Magnetotermico scatta con botta istantanea', 'Cortocircuito — resistenza quasi zero tra i conduttori', 'Alta', 'Scollegare tutti i carichi. Misurare resistenza con multimetro tra L e N a valle del MT. Trovare il punto di cortocircuito.', 'Multimetro in modalità Ω', 'R > 1MΩ su circuito sano. Se < 10Ω → cortocircuito presente', 'Arco elettrico se riarmo con cortocircuito presente', 'CEI 64-8 art.434'),
    ('MCB-16C', 'MCB', 'Magnetotermico scatta gradualmente senza botta dopo minuti o ore', 'Sovraccarico — somma correnti carichi supera la targa del MT', 'Alta', 'Misurare corrente sul conduttore con pinza amperometrica. Confrontare con In del MT.', 'Pinza amperometrica true-RMS', 'Corrente misurata < In del magnetotermico', 'Surriscaldamento cavi, possibile incendio se non corretto', 'CEI 64-8 art.433'),
    ('MCB-16C', 'MCB', 'Magnetotermico non si riarma subito ma solo dopo minuti', 'Intervento termico — bimetallico caldo, deve raffreddarsi', 'Alta', 'Attendere 5-10 minuti poi riarmare. Se si riarma → confermato sovraccarico. Misurare corrente.', 'Pinza amperometrica dopo riarmo', 'MT si riarma dopo raffreddamento. Corrente misurata > In', 'Ripetersi del sovraccarico causerà nuovo scatto', 'CEI EN 60898-1'),
    ('MCB-16C', 'MCB', 'Magnetotermico scatta anche senza carichi collegati', 'MT difettoso oppure cortocircuito nel cablaggio interno al quadro', 'Media', 'Controllare cablaggio nel quadro: cavi pinzati, isolante usurato, morsetti. Poi sostituire MT se cablaggio ok.', 'Ispezione visiva + multimetro in continuità', 'Nessuna continuità tra L e N a valle senza carichi', 'Corto nei cavi del quadro — rischio incendio', 'CEI 64-8'),

    -- GUASTI RCBO
    ('RCBO-16C-30AC', 'RCBO', 'RCBO scatta — capire se intervento differenziale o magnetotermico', 'Intervento di uno dei due meccanismi — da distinguere', 'Alta', '1) Scatta con botta/rumore → magnetotermico (cortocircuito). 2) Scatta silenzioso/graduale → differenziale (dispersione). 3) A vuoto rimane scattato → dispersione nei cavi.', 'Osservazione + multimetro', 'Botta = corto. Silenzioso = dispersione. A vuoto = cavi/quadro.', 'Diagnosi errata porta nella direzione sbagliata', 'CEI EN 61009-1'),

    -- GUASTI MOTORE
    ('MOT-150', 'MOTORE', 'Motore non parte, ronza e scatta il termico', 'Rotore bloccato meccanicamente oppure un avvolgimento aperto', 'Alta', 'Verificare rotazione manuale (scollegare dall alimentazione). Se libero → avvolgimento aperto. Misurare resistenza tra fasi.', 'Multimetro in Ω', 'Resistenza tra fasi: bilanciata ±5%. Se una fase è aperta → ∞', 'Sovrariscaldamento avvolgimento — guasto irreversibile', 'CEI EN 60034'),
    ('MOT-150', 'MOTORE', 'Motore si avvia ma gira lento e assorbe corrente eccessiva', 'Sovraccarico meccanico oppure tensione bassa alla morsettiera', 'Alta', 'Misurare tensione alla morsettiera motore sotto carico. Misurare corrente di linea. Verificare carico meccanico.', 'Voltmetro + pinza amperometrica', 'Tensione: 400V ±10%. Corrente < In di targa. Scorrimento < 8%', 'Sovrirscaldamento — riduzione vita motore', 'CEI EN 60034'),
    ('MOT-150', 'MOTORE', 'Motore vibra e rumoreggia anormalmente', 'Squilibrio fasi oppure cuscinetti usurati oppure accoppiamento disallineato', 'Media', 'Misurare tensioni delle 3 fasi. Controllare squilibrio. Ispezionare cuscinetti a mano.', 'Voltmetro trifase + ispezione meccanica', 'Squilibrio tensioni < 2%. Cuscinetti lisci senza gioco', 'Danno meccanico progressivo — guasto cuscinetti', 'CEI EN 60034'),
    ('MOT-150', 'MOTORE', 'Motore si surriscalda anche senza carico eccessivo', 'Ventilazione insufficiente oppure avvolgimento deteriorato oppure tensione elevata', 'Media', 'Verificare libero flusso aria sulla carcassa. Misurare tensione alimentazione. Misurare resistenza isolamento.', 'Termometro IR + megaohmmetro 500Vdc', 'Temperatura carcassa < 80°C classe F. Riso > 1MΩ', 'Guasto avvolgimento — costo riavvolgimento elevato', 'CEI EN 60034'),

    -- GUASTI CONTATTORE
    ('CONT-9AC3', 'CONTATTORE', 'Contattore ronza e vibra anormalmente', 'Tensione bobina bassa oppure nucleo magnetico sporco o usurato', 'Alta', 'Misurare tensione ai morsetti bobina A1-A2 durante eccitazione. Pulire superfici polo.', 'Voltmetro CA', 'Tensione bobina: valore nominale ±15%. Es. bobina 230Vac → 195÷265V', 'Ronzio causa usura precoce e surriscaldamento bobina', 'CEI EN 60947-4-1'),
    ('CONT-9AC3', 'CONTATTORE', 'Contattore si eccita ma non mantiene', 'Contatti ausiliari di autotenuta difettosi oppure bobina intermittente', 'Media', 'Misurare continuità contatto ausiliario NA durante chiusura. Verificare circuito di autotenuta.', 'Multimetro in continuità', 'Contatto NA: chiuso = 0Ω, aperto = ∞', 'Cicli di apertura/chiusura dannosi per carichi', 'CEI EN 60947-4-1'),
    ('CONT-9AC3', 'CONTATTORE', 'Contattore non si apre al de-energizzare la bobina', 'Contatti principali incollati da arco oppure meccanismo bloccato', 'Alta', 'NON toccare. Sezionare a monte. Ispezionare contatti principali: verificare erosione/fusione da arco.', 'Ispezione visiva + multimetro', 'Contatti aperti = ∞ tra morsetti. Se 0Ω → incollati', 'Rischio cortocircuito e incendio — NON azionare', 'CEI EN 60947-4-1');

  END IF;
END $$;

-- ─── MISURE ATTESE ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM rocco_misure_attese) = 0 THEN

    INSERT INTO rocco_misure_attese (famiglia, parametro, valore_minimo, valore_massimo, unita, condizione, norma_riferimento) VALUES

    -- Isolamento impianti
    ('IMPIANTO_CIVILE',    'resistenza_isolamento',  0.5,    NULL,   'MΩ',  'Misurato a 500Vdc — impianto de-energizzato. Valore operativo > 1MΩ', 'CEI 64-8 sez.61'),
    ('IMPIANTO_CIVILE',    'resistenza_isolamento',  100,    NULL,   'MΩ',  'Impianto nuovo — valore ottimale', 'CEI 64-8 sez.61'),
    ('IMPIANTO_INDUSTRIALE','resistenza_isolamento', 1,      NULL,   'MΩ',  'Misurato a 500Vdc — valore minimo operativo', 'CEI 64-8 sez.61'),
    ('MOTORE',             'resistenza_isolamento',  1,      NULL,   'MΩ',  'Misurato a 500Vdc tra avvolgimento e carcassa — minimo accettabile. < 0.5MΩ = da riavvolgere', 'CEI EN 60034'),

    -- Caduta tensione
    ('IMPIANTO_CIVILE',    'caduta_tensione',        NULL,   4,      '%',   'Dal contatore al carico più lontano — limite CEI 64-8', 'CEI 64-8 art.525'),
    ('IMPIANTO_CIVILE',    'caduta_tensione',        NULL,   3,      '%',   'Valore consigliato per impianti nuovi', 'CEI 64-8 art.525'),
    ('IMPIANTO_INDUSTRIALE','caduta_tensione',       NULL,   5,      '%',   'Dal QGBT al quadro macchina — limite per uso industriale', 'CEI 64-8 art.525'),

    -- Resistenza terra
    ('TERRA_TT',           'resistenza_impianto_terra', NULL, 1667, 'Ω',   'Con diff 30mA: RE × Idn ≤ 50V → RE ≤ 1667Ω. Limite teorico.', 'CEI 64-8 art.413'),
    ('TERRA_TT',           'resistenza_impianto_terra', NULL, 200,  'Ω',   'Valore operativo raccomandato per impianti civili', 'CEI 64-8 art.413'),
    ('TERRA_TN',           'resistenza_impianto_terra', NULL, 5,    'Ω',   'Sistema TN — resistenza dispersore', 'CEI 64-8 art.411'),

    -- Squilibrio tensioni trifase
    ('IMPIANTO_TRIFASE',   'squilibrio_tensioni',    NULL,   2,      '%',   'Squilibrio percentuale tra le tre fasi — oltre il 2% causa surriscaldamento motori', 'CEI EN 60034'),
    ('MOTORE',             'squilibrio_tensioni',    NULL,   2,      '%',   'Squilibrio > 2% riduce la vita del motore del 50%', 'CEI EN 60034'),

    -- Temperatura morsetti
    ('QUADRO_BT',          'temperatura_morsetti',   NULL,   75,     '°C',  'Con termometro IR — oltre 75°C indica morsetto allentato o cavo sottodimensionato', 'CEI 64-8, termografia IEC 60068'),
    ('QUADRO_BT',          'temperatura_morsetti',   NULL,   60,     '°C',  'Temperatura operativa normale — se supera 60°C verificare serraggio', 'CEI 64-8'),
    ('MOTORE',             'temperatura_carcassa',   NULL,   80,     '°C',  'Classe F (155°C isolamento) — carcassa max 80°C in esercizio normale', 'CEI EN 60034'),

    -- Corrente differenziale
    ('RCCB',               'corrente_dispersione_singolo_carico', NULL, 10, 'mA', 'Ogni carico singolo non deve superare 10mA per non contribuire a dispersione cumulativa', 'CEI 64-8 art.413'),
    ('RCCB',               'corrente_scatto',        NULL,   30,     'mA',  'Differenziale 30mA deve scattare tra 15mA e 30mA (IΔn)', 'CEI EN 61008-1');

  END IF;
END $$;
