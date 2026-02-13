/* IA Wire Pro - app.js (definitivo V1)
   - Layout stabile (composer sempre visibile)
   - Compressione immagini (1200px, JPEG 0.7)
   - Preview + rimozione
   - Stati UI: Pronto / Analisi / Elaborazione / Errore
   - Chat con bubble + autoscroll
   - Fetch robusto: /api/chat con fallback localhost:3000
*/

(() => {
  "use strict";

  // ====== DOM ======
  const chat = document.getElementById("chat");
  const chatForm = document.getElementById("chatForm");
  const textInput = document.getElementById("textInput");
  const sendBtn = document.getElementById("sendBtn");
  const statusPill = document.getElementById("statusPill");

  const imageInput = document.getElementById("imageInput");
  const previewWrap = document.getElementById("previewWrap");
  const previewImg = document.getElementById("previewImg");
  const removeImageBtn = document.getElementById("removeImageBtn");

  // ====== STATE ======
  let selectedFile = null;
  let selectedBlob = null; // immagine compressa pronta per upload
  let abortCtrl = null;

  // ====== UTIL ======
  const setStatus = (label) => {
    if (!statusPill) return;
    statusPill.textContent = label;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const escapeHtml = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const addMessage = (role, text) => {
    const wrapper = document.createElement("div");
    wrapper.className = `msg ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = escapeHtml(text);

    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);

    // autoscroll morbido
    chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
    return { wrapper, bubble };
  };

  const addTyping = (label = "Sto analizzando...") => {
    const { bubble } = addMessage("ai", label);
    bubble.dataset.typing = "1";
    return bubble;
  };

  const removeTyping = () => {
    const nodes = chat.querySelectorAll(".bubble[data-typing='1']");
    nodes.forEach((n) => n.closest(".msg")?.remove());
  };

  const autoResize = () => {
    if (!textInput) return;
    textInput.style.height = "auto";
    const max = 140;
    textInput.style.height = Math.min(textInput.scrollHeight, max) + "px";
  };

  // ====== IMAGE COMPRESSION ======
  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("FileReader error"));
      r.readAsDataURL(file);
    });

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Immagine non caricabile"));
      img.src = src;
    });

  const compressImageFile = async (file, opts = {}) => {
    const maxSize = opts.maxSize ?? 1200;
    const quality = opts.quality ?? 0.7;

    const dataUrl = await fileToDataUrl(file);
    const img = await loadImage(dataUrl);

    let { width, height } = img;

    if (width > height && width > maxSize) {
      height = Math.round(height * (maxSize / width));
      width = maxSize;
    } else if (height >= width && height > maxSize) {
      width = Math.round(width * (maxSize / height));
      height = maxSize;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: false });

    // riempimento leggero per evitare background strani
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        "image/jpeg",
        quality
      );
    });

    if (!blob) throw new Error("Compressione fallita");
    return { blob, previewUrl: canvas.toDataURL("image/jpeg", 0.8) };
  };

  const clearImage = () => {
    selectedFile = null;
    selectedBlob = null;
    if (imageInput) imageInput.value = "";
    if (previewWrap) previewWrap.hidden = true;
    if (previewImg) previewImg.src = "";
  };

  // ====== API ENDPOINT RESOLVER ======
  const candidateEndpoints = () => {
    const origin = window.location.origin;

    // 1) stessa origin, utile quando frontend è servito dal backend
    // 2) localhost:3000, utile quando usi Live Server (5500) + backend 3000
    // 3) Render o altro, se hai proxy/cors: rimane gestito dal 1
    return [
      `${origin}/api/chat`,
      `http://localhost:3000/api/chat`,
    ];
  };

  const postToChatApi = async (payload, imageBlob, signal) => {
    // preferiamo multipart sempre, cosi è pronto anche quando c’è immagine
    const formData = new FormData();
    formData.append("text", payload.text || "");
    if (payload.mode) formData.append("mode", payload.mode);

    if (imageBlob) {
      formData.append("image", imageBlob, "photo.jpg");
      formData.append("image_mime", "image/jpeg");
    }

    let lastErr = null;

    for (const url of candidateEndpoints()) {
      try {
        const res = await fetch(url, {
          method: "POST",
          body: formData,
          signal,
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${t}`.trim());
        }

        const data = await res.json().catch(() => ({}));
        return { data, urlUsed: url };
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("Errore di rete");
  };

  // ====== TECH RESPONSE SHAPER (client side) ======
  const ensureStructuredAnswer = (text) => {
    const t = (text || "").trim();
    if (!t) return "Risposta vuota dal server.";

    // Se già contiene una struttura, non tocchiamo
    const hasSections =
      /OSSERVAZIONE|ANALISI|VERIFICHE|CERTEZZA|POSSIBILI/i.test(t);

    if (hasSections) return t;

    // Altrimenti, impacchettiamo per mantenerla “da tecnico”
    return [
      "OSSERVAZIONE (da risposta IA):",
      t,
      "",
      "LIVELLO DI CERTEZZA:",
      "Non verificabile (formato non strutturato).",
      "",
      "VERIFICHE CONSIGLIATE:",
      "1) Aggiungi 1 foto più ravvicinata e nitida.",
      "2) Scrivi marca/modello e cosa hai già provato.",
    ].join("\n");
  };

  // ====== EVENTS ======
  if (textInput) {
    textInput.addEventListener("input", autoResize);
    // invio con Enter, nuova linea con Shift+Enter
    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        chatForm?.requestSubmit();
      }
    });
    autoResize();
  }

  if (imageInput) {
    imageInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      selectedFile = file;
      setStatus("Analisi immagine…");
      sendBtn.disabled = true;

      try {
        const { blob, previewUrl } = await compressImageFile(file, {
          maxSize: 1200,
          quality: 0.7,
        });

        selectedBlob = blob;

        if (previewImg) previewImg.src = previewUrl;
        if (previewWrap) previewWrap.hidden = false;

        setStatus("Pronto");
      } catch (err) {
        console.error(err);
        clearImage();
        setStatus("Errore");
        addMessage("ai", "Non riesco a leggere/comprimere la foto. Prova con un’altra immagine.");
        await sleep(600);
        setStatus("Pronto");
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  if (removeImageBtn) {
    removeImageBtn.addEventListener("click", () => {
      clearImage();
      setStatus("Pronto
