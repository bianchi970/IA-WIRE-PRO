/**
 * ROCCO TOOLS — Motore di calcolo autonomo
 * Funzioni pure JavaScript, nessuna dipendenza esterna.
 * Valori CEI 64-8 IX edizione, CEI-UNEL 35024/1
 */

const RHO_RAME_70  = 0.0175;
const RHO_ALLUM_70 = 0.0291;
const SQRT3        = 1.7320508;
const SEZIONI_STD  = [1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240,300];

const IZ = {
  A:      {1.5:13,2.5:18,4:24,6:31,10:42,16:56,25:73,35:89,50:108,70:136,95:164,120:188,150:216,185:245,240:286,300:328},
  B:      {1.5:15.5,2.5:21,4:28,6:36,10:50,16:66,25:84,35:103,50:125,70:158,95:191,120:220,150:253,185:288,240:338,300:387},
  E:      {1.5:17,2.5:23,4:31,6:40,10:54,16:73,25:95,35:117,50:141,70:179,95:216,120:249,150:285,185:324,240:380,300:435},
  E_XLPE: {1.5:22,2.5:30,4:40,6:51,10:70,16:94,25:119,35:147,50:179,70:229,95:278,120:322,150:371,185:424,240:500,300:576}
};
const K_TEMP = {10:1.22,15:1.17,20:1.12,25:1.06,30:1.0,35:0.94,40:0.87,45:0.79,50:0.71};

function r2(n){ return Math.round(n*100)/100; }

function calcola_ib(P, V, cosfi=0.9, eta=1.0, fasi='tri'){
  const Ib = fasi==='mono' ? P/(V*cosfi*eta) : P/(SQRT3*V*cosfi*eta);
  return { Ib:r2(Ib), unita:'A',
    formula: fasi==='mono'?'Ib = P/(V×cosφ×η)':'Ib = P/(√3×V×cosφ×η)',
    risultato:`Ib = ${r2(Ib)} A` };
}

function seleziona_sezione(Ib, metodo='B', isolamento='PVC', temp_amb=30){
  const chiave = (metodo==='E'&&isolamento==='XLPE')?'E_XLPE':metodo;
  const tab = IZ[chiave]||IZ['B'];
  const kT = K_TEMP[temp_amb]||1.0;
  for(const S of SEZIONI_STD){
    const Iz_c = r2(tab[S]*kT);
    if(Iz_c>=Ib) return {
      sezione:S, Iz_base:tab[S], kT, Iz_corretta:Iz_c, Ib,
      verifica:'✅ Iz ≥ Ib',
      risultato:`S = ${S} mm² → Iz = ${Iz_c} A ≥ Ib = ${Ib} A`,
      metodo:`Metodo ${metodo} - ${isolamento} - ${temp_amb}°C`
    };
  }
  return { errore:'Sezione fuori range — verificare manualmente' };
}

function calcola_dv(S, L, Ib, cosfi=0.9, V=400, fasi='tri', materiale='Cu'){
  const rho = materiale==='Cu'?RHO_RAME_70:RHO_ALLUM_70;
  const sinfi = Math.sqrt(1-cosfi*cosfi);
  const R1 = rho/S; const X1=0.00008;
  const dV = fasi==='mono' ? 2*L*Ib*(R1*cosfi+X1*sinfi) : SQRT3*L*Ib*(R1*cosfi+X1*sinfi);
  const dV_perc = r2((dV/V)*100);
  return { dV_V:r2(dV), dV_perc,
    formula: fasi==='mono'?'ΔU=2×L×Ib×(R1cosφ+X1sinφ)':'ΔU=√3×L×Ib×(R1cosφ+X1sinφ)',
    verifica_4perc: dV_perc<=4?'✅ OK (≤4%)':`❌ KO (${dV_perc}% > 4%)`,
    verifica_3perc: dV_perc<=3?'✅ OK illuminazione':'⚠️ Supera 3%',
    risultato:`ΔV = ${r2(dV)} V (${dV_perc}%)` };
}

function sezione_da_dv(L, Ib, cosfi=0.9, V=400, dV_max_perc=4, fasi='tri'){
  const k = fasi==='mono'?2:SQRT3;
  const S_min = (k*RHO_RAME_70*L*Ib*cosfi)/((dV_max_perc/100)*V);
  const S_scel = SEZIONI_STD.find(s=>s>=S_min)||null;
  return { S_min_teorica:r2(S_min), S_commerciale:S_scel,
    risultato: S_scel?`S ≥ ${r2(S_min)} mm² → scegli ${S_scel} mm²`:'Fuori range' };
}

