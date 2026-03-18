const http = require('http');
const url = require('url');

const server = http.createServer((req, res) => {
    const queryObject = url.parse(req.url, true).query;
    if (queryObject.code) {
        console.log("\n✅ CODE CAPTURED:");
        console.log(queryObject.code);
        console.log("------------------------------------------");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>¡Autorización Exitosa!</h1><p>Ya capturé el código. Puedes cerrar esta pestaña y volver al chat.</p>');
        // Give it a second to respond before exiting if needed, or just let it run
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Esperando código...</h1>');
    }
});

server.listen(3000, 'localhost', () => {
    console.log('🚀 Localhost server running at http://localhost:3000');
});
