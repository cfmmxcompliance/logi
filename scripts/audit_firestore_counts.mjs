
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getCountFromServer } from "firebase/firestore";
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Reading .env.local manually
const envPath = '/Users/alex/Downloads/logimaster (2)/.env.local';
let envConfig = {};
try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) envConfig[key.trim()] = val.trim();
    });
} catch (e) {
    console.log("Could not read .env.local");
}

const firebaseConfig = {
    apiKey: envConfig.VITE_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
    authDomain: envConfig.VITE_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: "logimaster-cfmoto", // Hardcoding known project ID if verification fails
    storageBucket: envConfig.VITE_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: envConfig.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: envConfig.VITE_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const collections = [
    'ds501', 'ds502', 'ds503', 'ds504', 'ds505',
    'ds551', 'ds506', 'ds520', 'ds507', 'ds509',
    'ds510', 'ds511', 'ds_items', 'ds_files'
];

async function audit() {
    console.log("--- FIRESTORE COUNT AUDIT ---");
    const results = {};

    for (const col of collections) {
        try {
            const coll = collection(db, col);
            const snapshot = await getCountFromServer(coll);
            const count = snapshot.data().count;
            console.log(`${col}: ${count}`);
            results[col] = count;
        } catch (e) {
            // Ignore ds_items/ds_files errors if they are not relevant for raw checks
            if (!['ds_items', 'ds_files'].includes(col)) {
                console.error(`Error counting ${col}:`, e.message);
            }
            results[col] = 'Error';
        }
    }
    console.log("-----------------------------");
}

audit();
