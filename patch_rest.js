import fs from 'fs';
import https from 'https';

const payload = {
    fields: {
        reviewsByMonth: {
            arrayValue: {
                values: [
                    {
                        mapValue: {
                            fields: {
                                name: { stringValue: 'Apr' },
                                Import: { integerValue: "68" },
                                Export: { integerValue: "7" }
                            }
                        }
                    }
                ]
            }
        },
        monthlyDuties: {
            arrayValue: {
                values: [
                    {
                        mapValue: {
                            fields: {
                                name: { stringValue: 'Apr' },
                                "IGI Import": { doubleValue: 0 },
                                "IVA Import": { doubleValue: 237413 },
                                "DTA Import": { doubleValue: 642879 },
                                "IGI Export": { doubleValue: 0 },
                                "IVA Export": { doubleValue: 11873 },
                                "DTA Export": { doubleValue: 225999 }
                            }
                        }
                    }
                ]
            }
        },
        taxSummary: {
            mapValue: {
                fields: {
                    totalIGI: { doubleValue: 0 },
                    totalIVA: { doubleValue: 249286 },
                    totalDTA: { doubleValue: 868878 }
                }
            }
        }
    }
};

const reqData = JSON.stringify(payload);

const options = {
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/logimaster-cfmoto/databases/(default)/documents/data_stage_reports/9b04de33-6b65-419f-b31b-085651116c94?updateMask.fieldPaths=reviewsByMonth&updateMask.fieldPaths=monthlyDuties&updateMask.fieldPaths=taxSummary`,
    method: 'PATCH',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(reqData)
    }
};

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let d = '';
    res.on('data', chunk => d+=chunk);
    res.on('end', () => console.log(d.substring(0, 500)));
});

req.on('error', (e) => console.error(e));
req.write(reqData);
req.end();
