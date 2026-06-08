import { doc, updateDoc } from "firebase/firestore";
import { db } from "./services/firebaseConfig.js";
import fs from "fs";

const reportId = '9b04de33-6b65-419f-b31b-085651116c94';
const payload = JSON.parse(fs.readFileSync('payload.json', 'utf8'));

updateDoc(doc(db, "data_stage_reports", reportId), payload).then(() => {
    console.log("Firebase updated successfully.");
    process.exit(0);
}).catch(e => {
    console.error("Firebase update failed:", e);
    process.exit(1);
});
