import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('/Users/alex/Logimaster_CFMoto/serviceAccountKey.json', 'utf8'));

const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app);

function randomVin() {
    return 'L1' + Math.random().toString(36).substring(2, 10).toUpperCase() + 'SIMU' + Math.floor(Math.random() * 1000);
}

const models = ['ZFORCE 950', 'CFORCE 400', 'UFORCE 1000', 'NK 300'];

async function seed() {
    console.log('Seeding 20 vehicles in L1...');
    for (let i = 0; i < 20; i++) {
        const vin = randomVin();
        await db.collection('wms_vehicles').doc(vin).set({
            vin,
            model: models[Math.floor(Math.random() * models.length)],
            product_no: 'PRD-' + Math.floor(Math.random() * 10000),
            color: 'Black',
            current_location: 'L1',
            status: 'RECEIVED',
            entered_L1_at: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        console.log(`Inserted ${vin}`);
    }
    console.log('Done!');
}

seed().catch(console.error);
