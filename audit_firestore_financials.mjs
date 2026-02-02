import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function audit() {
    console.log("🚀 STARTING FIRESTORE FINANCIAL AUDIT...");
    const snap = await getDocs(collection(db, 'electronic_dossiers'));

    const stats = {
        total: snap.size,
        hasFinancials: 0,
        missingLineaCaptura: 0,
        missingClavePedimento: 0,
        missingIvaPrv: 0,
        missingValorAduana: 0,
        missingBanco: 0,
        missingSupplierTaxId: 0
    };

    snap.forEach(d => {
        const data = d.data();
        const fins = data.financials || {};

        if (Object.keys(fins).length > 0) stats.hasFinancials++;
        if (!fins.lineaCaptura) stats.missingLineaCaptura++;
        if (!fins.clavePedimento) stats.missingClavePedimento++;
        if (!fins.ivaPrv) stats.missingIvaPrv++;
        if (!fins.valorAduana) stats.missingValorAduana++;
        if (!fins.banco) stats.missingBanco++;
        if (!fins.supplierTaxId) stats.missingSupplierTaxId++;
    });

    console.table(stats);
    process.exit(0);
}

audit().catch(console.error);
