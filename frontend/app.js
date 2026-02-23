console.log('BRIDGE LIVE');
/* IA Wire Pro - app.js (V1 stable, ITA) - compatibile (no ?., no ??, no replaceAll)
   TECH MODE: compressione più nitida per quadri elettrici (1800px, 0.85)
   FIX 400: se invii solo foto, forza message tecnico
   DEBUG RAG: mostra RAG ON/OFF (status + console)
   HISTORY: invia ultimi 10 messaggi al backend (DB history ha priorità)
*/

(function () {
  "use strict";

  // ====== DOM ======
  var chat = document.getElementById("chat");
  var chatForm = document.getElementById("chatForm");
  var textInput = document.getElementById("textInput");
  var sendBtn = document.getElementById("sendBtn");
  var statusPill = document.getElementById("statusPill");

  var imageInput = document.getElementById("imageInput");
  var previewWrap = document.getElementById("previewWrap");
  var previewImg = document.getElementById("previewImg");
  var removeImageBtn = document.getElementById("removeImageBtn");

  // ====== STATE ======
  var selectedBlob = null;
  var abortCtrl = null;

  // Persistenza conversation_id
  var conversationId = localStorage.getItem("conversation_id") || null;

  // ✅ History locale (ultimi messaggi) per backend
  var conversationHistory = []; // {role:"user"|"assistant", content:"..."}

  // ====== UTIL ======
  function setStatus(label) {
    if (!statusPill) return;
    statusPill.textContent = label;
    statusPill.classList.remove("busy", "error");
    var l = String(label || "").toLowerCase();
    if (l.indexOf("errore") >= 0) statusPill.classList.add("error");
    else if (l !== "pronto") statusPill.classList.add("busy");
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function escapeHtml(s) {
    var str = String(s == null ? "" : s);
    str = str.replace(/&/g, "&amp;");
    str = str.replace(/</g, "&lt;");
    str = str.replace(/>/g, "&gt;");
    return str;
  }

  function addMessage(role, text) {
    if (!chat) return { wrapper: null, bubble: null };

    var wrapper = document.createElement("div");
    wrapper.className = "msg " + role;

    var bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = escapeHtml(text);

    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);

    // autoscroll
    try {
      chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
    } catch (e) {
      chat.scrollTop = chat.scrollHeight;
    }

    return { wrapper: wrapper, bubble: bubble };
  }

  function clearChatUi() {
    if (!chat) return;
    chat.innerHTML = "";
  }

  function addTyping(label) {
    var t = label || "Sto lavorando...";
    var r = addMessage("ai", t);
    if (r.bubble) r.bubble.setAttribute("data-typing", "1");
    return r.bubble;
  }

  function removeTyping() {
    if (!chat) return;
    var nodes = chat.querySelectorAll(".bubble[data-typing='1']");
    for (var i = 0; i < nodes.length; i++) {
      var bubble = nodes[i];
      var msg = bubble.closest ? bubble.closest(".msg") : bubble.parentNode;
      if (msg && msg.parentNode) msg.parentNode.removeChild(msg);
    }
  }

  function autoResize() {
    if (!textInput) return;
    textInput.style.height = "auto";
    var max = 140;
    var h = textInput.scrollHeight;
    textInput.style.height = (h > max ? max : h) + "px";
  }

  function setBusy(busy) {
    var b = !!busy;
    if (sendBtn) sendBtn.disabled = b;
    if (textInput) textInput.disabled = b;
    if (imageInput) imageInput.disabled = b;
  }

  // ✅ History helpers
  function pushHistory(role, content) {
    var r = String(role || "").toLowerCase();
    if (r !== "user" && r !== "assistant") r = "user";
    conversationHistory.push({ role: r, content: String(content == null ? "" : content) });
    // tieni gli ultimi 10
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(conversationHistory.length - 10);
    }
  }

  function resetHistoryFromLoadedMessages(raw) {
    conversationHistory = [];
    var arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && Array.isArray(raw.items)) arr = raw.items;
    else if (raw && Array.isArray(raw.messages)) arr = raw.messages;
    else if (raw && Array.isArray(raw.rows)) arr = raw.rows;

    for (var i = 0; i < arr.length; i++) {
      var m = arr[i] || {};
      var role = String(m.role || m.sender || m.type || "").toLowerCase();
      var content = (m.content != null ? m.content :
        m.text != null ? m.text :
        m.message != null ? m.message :
        m.body != null ? m.body : "");

      if (role.indexOf("assistant") >= 0 || role === "ai") pushHistory("assistant", String(content));
      else pushHistory("user", String(content));
    }

    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(conversationHistory.length - 10);
    }
  }

  // ====== IMAGE COMPRESSION (TECH MODE) ======
  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error("Errore FileReader")); };
      r.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Errore caricamento immagine")); };
      img.src = src;
    });
  }

  function compressImageFile(file, opts) {
    opts = opts || {};

    // ✅ Quadro elettrico: più dettaglio per etichette/tasti TEST
    var maxSize = (opts.maxSize != null ? opts.maxSize : 1800); // era 1200
    var quality = (opts.quality != null ? opts.quality : 0.85); // era 0.7

    return fileToDataUrl(file)
      .then(function (dataUrl) {
        return loadImage(dataUrl).then(function (img) {
          var width = img.width;
          var height = img.height;

          if (width > height && width > maxSize) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          } else if (height >= width && height > maxSize) {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }

          var canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          var ctx = canvas.getContext("2d", { alpha: false });

          // ✅ sfondo bianco = migliore leggibilità dei testi
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, width, height);

          ctx.drawImage(img, 0, 0, width, height);

          return new Promise(function (resolve, reject) {
            canvas.toBlob(function (b) {
              if (!b) return reject(new Error("Compressione fallita"));

              var previewUrl = "";
              try {
                previewUrl = canvas.toDataURL("image/jpeg", quality);
              } catch (e) {
                previewUrl = "";
              }

              resolve({ blob: b, previewUrl: previewUrl });
            }, "image/jpeg", quality);
          });
        });
      });
  }

  function clearImage() {
    selectedBlob = null;
    if (imageInput) imageInput.value = "";
    if (previewWrap) previewWrap.hidden = true;
    if (previewImg) previewImg.src = "";
  }

  // ====== API ENDPOINTS ======
  function isProdSameOrigin() {
    return location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
  }

  function candidateChatEndpoints() {
    if (isProdSameOrigin()) return [location.origin + "/api/chat"];
    return [location.origin + "/api/chat", "http://localhost:3000/api/chat"];
  }

  function candidateMessagesEndpoints(convId) {
    var path = "/api/conversations/" + encodeURIComponent(convId) + "/messages";
    if (isProdSameOrigin()) return [location.origin + path];
    return [location.origin + path, "http://localhost:3000" + path];
  }

  function postToChatApi(payload, imageBlob, signal) {
    var formData = new FormData();

    var rawMsg = ((payload && (payload.message || payload.text)) || "").trim();
    var safeMsg = rawMsg || (imageBlob ? "Analizza la foto in modo tecnico: elenca componenti (RCD/RCBO/MT), pettini, morsettiere, e indica cosa non è leggibile e che zoom serve." : "");
    formData.append("message", safeMsg);

    if (payload && payload.history) formData.append("history", JSON.stringify(payload.history));
    if (payload && payload.mode) formData.append("mode", payload.mode);
    if (payload && payload.conversation_id) formData.append("conversation_id", String(payload.conversation_id));

    if (imageBlob) formData.append("image", imageBlob, "photo_" + Date.now() + ".jpg");

    var urls = candidateChatEndpoints();
    var lastErr = null;

    function tryOne(i) {
      if (i >= urls.length) return Promise.reject(lastErr || new Error("Errore di rete"));
      var url = urls[i];

      return fetch(url, { method: "POST", body: formData, signal: signal })
        .then(function (res) {
          var ct = res.headers.get("content-type") || "";
          if (!res.ok) {
            return (ct.indexOf("application/json") >= 0 ? res.json().catch(function(){return {};}) : res.text().catch(function(){return "";}))
              .then(function (details) {
                var d = (typeof details === "string") ? details : JSON.stringify(details);
                throw new Error(("HTTP " + res.status + " " + d).trim());
              });
          }
          return (ct.indexOf("application/json") >= 0 ? res.json().catch(function(){return {};}) : res.text().catch(function(){return "";}))
            .then(function (data) {
              if (typeof data === "string") data = { reply: data };
              return { data: data, urlUsed: url };
            });
        })
        .catch(function (e) {
          lastErr = e;
          return tryOne(i + 1);
        });
    }

    return tryOne(0);
  }

  function getConversationMessages(convId) {
    var urls = candidateMessagesEndpoints(convId);
    var lastErr = null;

    function tryOne(i) {
      if (i >= urls.length) return Promise.reject(lastErr || new Error("Impossibile caricare messaggi"));
      var url = urls[i];

      return fetch(url, { method: "GET" })
        .then(function (res) {
          var ct = res.headers.get("content-type") || "";
          if (!res.ok) throw new Error("HTTP " + res.status);
          return (ct.indexOf("application/json") >= 0 ? res.json() : Promise.resolve([]));
        })
        .catch(function (e) {
          lastErr = e;
          return tryOne(i + 1);
        });
    }

    return tryOne(0);
  }

  function ensureStructuredAnswer(text) {
    var t = (text || "").trim();
    if (!t) return "Risposta vuota dal server.";

    var hasSections = /OSSERVAZIONI|OSSERVAZIONE|IPOTESI|VERIFICHE|CERTEZZA|RISCHI/i.test(t);
    if (hasSections) return t;

    return [
      "OSSERVAZIONI:",
      "- " + t,
      "",
      "LIVELLO DI CERTEZZA:",
      "- Da verificare (risposta non strutturata).",
      "",
      "VERIFICHE CONSIGLIATE:",
      "1) Aggiungi una foto più ravvicinata e nitida.",
      "2) Scrivi marca/modello e cosa hai già provato."
    ].join("\n");
  }

  function renderLoadedMessages(raw) {
    var arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && Array.isArray(raw.items)) arr = raw.items;
    else if (raw && Array.isArray(raw.messages)) arr = raw.messages;
    else if (raw && Array.isArray(raw.rows)) arr = raw.rows;

    if (!arr.length) return;

    clearChatUi();

    for (var i = 0; i < arr.length; i++) {
      var m = arr[i] || {};
      var role = String(m.role || m.sender || m.type || "").toLowerCase();
      var content = (m.content != null ? m.content :
        m.text != null ? m.text :
        m.message != null ? m.message :
        m.body != null ? m.body : "");

      if (role.indexOf("assistant") >= 0 || role === "ai") addMessage("ai", ensureStructuredAnswer(String(content)));
      else addMessage("user", String(content));
    }

    resetHistoryFromLoadedMessages(raw);
  }

  function loadConversationOnStart() {
    if (!conversationId) return;
    setStatus("Carico chat...");
    setBusy(true);
    return getConversationMessages(conversationId)
      .then(function (data) {
        renderLoadedMessages(data);
        setStatus("Pronto");
      })
      .catch(function (e) {
        var msg = e && e.message ? e.message : String(e || "");
        console.warn("Load conversation failed:", msg);
        // conversation non trovata o DB error: pulisce localStorage per evitare loop
        if (msg.indexOf("HTTP 404") >= 0 || msg.indexOf("HTTP 500") >= 0) {
          conversationId = null;
          localStorage.removeItem("conversation_id");
        }
        setStatus("Pronto");
      })
      .finally(function () {
        setBusy(false);
      });
  }

  // ====== EVENTS ======
  if (textInput) {
    textInput.addEventListener("input", autoResize);
    textInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (sendBtn) sendBtn.click();
      }
    });
    autoResize();
  }

  if (imageInput) {
    imageInput.addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;

      setStatus("Analisi immagine...");
      setBusy(true);

      compressImageFile(file, { maxSize: 1800, quality: 0.85 })
        .then(function (r) {
          selectedBlob = r.blob;
          if (previewImg) previewImg.src = r.previewUrl || "";
          if (previewWrap) previewWrap.hidden = false;
          setStatus("Pronto");
        })
        .catch(function (err) {
          console.error(err);
          clearImage();
          setStatus("Errore");
          addMessage("ai", "Non riesco a leggere/comprimere la foto. Prova con un’altra immagine (nitida e ravvicinata).");
          return sleep(650).then(function () { setStatus("Pronto"); });
        })
        .finally(function () {
          setBusy(false);
        });
    });
  }

  if (removeImageBtn) {
    removeImageBtn.addEventListener("click", function () {
      clearImage();
      setStatus("Pronto");
    });
  }

  if (chatForm) {
    chatForm.addEventListener("submit", function (e) { e.preventDefault(); });

    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        var text = (textInput && textInput.value ? textInput.value : "").trim();
        if (!text && !selectedBlob) return;

        // ✅ se solo foto, messaggio tecnico
        if (!text && selectedBlob) {
          text = "Analizza la foto in modo tecnico: elenca componenti (RCD/RCBO/MT), pettini, morsettiere, e indica cosa non è leggibile e che zoom serve.";
        }

        if (selectedBlob && text.indexOf("Analizza la foto") === 0) addMessage("user", "📷 Foto inviata");
        else addMessage("user", text);

        pushHistory("user", text);

        var pendingText = text;

        setBusy(true);
        setStatus(selectedBlob ? "Analisi..." : "Elaborazione...");

        removeTyping();
        addTyping(selectedBlob ? "Sto analizzando la foto..." : "Sto rispondendo...");

        if (abortCtrl) abortCtrl.abort();
        abortCtrl = new AbortController();

        postToChatApi(
          { message: text, history: conversationHistory, conversation_id: conversationId },
          selectedBlob,
          abortCtrl.signal
        )
          .then(function (r) {
            var data = r.data || {};

            var newConvId = data.conversation_id || data.conversationId || data.id || null;
            if (newConvId) {
              conversationId = String(newConvId);
              localStorage.setItem("conversation_id", conversationId);
            }

            // ✅ DEBUG RAG (status + console)
            try { console.log("RAG:", data.rag); } catch (e) {}
            if (data && data.rag && typeof data.rag.usedDbContext !== "undefined") {
              setStatus(data.rag.usedDbContext ? "RAG: ON" : "RAG: OFF");
              sleep(1200).then(function(){ setStatus("Pronto"); });
            }

            removeTyping();

            var ans = ensureStructuredAnswer(data.answer || data.reply || "");
            addMessage("ai", ans);

            pushHistory("assistant", ans);

            if (textInput) {
              textInput.value = "";
              autoResize();
            }

            clearImage();
            if (!(data && data.rag && typeof data.rag.usedDbContext !== "undefined")) {
              setStatus("Pronto");
            }
          })
          .catch(function (err) {
            console.error(err);
            removeTyping();

            var msg = String((err && err.message) ? err.message : (err || "Errore"));

            if (textInput && pendingText && pendingText.indexOf("Analizza la foto") !== 0) {
              textInput.value = pendingText;
              autoResize();
            }

            if (msg.indexOf("HTTP 413") >= 0) addMessage("ai", "Foto troppo grande. Riducila e riprova (obiettivo < 4-5MB).");
            else if (msg.indexOf("HTTP 400") >= 0) addMessage("ai", "Richiesta non valida. Se persiste, è un mismatch di campi nel backend.");
            else addMessage("ai", "Errore: " + msg);

            setStatus("Errore");
            return sleep(750).then(function () { setStatus("Pronto"); });
          })
          .finally(function () {
            setBusy(false);
          });
      });
    }
  }

  setStatus("Pronto");
  loadConversationOnStart();
})();