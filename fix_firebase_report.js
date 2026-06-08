import fs from 'fs';
import https from 'https';

const reportId = '9b04de33-6b65-419f-b31b-085651116c94';

const normalizeTipoOperacion = (raw) => {
  const v = (raw || '').trim().toUpperCase();
  if (v === '1' || v === 'IMP' || v.startsWith('I')) return 'IMP';
  if (v === '2' || v === 'EXP' || v.startsWith('E')) return 'EXP';
  return raw;
};

const parseSATDate = (s) => {
  if (!s || !s.trim()) return -1;
  let raw = s.trim();
  raw = raw.replace(' ', 'T');
  let d = new Date(raw.length > 10 ? raw : raw + 'T12:00:00');
  if (!isNaN(d.getTime())) return d.getMonth();
  
  let datePart = raw.split('T')[0];
  const slash = datePart.split('/');
  if (slash.length === 3) {
    d = new Date(`${slash[2]}-${slash[1].padStart(2,'0')}-${slash[0].padStart(2,'0')}T12:00:00`);
    if (!isNaN(d.getTime())) return d.getMonth();
  }
  if (/^\d{8}$/.test(datePart)) {
    d = new Date(`${datePart.slice(0,4)}-${datePart.slice(4,6)}-${datePart.slice(6,8)}T12:00:00`);
    if (!isNaN(d.getTime())) return d.getMonth();
  }
  return -1;
};

const file501 = fs.readFileSync('extracted_zip/1901508_501.asc', 'latin1');
const file510 = fs.readFileSync('extracted_zip/1901508_510.asc', 'latin1');
const fileSel = fs.readFileSync('extracted_zip/1901508_Sel.asc', 'latin1');
const fileInci = fs.readFileSync('extracted_zip/1901508_Inci.asc', 'latin1');

const pedimentoMap = new Map();

file501.split(/\r?\n/).forEach(line => {
    if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
    const cols = line.split('|');
    if (cols.length < 10) return;
    const key = `${cols[0].trim()}-${cols[1].trim()}-${cols[2].trim()}`;
    pedimentoMap.set(key, {
        tipoOperacion: normalizeTipoOperacion(cols[3]),
        fechaEntrada: cols[29] ? cols[29].trim() : '',
        fechaPago: cols[30] ? cols[30].trim() : ''
    });
});

const monthlyDutiesAccum = Array.from({length: 12}, () => ({
    igi_imp: 0, iva_imp: 0, dta_imp: 0,
    igi_exp: 0, iva_exp: 0, dta_exp: 0,
}));

let hasRealDuties = false;

file510.split(/\r?\n/).forEach(line => {
    if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
    const cols = line.split('|');
    if (cols.length < 6) return;
    const key = `${cols[0].trim()}-${cols[1].trim()}-${cols[2].trim()}`;
    const clave = cols[3].trim().toUpperCase();
    const importe = parseFloat(cols[5]) || 0;
    
    if (importe > 0) hasRealDuties = true;

    const record = pedimentoMap.get(key);
    if (!record) return;

    let month = parseSATDate(record.fechaPago);
    if (month === -1) month = parseSATDate(record.fechaEntrada);
    if (month < 0 || month > 11) return;

    const acc = monthlyDutiesAccum[month];
    const isExp = record.tipoOperacion === 'EXP';
    
    // 6=IGI, 15=IVA, 1=DTA, 23=PRV, 3=CC
    if (isExp) {
      if (clave === 'IGI' || clave === 'DBA' || clave === '6') acc.igi_exp += importe;
      else if (clave === 'IVA' || clave === 'PRV' || clave === '15' || clave === '23') acc.iva_exp += importe;
      else if (clave === 'DTA' || clave === 'DAN' || clave === '1') acc.dta_exp += importe;
    } else {
      if (clave === 'IGI' || clave === 'DBA' || clave === '6') acc.igi_imp += importe;
      else if (clave === 'IVA' || clave === 'PRV' || clave === '15' || clave === '23') acc.iva_imp += importe;
      else if (clave === 'DTA' || clave === 'DAN' || clave === '1') acc.dta_imp += importe;
    }
});

const monthRevisions = Array.from({length: 12}, () => ({imp: 0, exp: 0}));

