import express from "express";
import fs from "fs";
import path from "path";
import localtunnel from "localtunnel";


const app = express();
const PORT = 3000;
const SUBDOMAIN = "cagliari-smart-450"; // cambia il nome qui


// Percorso assoluto della cartella
const __dirname = path.resolve();

// Middleware per loggare gli accessi
app.use((req, res, next) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.log("Host header:", req.headers.host);

  const log = `${new Date().toISOString()} - ${ip} - ${req.method} ${req.url}\n`;

  fs.appendFileSync(path.join(__dirname, "accessi.log"), log);
  console.log(`📥 Accesso da ${ip}`);

  next();
});

// Route principale: restituisce index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Se vuoi servire anche altre risorse statiche (css, js, img)
app.use(express.static(__dirname));

// Avvio server
app.listen(PORT, () => {
  console.log(`🚀 Server avviato su http://localhost:${PORT}`);
});