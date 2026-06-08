import fs from 'fs';
import https from 'https';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// The REAL Efectivo amounts from 557 and 510:
// IGI Import (Clave 6, FP 0 in 557) = 2,196,403
// IVA Import (Clave 3, FP 0 in 557) = 29,979,838 
// PRV (Clave 15, FP 0 in 510) = 214,790  -> wait, the chart doesn't have PRV. Should PRV be added to IVA?
// The user's chart only has IGI, IVA, DTA. Usually PRV is grouped with DTA or shown separately.
// Let's keep PRV+IVA together? No, IVA is 29,979,838. I'll just use that.
// DTA Import (Clave 1, FP 0 in 510) = 793,247

const monthlyDuties = MONTHS_SHORT.map(name => {
    if (name === 'Apr') {
        return {
            mapValue: {
                fields: {
                    name: { stringValue: 'Apr' },
                    "IGI Import": { doubleValue: 2196403 },
                    "IVA Import": { doubleValue: 29979838 },
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
