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
        const typedEmail = (email || '').trim();        // Email tal como lo escribió el usuario
        const cleanEmail = typedEmail.toLowerCase();     // Versión minúsculas para Firebase Auth
        const cleanPassword = (password || '').trim();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            throw { code: 'auth/invalid-email', message: 'Ingresa un correo electrónico válido.' };
        }
        if (!cleanPassword) {
            throw { code: 'auth/wrong-password', message: 'Ingresa tu contraseña.' };
        }

        const username = cleanEmail.split('@')[0];
        const isRootAdmin = cleanEmail === ROOT_ADMIN_EMAIL;

        try {
            // 1. Buscar documento: primero con el email exacto como fue escrito,
            //    si no existe intentar con minúsculas, y finalmente con solo el username
            //    (fallback para usuarios cuyo ID en Firestore es solo "jorge.rodriguez" en vez del email completo).
            let userSnap;
            const baseIds = typedEmail === cleanEmail ? [cleanEmail] : [typedEmail, cleanEmail];
            const lookupIds = [...baseIds, username]; // username = parte antes del @

            for (const lookupId of lookupIds) {
                try {
                    // ALWAYS try network first during login to get fresh role/password
                    const fromNet = await getDoc(doc(db, 'users', lookupId));
                    if (fromNet.exists()) { userSnap = fromNet; break; }
                } catch (netErr) {
                    console.warn(`[Auth] Network attempt failed for ${lookupId}, trying cache...`, netErr);
                    try {
                        const cached = await getDocFromCache(doc(db, 'users', lookupId));
                        if (cached.exists()) { userSnap = cached; break; }
                    } catch (_) {}
                    
                    // If both fail, we continue to the next lookupId (e.g. lowercase, username)
                }
            }

            if (!userSnap || !userSnap.exists()) {
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
                // 3. Fallback: No password stored locally (legacy user) OR password mismatch.
                //    Validate against Firebase Auth servers.
                try {
                    const authResult = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
                    firebaseUser = authResult.user;
                } catch (e: any) {
                    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') throw e;
                    
                    // LEGACY USER FIX: User exists in Firestore but NOT in Firebase Auth.
                    // Auto-create Auth account and store password for future offline logins.
                    if (e.code === 'auth/user-not-found') {
                        try {
                            const newCred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
                            firebaseUser = newCred.user;
                            // Store password in Firestore for future offline login
                            updateDoc(doc(db, 'users', cleanEmail), { password: cleanPassword }).catch(console.warn);
                            console.log('[Auth] Legacy user auto-migrated to Firebase Auth:', cleanEmail);
                        } catch (createErr: any) {
                            console.error('[Auth] Failed to auto-create Auth account:', createErr);
                            throw { code: 'auth/network-request-failed', message: 'No se pudo crear cuenta de autenticación. Verifica tu conexión.' };
                        }
                    } else if (e.code === 'auth/configuration-not-found' || e.code === 'auth/operation-not-allowed') {
                        // Firebase Auth Email/Password provider is NOT enabled in Firebase Console.
                        // Fall back to Firestore stored password as auth mechanism.
                        console.warn('[Auth] Firebase Auth provider disabled. Falling back to Firestore password for:', cleanEmail);
                        if (data.password && data.password === cleanPassword) {
                            // ✅ Password matches Firestore record — allow login in degraded mode.
                            // Store password to keep offline login working.
                            updateDoc(doc(db, 'users', cleanEmail), { password: cleanPassword }).catch(console.warn);
                            console.log('[Auth] Firestore password fallback succeeded for:', cleanEmail);
                        } else if (data.password) {
                            // Password stored but doesn't match
                            throw { code: 'auth/invalid-credential', message: 'Contraseña incorrecta.' };
                        } else {
                            // No password stored at all — admin must reset
                            throw { code: 'auth/network-request-failed', message: 'Tu cuenta no tiene contraseña registrada. Pide al administrador que te asigne una.' };
                        }
                    } else if (e.code === 'auth/too-many-requests') {
                        throw { code: 'auth/too-many-requests', message: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.' };
                    } else {
                        // Genuine network failure
                        if (data.password) {
                            throw { code: 'auth/wrong-password', message: 'Invalid password.' };
                        } else {
                            throw { code: 'auth/network-request-failed', message: 'Se requiere conexión a internet para el primer inicio de sesión.' };
                        }
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
                avatarInitials: cleanEmail.substring(0, 2).toUpperCase(),
                scac: data.scac || '',
                subLinea: data.subLinea || ''
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
                // Always try network first so updated fields (subLinea, role) are always fresh
                userSnap = await getDoc(userRef);
            } catch (e) {
                // Network unavailable — fall back to local Firestore cache
                userSnap = await getDocFromCache(userRef);
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
                    avatarInitials: (data.email || email).substring(0, 2).toUpperCase(),
                    scac: data.scac || '',
                    subLinea: data.subLinea || ''
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
                    avatarInitials: (data.email || '??').substring(0, 2).toUpperCase(),
                    scac: data.scac || '',
                    subLinea: data.subLinea || ''
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

    updateUserScac: async (email: string, scac: string) => {
        if (!db) return false;
        try {
            await storageService.upsertUser({ email, scac });
            return true;
        } catch (e) {
            console.error("Error updating SCAC:", e);
            return false;
        }
    },

    updateUserSubLinea: async (email: string, subLinea: string) => {
        if (!db) return false;
        try {
            await storageService.upsertUser({ email, subLinea } as any);
            return true;
        } catch (e) {
            console.error("Error updating SubLinea:", e);
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
