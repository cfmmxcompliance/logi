const admin = require('firebase-admin');
const serviceAccount = require('/Users/alex/Downloads/logimaster (2)/logimaster-cfmoto-a59f54d6641a.json');

// We will use the REST API instead since we know it works without the service account issues
async function fetchRest() {
    let response = await fetch("https://firestore.googleapis.com/v1/projects/logimaster-cfmoto/databases/(default)/documents/asignacion_cajas/4OFdyBTbyQBj8NdOBYvy");
    let data = await response.json();
    console.log("Asignacion 4OFdyBTbyQBj8NdOBYvy:", JSON.stringify(data.fields, null, 2));

    console.log("\nFetching liberaciones...");
    response = await fetch("https://firestore.googleapis.com/v1/projects/logimaster-cfmoto/databases/(default)/documents/liberaciones?pageSize=1000");
    data = await response.json();
    pageToken = data.nextPageToken;
    while(data.documents) {
        for (const doc of data.documents) {
            const numCaja = doc.fields.numeroCaja?.stringValue || "";
            const selloVal = doc.fields.selloValidado?.stringValue || "";
            if (numCaja === "GO54" || numCaja === "G054" || selloVal === "742194" || selloVal === "741933") {
                console.log("Found Liberacion:", doc.name.split('/').pop());
                console.log("Caja:", numCaja);
                console.log("Sello Validado:", selloVal);
                console.log("Asignacion ID:", doc.fields.asignacionCajaId?.stringValue);
            }
        }
        if (!pageToken) break;
        response = await fetch(`https://firestore.googleapis.com/v1/projects/logimaster-cfmoto/databases/(default)/documents/liberaciones?pageSize=1000&pageToken=${pageToken}`);
        data = await response.json();
        pageToken = data.nextPageToken;
    }
}

fetchRest().catch(console.error);
