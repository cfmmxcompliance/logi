import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { User, UserRole } from '../types.ts';
// @ts-ignore
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, deleteField } from 'firebase/firestore';
import { db } from './firebaseConfig';

export const authService = {
    // Hybrid Login with forced local password check capability
    login: async (email: string, password: string): Promise<User | null> => {
        // Simulate network delay
        await new Promise(r => setTimeout(r, 500));

        const username = email.split('@')[0];
        let role: UserRole | null = null;

        if (!db) {
            console.warn("⚠️ Firestore not available. Login Restricted.");
            throw { code: 'auth/network-request-failed', message: 'Database unavailable.' };
        } else {
            try {
                // 2. Check if user exists in Firestore
                const userRef = doc(db, 'users', email);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    const data = userSnap.data();
                    role = data.role as UserRole;

                    // 1. Check for Forced Password Reset Flag
                    // This takes precedence over password check (so they can reset even if they don't know the old one)
                    if (data.requireReset) {
                        console.warn(`⚠️ User ${email} requires password reset.`);
                        throw { code: 'auth/new-password-required', message: 'Admin requested password reset.' };
                    }

                    // 2. Password Check (If password exists in DB)
                    // If DB has no password field, we allow access (Legacy/Mock Compatibility)
                    if (data.password && data.password !== password) {
                        console.warn(`⛔ Access Denied: User ${email} entered wrong password.`);
                        throw { code: 'auth/wrong-password', message: 'Invalid password.' };
                    }

                    // FAILSAFE: Admin Elevation logic
                    if (email.toLowerCase().includes('admin') && role !== UserRole.ADMIN) {
                        console.warn(`⚠️ Detected Admin Email '${email}' with '${role}' role. Elevating to ADMIN.`);
                        await updateDoc(userRef, { role: UserRole.ADMIN });
                        role = UserRole.ADMIN;
                    }

                    console.log(`✅ Logged in as ${email} [${role}]`);
                } else {
                    console.warn(`⛔ Access Denied: User ${email} not found.`);
                    throw { code: 'auth/user-not-found', message: 'User not registered.' };
                }
            } catch (e) {
                console.error("Auth Error (Firestore):", e);
                throw e;
            }
        }

        if (!role || role === UserRole.PENDING) {
            console.error("⛔ Security Alert: Role not assigned or Pending.");
            throw { code: 'auth/role-pending', message: 'Role verification failed. Pending Approval.' };
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

    getUser: async (email: string): Promise<User | null> => {
        if (!db) return null;
        try {
            const userRef = doc(db, 'users', email);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                return {
                    username: data.username || email.split('@')[0],
                    name: data.username || data.name || email.split('@')[0],
                    role: data.role as UserRole,
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
        let role = UserRole.PENDING;

        if (!db) {
            throw { code: 'auth/network-request-failed', message: 'Database unavailable.' };
        }

        try {
            const userRef = doc(db, 'users', email);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                throw { code: 'auth/email-already-in-use', message: 'User already registered.' };
            }

            if (email.toLowerCase().includes('admin')) role = UserRole.ADMIN;

            console.log(`🆕 Creating New User ${email}. Registering as ${role}.`);
            await setDoc(userRef, {
                email,
                username,
                role,
                password, // SAVE PASSWORD LOCALLY
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            });

            if (role === UserRole.PENDING) {
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

            await setDoc(userRef, {
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

    // Admin Features: Read/Write Real Users
    getUsers: async (): Promise<User[]> => {
        if (!db) return [];

        try {
            const q = query(collection(db, 'users'));
            const querySnapshot = await getDocs(q);

            const uniqueUsers = new Map<string, User>();

            querySnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Normalize username but DO NOT DEDUPLICATE based on it
                // We want to see ALL records to catch "Shadow Accounts"
                const rawUsername = data.username || data.email || doc.id;

                // Use doc.id (the email) as the absolute unique identifier
                const userObj: User = {
                    username: rawUsername, // This might be same for multiple users, that's okay, we want to see them
                    email: doc.id,         // This is the Firestore Document ID (Unique Source of Truth)
                    name: data.username || data.name || data.email,
                    role: data.role as UserRole,
                    avatarInitials: (data.email || '??').substring(0, 2).toUpperCase()
                };

                uniqueUsers.set(doc.id, userObj); // Map by Doc ID (Email) instead of Username
            });

            return Array.from(uniqueUsers.values());

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
    },


    deleteUser: async (email: string) => {
        if (!db) return false;
        try {
            await deleteDoc(doc(db, 'users', email));
            return true;
        } catch (e) {
            console.error("Error deleting user:", e);
            return false;
        }
    },

    // Admin sets flag: User MUST change password next login
    requestPasswordReset: async (email: string) => {
        if (!db) return false;
        try {
            // We set 'requireReset' to true. 
            // We DO NOT delete the password, so old credentials ostensibly work until triggered, 
            // BUT login() logic sees flag and intercepts BEFORE checking password.
            // Actually, to let them in with ANY password to set a new one, we might want to let the flag override password check.
            const userRef = doc(db, 'users', email);
            await updateDoc(userRef, {
                requireReset: true
            });
            return true;
        } catch (e) {
            console.error("Error requesting reset:", e);
            return false;
        }
    },

    // User confirms new password
    confirmPasswordReset: async (email: string, newPassword: string) => {
        if (!db) return false;
        try {
            const userRef = doc(db, 'users', email);
            await updateDoc(userRef, {
                password: newPassword,
                requireReset: false // Clear flag
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
            console.log(`📧 Password reset email sent to ${email}`);
            return true;
        } catch (e: any) {
            console.error("Error sending reset email:", e);
            if (e.code === 'auth/user-not-found') {
                console.warn("User has entry in Firestore but not in Auth. This is expected in Hybrid mode for some users.");
            }
            throw e;
        }
    }
};