const parseRevisionASC = (content, isSel) => {
    content.split(/\r?\n/).forEach(line => {
      if (line.startsWith('Patente|') || !line.trim()) return;
      const cols = line.split('|');
      if (isSel) {
        if (cols.length < 10) return;
        const sem = (cols[7]||'').trim();
        if (sem !== '2' && sem !== '3') return;
        const m = parseSATDate(cols[5]);
        if (m < 0) return;
        const tipo = normalizeTipoOperacion(cols[9]);
        if (tipo==='IMP') monthRevisions[m].imp++;
        else if (tipo==='EXP') monthRevisions[m].exp++;
      } else {
        if (cols.length < 14) return;
        const g = (cols[13]||'').trim().toUpperCase();
        if (g!=='C' && g!=='A') return;
        const dateStr = (cols[14]||cols[5]||'').trim();
        const m = parseSATDate(dateStr);
        if (m < 0) return;
        const tipo = normalizeTipoOperacion(cols[12]);
        if (tipo==='IMP') monthRevisions[m].imp++;
        else if (tipo==='EXP') monthRevisions[m].exp++;
      }
    });
};

parseRevisionASC(fileSel, true);
parseRevisionASC(fileInci, false);

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const reviewsByMonth = MONTHS_SHORT.map((name, i) => ({
    name,
    Import: monthRevisions[i].imp,
    Export: monthRevisions[i].exp,
}));

const monthlyDuties = MONTHS_SHORT.map((name, i) => ({
    name,
    'IGI Import': parseFloat(monthlyDutiesAccum[i].igi_imp.toFixed(1)),
    'IVA Import': parseFloat(monthlyDutiesAccum[i].iva_imp.toFixed(1)),
    'DTA Import': parseFloat(monthlyDutiesAccum[i].dta_imp.toFixed(1)),
    'IGI Export': parseFloat(monthlyDutiesAccum[i].igi_exp.toFixed(1)),
    'IVA Export': parseFloat(monthlyDutiesAccum[i].iva_exp.toFixed(1)),
    'DTA Export': parseFloat(monthlyDutiesAccum[i].dta_exp.toFixed(1)),
}));

const taxSummary = hasRealDuties ? {
    totalIGI: monthlyDuties.reduce((s, m) => s + m['IGI Import'] + m['IGI Export'], 0),
    totalIVA: monthlyDuties.reduce((s, m) => s + m['IVA Import'] + m['IVA Export'], 0),
    totalDTA: monthlyDuties.reduce((s, m) => s + m['DTA Import'] + m['DTA Export'], 0),
} : null;

console.log("Calculated reviewsByMonth:", reviewsByMonth.filter(r => r.Import > 0 || r.Export > 0));
console.log("Calculated monthlyDuties:", monthlyDuties.filter(m => m['IGI Import'] > 0 || m['IVA Import'] > 0 || m['DTA Import'] > 0));
console.log("Tax Summary:", taxSummary);

// PATCH TO FIREBASE
const payload = {
    fields: {
        reviewsByMonth: {
            arrayValue: {
                values: reviewsByMonth.map(r => ({
                    mapValue: {
                        fields: {
                            name: { stringValue: r.name },
                            Import: { integerValue: r.Import.toString() },
                            Export: { integerValue: r.Export.toString() }
                        }
                    }
                }))
            }
        },
        monthlyDuties: hasRealDuties ? {
            arrayValue: {
                values: monthlyDuties.map(m => ({
                    mapValue: {
                        fields: {
                            name: { stringValue: m.name },
                            "IGI Import": { doubleValue: m["IGI Import"] },
                            "IVA Import": { doubleValue: m["IVA Import"] },
                            "DTA Import": { doubleValue: m["DTA Import"] },
                            "IGI Export": { doubleValue: m["IGI Export"] },
                            "IVA Export": { doubleValue: m["IVA Export"] },
                            "DTA Export": { doubleValue: m["DTA Export"] },
                        }
                    }
                }))
            }
        } : { arrayValue: { values: [] } }
    }
};

if (taxSummary) {
    payload.fields.taxSummary = {
        mapValue: {
            fields: {
                totalIGI: { doubleValue: taxSummary.totalIGI },
                totalIVA: { doubleValue: taxSummary.totalIVA },
                totalDTA: { doubleValue: taxSummary.totalDTA }
            }
        }
    };
}

const reqData = JSON.stringify(payload);

const options = {
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/logimaster-cfmoto/databases/(default)/documents/data_stage_reports/${reportId}?updateMask=reviewsByMonth&updateMask=monthlyDuties&updateMask=taxSummary`,
    method: 'PATCH',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(reqData)
    }
};

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let d = '';
    res.on('data', chunk => d+=chunk);
    res.on('end', () => console.log(d.substring(0, 500)));
});

req.on('error', (e) => console.error(e));
req.write(reqData);
req.end();
