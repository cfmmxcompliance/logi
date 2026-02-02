import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc, deleteDoc, addDoc } from "firebase/firestore";
import fs from "fs";

const c = fs.readFileSync("./services/firebaseConfig.ts", "utf8");
const config = {
    apiKey: c.match(/apiKey:\s*"([^"]+)"/)[1],
    authDomain: c.match(/authDomain:\s*"([^"]+)"/)[1],
    projectId: c.match(/projectId:\s*"([^"]+)"/)[1],
    storageBucket: c.match(/storageBucket:\s*"([^"]+)"/)[1],
    messagingSenderId: c.match(/messagingSenderId:\s*"([^"]+)"/)[1],
    appId: c.match(/appId:\s*"([^"]+)"/)[1]
};

const app = initializeApp(config);
const db = getFirestore(app);

async function nuclearFix() {
    console.log("🚀 INICIANDO LIMPIEZA NUCLEAR...");
    const snap = await getDocs(collection(db, "electronic_dossiers"));
    const allDocs = snap.docs;

    const unclassified = allDocs.filter(d => (d.data().numPedimento || "").includes('POR_CLASIFICAR'));
    const validDossiers = allDocs.filter(d => !(d.data().numPedimento || "").includes('POR_CLASIFICAR'));

    console.log(`Encontrados ${unclassified.length} expedientes POR_CLASIFICAR.`);

    let totalMoved = 0;

    for (const uDoc of unclassified) {
        const uData = uDoc.data();
        const items = uData.items || [];
        if (items.length === 0) {
            console.log(`🗑️ Borrando expediente vacío: ${uData.numPedimento}`);
            await deleteDoc(doc(db, "electronic_dossiers", uDoc.id));
            continue;
        }

        const item = items[0];
        const name = item.name || "";

        let detectedSuffix = "";
        const m7 = name.match(/(\d{7})/);
        const mMC = name.match(/MC(\d{4})/i);

        if (mMC) detectedSuffix = `640${mMC[1]}`;
        else if (m7) detectedSuffix = m7[1];

        if (detectedSuffix) {
            console.log(`🔍 Buscando destino para ${name} (Sufijo: ${detectedSuffix})...`);
            const target = validDossiers.find(d => (d.data().numPedimento || "").replace(/\s+/g, '').endsWith(detectedSuffix));

            if (target) {
                console.log(`✅ ¡ENCONTRADO! Moviendo a ${target.data().numPedimento}`);
                const tData = target.data();
                const existingItems = tData.items || [];
                // Evitar duplicados
                if (!existingItems.some(it => it.name === item.name || it.driveId === item.driveId)) {
                    await updateDoc(doc(db, "electronic_dossiers", target.id), {
                        items: [...existingItems, item],
                        lastUpdate: new Date().toISOString()
                    });
                }
                await deleteDoc(doc(db, "electronic_dossiers", uDoc.id));
                totalMoved++;
            } else {
                console.log(`❌ No se encontró destino oficial para sufijo ${detectedSuffix}.`);
            }
        } else {
            console.log(`⚠️ No se pudo extraer sufijo de: ${name}`);
        }
    }

    console.log(`\n✨ PROCESO FINALIZADO.`);
    console.log(`Archivos relocalizados con éxito: ${totalMoved}`);
}

nuclearFix().catch(console.error);
