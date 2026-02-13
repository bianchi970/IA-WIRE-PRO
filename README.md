# 🔌 IA WIRE PRO

**Assistente tecnico virtuale con AI per elettricisti e tecnici**

---

## 📱 COSA FA QUEST'APP

- Analizza foto di quadri elettrici, impianti, caldaie
- Fornisce diagnosi tecniche precise
- Risponde a domande tecniche specifiche
- Installabile come app sul telefono (PWA)

---

## 📁 STRUTTURA FILE

```
ia-wire-pro/
│
├── backend/                  ← Cartella server
│   ├── server.js            ← Server Node.js + API
│   ├── package.json         ← Dipendenze
│   ├── .env                 ← Chiave API (da configurare!)
│   └── .gitignore          
│
└── frontend/                ← Cartella interfaccia
    ├── index.html           ← Pagina principale
    ├── style.css            ← Stili
    ├── app.js               ← Logica frontend
    ├── manifest.json        ← Config PWA
    ├── service-worker.js    ← Cache offline
    └── AI_RULES.md          ← Regole assistente
```

---

## 🚀 DEPLOYMENT SU RENDER.COM (Hosting Gratuito)

### **PASSO 1: Preparazione File** 📦

1. **Crea questa struttura sul tuo PC:**
   ```
   ia-wire-pro/
   ├── backend/
   └── frontend/
   ```

2. **Sposta i file nelle cartelle giuste:**
   - `server.js`, `package.json`, `.env` → dentro `backend/`
   - `index.html`, `style.css`, `app.js`, ecc. → dentro `frontend/`

3. **NON serve modificare nulla** (eccetto la chiave API dopo)

---

### **PASSO 2: Carica su GitHub** 📤

1. **Vai su** https://github.com/new
2. **Crea repository:**
   - Nome: `ia-wire-pro`
   - Tipo: **Public** (gratuito)
   - ✅ Add README: NO (lo hai già)
   - Click **"Create repository"**

3. **Carica i file:**
   
   **Opzione A - Da browser (più semplice):**
   - Click su **"uploading an existing file"**
   - Trascina la cartella `ia-wire-pro` completa
   - Click **"Commit changes"**

   **Opzione B - Da terminale:**
   ```bash
   cd ia-wire-pro
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TUO-USERNAME/ia-wire-pro.git
   git push -u origin main
   ```

---

### **PASSO 3: Deploy su Render** 🌐

1. **Vai su** https://render.com
2. **Registrati** (gratuito, usa GitHub)
3. Click **"New +"** → **"Web Service"**
4. **Connetti repository GitHub:**
   - Seleziona `ia-wire-pro`
   - Click **"Connect"**

5. **Configurazione:**
   ```
   Name:              ia-wire-pro
   Region:            Frankfurt (EU Central)
   Branch:            main
   Root Directory:    backend
   Runtime:           Node
   Build Command:     npm install
   Start Command:     npm start
   Instance Type:     FREE
   ```

6. **Variabili d'ambiente (IMPORTANTE!):**
   - Click su **"Advanced"**
   - Click **"Add Environment Variable"**
   - Aggiungi:
     ```
     Key:   ANTHROPIC_API_KEY
     Value: [INCOLLA QUI LA TUA CHIAVE ANTHROPIC]
     ```
   
7. Click **"Create Web Service"**

8. **Attendi 3-5 minuti** (Render installa tutto)

9. **Quando vedi "Live" in verde** → FATTO! ✅

---

### **PASSO 4: Ottieni il Link** 🔗

1. Copia l'URL tipo: `https://ia-wire-pro.onrender.com`
2. **Questo è il link della tua app!**

---

## 📱 INSTALLAZIONE SUL TELEFONO

### **Android (Chrome):**

1. Apri Chrome
2. Vai su: `https://ia-wire-pro.onrender.com`
3. Click menu **⋮** (3 puntini in alto)
4. Click **"Installa app"** o **"Aggiungi a schermata Home"**
5. ✅ Icona appare nella home!

