const nodemailer = require("nodemailer");

const CONFIG = {
    SENDER_EMAIL: "cfm.mx.compliance@gmail.com",
    PASS: "cwotuqypfzygmnrh"
};

async function ping() {
    console.log("📨 Enviando PING de confirmación rápida...");
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: CONFIG.SENDER_EMAIL, pass: CONFIG.PASS }
        });

        const mailOptions = {
            from: `"Logimaster PING" <${CONFIG.SENDER_EMAIL}>`,
            to: CONFIG.SENDER_EMAIL,
            subject: "⚡️ PING RÁPIDO - Favor de confirmar recepción",
            text: "Este es un correo corto sin archivos adjuntos para verificar que la fila de Gmail no esté saturada.\n\nHora: " + new Date().toLocaleTimeString()
        };

        await transporter.sendMail(mailOptions);
        console.log("✅ PING ENVIADO.");
        process.exit(0);
    } catch (e) {
        console.error("❌ ERROR:", e.message);
        process.exit(1);
    }
}

ping();
