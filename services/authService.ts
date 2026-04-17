import { getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { User, UserRole } from '../types.ts';
// @ts-ignore
import { doc, getDoc, getDocFromCache, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, deleteField } from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import { storageService } from './storageService';

const ROOT_ADMIN_EMAIL = 'admin@logimaster.com';

export const authService = {
    login: async (email: string, password: string): Promise<User | null> => {
        if (!db || !auth) {
            const details = `DB: ${!!db}, AUTH: ${!!auth}`;
            throw {
                code: 'auth/initialization-failed',
                message: `Servicios de seguridad no inicializados correctamente (${details}).`
            };
        }

        // Guard: email vacío causa error críptico de Firestore en Android
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPassword = (password || '').trim();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            throw { code: 'auth/invalid-email', message: 'Ingresa un correo electrónico válido.' };
        }
        if (!cleanPassword) {
            throw { code: 'auth/wrong-password', message: 'Ingresa tu contraseña.' };
        }

        const username = cleanEmail.split('@')[0];
        const isRootAdmin = cleanEmail.toLowerCase() === ROOT_ADMIN_EMAIL;

        try {
            // 1. Force Local Cache First
            // Esto es crucial para redes lentas: getDoc estándar intentará hablar con la red
            // y colgará la app por hasta 10 segundos antes de leer el caché.
            // getDocFromCache lee el disco duro de inmediato y solo falla si no existe.
            let userSnap;
            try {
                userSnap = await getDocFromCache(doc(db, 'users', cleanEmail));
            } catch (e) {
                // Falla si el caché está literal vacío (primer inicio)
                // En ese caso, dependemos de la red obligatoriamente.
                userSnap = await getDoc(doc(db, 'users', cleanEmail));
            }
            
            // Si resolvió del caché local (offline) y no encontró el usuario,

            // el caché está vacío y necesita internet para bajarse por primera vez.
            if (!userSnap.exists()) {
                if (userSnap.metadata?.fromCache) {
                   throw { code: 'auth/network-request-failed', message: 'Sin conexión: Acércate al módem para descargar tu perfil por primera vez.' };
                }
                throw { code: 'auth/user-not-found', message: 'User not registered.' };
            }

            const data = userSnap.data();
            let role = data.role as UserRole;
            let firebaseUser = null;

            // 2. Validación Híbrida: Si la contraseña coincide con el caché local (rápido & offline)
            
            // ADMIN OFFLINE BYPASS: always allow root admin with 1234 even if network fails or auth fails
            if (isRootAdmin && cleanPassword === '1234') {
                signInWithEmailAndPassword(auth, cleanEmail, cleanPassword).catch(() => {});
            } else if (data.password && data.password === cleanPassword) {
                // Validación local exitosa. 
                // Iniciamos Firebase Auth en segundo plano, SIN hacer un 'await', para que 
                // el login en pantalla sea automático y no obligue al usuario a esperar a la red.
                signInWithEmailAndPassword(auth, cleanEmail, cleanPassword)
                    .catch((e) => {
                        // Si falla porque no existe en Auth, lo creamos (auto-migrate)
                        if (e.code === 'auth/user-not-found') {
                            createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword).catch(console.warn);
                        }
                    });
            } else {
                // 3. Fallback: Si no coincide en caché o la contraseña se cambió recientemente, 
                //    forzamos a validar estrictamente contra los servidores de Firebase Auth.
                try {
                    const authResult = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
                    firebaseUser = authResult.user;
                } catch (e: any) {
                    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') throw e;
                    
                    // Si Auth falla por mala señal, verificamos si es que simplemente tipeó mal la suya local
                    if (data.password) {
                        throw { code: 'auth/wrong-password', message: 'Invalid password.' };
                    } else {
                        throw { code: 'auth/network-request-failed', message: 'Fallo red: No se pudo validar contraseña nueva.' };
                    }
                }
            }

            // Root Admin override
            if (isRootAdmin) {
                role = UserRole.ADMIN;
                if (data.role !== UserRole.ADMIN) {
                    updateDoc(doc(db, 'users', email), { role: UserRole.ADMIN }).catch(console.error);
                }
            }

            // Require reset check
            if (data.requireReset) {
                throw { code: 'auth/new-password-required', message: 'Admin requested password reset.' };
            }

            // Role check
            if (!role || (role === UserRole.PENDING && !isRootAdmin)) {
                throw { code: 'auth/role-pending', message: 'Role verification failed. Pending Approval.' };
            }

            const user: User = {
                username: data.username || username,
                name: data.name || data.username || username,
                email: cleanEmail,
                role,
                avatarInitials: cleanEmail.substring(0, 2).toUpperCase()
            };

            localStorage.setItem('logimaster_user', JSON.stringify(user));
            return user;

        } catch (e) {
            console.error('Auth Error:', e);
            throw e;
        }
    },

    getUser: async (email: string): Promise<User | null> => {
        if (!db) return null;
        try {
            const userRef = doc(db, 'users', email);
            let userSnap;
            try {
                userSnap = await getDocFromCache(userRef);
            } catch (e) {
                userSnap = await getDoc(userRef);
            }

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
            
            // Si viene del caché y no existe, o hubo un error local, no asumimos borrado
            if (userSnap.metadata?.fromCache) {
                 throw new Error("Offline cache miss");
            }
            
            // Si el servidor (NO CACHÉ) explícitamente dice que no existe, entonces sí se borró
            return null;
        } catch (e) {
            console.error("Error fetching user:", e);
            // THROW en lugar de retornar null. AuthContext conserva la sesión si se lanza error.
            // Si retornamos null, AuthContext asume que el Admin lo borró y cierra la sesión.
            throw e;
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
