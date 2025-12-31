
import { User, UserRole } from '../types.ts';
// @ts-ignore
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebaseConfig';

export const authService = {
    // Hybrid Login: Still mocks password check (accepts any), but fetches ROLE from Real Database
    login: async (email: string, password: string): Promise<User | null> => {
        // Simulate network delay
        await new Promise(r => setTimeout(r, 500));

        // 1. Construct User Object Base
        const username = email.split('@')[0];
        let role = UserRole.VIEWER; // Default safety role

        if (!db) {
            console.warn("⚠️ Firestore not available. Falling back to Mock Logic.");
            if (email.includes('admin')) role = UserRole.ADMIN;
            else if (email.includes('ops') || email.includes('operator')) role = UserRole.OPERATOR;
            else if (email.includes('edit')) role = UserRole.EDITOR;
        } else {
            try {
                // 2. Check if user exists in Firestore
                const userRef = doc(db, 'users', email);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    // User exists: Load their Assigned Role
                    const data = userSnap.data();
                    role = data.role as UserRole;

                    // FAILSAFE: If it's an 'admin' email but has wrong role (e.g. accidentally created as Viewer), fix it.
                    if (email.toLowerCase().includes('admin') && role !== UserRole.ADMIN) {
                        console.warn(`⚠️ Detected Admin Email '${email}' with '${role}' role. Elevating to ADMIN.`);
                        await updateDoc(userRef, { role: UserRole.ADMIN });
                        role = UserRole.ADMIN;
                    }

                    console.log(`✅ Logged in as ${email} [${role}] (Loaded from DB)`);
                } else {
                    // New User: Auto-Register
                    // If email contains 'admin', make them Admin immediately.
                    // If 'ops', make them Editor.
                    // Otherwise VIEWER.
                    let initialRole = UserRole.VIEWER;
                    if (email.toLowerCase().includes('admin')) initialRole = UserRole.ADMIN;
                    if (email.toLowerCase().includes('admin')) initialRole = UserRole.ADMIN;
                    else if (email.toLowerCase().includes('ops') || email.toLowerCase().includes('operator')) initialRole = UserRole.OPERATOR;
                    else if (email.toLowerCase().includes('edit')) initialRole = UserRole.EDITOR;

                    console.log(`🆕 New User ${email}. Registering as ${initialRole}.`);
                    await setDoc(userRef, {
                        email,
                        username,
                        role: initialRole,
                        createdAt: new Date().toISOString(),
                        lastLogin: new Date().toISOString()
                    });
                    role = initialRole;
                }
            } catch (e) {
                console.error("Auth Error (Firestore):", e);
                // Fallback if DB fails
                role = UserRole.VIEWER;
            }
        }

        const user: User = {
            username,
            name: username, // simplistic name
            role,
            avatarInitials: email.substring(0, 2).toUpperCase()
        };

        localStorage.setItem('logimaster_user', JSON.stringify(user));
        return user;
    },

    register: async (email: string, password: string): Promise<User | null> => {
        return authService.login(email, password);
    },

    logout: async () => localStorage.removeItem('logimaster_user'),

    // Admin Features: Read/Write Real Users
    getUsers: async (): Promise<User[]> => {
        if (!db) return []; // Mock fallback currently in Settings.tsx, this is for real mode

        try {
            const q = query(collection(db, 'users'));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    username: data.username || data.email,
                    email: doc.id, // THE KEY IS THE EMAIL (DOC ID)
                    name: data.username || data.email,
                    role: data.role as UserRole,
                    avatarInitials: (data.email || '??').substring(0, 2).toUpperCase()
                };
            });
        } catch (e) {
            console.error("Error fetching users:", e);
            return [];
        }
    },

    updateUserRole: async (email: string, newRole: UserRole) => {
        if (!db) return false;
        try {
            const userRef = doc(db, 'users', email);
            await updateDoc(userRef, { role: newRole });
            return true;
        } catch (e) {
            console.error("Error updating role:", e);
            return false;
        }
    }
};
