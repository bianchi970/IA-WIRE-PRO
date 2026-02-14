/* IA Wire Pro - app.js (V1 stable, ASCII-safe)
   - Stable composer
   - Image compression (1200px, JPEG 0.7)
   - Preview + remove
   - UI states: Ready / Analyzing / Processing / Error
   - Chat bubbles + autoscroll
   - MULTIPART upload: /api/chat (message + image)
   - Fallback endpoints: same-origin + localhost:3000
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
  let selectedBlob = null;
  let abortCtrl = null;

  // ====== UTIL ======
  const setStatus = (label) => {
    if (!statusPill) return;
    statusPill.textContent = label;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const addMessage = (role, text) => {
    if (!chat) return { wrapper: null, bubble: null };

    const wrapper = document.createElement("div");
    wrapper.className = `msg ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = escapeHtml(text);

    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);

    chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
    return { wrapper, bubble };
  };

  const addTyping = (label = "Working...") => {
    const { bubble } = addMessage("ai", label);
    if (bubble) bubble.dataset.typing = "1";
    return bubble;
  };

  const removeTyping = () => {
    if (!chat) return;
    chat.querySelectorAll(".bubble[data-typing='1']").forEach((n) => {
      n.closest(".msg")?.remove();
    });
  };

  const autoResize = () => {
    if (!textInput) return;
    textInput.style.height = "auto";
    const max = 140;
    textInput.style.height = Math.min(textInput.scrollHeight, max) + "px";
  };

  const setBusy = (busy) => {
    if (sendBtn) sendBtn.disabled = !!busy;
    if (textInput) textInput.disabled = !!busy;
    if (imageInput) imageInput.disabled = !!busy;
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
      img.onerror = () => reject(new Error("Image load error"));
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
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });

    if (!blob) throw new Error("Compression failed");
    return { blob, previewUrl: canvas.toDataURL("image/jpeg", 0.82) };
  };

  const clearImage = () => {
    selectedBlob = null;
    if (imageInput) imageInput.value = "";
    if (previewWrap) previewWrap.hidden = true;
    if (previewImg) previewImg.src = "";
  };

  // ====== API ENDPOINTS ======
  const candidateEndpoints = () => {
    const origin = window.location.origin;
    return [`${origin}/api/chat`, `http://localhost:3000/api/chat`];
  };

  const postToChatApi = async (payload, imageBlob, signal) => {
    const formData = new FormData();
    formData.append("message", payload.text || "");
    if (payload.history) formData.append("history", JSON.stringify(payload.history));
    if (payload.mode) formData.append("mode", payload.mode);
    if (imageBlob) formData.append("image", imageBlob, "photo.jpg");

    let lastErr = null;

    for (const url of candidateEndpoints()) {
      try {
        const res = await fetch(url, { method: "POST", body: formData, signal });
        const ct = res.headers.get("content-type") || "";

        if (!res.ok) {
          let details = "";
          try {
            details = ct.includes("application/json")
              ? JSON.stringify(await res.json())
              : await res.text();
          } catch (_) {}
          throw new Error(`HTTP ${res.status} ${details}`.trim());
        }

        const data = ct.includes("application/json")
          ? await res.json().catch(() => ({}))
          : { reply: await res.text().catch(() => "") };

        return { data, urlUsed: url };
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("Network error");
  };

  const ensureStructuredAnswer = (text) => {
    const t = (text || "").trim();
    if (!t) return "Empty reply from server.";

    const hasSections = /OSSERVAZIONE|ANALISI|VERIFICHE|CERTEZZA|POSSIBILI/i.test(t);
    if (hasSections) return t;

    return [
      "OSSERVAZIONE:",
      t,
      "",
      "LIVELLO DI CERTEZZA:",
      "Da verificare (non strutturato).",
      "",
      "VERIFICHE CONSIGLIATE:",
      "1) Aggiungi una foto piu ravvicinata e nitida.",
      "2) Scrivi marca/modello e cosa hai gia provato.",
    ].join("\n");
  };

  // ====== EVENTS ======
  if (textInput) {
    textInput.addEventListener("input", autoResize);
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

      setStatus("Analyzing image...");
      setBusy(true);

      try {
        const { blob, previewUrl } = await compressImageFile(file, { maxSize: 1200, quality: 0.7 });
        selectedBlob = blob;

        if (previewImg) previewImg.src = previewUrl;
        if (previewWrap) previewWrap.hidden = false;

        setStatus("Ready");
      } catch (err) {
        console.error(err);
        clearImage();
        setStatus("Error");
        addMessage("ai", "Cannot read/compress the photo. Try another image.");
        await sleep(650);
        setStatus("Ready");
      } finally {
        setBusy(false);
      }
    });
  }

  if (removeImageBtn) {
    removeImageBtn.addEventListener("click", () => {
      clearImage();
      setStatus("Ready");
    });
  }

  if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const text = (textInput?.value || "").trim();
      if (!text && !selectedBlob) return;

      if (text) addMessage("user", text);

      if (textInput) {
        textInput.value = "";
        autoResize();
      }

      setBusy(true);
      setStatus(selectedBlob ? "Analyzing..." : "Processing...");

      removeTyping();
      addTyping(selectedBlob ? "Analyzing the photo..." : "Replying...");

      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();

      try {
        const { data } = await postToChatApi({ text, history: [] }, selectedBlob, abortCtrl.signal);
        removeTyping();
        addMessage("ai", ensureStructuredAnswer(data.reply || ""));
        clearImage();
        setStatus("Ready");
      } catch (err) {
        console.error(err);
        removeTyping();

        const msg = String(err?.message || err || "Error");
        if (msg.includes("HTTP 413")) addMessage("ai", "Photo too large. Reduce it and retry (target < 4-5MB).");
        else if (msg.includes("HTTP 400")) addMessage("ai", "Bad request. Check that 'message' is sent correctly.");
        else addMessage("ai", "Error: " + msg);

        setStatus("Error");
        await sleep(750);
        setStatus("Ready");
      } finally {
        setBusy(false);
      }
    });
  }

  setStatus("Ready");
})();
