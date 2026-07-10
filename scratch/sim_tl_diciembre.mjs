/**
 * SIMULACIÓN SIMPLE: TL counter Dic 28-31, 2026
 * Sin precarga — cada día arranca de cero para esa fecha
 * Replica exactamente: getNextOperationNumber(fecha_de_cita)
 */

let mockFirestore = [];

async function getNextOperationNumber(fecha) {
  const del_dia = mockFirestore.filter(r => r.fecha === fecha);
  let maxNum = 0;
  del_dia.forEach(r => {
    const m = (r.numeroOperacion || '').match(/^TL(\d+)$/);
    if (m) { const n = parseInt(m[1]); if (n > maxNum) maxNum = n; }
  });
  return `TL${String(maxNum + 1).padStart(3, '0')}`;
}

function guardar(fecha, tl, caja) {
  mockFirestore.push({ fecha, numeroOperacion: tl, numeroCaja: caja });
}

async function registrar(fecha, caja) {
  const tl = await getNextOperationNumber(fecha);
  guardar(fecha, tl, caja);
  return tl;
}

async function run() {
  console.log('='.repeat(55));
  console.log('SIMULACIÓN: Dic 28-31, 2026 — sin precarga');
  console.log('='.repeat(55));

  const dias = [
    { fecha: '2026-12-28', cajas: ['C-101','C-102','C-103','C-104','C-105'] },
    { fecha: '2026-12-29', cajas: ['C-201','C-202','C-203'] },
    { fecha: '2026-12-30', cajas: ['C-301','C-302','C-303','C-304'] },
    { fecha: '2026-12-31', cajas: ['C-401','C-402'] },
  ];

  for (const { fecha, cajas } of dias) {
    console.log(`\n📅 ${fecha}`);
    const ops = [];
    for (const caja of cajas) {
      const tl = await registrar(fecha, caja);
      ops.push(tl);
      console.log(`  ${caja} → ${tl}`);
    }
    const iniciaEnTL001 = ops[0] === 'TL001';
    const sinDup = new Set(ops).size === ops.length;
    const consec = ops.every((o,i) => i===0 || parseInt(o.slice(2)) === parseInt(ops[i-1].slice(2))+1);
    console.log(`  ${iniciaEnTL001?'✅':'❌'} Inicia TL001  |  ${sinDup?'✅':'❌'} Sin duplicados  |  ${consec?'✅':'❌'} Consecutivo`);
  }
}

run().catch(console.error);
