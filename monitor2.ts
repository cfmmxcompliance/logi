import { collection, getDocs } from 'firebase/firestore';
import { db } from './services/firebaseConfig.js';

const DEPLOY_TIME = '2026-07-06T22:14:00.000Z';

async function check(): Promise<boolean> {
  const snap = await getDocs(collection(db, 'asignacion_cajas'));
  const found: any[] = [];
  snap.forEach(d => {
    const data = d.data();
    if (!data.layoutUrl || !data.layoutUploadedAt) return;
    if (data.layoutUploadedAt < DEPLOY_TIME) return;
    found.push({ op: data.numeroOperacion, cfmRef: data.cfmRef, vehiculos: data.vehiculos });
  });
  if (!found.length) return false;
  console.log(`\n[${new Date().toLocaleTimeString('es-MX')}] ${found.length} layout(s) post-deploy:`);
  let allOk = true;
  found.forEach(d => {
    const ok = d.cfmRef && d.vehiculos;
    if (!ok) allOk = false;
    console.log(`  ${ok ? '✅' : '❌'} ${d.op} | cfmRef: "${d.cfmRef||'VACÍO'}" | vehiculos: "${d.vehiculos||'VACÍO'}"`);
  });
  console.log(allOk ? '\n✅ Auto-fill FUNCIONA correctamente.' : '\n❌ Auto-fill aún falla.');
  return true;
}

async function main() {
  console.log('Monitor activo (deploy 22:14 UTC). Sube un layout en la app...\n');
  let found = false;
  while (!found) { found = await check(); if (!found) { process.stdout.write('.'); await new Promise(r => setTimeout(r, 10000)); } }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
