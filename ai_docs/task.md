# Task: Clone/Setup LogiMaster Application

- [x] Install dependencies <!-- id: 0 -->
- [x] Configure environment variables (GEMINI_API_KEY) <!-- id: 1 -->
- [x] Verify file integrity and structure <!-- id: 2 -->
- [x] Run development server (`npm run dev`) <!-- id: 3 -->
- [x] Verify application functionality in browser <!-- id: 4 -->
- [x] Verify "Smart Document Processing" page loads (AI Features) <!-- id: 5 -->

# Task: Firebase Cloud Persistence

- [x] Create Firebase Project in Console <!-- id: 6 -->
- [x] Enable Firestore Database <!-- id: 7 -->
- [x] Enable Authentication (Email/Google) <!-- id: 8 -->
- [x] Obtain and Configure Firebase Credentials <!-- id: 9 -->
- [x] Verify Data Persistence (Cloud Mode) <!-- id: 10 -->

# Task: Implement Business Logic (Data Distribution)
- [x] Implement `distributeToModules` in `storageService.ts` <!-- id: 11 -->
- [x] Update `processPreAlertExtraction` to use distribution logic <!-- id: 12 -->
- [x] Add "Generate Tracking/Equipment" pop-up in `PreAlerts.tsx` (Manual Entry) <!-- id: 13 -->
- [x] Debug Data Visibility (Customs/Equipment not showing data) <!-- id: 15 -->
- [x] Verify data propagation (Pre-Alert -> Tracking/Customs/Equipment) <!-- id: 14 -->

# Task: Inland Freight & Invoice Control Enhancements
- [x] Implement Extraction Review Modal (Edit BL/Container before save) <!-- id: 20 -->
- [x] Add 'Currency' column to Invoice Table and Review Modal <!-- id: 21 -->
- [x] Update Date Logic to use 'FechaTimbrado' (Robust Regex) <!-- id: 22 -->
- [x] Map XML Description to Comments field (Robust Regex + Display) <!-- id: 23 -->
- [x] Fix persistence logic to prevent Comments overwrite <!-- id: 24 -->
- [x] Implement 'Type' Column (Review Modal, Table, Edit Modal) <!-- id: 25 -->
- [x] Fix 'Type' persistence by adding legacy options to legacy data <!-- id: 26 -->
- [x] Implement 'Type' Filter with Legacy Support <!-- id: 27 -->

# Task: Deployment & Verification

- [x] Build application for production (`npm run build`) <!-- id: 16 -->
- [ ] Verify production build locally (`npm run preview`) <!-- id: 17 -->
- [ ] Deploy to Firebase Hosting (`firebase deploy`) <!-- id: 18 -->

# Task: Source Control

- [x] Sync local code to GitHub (`git push`) <!-- id: 19 -->

# Task: Bug Fixes
- [x] Fix "Function setDoc() called with invalid data" (undefined `ata` field) <!-- id: 28 -->
- [x] Implement Cross-Module Sync for BL Updates (PreAlerts, Customs, Equipment) <!-- id: 30 -->
- [x] Fix "where() called with invalid data" & "Cannot delete record" (Ghost Busting & Safe Fetch) <!-- id: 31 -->
- [x] Refine AI Prompt to enforce "EGLV" prefix extraction <!-- id: 32 -->