function calcola_icc(Sn_kVA, Vcc_perc, L_m=0, S_mm2=0){
  const V=400;
  const In_tr=(Sn_kVA*1000)/(SQRT3*V);
  const Icc_tr=In_tr/(Vcc_perc/100);
  if(L_m===0) return { Icc:r2(Icc_tr/1000), unita:'kA', risultato:`Icc sbarre = ${r2(Icc_tr/1000)} kA` };
  const R_loop=2*(RHO_RAME_70/S_mm2)*L_m;
  const Icc_p=230/(SQRT3*R_loop);
  return { Icc_sbarre:r2(Icc_tr/1000), Icc_punto:r2(Icc_p/1000), unita:'kA',
    risultato:`Icc punto = ${r2(Icc_p/1000)} kA (sbarre = ${r2(Icc_tr/1000)} kA)` };
}

function calcola_pe(S_fase){
  let S_PE, regola;
  if(S_fase<=16)     { S_PE=S_fase; regola='S_PE=S_fase (≤16mm²)'; }
  else if(S_fase<=35){ S_PE=16;     regola='S_PE=16mm² (16<S≤35)'; }
  else               { S_PE=S_fase/2; regola='S_PE=S_fase/2 (>35mm²)'; }
  const S_PE_c = SEZIONI_STD.find(s=>s>=S_PE)||S_PE;
  return { S_PE_minima:S_PE, S_PE_commerciale:S_PE_c, regola,
    risultato:`PE ≥ ${S_PE} mm² → usa ${S_PE_c} mm²` };
}

function calcola_potenza(I, V=400, cosfi=0.9, fasi='tri'){
  const P = fasi==='mono'?I*V*cosfi:SQRT3*I*V*cosfi;
  const Q = fasi==='mono'?I*V*Math.sqrt(1-cosfi*cosfi):SQRT3*I*V*Math.sqrt(1-cosfi*cosfi);
  const S = fasi==='mono'?I*V:SQRT3*I*V;
  return { P:r2(P), Q:r2(Q), S:r2(S),
    risultato:`P=${r2(P/1000)}kW  Q=${r2(Q/1000)}kVAR  S=${r2(S/1000)}kVA` };
}

function calcola_rifasamento(P_kW, cosfi_ini, cosfi_fin){
  const Qc = r2(P_kW*(Math.tan(Math.acos(cosfi_ini))-Math.tan(Math.acos(cosfi_fin))));
  return { Qc_kvar:Qc, formula:'Qc=P×(tanφ1-tanφ2)',
    risultato:`Qc = ${Qc} kVAR → banco condensatori da ${Qc} kVAR` };
}

function corrente_motore(P_kW, V=400, cosfi=0.85, eta=0.90){
  const In = (P_kW*1000)/(SQRT3*V*cosfi*eta);
  return { In:r2(In), unita:'A',
    Iavv_DOL:r2(In*7), Iavv_YD:r2(In*2.5), Iavv_VFD:r2(In*1.3),
    risultato:`In=${r2(In)}A | DOL≈${r2(In*7)}A | Y-Δ≈${r2(In*2.5)}A | VFD≈${r2(In*1.3)}A` };
}

function verifica_coordinamento(Ib, In_int, Iz){
  const r1=Ib<=In_int, r2v=In_int<=Iz;
  return { Ib, In_int, Iz, regola:'Ib ≤ In ≤ Iz',
    check_Ib_In: r1?'✅ Ib ≤ In':`❌ Ib(${Ib}A) > In(${In_int}A)`,
    check_In_Iz: r2v?'✅ In ≤ Iz':`❌ In(${In_int}A) > Iz(${Iz}A)`,
    esito:(r1&&r2v)?'✅ COORDINAMENTO OK':'❌ COORDINAMENTO KO' };
}

