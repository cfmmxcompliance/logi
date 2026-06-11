async function main() {
    console.log("Fetching sellos via REST API...");
    let url = "https://firestore.googleapis.com/v1/projects/logimaster-cfmoto/databases/(default)/documents/sellos?pageSize=1000";
    let found = false;

    while (url) {
        const response = await fetch(url);
        if (!response.ok) {
            console.error("Error fetching:", response.status, response.statusText);
            break;
        }
        const data = await response.json();
        
        if (!data.documents) {
            console.log("No documents found.");
            break;
        }

        for (const doc of data.documents) {
            const fields = doc.fields;
            const caja = fields.numeroCaja?.stringValue || "";
            const fecha = fields.fechaAsignacion?.stringValue || "";
            const fechaHora = fields.fechaHoraRegistro?.stringValue || "";
            const createdAt = fields.createdAt?.stringValue || "";
            const asignacionId = fields.asignacionCajaId?.stringValue || "";

            if (JSON.stringify(fields).toLowerCase().includes("tl")) {
                console.log("\n--- Registro Encontrado ---");
                console.log("ID:", doc.name.split('/').pop());
                console.log("Número Caja:", caja);
                console.log("Sello Asignado:", fields.selloAsignado?.stringValue);
                console.log("Usuario:", fields.usuario?.stringValue);
                console.log("Fecha Asignación:", fecha);
                console.log("Fecha Hora Registro:", fechaHora);
                console.log("CreatedAt:", createdAt);
                found = true;
            }
        }

        if (data.nextPageToken) {
            url = `https://firestore.googleapis.com/v1/projects/logimaster-cfmoto/databases/(default)/documents/sellos?pageSize=1000&pageToken=${data.nextPageToken}`;
        } else {
            break;
        }
    }

    if (!found) {
        console.log("No se encontraron registros para TL019.");
    }
}

main().catch(console.error);
