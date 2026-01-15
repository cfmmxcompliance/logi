import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { User, UserRole } from '../types.ts';
// @ts-ignore
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, deleteField } from 'firebase/firestore';
import { db } from './firebaseConfig';

const ROOT_ADMIN_EMAIL = 'admin@logimaster.com';

export const authService = {
    login: async (email: string, password: string): Promise<User | null> => {
        // Simulate network delay
        await new Promise(r => setTimeout(r, 500));

        const username = email.split('@')[0];
        const isRootAdmin = email.toLowerCase() === ROOT_ADMIN_EMAIL;
        let role: UserRole | null = null;

        if (!db) {
            console.warn("⚠️ Firestore not available. Login Restricted.");
            throw { code: 'auth/network-request-failed', message: 'Database unavailable.' };
        }

        try {
            const userRef = doc(db, 'users', email);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                role = data.role as UserRole;

                // 1. HARD OVERRIDE: Root Admin is ALWAYS Admin in memory, regardless of DB status
                if (isRootAdmin) {
                    role = UserRole.ADMIN;
                    // Background sync: Fix DB if it's wrong, but don't block login if write fails
                    if (data.role !== UserRole.ADMIN) {
                        console.warn(`⚠️ Elevating Root Admin in DB.`);
                        updateDoc(userRef, { role: UserRole.ADMIN }).catch(console.error);
                    }
                }

                // 2. Forced Password Reset Check
                if (data.requireReset) {
                    console.warn(`⚠️ User ${email} requires password reset.`);
                    throw { code: 'auth/new-password-required', message: 'Admin requested password reset.' };
                }

                // 3. Password Check
                if (data.password && data.password !== password) {
                    console.warn(`⛔ Access Denied: User ${email} entered wrong password.`);
                    throw { code: 'auth/wrong-password', message: 'Invalid password.' };
                }

                console.log(`✅ Logged in as ${email} [${role}]`);
            } else {
                console.warn(`⛔ Access Denied: User ${email} not found.`);
                throw { code: 'auth/user-not-found', message: 'User not registered.' };
            }

            // 4. Role Verification (The Barrier)
            if (!role || (role === UserRole.PENDING && !isRootAdmin)) {
                console.error("⛔ Security Alert: Role not assigned or Pending.");
                throw { code: 'auth/role-pending', message: 'Role verification failed. Pending Approval.' };
            }

            const user: User = {
                username,
                name: username,
                role, // Guaranteed to be ADMIN for root user
                avatarInitials: email.substring(0, 2).toUpperCase()
            };

            localStorage.setItem('logimaster_user', JSON.stringify(user));
            return user;

        } catch (e) {
            console.error("Auth Error (Firestore):", e);
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

        // Force role assignment immediately upon creation logic
        let role = isRootAdmin ? UserRole.ADMIN : UserRole.PENDING;

        if (!db) {
            throw { code: 'auth/network-request-failed', message: 'Database unavailable.' };
        }

        try {
            const userRef = doc(db, 'users', email);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                throw { code: 'auth/email-already-in-use', message: 'User already registered.' };
            }

            console.log(`🆕 Creating New User ${email}. Registering as ${role}.`);
            await setDoc(userRef, {
                email,
                username,
                role,
                password,
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

    getUsers: async (): Promise<User[]> => {
        if (!db) return [];

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

            return Array.from(uniqueUsers.values());

        } catch (e) {
            console.error("Error fetching users:", e);
            return [];
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
        if (email.toLowerCase() === ROOT_ADMIN_EMAIL) {
            console.error("⛔ Cannot delete Root Admin.");
            return false;
        }
        try {
            await deleteDoc(doc(db, 'users', email));
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
