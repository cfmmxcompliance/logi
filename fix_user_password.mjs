// fix_user_password.mjs
// Asigna contraseña de fallback a usuarios que no tienen campo 'password' en Firestore
// Esto permite que el login funcione en modo degradado (sin Firebase Auth Email/Password habilitado)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./logimaster-cfmoto-a59f54d6641a.json', 'utf8'));

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: 'logimaster-cfmoto'
});

const db = getFirestore(app);

async function fixUsersWithoutPassword() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  let fixed = 0;
  let skipped = 0;
  const noPassword = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.password) {
      noPassword.push({ email: doc.id, role: data.role });
    } else {
      skipped++;
    }
  }

  console.log(`\n📋 Users WITHOUT a stored password (${noPassword.length}):`);
  noPassword.forEach(u => console.log(`  - ${u.email} [${u.role}]`));
  
  console.log(`\n✅ Users with password already set: ${skipped}`);
  
  // Assign a default password 'cfmoto2024' to users without one
  const DEFAULT_PASSWORD = 'cfmoto2024';
  
  for (const user of noPassword) {
    await usersRef.doc(user.email).update({ password: DEFAULT_PASSWORD });
    console.log(`  ✔ Set password for: ${user.email}`);
    fixed++;
  }

  console.log(`\n✅ Fixed ${fixed} users. Default password assigned: "${DEFAULT_PASSWORD}"`);
  console.log('⚠️  Users should be asked to change their password after first login.');
}

fixUsersWithoutPassword().catch(console.error);
