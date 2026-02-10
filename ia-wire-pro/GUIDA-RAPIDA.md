# 🚀 GUIDA RAPIDA - IA WIRE PRO

## ⚡ 3 PASSI PER AVERE L'APP ONLINE

### 📦 PASSO 1: ORGANIZZA FILE (5 minuti)

Crea due cartelle sul tuo PC:

```
ia-wire-pro/
  ├── backend/
  └── frontend/
```

**Sposta i file così:**

#### In `backend/`:
- ✅ server.js
- ✅ package.json  
- ✅ .env
- ✅ .gitignore

#### In `frontend/`:
- ✅ index-updated.html (rinominalo in `index.html`)
- ✅ style.css
- ✅ app.js
- ✅ manifest.json
- ✅ service-worker.js
- ✅ AI_RULES.md

---

### 🌐 PASSO 2: CARICA SU GITHUB (5 minuti)

1. Vai su: **https://github.com/new**
2. Nome repository: `ia-wire-pro`
3. Tipo: **Public**
4. Click **"Create repository"**
5. Click **"uploading an existing file"**
6. Trascina la cartella `ia-wire-pro` completa
7. Click **"Commit changes"**

✅ Fatto!

---

### ☁️ PASSO 3: DEPLOY SU RENDER (10 minuti)

1. Vai su: **https://render.com**
2. Registrati con GitHub (gratis)
3. Click **"New +"** → **"Web Service"**
4. Seleziona il repository `ia-wire-pro`
5. Click **"Connect"**

**Configurazione:**
```
Name:              ia-wire-pro
Region:            Frankfurt
Root Directory:    backend
Build Command:     npm install
Start Command:     npm start
Instance Type:     FREE
```

6. Click **"Advanced"**
7. Click **"Add Environment Variable"**
8. Aggiungi:
   ```
   Key:   ANTHROPIC_API_KEY
   Value: [LA TUA CHIAVE ANTHROPIC]
   ```

9. Click **"Create Web Service"**
10. **Attendi 3-5 minuti** ⏳

✅ Quando vedi **"Live"** in verde → FATTO!

---

## 📱 INSTALLA SUL TELEFONO

### Android:
1. Apri **Chrome**
2. Vai sul link Render (es: `https://ia-wire-pro.onrender.com`)
3. Menu **⋮** → **"Installa app"**

### iPhone:
1. Apri **Safari**
2. Vai sul link Render
3. **Condividi** → **"Aggiungi a Home"**

---

## 🎯 LINK UTILI

- **Console Anthropic:** https://console.anthropic.com
- **Dashboard Render:** https://dashboard.render.com
- **GitHub:** https://github.com

---

## ❓ PROBLEMI?

### "Errore API Anthropic"
→ Verifica chiave su Render → Environment Variables

### "Server non risponde"
→ Riapri l'app dopo 30 secondi (Render si riattiva)

### "Non si installa su telefono"
→ iPhone: usa Safari | Android: usa Chrome

---

## ✅ CHECKLIST

- [ ] Cartelle create
- [ ] File organizzati
- [ ] Repository GitHub creato
- [ ] File caricati su GitHub
- [ ] Web Service Render creato
- [ ] Chiave API configurata
- [ ] Deploy completato
- [ ] App testata da browser
- [ ] App installata su telefono

---

**Tempo totale: ~20 minuti**

**Costo: $0** (Render gratuito + $5 crediti Anthropic inclusi)

🔥 **SEI PRONTO! VAI!**
