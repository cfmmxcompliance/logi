import fs from 'fs';
import https from 'https';

const options = {
    hostname: 'firestore.googleapis.com',
    path: '/v1/projects/logimaster-cfmoto/databases/(default)/documents/data_stage_reports',
    method: 'GET'
};

const req = https.request(options, (res) => {
    let d = '';
    res.on('data', chunk => d += chunk);
    res.on('end', () => {
        const json = JSON.parse(d);
        json.documents.forEach(doc => {
            const name = doc.fields.name ? doc.fields.name.stringValue : 'N/A';
            const id = doc.name.split('/').pop();
            console.log(`Report: ${id} - Name: ${name}`);
            if (doc.fields.reviewsByMonth) {
                const totalRev = doc.fields.reviewsByMonth.arrayValue.values.reduce((s, v) => s + parseInt(v.mapValue.fields.Import.integerValue) + parseInt(v.mapValue.fields.Export.integerValue), 0);
                console.log(`  Revisions total: ${totalRev}`);
            }
        });
    });
});
req.end();
