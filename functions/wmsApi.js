const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const wmsApi = express.Router();
app.use('/api', wmsApi);

const JWT_SECRET = process.env.JWT_SECRET || 'wms_secret_key_12345';
const db = admin.firestore();

// ----------------------------------------------------
// Middleware: Authenticate Token
// ----------------------------------------------------
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// ----------------------------------------------------
// 1. POST /api/auth/login
// ----------------------------------------------------
wmsApi.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and Password are required' });

        const cleanEmail = email.trim().toLowerCase();
        const cleanPassword = password.trim();
        const isRootAdmin = cleanEmail === 'admin@logimaster.com';

        // 1. Check Firestore first (just like authService.ts)
        const usersRef = db.collection('users');
        const userDoc = await usersRef.doc(cleanEmail).get();

        if (!userDoc.exists) {
            return res.status(401).json({ error: 'User not registered.' });
        }

        const userData = userDoc.data();
        let authSuccess = false;

        // 2. Fallback validation exactly like Logimaster authService.ts
        if (isRootAdmin && cleanPassword === '1234') {
            authSuccess = true;
        } else if (userData.password && userData.password === cleanPassword) {
            authSuccess = true;
        } else {
            // Try Firebase Auth REST API just in case it works (production)
            try {
                const FIREBASE_API_KEY = "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU";
                const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: cleanEmail, password: cleanPassword, returnSecureToken: true })
                });
                
                if (authResponse.ok) {
                    authSuccess = true;
                }
            } catch (e) {
                // Ignore and fail
            }
        }

        if (!authSuccess) {
            return res.status(401).json({ error: 'Contraseña incorrecta.' });
        }

        const userId = userDoc.id;

        const userPayload = {
            user_id: userId,
            name: userData.name || userData.displayName || email.split('@')[0],
            role: userData.role || 'HANDHELD_USER',
            location: userData.assigned_location || 'L1' // fallback to L1 if not set
        };

        const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '10h' });
        
        return res.json({ token, user: userPayload });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ----------------------------------------------------
