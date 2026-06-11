const admin = require('firebase-admin');
const serviceAccount = require('/Users/alex/Downloads/logimaster (2)/logimaster-cfmoto-a59f54d6641a.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function main() {
    console.log("Conectando a Firebase para buscar sellos de TL019 del 2026-06-11...");
    
    // Buscar en la coleccion 'sellos'
    const snapshot = await db.collection('sellos').get();
    
    let found = false;
    snapshot.forEach(doc => {
        const data = doc.data();
        // Check if TL019 is in the data
        if (JSON.stringify(data).includes('TL019')) {
            console.log("\n--- Registro Encontrado ---");
            console.log("ID:", doc.id);
            console.log("Sello Asignado:", data.selloAsignado || data.sello);
            console.log("Número Caja:", data.numeroCaja);
            console.log("Usuario:", data.usuario);
            console.log("Fecha Asignación:", data.fechaAsignacion);
            console.log("Fecha Hora Registro:", data.fechaHoraRegistro);
            console.log("CreatedAt:", data.createdAt);
            found = true;
        }
    });
    
    if (!found) {
        console.log("No se encontraron registros de TL019 en la colección 'sellos'.");
    }
}

main().catch(console.error);
