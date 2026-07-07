import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, limit, doc, getDoc, updateDoc } from 'firebase/firestore';

const CORRUPTED = [
    { id: 'exp_1jGNoiWVZJuMCR6BYoUa', trailer: 'JB-0002' },
    { id: 'exp_7GOhYIBpPljtbqTD91mk', trailer: 'R2219' },
    { id: 'exp_FIQNXSiaYPrLnfYlEhZV', trailer: 'H04938' },
    { id: 'exp_JWFOtzyXjae4MjfexhaH', trailer: 'AB-1234' },
    { id: 'exp_KdFTgdpaJmqydV6qo0Xr', trailer: 'R2219' },
    { id: 'exp_L7jnYxZwKCZ95UC1L4LC', trailer: 'EGLV4567890' },
    { id: 'exp_S8NH1taeuSxzB7zXz0ND', trailer: '2033466PLA' },
    { id: 'exp_Sl5jKr3xuURAKzdaROUQ', trailer: 'SNLU212436' },
    { id: 'exp_Wz60rhrsbwmZN55TWJy7', trailer: 'AB-1234' },
    { id: 'exp_gmXhZJHCkGGIuQTWSxc1', trailer: 'JB-0001' },
    { id: 'exp_lfGP2WEU6Odj6Jr0C5JR', trailer: 'YMCA1234' },
    { id: 'exp_v4wWnD39LeCGK41pdp3O', trailer: '2001' }
];

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        let restored = 0;
        let skipped = 0;

        for (const record of CORRUPTED) {
            const selloSnap = await getDocs(query(collection(db, 'sellos'), where('numeroCaja', '==', record.trailer), limit(1)));
            
            if (!selloSnap.empty) {
                const sello = selloSnap.docs[0].data();
                // Use fechaAsignacion (YYYY-MM-DD) as the date - same day as sello but without time
                const fechaSello = sello.fechaAsignacion || sello.fechaHoraRegistro;
                await updateDoc(doc(db, 'historico_expo', record.id), {
                    pickupDayCFM: fechaSello
                });
                console.log(`✓ ${record.trailer} → ${fechaSello}`);
                restored++;
            } else {
                console.log(`✗ ${record.trailer} → sin sello, sin fecha posible`);
                skipped++;
            }
        }

        console.log(`\nRestaurados: ${restored} | Sin sello: ${skipped}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