// 2. GET /api/units/:vin
// ----------------------------------------------------
wmsApi.get('/units/:vin', authenticateToken, async (req, res) => {
    try {
        const vin = req.params.vin.toUpperCase().trim();
        const docRef = db.collection('wms_vehicles').doc(vin);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'VIN not found' });
        }

        // Get last transfer info (query by vin only to avoid composite index requirement)
        const transfersSnap = await db.collection('wms_transfers')
            .where('vin', '==', vin)
            .get();

        let lastTransfer = null;
        if (!transfersSnap.empty) {
            const sortedDocs = [...transfersSnap.docs].sort((a, b) => {
                return new Date(b.data().timestamp).getTime() - new Date(a.data().timestamp).getTime();
            });
            lastTransfer = sortedDocs[0].data();
        }

        return res.json({ vehicle: { id: doc.id, ...doc.data() }, lastTransfer });
    } catch (err) {
        console.error("Get unit error:", err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ----------------------------------------------------
// 3. POST /api/units/register
// ----------------------------------------------------
wmsApi.post('/units/register', authenticateToken, async (req, res) => {
    try {
        const { vin, operator_id, location } = req.body;
        const operatorLocation = location || req.user.location;

        if (!vin) return res.status(400).json({ error: 'VIN is required' });

        const cleanVin = vin.toUpperCase().trim();
        const docRef = db.collection('wms_vehicles').doc(cleanVin);
        const now = new Date().toISOString();
        
        const doc = await docRef.get();
        if (doc.exists) {
            const vehicleData = doc.data();
            if (vehicleData.status === 'REJECTED') {
                // Find where it was rejected from to determine re-entry location
                const transfersSnap = await db.collection('wms_transfers').where('vin', '==', cleanVin).get();
                let rejectedFrom = 'L1';
                if (!transfersSnap.empty) {
                    const sortedDocs = [...transfersSnap.docs].sort((a, b) => new Date(b.data().timestamp).getTime() - new Date(a.data().timestamp).getTime());
                    rejectedFrom = sortedDocs[0].data().from_location || 'L1';
                }
                const allowedReentryLocation = rejectedFrom === 'L3' ? 'L2' : 'L1';

                if (operatorLocation !== allowedReentryLocation && req.user.role !== 'ADMIN' && operatorLocation !== 'ALL') {
                    return res.status(403).json({ error: `Rejected from ${rejectedFrom}. Must re-enter through ${allowedReentryLocation}` });
                }

                // RE-ENTRY LOGIC
                const updates = {
                    current_location: allowedReentryLocation,
                    status: 'IN_PROCESS',
                    qa_cleared: false,
                };
                if (allowedReentryLocation === 'L2') updates.entered_L2_at = now;
                else updates.entered_L1_at = now;
                
                const batch = db.batch();
                batch.update(docRef, updates);

                const transferRef = db.collection('wms_transfers').doc();
                batch.set(transferRef, {
                    vin: cleanVin,
                    from_location: vehicleData.current_location,
                    to_location: allowedReentryLocation,
                    operator_id: operator_id || req.user.user_id,
                    observations: `Re-entry to ${allowedReentryLocation} after REJECT`,
                    timestamp: now
                });

                await batch.commit();
                return res.status(200).json({ success: true, vehicle: { id: doc.id, ...vehicleData, ...updates } });
            }
            return res.status(400).json({ error: 'VIN already registered' });
        }

        // Brand new registration
        if (operatorLocation !== 'L1' && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only L1 operators can register new VINs' });
        }

        const vehicleData = {
            vin: cleanVin,
            product_no: null,
            engine_no: null,
            color: null,
            production_date: null,
            current_location: 'L1',
            status: 'IN_PROCESS',
            enriched: false,
            entered_L1_at: now,
            entered_L3_at: null,
            shipped_at: null,
            qa_cleared: false,
            created_by: operator_id || req.user.user_id,
            created_at: now
        };

        const batch = db.batch();
        batch.set(docRef, vehicleData);

        const transferRef = db.collection('wms_transfers').doc();
        batch.set(transferRef, {
            vin: cleanVin,
            from_location: null,
            to_location: 'L1',
            operator_id: operator_id || req.user.user_id,
            observations: 'Initial Registration',
            timestamp: now
        });

        await batch.commit();

        return res.status(201).json({ success: true, vehicle: vehicleData });
    } catch (err) {
        console.error("Register unit error:", err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ----------------------------------------------------
// 4. POST /api/transfer
// ----------------------------------------------------
wmsApi.post('/transfer', authenticateToken, async (req, res) => {
    try {
        const { vin, operator_id, observations, location } = req.body;
        const operatorLocation = location || req.user.location;
        const operatorRole = req.user.role;

        if (!vin) return res.status(400).json({ error: 'VIN is required' });

        const cleanVin = vin.toUpperCase().trim();
        const docRef = db.collection('wms_vehicles').doc(cleanVin);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'VIN not found' });
        }

        const vehicle = doc.data();

        if (vehicle.status === 'REJECTED') {
            return res.status(403).json({ error: 'Vehicle is REJECTED. Must re-enter through L1.' });
        }

        // Enforce QA authorization before transfer
        if (vehicle.qa_cleared !== true) {
            return res.status(403).json({ error: 'Transfer restricted. Quality Assurance (QA) approval required.' });
        }

        // Determine next sequential location
        const seq = { 'L1': 'L2', 'L2': 'L3', 'L3': 'SHIPPED' };
        const nextLocation = seq[vehicle.current_location];

        if (!nextLocation) {
            return res.status(400).json({ error: 'Vehicle is already SHIPPED or in unknown location' });
        }

        // Validate operator assigned location matches current vehicle location
        if (operatorLocation !== vehicle.current_location && operatorLocation !== 'ALL' && operatorRole !== 'ADMIN') {
            return res.status(403).json({ error: `Operator is assigned to ${operatorLocation}, but vehicle is in ${vehicle.current_location}` });
        }

        const now = new Date().toISOString();
        const updates = {
            current_location: nextLocation,
            qa_cleared: false // Reset QA lock for the next location
        };

        if (nextLocation === 'L2') updates.entered_L2_at = now;
        if (nextLocation === 'L3') updates.entered_L3_at = now;
        if (nextLocation === 'SHIPPED') {
            updates.shipped_at = now;
            updates.status = 'SHIPPED';
        }

        const batch = db.batch();
        batch.update(docRef, updates);

        const transferRef = db.collection('wms_transfers').doc();
        batch.set(transferRef, {
            vin: cleanVin,
            from_location: vehicle.current_location,
            to_location: nextLocation,
            operator_id: operator_id || req.user.user_id,
            observations: observations || '',
            timestamp: now
        });

        await batch.commit();

        const updatedVehicle = { ...vehicle, ...updates };

        return res.json({ success: true, vehicle: updatedVehicle, transfer_id: transferRef.id });
    } catch (err) {
        console.error("Transfer error:", err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ----------------------------------------------------
// 5. POST /api/qa/authorize
// ----------------------------------------------------
wmsApi.post('/qa/authorize', authenticateToken, async (req, res) => {
    try {
        const { vin, operator_id, is_approved, action, observations } = req.body;
        
        if (!vin) return res.status(400).json({ error: 'VIN is required' });
        
        const cleanVin = vin.toUpperCase().trim();
        const docRef = db.collection('wms_vehicles').doc(cleanVin);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'VIN not found' });
        }

        const vehicle = doc.data();

        if (vehicle.status === 'SHIPPED') {
            return res.status(400).json({ error: 'Vehicle is already shipped' });
        }

        const now = new Date().toISOString();
        
        let qaAction = action;
        if (!qaAction) {
            qaAction = is_approved ? 'APPROVE' : 'REJECT';
        }

        // If QA approves, it unlocks the transfer. If rejects, it leaves the system and goes to REJECTED_AREA.
        // If returns, it goes back one station and remains IN_PROCESS but not qa_cleared.
        const updates = {
            qa_cleared: qaAction === 'APPROVE',
            status: qaAction === 'REJECT' ? 'REJECTED' : 'IN_PROCESS',
        };

        if (qaAction === 'REJECT') {
            updates.current_location = 'REJECTED_AREA';
        } else if (qaAction === 'RETURN') {
            if (vehicle.current_location === 'L3') {
                updates.current_location = 'L2';
                updates.entered_L2_at = now;
            }
            else if (vehicle.current_location === 'L2') {
                updates.current_location = 'L1';
                updates.entered_L1_at = now;
            }
            updates.qa_cleared = false;
        }

        const batch = db.batch();
        batch.update(docRef, updates);

        // Record QA action in transfers (as an audit log)
        const transferRef = db.collection('wms_transfers').doc();
        batch.set(transferRef, {
            vin: cleanVin || 'UNKNOWN',
            from_location: vehicle.current_location || 'L1',
            to_location: updates.current_location || vehicle.current_location || 'L1',
            operator_id: operator_id || (req.user && req.user.user_id) || 'UNKNOWN',
            observations: `QA ${qaAction}: ${observations || ''}`,
            timestamp: now,
            is_qa_action: true
        });

        await batch.commit();

        const updatedVehicle = { ...vehicle, ...updates };
        return res.json({ success: true, vehicle: updatedVehicle });
    } catch (err) {
        console.error("QA error:", err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
});

// ----------------------------------------------------
// 6. GET /api/location/:code/count
// ----------------------------------------------------
wmsApi.get('/location/:code/count', authenticateToken, async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        
        // Query by location only (no composite index needed)
        const snapshot = await db.collection('wms_vehicles')
            .where('current_location', '==', code)
            .get();

        // Filter status in JS
        const count = snapshot.docs.filter(d => {
            const status = d.data().status;
            return status === 'IN_PROCESS';
        }).length;

        return res.json({ location: code, count });
    } catch (err) {
        console.error("Count error:", err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

wmsApi.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const [l1Snap, l2Snap, l3Snap] = await Promise.all([
            db.collection('wms_vehicles').where('current_location', '==', 'L1').get(),
            db.collection('wms_vehicles').where('current_location', '==', 'L2').get(),
            db.collection('wms_vehicles').where('current_location', '==', 'L3').get()
        ]);

        const l1 = l1Snap.docs.filter(d => d.data().status === 'IN_PROCESS').length;
        const l2 = l2Snap.docs.filter(d => d.data().status === 'IN_PROCESS').length;
        const l3 = l3Snap.docs.filter(d => d.data().status === 'IN_PROCESS').length;
        
        // QA count is all active vehicles that are not cleared yet
        let qaCount = 0;
        const allDocs = [...l1Snap.docs, ...l2Snap.docs, ...l3Snap.docs];
        qaCount = allDocs.filter(d => d.data().status === 'IN_PROCESS' && d.data().qa_cleared !== true).length;

        return res.json({
            L1: l1,
            L2: l2,
            L3: l3,
            QA: qaCount
        });
    } catch (err) {
        console.error("Dashboard error:", err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ----------------------------------------------------
// 7. POST /api/admin/reverse  (ADMIN only)
// ----------------------------------------------------
wmsApi.post('/admin/reverse', authenticateToken, async (req, res) => {
    try {
        // Only admins can reverse
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Solo los administradores pueden ejecutar reversas.' });
        }

        const { vin, reason } = req.body;
        if (!vin || !reason || reason.trim() === '') {
            return res.status(400).json({ error: 'VIN y motivo de reversa son requeridos.' });
        }

        const cleanVin = vin.toUpperCase().trim();
        const docRef = db.collection('wms_vehicles').doc(cleanVin);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'VIN no encontrado.' });
        }

        const vehicle = doc.data();

        if (vehicle.status === 'SHIPPED') {
            return res.status(400).json({ error: 'No se puede revertir un vehículo que ya fue embarcado (SHIPPED).' });
        }

        // Map current location → previous location
        const prevLocation = {
            'L2': 'L1',
            'L3': 'L2',
            'REJECTED_AREA': 'L1',
        }[vehicle.current_location];

        if (!prevLocation) {
            return res.status(400).json({ error: `No hay ubicación anterior para "${vehicle.current_location}". El vehículo ya está en L1.` });
        }

        const now = new Date().toISOString();
        const updates = {
            current_location: prevLocation,
            status: 'IN_PROCESS',
            qa_cleared: false,  // QA must re-authorize
            [`entered_${prevLocation}_at`]: now,
        };

        const batch = db.batch();
        batch.update(docRef, updates);

        // Reversal audit record
        const transferRef = db.collection('wms_transfers').doc();
        batch.set(transferRef, {
            vin: cleanVin,
            from_location: vehicle.current_location,
            to_location: prevLocation,
            operator_id: req.user.user_id,
            observations: `⚠️ REVERSA ADMIN: ${reason.trim()}`,
            timestamp: now,
            type: 'REVERSAL',
            reversed_by: req.user.user_id,
            reason: reason.trim(),
        });

        await batch.commit();

        return res.json({
            success: true,
            message: `Vehículo ${cleanVin} revertido de ${vehicle.current_location} → ${prevLocation}. QA debe re-autorizar.`,
            vehicle: { ...vehicle, ...updates }
        });

    } catch (err) {
        console.error('Reversal error:', err);
        return res.status(500).json({ error: 'Error interno del servidor: ' + err.message });
    }
});

module.exports = app;

