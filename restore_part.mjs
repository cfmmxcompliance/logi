import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function restorePart() {
    const pn = '8080-000002';
    const id = crypto.randomUUID();

    // Data from plantilla_exacta-1.csv
    const data = {
        id: id,
        PART_NUMBER: pn,
        REGIMEN: 'IN',
        TypeMaterial: '0',
        DESCRIPTION_EN: 'CLIP NUT ST4.8',
        DESCRIPCION_ES: 'GRAPA DOBLE PARA TORNILLAR',
        UMC: 'PCS',
        UMT: '',
        HTSMX: '7326909999',
        HTSMXBASE: '73269099',
        HTSMXNICO: '99',
        IGI_DUTY: '35',
        PROSEC: 'NO APLICA',
        R8: '0',
        DESCRIPCION_R8: '',
        RRYNA_NON_DUTY_REQUIREMENTS: 'NO RRNA',
        REMARKS: '0',
        NETWEIGHT: '0.2',
        IMPORTED_OR_NOT: 'Y',
        SENSIBLE: 'NO SENSIBLE',
        HTS_SerialNo: '0',
        CLAVESAT: '39121705',
        DESCRIPCION_CN: '0',
        MATERIAL_CN: '0',
        MATERIAL_EN: '0',
        FUNCTION_CN: '0',
        FUNCTION_EN: '0',
        COMPANY: '0',
        ESTIMATED: '0',
        UPDATE_TIME: new Date().toISOString()
    };

    console.log(`📤 Restaurando PN: ${pn}...`);
    await setDoc(doc(db, 'parts', id), data);
    console.log("✅ Restauración completa.");
    process.exit(0);
}

restorePart();
