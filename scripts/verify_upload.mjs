import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env.local') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Config
const firebaseConfig = {
    apiKey: process.env.VITE_GEMINI_API_KEY || "YOUR_API_KEY_HERE",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.appspot.com",
    messagingSenderId: "367093282258",
    appId: "1:367093282258:web:7508df84d412e12613144f"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const db = getFirestore(app);
const auth = getAuth(app);

async function verifyUpload() {
    console.log("Starting verification with REAL examples...");

    // 1. Authenticate (Requires valid credentials for actual write)
    // const email = "your-email@example.com";
    // const password = "your-password";
    // await signInWithEmailAndPassword(auth, email, password);

    // 2. Select ALL PDF Files (N Formats)
    const projectRoot = path.resolve(__dirname, '..');
    const allFiles = readdirSync(projectRoot);

    // Filter for all PDF files (excluding the mock generation one if it exists)
    const pdfFiles = allFiles.filter(f => f.toLowerCase().endsWith('.pdf') && !f.includes('test_submission'));

    console.log(`\n🔍 Found ${pdfFiles.length} PDF formats to process (n=${pdfFiles.length})...`);

    if (pdfFiles.length === 0) {
        console.log("No PDF files found to process.");
        return;
    }

    for (const fileName of pdfFiles) {
        console.log(`\n[📄 Processing Format] ${fileName}`);
        await processFile(path.resolve(projectRoot, fileName), fileName);
    }
}

async function processFile(filePath, fileName) {
    const fileBuffer = readFileSync(filePath);

    // 3. Upload to Storage
    console.log(`   ⬆️  Uploading...`);
    try {
        const storageRef = ref(storage, `training_data/${Date.now()}_${fileName}`);
        const uploadResult = await uploadBytes(storageRef, fileBuffer);
        console.log("   ✅ Upload successful!", uploadResult.ref.fullPath);

        const downloadURL = await getDownloadURL(uploadResult.ref);
        console.log("   📎 URL:", downloadURL);

        // 4. Create Firestore Record
        console.log("   📝 Creating Record...");

        await addDoc(collection(db, 'training_submissions'), {
            fileName: fileName,
            fileUrl: downloadURL,
            provider: fileName.includes('EGLV') ? 'Evergreen Marine Corp' : 'Auto-Detected Provider',
            comments: 'Batch N-Formats Verification',
            uploadedAt: new Date().toISOString(),
            status: 'PENDING_ANALYSIS',
            user: 'Admin (Batch Script)'
        });

        console.log("   ✨ Done.");

    } catch (error) {
        console.error("   ❌ Upload Failed:", error.code || error.message);
        if (error.code === 'storage/unknown' || error.code === 'storage/unauthorized') {
            console.log("       (Expected in unauthenticated script context - UI Bypass would handle this)");
        }
    }
}

verifyUpload().catch(console.error);
