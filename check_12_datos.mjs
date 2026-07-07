import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, limit, doc, getDoc } from 'firebase/firestore';

const CORRUPTED_IDS = [
    'exp_1jGNoiWVZJuMCR6BYoUa',
    'exp_7GOhYIBpPljtbqTD91mk',
    'exp_FIQNXSiaYPrLnfYlEhZV',
    'exp_JWFOtzyXjae4MjfexhaH',
    'exp_KdFTgdpaJmqydV6qo0Xr',
    'exp_L7jnYxZwKCZ95UC1L4LC',
    'exp_S8NH1taeuSxzB7zXz0ND',
    'exp_Sl5jKr3xuURAKzdaROUQ',
    'exp_Wz60rhrsbwmZN55TWJy7',
    'exp_gmXhZJHCkGGIuQTWSxc1',
    'exp_lfGP2WEU6Odj6Jr0C5JR',
    'exp_v4wWnD39LeCGK41pdp3O'
];

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        for (const id of CORRUPTED_IDS) {
            const d = await getDoc(doc(db, 'historico_expo', id));
            const r = d.data();
            const trailer = r.trailer || '';

            // Check sello
            const selloSnap = await getDocs(query(collection(db, 'sellos'), where('numeroCaja', '==', trailer), limit(1)));
            const sello = selloSnap.empty ? null : selloSnap.docs[0].data();

            // Check asignacion_cajas (using the exp_ suffix)
            const asigId = id.replace('exp_', '');
            const asigDoc = await getDoc(doc(db, 'asignacion_cajas', asigId));

            console.log(`\nCaja: ${trailer} | ID: ${id}`);
            console.log(`  dodaUrl:  ${r.dodaUrl || '(vacío)'}`);
            console.log(`  entryUrl: ${r.entryUrl || '(vacío)'}`);
            console.log(`  cfmRef:   ${r.cfmRef || '(vacío)'}`);
            console.log(`  expDoda:  ${r.expDoda || '(vacío)'}`);
            console.log(`  comments: ${r.comments || '(vacío)'}`);
            console.log(`  Sello en DB: ${sello ? `${sello.selloAsignado} (${sello.fechaHoraRegistro})` : '(ninguno)'}`);
            console.log(`  Asignación en DB: ${asigDoc.exists() ? 'SÍ existe' : 'NO existe'}`);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