### **iPhone (Safari):**

1. Apri Safari
2. Vai su: `https://ia-wire-pro.onrender.com`
3. Click **Condividi** (quadrato con freccia)
4. Scroll e trova **"Aggiungi a Home"**
5. Click **"Aggiungi"**
6. ✅ Icona appare nella home!

---

## 🔧 TEST IN LOCALE (Prima di Deploy)

Se vuoi testare sul PC prima di caricare su Render:

```bash
# 1. Vai nella cartella backend
cd backend

# 2. Installa dipendenze
npm install

# 3. Modifica .env e aggiungi la chiave:
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# 4. Avvia server
npm start

# 5. Apri browser su:
http://localhost:3000
```

---

## ⚙️ CONFIGURAZIONE AVANZATA

### **Aumentare limite upload immagini:**

In `server.js`, riga 11:
```javascript
app.use(express.json({ limit: '10mb' })); // Aumenta a 20mb se serve
```

### **Cambiare modello AI:**

In `server.js`, riga 88:
```javascript
model: "claude-3-5-sonnet-20241022"  // Modello attuale
// Oppure:
model: "claude-3-opus-20240229"      // Più potente (più costoso)
model: "claude-3-haiku-20240307"     // Più veloce (meno costoso)
```

### **Personalizzare system prompt:**

In `server.js`, righe 39-74, modifica il `systemPrompt`

---

## 💰 COSTI

- **Render.com:** $0 (gratis per sempre)
- **Anthropic API:** 
  - ~$0.003 per immagine analizzata
  - Con $5 fai ~1500 analisi
  - Con $25 fai ~8000 analisi

**Monitora costi:** https://console.anthropic.com/settings/usage

---

## 🐛 RISOLUZIONE PROBLEMI

### ❌ **"Errore API Anthropic"**
- Controlla che la chiave sia corretta su Render
- Vai su Render → ia-wire-pro → Environment
- Verifica `ANTHROPIC_API_KEY` sia presente

### ❌ **"Errore di connessione"**
- Il server Render si "addormenta" dopo 15 min inattività
- Riapri l'app, si riattiva in 30 secondi

### ❌ **"Immagine troppo grande"**
- Max 5MB per immagine
- Riduci risoluzione foto prima di caricare

### ❌ **App non si installa su telefono**
- Verifica di usare HTTPS (Render lo fa automaticamente)
- Su iPhone usa Safari (non Chrome)
- Su Android usa Chrome (non altri browser)

---

## 📞 SUPPORTO

Per problemi tecnici:
1. Controlla i log su Render (tab "Logs")
2. Verifica console browser (F12 → Console)
3. Controlla crediti API Anthropic

---

## 🎨 PERSONALIZZAZIONE

### **Cambia colori:**
In `frontend/style.css`, righe 1-11:
```css
:root{
  --orange:#FF8C42;  /* Colore primario */
  --cyan:#00D9FF;    /* Colore secondario */
  /* ... */
}
```

### **Cambia nome app:**
In `frontend/manifest.json`:
```json
{
  "name": "IL TUO NOME",
  "short_name": "NOME CORTO"
}
```

---

## ✅ CHECKLIST FINALE

Prima di andare online, verifica:

- [ ] File organizzati in `backend/` e `frontend/`
- [ ] Chiave Anthropic API copiata
- [ ] Repository GitHub creato e file caricati
- [ ] Web Service creato su Render
- [ ] Variabile `ANTHROPIC_API_KEY` aggiunta su Render
- [ ] Deploy completato (status "Live")
- [ ] App testata da browser
- [ ] App installata su telefono
- [ ] Test con foto reale di un quadro elettrico

---

## 🚀 SEI PRONTO!

Hai tutto il necessario. Segui i passi uno alla volta e in 30 minuti hai l'app online e installabile sul telefono!

**Buon lavoro! ⚡**
