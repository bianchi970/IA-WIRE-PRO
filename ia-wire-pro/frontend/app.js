// IA Wire Pro - Frontend JavaScript
// Gestisce upload immagini + chat con backend

const uploadBox = document.getElementById("uploadBox");
const fileInput = document.getElementById("fileInput");
const mainElement = document.querySelector(".phone");

let uploadedImageBase64 = null;
let uploadedImageName = null;
let conversationHistory = [];

// Configura URL backend (cambia in produzione)
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : ''; // Stesso dominio in produzione

// =========================
// UPLOAD GESTIONE
// =========================

// Click sul box
uploadBox.addEventListener("click", () => {
  fileInput.click();
});

// File selezionato
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    handleFile(file);
  }
});

// Drag & Drop
uploadBox.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadBox.style.borderColor = "var(--cyan)";
  uploadBox.style.background = "rgba(0,217,255,.08)";
});

uploadBox.addEventListener("dragleave", () => {
  uploadBox.style.borderColor = "rgba(255,140,66,.45)";
  uploadBox.style.background = "rgba(255,255,255,.03)";
});

uploadBox.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadBox.style.borderColor = "rgba(255,140,66,.45)";
  uploadBox.style.background = "rgba(255,255,255,.03)";
  
  const file = e.dataTransfer.files[0];
  if (file) {
    handleFile(file);
  }
});

