import { getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { User, UserRole } from '../types.ts';
// @ts-ignore
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, deleteField } from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import { storageService } from './storageService';

const ROOT_ADMIN_EMAIL = 'admin@logimaster.com';

export const authService = {
    login: async (email: string, password: string): Promise<User | null> => {
        let firebaseUser = null;
        let migrationNeeded = false;

        // 1. Attempt Firebase Native Auth First
        if (auth) {
            try {
                const credential = await signInWithEmailAndPassword(auth, email, password);
                firebaseUser = credential.user;
                console.log("✅ Firebase Auth: Login Success");
            } catch (e: any) {
                if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-login-credentials') {
                    console.warn("⚠️ Firebase Auth failed. Checking Legacy DB for migration...");
                    migrationNeeded = true;
                } else if (e.code === 'auth/wrong-password') {
                    console.warn("⛔ Firebase Auth: Wrong Password.");
                    throw e;
                } else {
                    console.error("Firebase Auth Error:", e);
                    // Continue to legacy check in case of network weirdness? No, usually stop.
                }
            }
        }

        const username = email.split('@')[0];
        const isRootAdmin = email.toLowerCase() === ROOT_ADMIN_EMAIL;
        let role: UserRole | null = null;
        let legacyData: any = null;

        if (!db) {
            console.warn("⚠️ Firestore not available. Login Restricted.");
            throw { code: 'auth/network-request-failed', message: 'Database unavailable.' };
        }

        try {
            // 2. Fetch User Data (Role/Profile) from Firestore
            // We ALWAYS need this because we store Roles in Firestore (until Custom Claims are built)
            const userRef = doc(db, 'users', email);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                legacyData = data;
                role = data.role as UserRole;

                // A. HARD OVERRIDE: Root Admin is ALWAYS Admin
                if (isRootAdmin) {
                    role = UserRole.ADMIN;
                    if (data.role !== UserRole.ADMIN) {
                        updateDoc(userRef, { role: UserRole.ADMIN }).catch(console.error);
                    }
                }

                // B. Legacy Password Check (Only if Firebase Auth failed/didn't exist)
                if (!firebaseUser) {
                    // If migration is needed, we verify the LEGACY password here
                    if (data.password && data.password !== password) {
                        console.warn(`⛔ Access Denied: User ${email} entered wrong password (Legacy).`);
                        throw { code: 'auth/wrong-password', message: 'Invalid password.' };
                    }

                    // C. AUTO-MIGRATION
                    // If we are here, Legacy Password matched.
                    if (auth) {
                        console.log(`🚀 Migrating user ${email} to Firebase Auth...`);
                        try {
                            const newCred = await createUserWithEmailAndPassword(auth, email, password);
                            firebaseUser = newCred.user;
                            console.log(`✅ Migration Successful for ${email}`);
                            // Optional: Clear legacy password field to enforce Firebase usage?
                            // await updateDoc(userRef, { password: deleteField() }); 
                        } catch (migErr) {
                            console.error("Migration Failed (User might exist or weak pass):", migErr);
                            // We allow them to login via Legacy for now, but log the error
                        }
                    }
                }

                // D. Check "Require Reset" flag
                if (data.requireReset) {
                    throw { code: 'auth/new-password-required', message: 'Admin requested password reset.' };
                }

            } else {
                console.warn(`⛔ Access Denied: User ${email} not found.`);
                throw { code: 'auth/user-not-found', message: 'User not registered.' };
            }

            // 3. Role Verification
            if (!role || (role === UserRole.PENDING && !isRootAdmin)) {
                console.error("⛔ Security Alert: Role not assigned or Pending.");
                throw { code: 'auth/role-pending', message: 'Role verification failed. Pending Approval.' };
            }

            const user: User = {
                username: legacyData.username || username,
                name: legacyData.name || legacyData.username || username,
                role,
                avatarInitials: email.substring(0, 2).toUpperCase()
            };

            localStorage.setItem('logimaster_user', JSON.stringify(user));
            return user;

        } catch (e) {
            console.error("Auth Error:", e);
            throw e;
        }
    },

    getUser: async (email: string): Promise<User | null> => {
        if (!db) return null;
        try {
            const userRef = doc(db, 'users', email);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                // Ensure Root Admin always appears as Admin in UI fetch
                const isRootAdmin = email.toLowerCase() === ROOT_ADMIN_EMAIL;

                return {
                    username: data.username || email.split('@')[0],
                    name: data.username || data.name || email.split('@')[0],
                    role: isRootAdmin ? UserRole.ADMIN : (data.role as UserRole),
                    email: email,
                    avatarInitials: (data.email || email).substring(0, 2).toUpperCase()
                };
            }
            return null;
        } catch (e) {
            console.error("Error fetching user:", e);
            return null;
        }
    },

    register: async (email: string, password: string): Promise<User | null> => {
        const username = email.split('@')[0];
        const isRootAdmin = email.toLowerCase() === ROOT_ADMIN_EMAIL;
        let role = isRootAdmin ? UserRole.ADMIN : UserRole.PENDING;

        if (!db) {
            throw { code: 'auth/network-request-failed', message: 'Database unavailable.' };
        }

        try {
            // 1. Check for duplicate in Firestore first (Legacy check)
            const userRef = doc(db, 'users', email);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                throw { code: 'auth/email-already-in-use', message: 'User already registered (Legacy).' };
            }

            // 2. Create User in Firebase Auth
            let firebaseDetail = null;
            if (auth) {
                try {
                    const cred = await createUserWithEmailAndPassword(auth, email, password);
                    firebaseDetail = cred.user;
                } catch (e: any) {
                    if (e.code === 'auth/email-already-in-use') {
                        // Special Case: Exists in Auth but not in Firestore?
                        // Proceed to create Firestore record.
                        console.warn("User exists in Auth but not Firestore. Fixing...");
                    } else {
                        throw e;
                    }
                }
            }

            // 3. Create User in Firestore (Source of Truth for Role)
            console.log(`🆕 Creating New User ${email}. Registering as ${role}.`);
            await setDoc(userRef, {
                email,
                username,
                role,
                password, // Legacy fallback. Ideally we'd remove this.
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            });

            // Prevent login if pending (Except Admin)
            if (role === UserRole.PENDING && !isRootAdmin) {
                throw { code: 'auth/signup-success-pending', message: 'Account created. Waiting for approval.' };
            }

            const user: User = {
                username,
                name: username,
                role,
                avatarInitials: email.substring(0, 2).toUpperCase()
            };

            localStorage.setItem('logimaster_user', JSON.stringify(user));
            return user;

        } catch (e: any) {
            console.error("Registration Error:", e);
            throw e;
        }
    },

    adminCreateUser: async (email: string, password: string, role: UserRole): Promise<boolean> => {
        if (!db) return false;
        try {
            const userRef = doc(db, 'users', email);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                alert("User already exists!");
                return false;
            }

            await storageService.upsertUser({
                email,
                username: email.split('@')[0],
                role,
                password,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            });
            return true;
        } catch (e) {
            console.error("Admin Create Error:", e);
            return false;
        }
    },

    logout: async () => localStorage.removeItem('logimaster_user'),

    getUsers: async (): Promise<User[]> => {
        if (!db) return storageService.getLocalState().users || [];

        try {
            const q = query(collection(db, 'users'));
            const querySnapshot = await getDocs(q);
            const uniqueUsers = new Map<string, User>();

            querySnapshot.docs.forEach(doc => {
                const data = doc.data();
                const userEmail = doc.id;

                // Consistency check for Root Admin in lists
                const isRootAdmin = userEmail.toLowerCase() === ROOT_ADMIN_EMAIL;
                const effectiveRole = isRootAdmin ? UserRole.ADMIN : (data.role as UserRole);

                const userObj: User = {
                    username: data.username || data.email || doc.id,
                    email: userEmail,
                    name: data.username || data.name || data.email,
                    role: effectiveRole,
                    avatarInitials: (data.email || '??').substring(0, 2).toUpperCase()
                };

                uniqueUsers.set(doc.id, userObj);
            });

            const usersArray = Array.from(uniqueUsers.values());
            // Sync local state for offline use
            (storageService.getLocalState() as any).users = usersArray;

            return usersArray;

        } catch (e) {
            console.error("Error fetching users:", e);
            return storageService.getLocalState().users || [];
        }
    },

    updateUserRole: async (email: string, newRole: UserRole) => {
        if (!db) return false;
        // Safety: Prevent demoting the root admin
        if (email.toLowerCase() === ROOT_ADMIN_EMAIL && newRole !== UserRole.ADMIN) {
            console.error("⛔ Cannot demote Root Admin.");
            return false;
        }
        try {
            // Delegate to storageService for Offline Sync Queue support
            await storageService.upsertUser({ email, role: newRole });
            return true;
        } catch (e) {
            console.error("Error updating role:", e);
            return false;
        }
    },

    deleteUser: async (email: string) => {
        if (!db) return false;
        if (email.toLowerCase() === ROOT_ADMIN_EMAIL) {
            console.error("⛔ Cannot delete Root Admin.");
            return false;
        }
        try {
            await storageService.deleteUser(email);
            return true;
        } catch (e) {
            console.error("Error deleting user:", e);
            return false;
        }
    },

    requestPasswordReset: async (email: string) => {
        if (!db) return false;
        try {
            const userRef = doc(db, 'users', email);
            await updateDoc(userRef, { requireReset: true });
            return true;
        } catch (e) {
            console.error("Error requesting reset:", e);
            return false;
        }
    },

    confirmPasswordReset: async (email: string, newPassword: string) => {
        if (!db) return false;
        try {
            const userRef = doc(db, 'users', email);
            await updateDoc(userRef, {
                password: newPassword,
                requireReset: false
            });
            console.log(`✅ Password updated for ${email}`);
            return true;
        } catch (e) {
            console.error("Error confirming reset:", e);
            return false;
        }
    },

    resetPassword: async (email: string) => {
        try {
            const auth = getAuth();
            await sendPasswordResetEmail(auth, email);
            return true;
        } catch (e: any) {
            console.error("Error sending reset email:", e);
            throw e;
        }
    }
};