function seleziona_differenziale(tipo_carico){
  const T={
    'lavatrice':      {tipo:'A', Idn:30,  m:'correnti pulsanti DC'},
    'lavatrice_inv':  {tipo:'F', Idn:30,  m:'inverter monofase — frequenze variabili'},
    'pompa_calore':   {tipo:'F', Idn:30,  m:'inverter monofase'},
    'motore_trifase': {tipo:'B', Idn:300, m:'inverter trifase — DC puro'},
    'ups':            {tipo:'B', Idn:300, m:'UPS — armoniche DC'},
    'bagno':          {tipo:'A', Idn:30,  m:'CEI sez.701 — protezione addizionale'},
    'piscina':        {tipo:'A', Idn:10,  m:'CEI sez.702 — zona 0/1'},
    'fotovoltaico':   {tipo:'B', Idn:30,  m:'inverter FV — DC puro'},
    'medico_gr1':     {tipo:'A', Idn:10,  m:'Gruppo 1 — limite 25V contatto'},
    'medico_gr2':     {tipo:'A', Idn:10,  m:'Gruppo 2 — IT medicale'},
    'illuminazione':  {tipo:'AC',Idn:30,  m:'carico resistivo/induttivo puro'},
    'default':        {tipo:'A', Idn:30,  m:'scelta conservativa'}
  };
  const r=T[tipo_carico]||T['default'];
  return { tipo_diff:`Tipo ${r.tipo}`, Idn:`${r.Idn} mA`, motivo:r.m,
    avviso: r.tipo==='AC'?'⚠️ Tipo AC obsoleto — preferire Tipo A':null,
    risultato:`RCD Tipo ${r.tipo} — ${r.Idn} mA — ${r.m}` };
}

function diagnosi_numerica(grandezza, valore_misurato, valore_atteso, tolleranza_perc=10){
  const scarto=Math.abs(valore_misurato-valore_atteso);
  const scarto_perc=r2((scarto/valore_atteso)*100);
  const anomalia=scarto_perc>tolleranza_perc;
  const ipotesi_map={
    'tensione_bassa':   ['Caduta eccessiva sul cavo','Connessione allentata','Sezione sottodimensionata'],
    'corrente_alta':    ['Sovraccarico','Guasto a terra parziale','Cortocircuito incipiente'],
    'resistenza_iso':   ['Umidità nel cavo','Isolamento degradato','Contatto con terra'],
    'resistenza_terra': ['Dispersore corroso','Connessione PE allentata','Terreno asciutto']
  };
  let ipotesi = null;
  if(anomalia){
    const k = grandezza==='tensione'&&valore_misurato<valore_atteso ? 'tensione_bassa'
      : grandezza==='corrente'&&valore_misurato>valore_atteso ? 'corrente_alta'
      : grandezza==='resistenza_isolamento' ? 'resistenza_iso'
      : grandezza==='resistenza_terra' ? 'resistenza_terra' : null;
    ipotesi = k ? ipotesi_map[k] : ['Anomalia — verificare manualmente'];
  }
  return { grandezza, valore_misurato, valore_atteso, scarto_perc,
    anomalia: anomalia?`⚠️ ANOMALIA — scarto ${scarto_perc}% > ${tolleranza_perc}%`:'✅ Nella norma',
    ipotesi_guasto: ipotesi };
}

function output_tecnico(osservazioni, ipotesi, verifiche, rischi, formule=[], numerico=null){
  let o='';
  o+='─────────────────────────────────────\n';
  o+='ANALISI TECNICA ROCCO\n';
  o+='─────────────────────────────────────\n';
  o+=`\n📋 OSSERVAZIONI\n${osservazioni}\n`;
  o+=`\n🔍 IPOTESI\n${ipotesi}\n`;
  o+=`\n✅ VERIFICHE CONSIGLIATE\n${verifiche}\n`;
  o+=`\n⚠️  RISCHI POTENZIALI\n${rischi}\n`;
  if(formule.length>0) o+=`\n📐 FORMULE USATE\n${formule.join('\n')}\n`;
  if(numerico) o+=`\n🔢 CONFRONTO NUMERICO\n${numerico}\n`;
  o+='─────────────────────────────────────\n';
  return o;
}

module.exports = {
  calcola_ib, seleziona_sezione, calcola_dv, sezione_da_dv,
  calcola_icc, calcola_pe, calcola_potenza, calcola_rifasamento,
  corrente_motore, verifica_coordinamento, seleziona_differenziale,
  diagnosi_numerica, output_tecnico
};
