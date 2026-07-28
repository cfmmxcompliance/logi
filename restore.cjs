const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    await setDoc(doc(db, 'sellos', 'sello_TL05720260727ARCBARCA_1785175301797'), {
      usuario: '1devany.ramos@cfmoto.com',
      id: 'sello_TL05720260727ARCBARCA_1785175301797',
      fechaAsignacion: '2026-07-27',
      fotoUrl: 'https://drive.google.com/file/d/12AwLe2c1TsXG6Ppprdq62kvCY0Qvsm-1/view?usp=drivesdk',
      createdAt: '2026-07-27T18:01:41.797Z',
      numeroCaja: '941084',
      selloAsignado: '743447',
      fechaHoraRegistro: '27/7/2026, 12:02:41',
      asignacionCajaId: 'TL05720260727ARCBARCA'
    });

    await setDoc(doc(db, 'sellos', 'sello_TL03820260727ARCBTQLA_1785174777350'), {
      usuario: '1devany.ramos@cfmoto.com',
      id: 'sello_TL03820260727ARCBTQLA_1785174777350',
      fechaAsignacion: '2026-07-27',
      fotoUrl: 'https://drive.google.com/file/d/18pbGX4TGBjlKSfONJ66_FtERRk_ZsuPj/view?usp=drivesdk',
      createdAt: '2026-07-27T17:52:57.350Z',
      numeroCaja: 'R1423',
      selloAsignado: '743396',
      asignacionCajaId: 'TL03820260727ARCBTQLA',
      fechaHoraRegistro: '27/7/2026, 11:52:57'
    });

    console.log("Restored!");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
