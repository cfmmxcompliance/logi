import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

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

async function reconcileRemesas() {
    console.log("Reconciling Remesas vs 53' Trailers for Jan 2026...");

    const start = "2026-01-01";
    const end = "2026-01-31 23:59:59";

    // 1. Fetch Remesas from dsSel
    const snapSel = await getDocs(query(collection(db, "dsSel"),
        where("FechaPagoReal", ">=", start),
        where("FechaPagoReal", "<=", end)));

    const remesas = [];
    snapSel.docs.forEach(doc => {
        const d = doc.data();
        const remesaNum = parseInt(d.ConsecutivoRemesa || d.c3 || "0");
        const op = d.TipoOperacion || d.c9 || "1";
        if (remesaNum > 0) {
            remesas.push({
                docId: doc.id,
                patente: d.Patente || d.c0,
                pedimento: d.Pedimento || d.c1,
                remesa: remesaNum,
                op: op
            });
        }
    });
    console.log(`Total Remesas found (dsSel): ${remesas.length}`);

    // 2. Fetch Containers from ds504
    const snap504 = await getDocs(query(collection(db, "ds504"),
        where("FechaPagoReal", ">=", start),
        where("FechaPagoReal", "<=", end)));

    const trailers53 = [];
    const otherContainers = [];

    snap504.docs.forEach(doc => {
        const d = doc.data();
        const type = (d.TipoContenedor || d.c4 || "").toString();
        const id = (d.NumContenedor || d.c3 || "UNKNOWN").toString();
        const ped = d.Pedimento || d.c1;

        if (type === "22" || type === "56") {
            trailers53.push({ id, ped, type });
        } else {
            otherContainers.push({ id, ped, type });
        }
    });

    console.log(`Total records in ds504: ${snap504.size}`);
    console.log(`Total 53' Trailers (Type 22/56): ${trailers53.length}`);
    console.log(`Total Other Containers: ${otherContainers.length}`);

    // 3. Analysis: Map Remesas to Containers
    // Usually remesas are linked to pedimentos.
    const remesasByPed = new Map();
    remesas.forEach(r => {
        if (!remesasByPed.has(r.pedimento)) remesasByPed.set(r.pedimento, []);
        remesasByPed.get(r.pedimento).push(r);
    });

    const trailersByPed = new Map();
    trailers53.forEach(t => {
        if (!trailersByPed.has(t.ped)) trailersByPed.set(t.ped, []);
        trailersByPed.get(t.ped).push(t);
    });

    console.log("\nSample Pedimentos with Remesas but NO 53' Trailers:");
    let gapCount = 0;
    const gapList = [];
    remesasByPed.forEach((rems, ped) => {
        const trailers = trailersByPed.get(ped) || [];
        if (trailers.length < rems.length) {
            gapCount += (rems.length - trailers.length);
            gapList.push({ ped, remesas: rems.length, trailers: trailers.length });
        }
    });

    console.table(gapList.slice(0, 10));
    console.log(`\nEstimated total gap (Missing trailers vs remesas): ${gapCount}`);

    // Check if "Other Containers" might be the missing 53' trailers but with different codes
    const types = {};
    otherContainers.forEach(c => {
        types[c.type] = (types[c.type] || 0) + 1;
    });
    console.log("\nOther Container Types found in Jan 2026:");
    console.table(types);

    process.exit(0);
}

reconcileRemesas().catch(console.error);
