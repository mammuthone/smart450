import express from "express";
import fs from "fs";
import path from "path";
import https from 'https';
import http from 'http';
import nodemailer from 'nodemailer';

const app = express();
const HTTP_PORT = 80;
const HTTPS_PORT = 443;

// Percorso assoluto della cartella
const __dirname = path.resolve();

// Configurazione certificati SSL
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/smart450cagliari.ichnusalab.it/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/smart450cagliari.ichnusalab.it/fullchain.pem')
};
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

const EMAIL_CONFIG = {
    service: 'gmail', // o il tuo provider email
    auth: {
        user: 'igorino80@gmail.com', // CAMBIA CON LA TUA EMAIL
        pass: 'sqhgsvauyuvmjbek' // CAMBIA CON LA TUA PASSWORD APP
    }
};

const DESTINATION_EMAIL = 'igorino80@gmail.com'; // CAMBIA CON LA TUA EMAIL

const LOG_FILE = path.join(__dirname, "accessi.json");

// Carica accessi esistenti o inizializza
let accessi = {};
if (fs.existsSync(LOG_FILE)) {
    accessi = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
}

app.use((req, res, next) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const protocol = req.secure ? 'HTTPS' : 'HTTP';

    if (!accessi[ip]) {
        accessi[ip] = {
            count: 0,
            lastAccess: null,
            logs: []
        };
    }

    accessi[ip].count += 1;
    accessi[ip].lastAccess = new Date().toISOString();
    accessi[ip].logs.push({
        timestamp: new Date().toISOString(),
        protocol,
        method: req.method,
        url: req.url
    });

    // Salva su file
    fs.writeFileSync(LOG_FILE, JSON.stringify(accessi, null, 2));

    console.log(`📥 Accesso da ${ip} via ${protocol} (totale: ${accessi[ip].count})`);
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

const transporter = nodemailer.createTransport({
    service: EMAIL_CONFIG.service,
    auth: EMAIL_CONFIG.auth
});

// Verifica configurazione email all'avvio
transporter.verify((error, success) => {
    if (error) {
        console.log('❌ Errore configurazione email:', error);
        console.log('💡 Controlla le credenziali email in EMAIL_CONFIG');
    } else {
        console.log('✅ Server email configurato correttamente');
    }
});

// Route per invio email
app.post('/send-email', async (req, res) => {
    try {
        console.log(req.body)
        const { name, email, phone, subject, message, privacy } = req.body;
        
        // Validazione campi obbligatori
        if (!name || !email || !message || !privacy) {
            return res.status(400).json({ 
                error: 'Tutti i campi obbligatori devono essere compilati' 
            });
        }

        // Validazione email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                error: 'Formato email non valido' 
            });
        }

        // Mappa dei soggetti
        const subjectMap = {
            'info-generali': 'Richiesta Informazioni Generali',
            'visione-auto': 'Richiesta Visione Auto',
            'prova-auto': 'Richiesta Prova Auto',
            'documentazione': 'Richiesta Documentazione Aggiuntiva',
            'trattativa': 'Proposta di Trattativa',
            'rivenditore': 'Contatto Rivenditore',
            'altro': 'Altro'
        };

        const subjectText = subjectMap[subject] || 'Contatto dal sito';
        const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

        // Email per te (proprietario)
        const ownerMailOptions = {
            from: EMAIL_CONFIG.auth.user,
            to: DESTINATION_EMAIL,
            subject: `🚗 Smart Fortwo 450 - ${subjectText}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                    <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; border-bottom: 3px solid #0088cc; padding-bottom: 10px;">
                            🚗 Nuovo Contatto - Smart Fortwo 450
                        </h2>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="color: #0088cc; margin-top: 0;">📋 Dettagli Contatto</h3>
                            <p><strong>Nome:</strong> ${name}</p>
                            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                            ${phone ? `<p><strong>Telefono:</strong> ${phone}</p>` : ''}
                            <p><strong>Tipo richiesta:</strong> ${subjectText}</p>
                            <p><strong>IP:</strong> ${ip}</p>
                            <p><strong>Data/Ora:</strong> ${new Date().toLocaleString('it-IT')}</p>
                        </div>
                        
                        <div style="background: #fff3cd; padding: 20px; border-radius: 5px; border-left: 4px solid #ffc107;">
                            <h3 style="color: #856404; margin-top: 0;">💬 Messaggio</h3>
                            <p style="line-height: 1.6; color: #856404;">${message.replace(/\n/g, '<br>')}</p>
                        </div>
                        
                        <div style="margin-top: 30px; padding: 20px; background: #d1ecf1; border-radius: 5px;">
                            <h4 style="color: #0c5460; margin-top: 0;">🎯 Azioni Suggerite</h4>
                            <p style="color: #0c5460; margin: 0;">
                                • Rispondi entro 24 ore per mantenere alta l'attenzione<br>
                                • Se richiesta visione/prova, coordina appuntamento<br>
                                • Tieni traccia del contatto nel tuo CRM
                            </p>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
                        Email automatica generata dal sito Smart Fortwo 450
                    </div>
                </div>
            `
        };

        // Email di conferma per l'utente
        const userMailOptions = {
            from: EMAIL_CONFIG.auth.user,
            to: email,
            subject: `✅ Messaggio ricevuto - Smart Fortwo 450 Cabrio`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                    <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px;">
                            ✅ Messaggio Ricevuto!
                        </h2>
                        
                        <p>Ciao <strong>${name}</strong>,</p>
                        
                        <p style="line-height: 1.6;">
                            Grazie per il tuo interesse nella mia <strong>Smart Fortwo 450 Cabrio</strong>! 
                            Ho ricevuto il tuo messaggio e ti risponderò al più presto.
                        </p>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="color: #0088cc; margin-top: 0;">📋 Riepilogo del tuo messaggio</h3>
                            <p><strong>Tipo richiesta:</strong> ${subjectText}</p>
                            <p><strong>Data invio:</strong> ${new Date().toLocaleString('it-IT')}</p>
                        </div>
                        
                        <div style="background: #d4edda; padding: 20px; border-radius: 5px; border-left: 4px solid #4CAF50;">
                            <h3 style="color: #155724; margin-top: 0;">⏰ Tempi di Risposta</h3>
                            <p style="color: #155724; margin: 0;">
                                Di solito rispondo entro <strong>24 ore</strong>. Se la tua richiesta è urgente, 
                                puoi anche contattarmi tramite:
                            </p>
                            <ul style="color: #155724;">
                                <li>💬 Chat del sito (angolo in basso a destra)</li>
                                <li>📱 Telegram (link sul sito)</li>
                            </ul>
                        </div>
                        
                        <div style="margin-top: 30px; text-align: center;">
                            <p style="color: #666;">
                                🚗 <strong>Smart Fortwo 450 Cabrio 2005</strong> 🚗<br>
                                126.000 km • € 3.500 • Quartu Sant'Elena (CA)
                            </p>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
                        Questa è una email automatica di conferma
                    </div>
                </div>
            `
        };

        // Invia entrambe le email
        await transporter.sendMail(ownerMailOptions);
        await transporter.sendMail(userMailOptions);

        // Log dell'invio
        console.log(`📧 Email inviata da: ${name} (${email}) - Tipo: ${subjectText}`);
        
        // Salva il contatto in un file per tracciare
        const contactsFile = path.join(__dirname, "contacts.json");
        let contacts = [];
        if (fs.existsSync(contactsFile)) {
            contacts = JSON.parse(fs.readFileSync(contactsFile, "utf8"));
        }
        
        contacts.push({
            timestamp: new Date().toISOString(),
            name,
            email,
            phone,
            subject: subjectText,
            message,
            ip
        });
        
        fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2));

        res.json({ 
            success: true, 
            message: 'Messaggio inviato con successo! Ti risponderò al più presto.' 
        });

    } catch (error) {
        console.error('❌ Errore invio email:', error);
        res.status(500).json({ 
            error: 'Errore nell\'invio del messaggio. Riprova più tardi.' 
        });
    }
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