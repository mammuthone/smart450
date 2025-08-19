import express from "express";
import fs from "fs";
import path from "path";
import localtunnel from "localtunnel";
import https from 'https';
import http from 'http';

const app = express();
const HTTP_PORT = 80;
const HTTPS_PORT = 443;
const SUBDOMAIN = "cagliari-smart-450"; // cambia il nome qui

// Percorso assoluto della cartella
const __dirname = path.resolve();

// Configurazione certificati SSL
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/smart450cagliari.ichnusalab.it/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/smart450cagliari.ichnusalab.it/fullchain.pem')
};

// Middleware per loggare gli accessi
app.use((req, res, next) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const protocol = req.secure ? 'HTTPS' : 'HTTP';
    console.log(`Host header: ${req.headers.host} (${protocol})`);

    const log = `${new Date().toISOString()} - ${ip} - ${protocol} ${req.method} ${req.url}\n`;

    fs.appendFileSync(path.join(__dirname, "accessi.log"), log);
    console.log(`📥 Accesso da ${ip} via ${protocol}`);

    next();
});

// Middleware per forzare HTTPS in produzione
app.use((req, res, next) => {
    // Se non è HTTPS e non è localhost, redirect a HTTPS
    if (!req.secure && req.get('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
        return res.redirect(301, `https://${req.get('host')}${req.url}`);
    }
    next();
});

// Route principale: restituisce index.html
app.get("/", (req, res) => {
    // Aggiungi header di sicurezza HTTPS
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    res.sendFile(path.join(__dirname, "index.html"));
});

// Route per health check
app.get("/health", (req, res) => {
    res.json({ 
        status: "OK", 
        timestamp: new Date().toISOString(),
        protocol: req.secure ? 'HTTPS' : 'HTTP'
    });
});

// Servire risorse statiche con header sicuri
app.use(express.static(__dirname, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
        } else {
            res.setHeader("Cache-Control", "public, max-age=31536000");
        }
        if (filePath.endsWith(".mp4")) {
            res.setHeader("Content-Type", "video/mp4");
        }
    }
}));

// Gestione errori
app.use((err, req, res, next) => {
    console.error('❌ Errore server:', err.message);
    res.status(500).send('Errore interno del server');
});


// Funzione per controllare se i certificati esistono
function checkCertificates() {
    try {
        fs.accessSync('/etc/letsencrypt/live/smart450cagliari.ichnusalab.it/privkey.pem');
        fs.accessSync('/etc/letsencrypt/live/smart450cagliari.ichnusalab.it/fullchain.pem');
        return true;
    } catch (error) {
        return false;
    }
}

// Avvio server
if (checkCertificates()) {
    // Server HTTPS (porta 443)
    https.createServer(options, app).listen(HTTPS_PORT, () => {
        console.log(`🔒 Server HTTPS avviato su https://smart450cagliari.ichnusalab.it`);
        console.log(`📋 Certificati SSL caricati correttamente`);
    });

    // Server HTTP per redirect a HTTPS (porta 80)
    http.createServer((req, res) => {
        console.log(`🔄 Redirect HTTP -> HTTPS per: ${req.url}`);
        res.writeHead(301, { 
            "Location": `https://${req.headers.host}${req.url}`,
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
        });
        res.end();
    }).listen(HTTP_PORT, () => {
        console.log(`🔄 Server HTTP redirect avviato su porta ${HTTP_PORT}`);
    });

} else {
    // Fallback: solo HTTP se non ci sono certificati
    console.log('⚠️  Certificati SSL non trovati, avvio server HTTP');
    app.listen(HTTP_PORT, () => {
        console.log(`🚀 Server HTTP avviato su http://localhost:${HTTP_PORT}`);
        console.log(`💡 Per HTTPS, assicurati che i certificati esistano in:`);
        console.log(`   /etc/letsencrypt/live/smart450cagliari.ichnusalab.it/`);
    });
}

// Gestione chiusura graceful
process.on('SIGINT', () => {
    console.log('\n🛑 Chiusura server in corso...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Server terminato');
    process.exit(0);
});

// Log di startup
console.log('🌟 Smart Fortwo 450 Server');
console.log('📁 Directory:', __dirname);
console.log('🌍 Ambiente:', process.env.NODE_ENV || 'development');