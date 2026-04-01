import fetch from 'node-fetch';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbysoVhtCCGKLs4YeNkMO_7--oggbRBaVn3-8plInsV3z9N66OtxBBawaVUy3TKDit0aFA/exec';

const payload = {
    filename: "test_specific_folder.txt",
    mimeType: "text/plain",
    bytes: Buffer.from("Testing user's folder ID").toString('base64'),
    folderId: "1jBIvDIbXAP2eGFyVM3J2i5iZWjaEdO9X"
};

console.log("Sending to Specific Folder via new GAS...");
fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
})
.then(res => res.text())
.then(text => console.log("Response:", text))
.catch(err => console.error("Error:", err));
