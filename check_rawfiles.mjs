import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

async function main() {
    const firebaseConfig = {
      apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
      projectId: "logimaster-cfmoto"
    };
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const reportsSnap = await getDocs(collection(db, 'data_stage_reports'));
    const first = reportsSnap.docs[0].data();
    
    console.log('=== rawFiles entries ===');
    (first.rawFiles || []).forEach((rf, i) => {
        console.log(`  [${i}] code="${rf.code}" fileName="${rf.fileName}" rows=${rf.rows} contentLen=${(rf.content||'').length}`);
        if (rf.content && rf.content.length > 0) {
            console.log(`       content preview: ${rf.content.substring(0, 150)}`);
        }
    });

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
