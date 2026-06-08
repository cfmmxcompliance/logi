import fs from 'fs';
import https from 'https';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// I already know April has:
// IVA Import: 237413, DTA Import: 642879, IVA Export: 11873, DTA Export: 225999
// IGI from 557 is: 41,231,989.
// But wait! Is that IGI on Import or Export?
// IGI (Impuesto General de Importacion) is always Import!
// So IGI Import = 41231989.

const monthlyDuties = MONTHS_SHORT.map(name => {
    if (name === 'Apr') {
        return {
            mapValue: {
                fields: {
                    name: { stringValue: 'Apr' },
                    "IGI Import": { doubleValue: 41231989 },
                    "IVA Import": { doubleValue: 237413 },
                    "DTA Import": { doubleValue: 642879 },
                    "IGI Export": { doubleValue: 0 },
                    "IVA Export": { doubleValue: 11873 },
                    "DTA Export": { doubleValue: 225999 }
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
