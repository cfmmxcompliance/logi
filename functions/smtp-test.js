const nodemailer = require("nodemailer");

const CONFIG = {
    SENDER_EMAIL: "cfm.mx.compliance@gmail.com",
    PASS: "cwotuqypfzygmnrh",
    RECIPIENTS: ["cfm.mx.compliance@gmail.com"]
};

async function quickMailTest() {
    console.log("📨 Probando conexión SMTP...");

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: CONFIG.SENDER_EMAIL, pass: CONFIG.PASS }
        });

        const mailOptions = {
            from: `"Logimaster SMTP Test" <${CONFIG.SENDER_EMAIL}>`,
            to: CONFIG.SENDER_EMAIL,
            subject: "🧪 TEST DE CONEXIÓN - Logimaster",
            text: "Si recibes esto, las credenciales del servidor (Gmail/App Password) están funcionando correctamente."
        };

        await transporter.sendMail(mailOptions);
        console.log("✅ CONEXIÓN SMTP EXITOSA. Correo enviado.");
        process.exit(0);
    } catch (e) {
        console.error("❌ FALLO SMTP:", e.message);
        process.exit(1);
    }
}

quickMailTest();
