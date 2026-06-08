import fs from 'fs';
import https from 'https';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// IGI: 2,196,403 (FP 0) + 0 (FP 22) = 2,196,403
// IVA: 29,979,838 (FP 0) + 53,135,847 (FP 22) = 83,115,685
// DTA: 793,247 (FP 0)

const monthlyDuties = MONTHS_SHORT.map(name => {
    if (name === 'Apr') {
        return {
            mapValue: {
                fields: {
                    name: { stringValue: 'Apr' },
                    "IGI Import": { doubleValue: 2196403 },
                    "IVA Import": { doubleValue: 83115685 },
                    "DTA Import": { doubleValue: 793247 },
                    "IGI Export": { doubleValue: 0 },
                    "IVA Export": { doubleValue: 0 },
                    "DTA Export": { doubleValue: 0 }
                }
            }
        };
    }
    return {
        mapValue: {
            fields: {
                name: { stringValue: name },
                "IGI Import": { doubleValue: 0 },
                "IVA Import": { doubleValue: 0 },
                "DTA Import": { doubleValue: 0 },
                "IGI Export": { doubleValue: 0 },
                "IVA Export": { doubleValue: 0 },
                "DTA Export": { doubleValue: 0 }
            }
        }
    };
});

const payload = {
    fields: {
        monthlyDuties: { arrayValue: { values: monthlyDuties } }
    }
};

const reqData = JSON.stringify(payload);

const options = {
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/logimaster-cfmoto/databases/(default)/documents/data_stage_reports/9b04de33-6b65-419f-b31b-085651116c94?updateMask.fieldPaths=monthlyDuties`,
    method: 'PATCH',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(reqData)
    }
};

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
});
req.write(reqData);
req.end();
