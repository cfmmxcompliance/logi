
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runLiveSync() {
    console.log("🚀 Starting Live EGLV Sync with Puppeteer...");

    // 1. Get all Pre-Alerts with EGLV that need data
    const preAlertsRef = collection(db, "pre_alerts");
    const snapshot = await getDocs(preAlertsRef);

    // Filter for EGLV and missing data
    const targets = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        const bl = data.bookingAbw || "";
        if (bl.startsWith("EGLV")) {
            // Check if missing packages or weight
            if (!data.packages || !data.grossWeight || data.packages === "0 PACKAGES" || data.grossWeight === 0) {
                targets.push({ id: doc.id, ...data });
            }
        }
    });

    console.log(`Found ${targets.length} EGLV records needing update.`);
    if (targets.length === 0) {
        console.log("Nothing to update.");
        process.exit(0);
    }

    // 2. Launch Browser
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();

    // Set a generous timeout (unlimited for manual interaction)
    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);

    console.log("🌏 Navigating to ShipmentLink...");
    await page.goto('https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do', { waitUntil: 'domcontentloaded' });

    console.log("\n🛑 SCRIPT PAUSED: Waiting for YOU to navigate to the tracking input page.");
    console.log("👉 Please accept cookies, select language, and ensure the 'Booking No.' input is visible.");
    console.log("👉 Once you are ready, press ENTER in this terminal to continue...");

    await new Promise(resolve => process.stdin.once('data', resolve));

    console.log("✅ Resuming... Analyzing page structure to find selectors.");

    // Analyze the page to find the likely input field
    const analysis = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        return inputs.map(i => ({
            name: i.name,
            id: i.id,
            placeholder: i.placeholder,
            visible: i.offsetParent !== null
        }));
    });

    console.log("🔎 Found Inputs:", analysis);

    let updatedCount = 0;

    for (const record of targets) {
        const bl = record.bookingAbw;
        const bookingDigits = bl.replace("EGLV", "");
        console.log(`\nProcessing ${bl} (${bookingDigits})...`);

        try {
            // 1. Find the input again (page might have refreshed or changed)
            const inputHandle = await page.evaluateHandle(() => {
                const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
                // Prefer 'no' or 'data', then first visible
                return inputs.find(i => i.name === 'no') ||
                    inputs.find(i => i.name === 'data') ||
                    inputs.find(i => i.offsetParent !== null);
            });

            if (inputHandle && inputHandle.asElement()) {

                // 2. Clear and Type
                await page.evaluate((inp, digits) => {
                    inp.value = "";
                    inp.value = digits;
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                }, inputHandle, bookingDigits);

                // 3. Ensure Booking Radio is checked
                await page.evaluate(() => {
                    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
                    const bookingRadio = radios.find(r => {
                        const text = r.parentElement?.innerText || r.nextSibling?.nodeValue || "";
                        return text && text.includes("Booking");
                    });
                    if (bookingRadio && !bookingRadio.checked) bookingRadio.click();
                });

                // 4. Submit
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('input[type="submit"], button'));
                    const submit = buttons.find(b => b.value === 'Submit' || b.innerText === 'Submit');
                    if (submit) submit.click();
                });

                // Wait for the result table to appear
                // We look for "No. of Packages" text in the body
                try {
                    await page.waitForFunction(() => {
                        return document.body.innerText.includes("No. of Packages") ||
                            document.body.innerText.includes("Gross Weight");
                    }, { timeout: 30000 });
                } catch (e) {
                    console.log("⚠️ Content wait failed. Dumping text...");
                    const text = await page.evaluate(() => document.body.innerText.substring(0, 500));
                    console.log(text);
                    throw e;
                }

                // 5. Extract Data
                const result = await page.evaluate(() => {
                    const cells = Array.from(document.querySelectorAll('td.table_body_sm, td'));
                    let packages = null;
                    let weight = null;

                    for (let i = 0; i < cells.length; i++) {
                        const text = cells[i].innerText.trim();
                        if (text === "No. of Packages") {
                            packages = cells[i].nextElementSibling?.innerText.trim();
                        }
                        if (text === "Gross Weight") {
                            weight = cells[i].nextElementSibling?.innerText.trim();
                        }
                    }
                    return { packages, weight };
                });

                console.log("Extracted:", result);

                if (result.packages && result.weight) {
                    const updates = {
                        packages: result.packages,
                        grossWeight: parseFloat(result.weight.replace(/,/g, '').replace(/[^\d.]/g, '')),
                        updatedAt: new Date().toISOString()
                    };

                    await updateDoc(doc(db, "pre_alerts", record.id), updates);
                    console.log(`✅ Updated ${bl}`);
                    updatedCount++;
                } else {
                    console.log(`⚠️ Data not found for ${bl}`);
                }

                // 6. Reset to tracking page
                await page.goto('https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do', { waitUntil: 'domcontentloaded' });

            } else {
                console.error("❌ Input not found. Did you stay on the tracking page?");
                // Try reloading
                await page.goto('https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do', { waitUntil: 'domcontentloaded' });
            }

        } catch (error) {
            console.error(`❌ Error processing ${bl}:`, error.message);
            // Try resetting
            try {
                await page.goto('https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do', { waitUntil: 'domcontentloaded' });
            } catch (e) { }
        }

        // Small delay
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n🎉 Live Sync Complete! Updated ${updatedCount} records.`);
    await browser.close();
    process.exit(0);
}

runLiveSync().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
