// patch_carlos_password.mjs
// Usa el REST API de Firestore con la API key del proyecto para parchear el campo 'password'
// del usuario carlos.chavez@cfmoto.com directamente.

const PROJECT_ID = 'logimaster-cfmoto';
const API_KEY = 'AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU';

// Los usuarios que queremos parchear (sin password en Firestore)
const USERS_TO_PATCH = [
  // Lista de emails a los que asignar contraseña por defecto
  // Se detectan consultando todos los users
];

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function getAllUsers() {
  const url = `${BASE_URL}/users?key=${API_KEY}&pageSize=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.documents || [];
}

async function patchUserPassword(email, password) {
  // Encode the email for use in the document path
  const encodedEmail = encodeURIComponent(email);
  const url = `${BASE_URL}/users/${encodedEmail}?key=${API_KEY}&updateMask.fieldPaths=password`;
  
  const body = {
    fields: {
      password: { stringValue: password }
    }
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed for ${email}: ${err}`);
  }
  return true;
}

async function main() {
  console.log('📋 Fetching all users from Firestore...');
  const docs = await getAllUsers();
  console.log(`Found ${docs.length} users total.`);

  const noPassword = [];
  for (const doc of docs) {
    const fields = doc.fields || {};
    const email = doc.name.split('/').pop(); // last segment of doc path
    if (!fields.password) {
      noPassword.push(decodeURIComponent(email));
    }
  }

  console.log(`\n🔍 Users WITHOUT stored password (${noPassword.length}):`);
  noPassword.forEach(e => console.log(`  - ${e}`));

  if (noPassword.length === 0) {
    console.log('\n✅ All users already have passwords. Nothing to fix.');
    return;
  }

  const DEFAULT_PASSWORD = 'cfmoto2024';
  console.log(`\n🔧 Assigning default password "${DEFAULT_PASSWORD}" to ${noPassword.length} users...`);

  let ok = 0;
  let fail = 0;
  for (const email of noPassword) {
    try {
      await patchUserPassword(email, DEFAULT_PASSWORD);
      console.log(`  ✔ ${email}`);
      ok++;
    } catch (e) {
      console.error(`  ✘ ${email}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n✅ Done. Fixed: ${ok} | Failed: ${fail}`);
  if (ok > 0) {
    console.log(`\n⚠️  Default password set: "${DEFAULT_PASSWORD}"`);
    console.log('   Users can log in with their email + cfmoto2024');
    console.log('   Recommend asking users to change password via Admin → Settings');
  }
}

main().catch(console.error);
