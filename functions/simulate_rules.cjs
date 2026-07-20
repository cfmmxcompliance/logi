require("dotenv").config();
const nodemailer = require("nodemailer");

async function runSimulation() {
  console.log("Iniciando simulación de NOTIFICACIONES POR REGLAS (Con contenido completo de Producción)...");
  
  // MOCK DE REGLAS
  const mockRules = [
    { carrier: 'ARCB', scac: 'MXTL', emails: ['jorge_melendez@outlook.com'] }
  ];

  const scac = "MXTL";
  const carrierPadre = "ARCB";
  let matchedEmails = [];
  for (const rule of mockRules) {
    if ((rule.carrier === carrierPadre) && (rule.scac === scac)) {
       matchedEmails.push(...rule.emails);
    }
  }
  
  const finalEmails = [...new Set(matchedEmails)].filter(Boolean);

  // DATOS EXACTOS DE PRODUCCIÓN
  const docId           = "TL03920260716ARCBMXTL"; 
  const numeroCaja      = "999999";
  const numeroOp        = docId; 
  const carrierRef      = "CR-123456789"; 
  const driver          = "Juan Perez (Reglas)";
  const cfmRef          = "REF-TEST-123";
  const vehiculos       = "2";
  const subidoPor       = "admin@logimaster.com";
  const layoutFileName  = "LAYOUT_TEST_RULES.xlsx";
  const hora            = new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City', hour12: false,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; }
    .card { background: #fff; border-radius: 8px; padding: 28px 32px; max-width: 560px;
            margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    h2 { color: #1e3a5f; margin: 0 0 6px; font-size: 20px; }
    .sub { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    td { padding: 9px 12px; font-size: 14px; border-bottom: 1px solid #e5e7eb; }
    td:first-child { color: #6b7280; width: 42%; font-weight: 600; }
    td:last-child { color: #111827; }
    .badge { display:inline-block; background:#dbeafe; color:#1d4ed8;
             border-radius:4px; padding:2px 8px; font-size:12px; font-weight:700; }
    .footer { font-size:11px; color:#9ca3af; text-align:center; margin-top:20px; }
  </style>
</head>
<body>
  <div class="card">
    <h2 style="color: #eab308;">⚠️ SIMULACIÓN: ENRUTAMIENTO POR REGLAS ⚠️</h2>
    <h2>📋 LAYOUT subido — ${numeroOp}</h2>
    <p class="sub">Asignación Diaria de Cajas Secas 53' · ${hora}</p>
    <table>
      <tr><td>No. Operación (ID)</td><td><span class="badge">${numeroOp}</span></td></tr>
      <tr><td>Número de Caja</td><td><strong>${numeroCaja}</strong></td></tr>
      <tr><td>Carrier / SCAC</td><td>${carrierPadre} <span style="color:#6b7280;font-size:12px;">(${scac})</span></td></tr>
      <tr><td>Carrier Ref</td><td>${carrierRef}</td></tr>
      <tr><td>Driver</td><td>${driver}</td></tr>
      <tr><td>CFM Ref</td><td>${cfmRef}</td></tr>
      <tr><td>Vehículos</td><td>${vehiculos}</td></tr>
      <tr><td>Archivo</td><td style="font-size:12px;">${layoutFileName}</td></tr>
      <tr><td>Subido por</td><td>${subidoPor}</td></tr>
      <tr><td>Fecha/Hora</td><td>${hora}</td></tr>
    </table>
    <p class="footer">Este correo es una simulación de la lógica de Producción por Reglas.</p>
  </div>
</body>
</html>`;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: "cfm.mx.compliance@gmail.com", pass: process.env.EMAIL_PASSWORD }
    });

    const dummyBuffer = Buffer.from("Archivo adjunto de prueba con reglas");

    console.log("Enviando correo a:", finalEmails.join(', '));
    const info = await transporter.sendMail({
      from: `"Logimaster Compliance" <cfm.mx.compliance@gmail.com>`,
      to: "cfm.mx.compliance@gmail.com",
      bcc: finalEmails.join(', '),
      subject: `[SIMULACION REGLAS V5] 📋 LAYOUT subido — ${numeroOp} / Caja ${numeroCaja} (${scac})`,
      html: htmlBody,
      attachments: [{ filename: layoutFileName, content: dummyBuffer }]
    });
    console.log("✓ Correo enviado:", info.messageId);
  } catch (e) {
    console.error("Error enviando correo:", e.message);
  }
}

runSimulation();
