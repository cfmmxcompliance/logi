import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DOMParser } from '@xmldom/xmldom';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

const XML_DIR = '/Users/alex/Downloads/logimaster (2)/XML';

function extractUUID(text, fileName) {
  try {
    const parser = new DOMParser();

    // Check if it's a Word ML document
    const isWordML = text.includes('w:wordDocument');

    let cfdiXml = text;

    if (isWordML) {
      const wordDoc = parser.parseFromString(text, 'text/xml');

      // Filter out w:del nodes (deleted revision text)
      const allWt = Array.from({ length: 999 }, (_, i) => i)
        .reduce((acc) => acc, wordDoc.getElementsByTagName('w:t'));

      // Manually filter w:t not inside w:del
      const wtNodes = wordDoc.getElementsByTagName('w:t');
      let embedded = '';
      for (let i = 0; i < wtNodes.length; i++) {
        const node = wtNodes[i];
        let parent = node.parentNode;
        let insideDel = false;
        while (parent) {
          if (parent.nodeName === 'w:del') { insideDel = true; break; }
          parent = parent.parentNode;
        }
        if (!insideDel) embedded += (node.textContent || '');
      }

      const cfdiStart = embedded.indexOf('<cfdi:Comprobante');
      const cfdiEnd = embedded.lastIndexOf('</cfdi:Comprobante>');
      if (cfdiStart === -1 || cfdiEnd === -1) {
        return { uuid: null, error: 'CFDI not found in WordML', isWordML: true };
      }
      cfdiXml = embedded.substring(cfdiStart, cfdiEnd + '</cfdi:Comprobante>'.length);
    }

    const cfdiDoc = parser.parseFromString(cfdiXml, 'text/xml');
    const timbre = cfdiDoc.getElementsByTagName('tfd:TimbreFiscalDigital')[0]
                || cfdiDoc.getElementsByTagName('TimbreFiscalDigital')[0];

    const uuid = timbre?.getAttribute('UUID') || null;
    const invoiceEl = cfdiDoc.getElementsByTagName('cfdi:Comprobante')[0]
                   || cfdiDoc.getElementsByTagName('Comprobante')[0];
    const serie = invoiceEl?.getAttribute('Serie') || '';
    const folio = invoiceEl?.getAttribute('Folio') || '';
    const invoiceNo = (serie + folio).trim() || 'S/F';

    return { uuid, invoiceNo, isWordML, error: uuid ? null : 'No UUID in TimbreFiscalDigital' };
  } catch (e) {
    return { uuid: null, error: String(e), isWordML: false };
  }
}

async function main() {
  // 1. Read all XML files and extract UUIDs
  const files = readdirSync(XML_DIR).filter(f => f.endsWith('.xml'));
  console.log(`Found ${files.length} XML files in /XML/\n`);

  const extracted = files.map(f => {
    const path = join(XML_DIR, f);
    const text = readFileSync(path, 'utf8');
    const result = extractUUID(text, f);
    return { file: f, ...result };
  });

  // 2. Fetch existing UUIDs from Firestore
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  console.log('Fetching cfdi_invoices from Firestore...\n');
  const snap = await getDocs(collection(db, 'cfdi_invoices'));
  const storedUUIDs = new Set(snap.docs.map(d => (d.data().uuid || '').toLowerCase()));
  console.log(`Firestore total UUIDs: ${storedUUIDs.size}\n`);
  console.log('═'.repeat(90));

  // 3. Compare
  for (const item of extracted) {
    const inFirestore = item.uuid ? storedUUIDs.has(item.uuid.toLowerCase()) : false;
    const status = !item.uuid ? '⚠️  SIN UUID' : inFirestore ? '✅ EN FIRESTORE' : '❌ FALTA EN FIRESTORE';
    console.log(`\n${status}`);
    console.log(`  Archivo  : ${item.file}`);
    console.log(`  Factura  : ${item.invoiceNo || 'N/A'}`);
    console.log(`  UUID XML : ${item.uuid || 'N/A'}`);
    if (item.isWordML) console.log(`  Formato  : Word ML (w:wordDocument)`);
    if (item.error) console.log(`  Error    : ${item.error}`);
  }

  console.log('\n' + '═'.repeat(90));
  const found = extracted.filter(e => e.uuid && storedUUIDs.has(e.uuid.toLowerCase())).length;
  const missing = extracted.filter(e => e.uuid && !storedUUIDs.has(e.uuid.toLowerCase())).length;
  const noUUID = extracted.filter(e => !e.uuid).length;
  console.log(`\nResumen: ✅ ${found} en Firestore | ❌ ${missing} faltantes | ⚠️  ${noUUID} sin UUID\n`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