// =========================
// GESTIONE FILE
// =========================
function handleFile(file) {
  // Controlla tipo
  if (!file.type.startsWith("image/")) {
    showError("⚠️ Solo immagini (JPG, PNG, WebP)");
    return;
  }

  // Controlla dimensione (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showError("⚠️ Immagine troppo grande (max 5MB)");
    return;
  }

  uploadedImageName = file.name;

  // Mostra loading
  uploadBox.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:32px;margin-bottom:10px;">⏳</div>
      <div style="font-size:14px;color:var(--muted);">Caricamento...</div>
    </div>
  `;

  // Converti in base64
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedImageBase64 = e.target.result;
    showImagePreview(uploadedImageBase64);
    createChatInterface();
  };
  reader.onerror = () => {
    showError("❌ Errore nel caricamento del file");
  };
  reader.readAsDataURL(file);
}

// =========================
// ANTEPRIMA IMMAGINE
// =========================
function showImagePreview(base64) {
  const uploadCard = document.querySelector(".card--upload");
  uploadCard.innerHTML = `
    <header class="card-head">
      <div class="cam-badge" aria-hidden="true">✅</div>
      <h2 class="card-title">Immagine<br />Caricata</h2>
    </header>

    <div style="text-align:center;padding:10px;">
      <img src="${base64}" alt="Quadro elettrico" style="
        max-width: 100%;
        max-height: 200px;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,.4);
        margin-bottom:12px;
      ">
      <div style="font-size: 13px; color: var(--muted); margin-bottom:10px;">
        📸 ${uploadedImageName}
      </div>
      <button onclick="resetUpload()" style="
        padding: 10px 20px;
        border-radius: 12px;
        border: 1px solid var(--stroke);
        background: rgba(255,255,255,.06);
        color: var(--text);
        cursor: pointer;
        font-size: 14px;
        font-weight:600;
      ">
        🔄 Cambia immagine
      </button>
    </div>
  `;
}

// Reset upload
window.resetUpload = function() {
  uploadedImageBase64 = null;
  uploadedImageName = null;
  conversationHistory = [];
  location.reload();
};

// =========================
// CHAT INTERFACE
// =========================
function createChatInterface() {
  // Rimuovi chat esistente se c'è
  const existingChat = document.querySelector(".card--chat");
  if (existingChat) {
    existingChat.remove();
  }

  const chatCard = document.createElement("section");
  chatCard.className = "card card--chat";
  chatCard.innerHTML = `
    <header class="card-head">
      <div class="cam-badge" aria-hidden="true">💬</div>
      <h2 class="card-title">Analisi<br />Tecnica</h2>
    </header>

    <div id="chatMessages" style="
      min-height: 200px;
      max-height: 400px;
      overflow-y: auto;
      padding: 12px;
      background: rgba(255,255,255,.02);
      border-radius: 16px;
      margin-bottom: 14px;
    ">
      <div style="text-align:center;padding:20px;color:var(--muted);font-size:14px;">
        👋 Chiedimi cosa vuoi sapere su questa immagine
      </div>
    </div>

    <div style="display:flex;gap:8px;">
      <input 
        id="userInput" 
        type="text" 
        placeholder="Es: Cosa vedi in questa immagine?" 
        style="
          flex:1;
          padding: 12px 16px;
          border-radius: 14px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.04);
          color: var(--text);
          font-size: 14px;
        "
      />
      <button id="sendBtn" style="
        padding: 12px 20px;
        border-radius: 14px;
        border: none;
        background: linear-gradient(135deg, var(--orange), var(--cyan));
        color: #061018;
        font-weight: 800;
        font-size: 14px;
        cursor: pointer;
        min-width:70px;
      ">
        Invia
      </button>
    </div>
  `;

  mainElement.appendChild(chatCard);

  // Event listeners
  document.getElementById("sendBtn").addEventListener("click", sendMessage);
  document.getElementById("userInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });

  // Auto-analisi iniziale
  setTimeout(() => {
    sendMessage("Analizza questa immagine seguendo le regole di IA Wire Pro", true);
  }, 500);
}

// =========================
// INVIO MESSAGGIO
// =========================
async function sendMessage(customMessage = null, isAutoAnalysis = false) {
  const input = document.getElementById("userInput");
  const message = customMessage || input.value.trim();

  if (!message && !isAutoAnalysis) return;

  // Mostra messaggio utente (solo se non è auto-analisi)
  if (!isAutoAnalysis) {
    addMessageToChat("user", message);
    input.value = "";
  }

  // Mostra loading
  const loadingId = addMessageToChat("assistant", "⏳ Analizzo...", true);

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message,
        image: uploadedImageBase64,
        history: conversationHistory
      })
    });

    const data = await response.json();

    // Rimuovi loading
    removeMessage(loadingId);

    if (data.error) {
      addMessageToChat("assistant", `❌ Errore: ${data.error}\n${data.details || ""}`);
      return;
    }

    // Mostra risposta
    addMessageToChat("assistant", data.reply);

    // Salva nella cronologia
    conversationHistory.push({
      role: "user",
      content: message
    });
    conversationHistory.push({
      role: "assistant",
      content: data.reply
    });

  } catch (error) {
    removeMessage(loadingId);
    addMessageToChat("assistant", `❌ Errore di connessione: ${error.message}\n\nVerifica che il backend sia avviato.`);
  }
}

// =========================
// GESTIONE MESSAGGI CHAT
// =========================
function addMessageToChat(role, content, isLoading = false) {
  const messagesContainer = document.getElementById("chatMessages");
  
  // Rimuovi messaggio iniziale se esiste
  const initialMsg = messagesContainer.querySelector('[data-initial]');
  if (initialMsg) {
    initialMsg.remove();
  }

  const messageId = `msg-${Date.now()}-${Math.random()}`;
  const messageDiv = document.createElement("div");
  messageDiv.id = messageId;
  messageDiv.style.cssText = `
    margin-bottom: 12px;
    padding: 12px 14px;
    border-radius: 14px;
    font-size: 14px;
    line-height: 1.5;
    ${role === "user" 
      ? "background: linear-gradient(135deg, rgba(255,140,66,.15), rgba(0,217,255,.15)); margin-left: 20px; text-align: right;" 
      : "background: rgba(255,255,255,.05); margin-right: 20px;"}
    ${isLoading ? "opacity: 0.7;" : ""}
  `;

  // Formatta il contenuto preservando newline
  const formattedContent = content.replace(/\n/g, '<br>');
  messageDiv.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px;font-size:12px;opacity:.7;">
      ${role === "user" ? "Tu" : "IA Wire Pro"}
    </div>
    <div>${formattedContent}</div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  return messageId;
}

function removeMessage(messageId) {
  const msg = document.getElementById(messageId);
  if (msg) {
    msg.remove();
  }
}

// =========================
// ERRORI
// =========================
function showError(message) {
  uploadBox.innerHTML = `
    <div style="text-align:center;color:#ff6b6b;">
      <div style="font-size:48px;margin-bottom:10px;">⚠️</div>
      <div style="font-size:16px;font-weight:700;">${message}</div>
      <button onclick="location.reload()" style="
        margin-top:16px;
        padding:10px 20px;
        border-radius:12px;
        border:1px solid var(--stroke);
        background:rgba(255,255,255,.06);
        color:var(--text);
        cursor:pointer;
        font-size:14px;
      ">
        Riprova
      </button>
    </div>
  `;
}

// =========================
// PWA - Service Worker
// =========================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('✅ Service Worker registrato'))
      .catch(err => console.log('❌ Service Worker errore:', err));
  });
}
