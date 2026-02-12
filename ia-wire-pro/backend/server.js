// IA Wire Pro - Frontend JavaScript
// Upload immagini + chat con backend (Render / Local)

const uploadBox = document.getElementById("uploadBox");
const fileInput = document.getElementById("fileInput");
const mainElement = document.querySelector(".phone");

let uploadedImageBase64 = null;
let uploadedImageName = null;
let conversationHistory = [];

// =========================
// CONFIG BACKEND URL
// =========================
// In locale -> localhost:3000
// In produzione (Render) -> URL backend Render
const API_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://ia-wire-pro.onrender.com";

console.log("✅ app.js caricato");
console.log("🌐 API_URL:", API_URL);

// =========================
// UPLOAD GESTIONE
// =========================

// Click sul box -> apre selettore file
uploadBox.addEventListener("click", () => {
  fileInput.click();
});

// File selezionato
fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleFile(file);
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

  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// =========================
// GESTIONE FILE
// =========================
function handleFile(file) {
  // Tipo
  if (!file.type.startsWith("image/")) {
    showError("⚠️ Solo immagini (JPG, PNG, WebP)");
    return;
  }

  // Dimensione max 5MB
  if (file.size > 5 * 1024 * 1024) {
    showError("⚠️ Immagine troppo grande (max 5MB)");
    return;
  }

  uploadedImageName = file.name;

  // Loading
  uploadBox.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:32px;margin-bottom:10px;">⏳</div>
      <div style="font-size:14px;color:var(--muted);">Caricamento...</div>
    </div>
  `;

  const reader = new FileReader();

  reader.onload = (e) => {
    uploadedImageBase64 = e.target.result;

    showImagePreview(uploadedImageBase64);
    createChatInterface();

    // Auto-analisi iniziale (parte SEMPRE)
    setTimeout(() => {
      sendMessage("Analizza questa immagine seguendo le regole di IA Wire Pro", true);
    }, 400);
  };

  reader.onerror = () => showError("❌ Errore nel caricamento del file");

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
        📸 ${escapeHtml(uploadedImageName || "immagine")}
      </div>

      <button id="btnResetUpload" type="button" style="
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

  const btn = document.getElementById("btnResetUpload");
  btn.addEventListener("click", resetUpload);
}

// Reset upload (pulito)
function resetUpload() {
  uploadedImageBase64 = null;
  uploadedImageName = null;
  conversationHistory = [];
  location.reload();
}

// =========================
// CHAT INTERFACE
// =========================
function createChatInterface() {
  // Rimuovi chat esistente
  const existingChat = document.querySelector(".card--chat");
  if (existingChat) existingChat.remove();

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
      <div data-initial="true" style="text-align:center;padding:20px;color:var(--muted);font-size:14px;">
        👋 Carica una foto e poi chiedimi cosa vuoi sapere
      </div>
    </div>

    <div style="display:flex;gap:8px;">
      <input
        id="userInput"
        type="text"
        placeholder="Es: Cosa vedi in questa immagine?"
        autocomplete="off"
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
      <button id="sendBtn" type="button" style="
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

  // Eventi invio
  document.getElementById("sendBtn").addEventListener("click", () => sendMessage());
  document.getElementById("userInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

// =========================
// INVIO MESSAGGIO
// =========================
async function sendMessage(customMessage = null, isAutoAnalysis = false) {
  const input = document.getElementById("userInput");
  const message = (customMessage ?? (input?.value || "")).trim();

  if (!message && !isAutoAnalysis) return;

  // Mostra messaggio utente
  if (!isAutoAnalysis) {
    addMessageToChat("user", message);
    input.value = "";
  }

  // Loading
  const loadingId = addMessageToChat("assistant", "⏳ Analizzo...", true);

  // Debug log
  console.log("➡️ Invio a:", `${API_URL}/api/chat`);
  console.log("📦 Image presente?", !!uploadedImageBase64);

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        image: uploadedImageBase64,
        history: conversationHistory
      })
    });

    // Leggi testo prima (così se non è JSON non crasha)
    const rawText = await response.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = { reply: rawText || "⚠️ Risposta vuota dal server." };
    }

    removeMessage(loadingId);

    if (!response.ok) {
      const errMsg = data?.error || data?.message || `HTTP ${response.status}`;
      const details = data?.details ? `\n${data.details}` : "";
      addMessageToChat("assistant", `❌ Errore: ${errMsg}${details}`);
      return;
    }

    if (data?.error) {
      addMessageToChat("assistant", `❌ Errore: ${data.error}\n${data.details || ""}`);
      return;
    }

    const reply = data?.reply || data?.text || "⚠️ Nessuna risposta ricevuta.";
    addMessageToChat("assistant", reply);

    // Salva cronologia (semplice)
    conversationHistory.push({ role: "user", content: message });
    conversationHistory.push({ role: "assistant", content: reply });

  } catch (error) {
    removeMessage(loadingId);
    addMessageToChat(
      "assistant",
      `❌ Errore di connessione: ${error.message}\n\nControlla che il backend su Render sia LIVE.`
    );
    console.error("❌ Fetch error:", error);
  }
}

// =========================
// MESSAGGI CHAT
// =========================
function addMessageToChat(role, content, isLoading = false) {
  const messagesContainer = document.getElementById("chatMessages");
  if (!messagesContainer) return null;

  // Rimuovi messaggio iniziale
  const initialMsg = messagesContainer.querySelector("[data-initial='true']");
  if (initialMsg) initialMsg.remove();

  const messageId = `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
      : "background: rgba(255,255,255,.05); margin-right: 20px;"
    }
    ${isLoading ? "opacity: 0.7;" : ""}
  `;

  const safe = escapeHtml(String(content || ""));
  const formattedContent = safe.replace(/\n/g, "<br>");

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
  if (!messageId) return;
  const msg = document.getElementById(messageId);
  if (msg) msg.remove();
}

// =========================
// ERRORI
// =========================
function showError(message) {
  uploadBox.innerHTML = `
    <div style="text-align:center;color:#ff6b6b;">
      <div style="font-size:48px;margin-bottom:10px;">⚠️</div>
      <div style="font-size:16px;font-weight:700;">${escapeHtml(message)}</div>
      <button id="btnReload" type="button" style="
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

  const btn = document.getElementById("btnReload");
  btn.addEventListener("click", () => location.reload());
}

// =========================
// UTIL
// =========================
function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =========================
// PWA - Service Worker
// =========================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then(() => console.log("✅ Service Worker registrato"))
      .catch((err) => console.log("❌ Service Worker errore:", err));
  });
}
