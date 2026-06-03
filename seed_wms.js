import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const seed = async () => {
  try {
    for(let i=1; i<=10; i++) {
        const vin = `TESTVIN00000000${i.toString().padStart(2, '0')}`;
        await setDoc(doc(db, "wms_vehicles", vin), {
            vin: vin,
            current_location: i <= 4 ? 'L1' : (i <= 7 ? 'L2' : 'L3'),
            status: 'RECEIVED',
            operator_id: 'TestAdmin',
            timestamp: new Date().toISOString(),
            is_qa_approved: i % 2 === 0
        });
        console.log(`Inserted ${vin}`);
    }
    
    // add some transfers
    await setDoc(doc(db, "wms_transfers", "tx_1"), {
        vin: "TESTVIN0000000001",
        from_location: "RECEIVING",
        to_location: "L1",
        operator_id: "TestAdmin",
        timestamp: new Date().toISOString()
    });
    console.log("Done seeding!");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

seed();
