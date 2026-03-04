console.log('BRIDGE LIVE');
/* IA Wire Pro - app.js
   - ES5 puro (no ?., no ??, no replaceAll) — compatibilità massima
   - TECH MODE: compressione nitida per quadri (1800px, 0.85)
   - Typing indicator animato (3 puntini)
   - Placeholder adattivo mobile
*/

(function () {
  "use strict";

  // ====== DOM ======
  var chat = document.getElementById("chat");
  var chatForm = document.getElementById("chatForm");
  var textInput = document.getElementById("textInput");
  var sendBtn = document.getElementById("sendBtn");
  var statusPill = document.getElementById("statusPill");
  var newChatBtn = document.getElementById("newChatBtn");
  var historyBtn = document.getElementById("historyBtn");
  var historyPanel = document.getElementById("historyPanel");
  var historyOverlay = document.getElementById("historyOverlay");
  var historyCloseBtn = document.getElementById("historyCloseBtn");
  var historyList = document.getElementById("historyList");

  var imageInput = document.getElementById("imageInput");
  var previewWrap = document.getElementById("previewWrap");
  var previewImg = document.getElementById("previewImg");
  var removeImageBtn = document.getElementById("removeImageBtn");

  // ====== STATE ======
  var selectedBlob = null;
  var abortCtrl = null;
  var _busy = false;

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

  // ====== ROCCO RESPONSE FORMATTER ======
  var KNOWN_SECTIONS = {
    "OSSERVAZIONI": 1, "COMPONENTI COINVOLTI": 1, "COMPONENTI RICONOSCIUTI": 1, "COMPONENTI": 1,
    "IPOTESI": 1, "IPOTESI PROBABILE": 1,
    "VERIFICHE OPERATIVE": 1, "VERIFICHE SUL CAMPO": 1, "VERIFICHE CONSIGLIATE": 1, "VERIFICHE": 1,
    "RISCHI REALI": 1, "RISCHI": 1, "RISCHI / SICUREZZA": 1, "SICUREZZA": 1,
    "LIVELLO DI CERTEZZA": 1,
    "NEXT STEP": 1, "PROSSIMO PASSO": 1,
    "CONCLUSIONE": 1, "CAUSA PROBABILE": 1, "NOTA": 1, "AVVERTENZE": 1
  };

  function inlineFormat(s) {
    var t = escapeHtml(s);
    t = t.replace(/\[CONFERMATO\]/g, '<span class="cert cert-ok">CONFERMATO</span>');
    t = t.replace(/\[PROBABILE\]/g, '<span class="cert cert-prob">PROBABILE</span>');
    t = t.replace(/\[POSSIBILE\]/g, '<span class="cert cert-poss">POSSIBILE</span>');
    t = t.replace(/\[DA_VERIFICARE\]/g, '<span class="cert cert-poss">DA VERIFICARE</span>');
    return t;
  }

  function formatRoccoResponse(rawText) {
    var text = String(rawText == null ? "" : rawText);
    var lines = text.split("\n");
    var html = "";
    var firstSection = true;

    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (!trimmed) continue; // sezioni hanno margin-top, blank lines non servono

      // Section header: controlla tabella KNOWN_SECTIONS
      var noColon = trimmed.replace(/:+\s*$/, "").trim();
      if (KNOWN_SECTIONS[noColon.toUpperCase()]) {
        var mt = firstSection ? ' style="margin-top:0"' : "";
        html += '<div class="rline"' + mt + '><strong class="sec-head">' + escapeHtml(noColon) + "</strong></div>";
        firstSection = false;
        continue;
      }

      // Bullet: "- testo" o "• testo"
      if (/^[-\u2022]\s/.test(trimmed)) {
        var bContent = trimmed.replace(/^[-\u2022]\s+/, "");
        html += '<div class="rline rline-bullet"><span class="bullet-dot">&#x2022;</span><span>' + inlineFormat(bContent) + "</span></div>";
        continue;
      }

      // Numerato: "1) testo" o "1. testo"
      var nm = trimmed.match(/^(\d+[.)]\s*)(.*)/);
      if (nm) {
        html += '<div class="rline rline-num"><span class="num-pfx">' + escapeHtml(nm[1]) + "</span><span>" + inlineFormat(nm[2]) + "</span></div>";
        continue;
      }

      html += '<div class="rline">' + inlineFormat(trimmed) + "</div>";
    }

    return html || escapeHtml(text);
  }

  function addMessage(role, text, meta) {
    if (!chat) return { wrapper: null, bubble: null };

    var wrapper = document.createElement("div");
    wrapper.className = "msg " + role;

    var bubble = document.createElement("div");

    // Usa il formatter per risposte AI strutturate
    var hasStructure = (role === "ai") &&
      /OSSERVAZIONI|IPOTESI|VERIFICHE|RISCHI|CERTEZZA|NEXT STEP|PROSSIMO PASSO/i.test(text);

    if (hasStructure) {
      bubble.className = "bubble bubble-formatted";
      bubble.innerHTML = formatRoccoResponse(text);
    } else {
      bubble.className = "bubble";
      bubble.innerHTML = escapeHtml(text);
    }

    wrapper.appendChild(bubble);

    // Badge provider (solo su risposte strutturate con meta)
    if (hasStructure && meta && (meta.provider || meta.model)) {
      var badge = document.createElement("div");
      badge.className = "provider-badge";
      var provText = String(meta.provider || "").toLowerCase();
      var modelText = String(meta.model || "");
      var label = provText;
      if (modelText) label += " \u00B7 " + modelText;
      if (meta.fallback_used) {
        badge.innerHTML = '<span class="prov-fallback">[fallback]</span> ' + escapeHtml(label);
      } else {
        badge.textContent = label;
      }
      wrapper.appendChild(badge);
    }

    chat.appendChild(wrapper);

    // autoscroll — setTimeout(0) assicura che il DOM sia già renderizzato prima di leggere scrollHeight
    var _chat = chat;
    setTimeout(function () {
      try {
        _chat.scrollTo({ top: _chat.scrollHeight, behavior: "smooth" });
      } catch (e) {
        _chat.scrollTop = _chat.scrollHeight;
      }
    }, 0);

    return { wrapper: wrapper, bubble: bubble };
  }

  function clearChatUi() {
    if (!chat) return;
    chat.innerHTML = "";
  }

  function addTyping(label) {
    var wrapper = document.createElement("div");
    wrapper.className = "msg ai";

    var bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.setAttribute("data-typing", "1");

    // Testo + 3 puntini animati CSS
    var txt = document.createElement("span");
    txt.textContent = (label || "Sto elaborando") + " ";

    var dots = document.createElement("span");
    dots.className = "typing-dots";
    dots.innerHTML = "<span>.</span><span>.</span><span>.</span>";

    bubble.appendChild(txt);
    bubble.appendChild(dots);
    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);

    var _chat = chat;
    setTimeout(function () {
      try { _chat.scrollTo({ top: _chat.scrollHeight, behavior: "smooth" }); }
      catch (e) { _chat.scrollTop = _chat.scrollHeight; }
    }, 0);

    return bubble;
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
    _busy = !!busy;
    if (textInput) textInput.disabled = _busy;
    if (imageInput) imageInput.disabled = _busy;
    if (sendBtn) {
      if (_busy) {
        sendBtn.textContent = "✕ Annulla";
        sendBtn.classList.add("danger");
        sendBtn.classList.remove("primary");
        sendBtn.disabled = false;
      } else {
        sendBtn.textContent = "Invia";
        sendBtn.classList.remove("danger");
        sendBtn.classList.add("primary");
        sendBtn.disabled = false;
      }
    }
  }

  function startNewChat() {
    if (abortCtrl) abortCtrl.abort();
    _busy = false;
    conversationId = null;
    conversationHistory = [];
    localStorage.removeItem("conversation_id");
    clearChatUi();
    clearImage();
    setStatus("Pronto");
    if (sendBtn) {
      sendBtn.textContent = "Invia";
      sendBtn.classList.remove("danger");
      sendBtn.classList.add("primary");
      sendBtn.disabled = false;
    }
    if (textInput) { textInput.disabled = false; textInput.value = ""; autoResize(); }
    if (imageInput) imageInput.disabled = false;
    addMessage("ai", "Nuova conversazione avviata. Descrivi il problema tecnico.");
    // Ripristina i chip nel messaggio di benvenuto (non è più visibile — non serve)
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

  // ====== STORICO CONVERSAZIONI ======
  function openHistoryPanel() {
    if (!historyPanel || !historyOverlay) return;
    historyOverlay.hidden = false;
    historyPanel.classList.add("open");
    historyPanel.setAttribute("aria-hidden", "false");
    loadHistoryList();
  }

  function closeHistoryPanel() {
    if (!historyPanel || !historyOverlay) return;
    historyPanel.classList.remove("open");
    historyPanel.setAttribute("aria-hidden", "true");
    historyOverlay.hidden = true;
  }

  function formatRelativeDate(isoStr) {
    if (!isoStr) return "";
    try {
      var d = new Date(isoStr);
      var now = new Date();
      var diffMs = now - d;
      var diffDays = Math.floor(diffMs / 86400000);
      if (diffDays === 0) {
        var h = d.getHours();
        var m = String(d.getMinutes()).length === 1 ? "0" + d.getMinutes() : d.getMinutes();
        return "Oggi " + h + ":" + m;
      }
      if (diffDays === 1) return "Ieri";
      if (diffDays < 7) return diffDays + " giorni fa";
      return d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear();
    } catch (e) { return ""; }
  }

  function loadHistoryList() {
    if (!historyList) return;
    historyList.innerHTML = '<div class="history-loading">Caricamento...</div>';

    var urls = candidateChatEndpoints().map(function (u) {
      return u.replace("/api/chat", "/api/conversations") + "?limit=30";
    });
    var lastErr = null;

    function tryOne(i) {
      if (i >= urls.length) return Promise.reject(lastErr || new Error("Nessun endpoint disponibile"));
      return fetch(urls[i], { method: "GET" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .catch(function (e) { lastErr = e; return tryOne(i + 1); });
    }

    tryOne(0).then(function (data) {
      var arr = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
      if (!arr.length) {
        historyList.innerHTML = '<div class="history-empty">Nessuna conversazione salvata.</div>';
        return;
      }

      var html = "";
      for (var i = 0; i < arr.length; i++) {
        var conv = arr[i] || {};
        var id = String(conv.id || "");
        var title = String(conv.title || "Conversazione").substring(0, 60);
        var date = formatRelativeDate(conv.updated_at || conv.created_at);
        var isActive = (conversationId && String(conversationId) === id) ? " active" : "";
        html += '<div class="history-item' + isActive + '" data-conv-id="' + escapeHtml(id) + '">';
        html += '<span class="history-item-icon">💬</span>';
        html += '<div class="history-item-body">';
        html += '<div class="history-item-title">' + escapeHtml(title) + '</div>';
        if (date) html += '<div class="history-item-date">' + escapeHtml(date) + '</div>';
        html += '</div></div>';
      }
      historyList.innerHTML = html;

      // Click su item → carica conversazione
      var items = historyList.querySelectorAll(".history-item");
      for (var j = 0; j < items.length; j++) {
        (function (item) {
          item.addEventListener("click", function () {
            var cid = item.getAttribute("data-conv-id");
            if (!cid) return;
            closeHistoryPanel();
            if (conversationId === cid) return; // già aperta
            conversationId = cid;
            localStorage.setItem("conversation_id", cid);
            conversationHistory = [];
            clearChatUi();
            setStatus("Carico chat...");
            setBusy(true);
            getConversationMessages(cid)
              .then(function (msgs) { renderLoadedMessages(msgs); setStatus("Pronto"); })
              .catch(function () { setStatus("Errore caricamento chat"); })
              .then(function () { setBusy(false); }, function () { setBusy(false); });
          });
        })(items[j]);
      }
    }).catch(function () {
      historyList.innerHTML = '<div class="history-empty">Impossibile caricare lo storico.</div>';
    });
  }

  if (historyBtn) historyBtn.addEventListener("click", openHistoryPanel);
  if (historyCloseBtn) historyCloseBtn.addEventListener("click", closeHistoryPanel);
  if (historyOverlay) historyOverlay.addEventListener("click", closeHistoryPanel);

  // ===== SUGGESTION CHIPS =====
  var chips = document.querySelectorAll(".chip");
  for (var ci = 0; ci < chips.length; ci++) {
    (function (chip) {
      chip.addEventListener("click", function () {
        var text = chip.getAttribute("data-text");
        if (!text || !textInput) return;
        textInput.value = text;
        autoResize();
        textInput.focus();
        // Rimuove i chip dopo il click (il messaggio di benvenuto rimane)
        var chipsEl = document.getElementById("suggestionChips");
        if (chipsEl) chipsEl.style.display = "none";
      });
    })(chips[ci]);
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
        // Se in corso → annulla la richiesta
        if (_busy) {
          if (abortCtrl) abortCtrl.abort();
          setBusy(false);
          removeTyping();
          clearImage();
          setStatus("Annullato");
          return sleep(800).then(function () { setStatus("Pronto"); });
        }

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
            addMessage("ai", ans, {
              provider: data.provider,
              model: data.model,
              fallback_used: !!data.fallback_used
            });

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
            clearImage();

            var msg = String((err && err.message) ? err.message : (err || "Errore"));

            if (textInput && pendingText && pendingText.indexOf("Analizza la foto") !== 0) {
              textInput.value = pendingText;
              autoResize();
            }

            if (msg.indexOf("aborted") >= 0 || msg.indexOf("abort") >= 0) {
              /* annullato dall'utente — nessun messaggio */
            } else if (msg.indexOf("HTTP 413") >= 0) {
              addMessage("ai", "Foto troppo grande (max ~4MB). Ritaglia o riduci la risoluzione e riprova.");
            } else if (msg.indexOf("HTTP 400") >= 0) {
              addMessage("ai", "Richiesta non valida. Prova a descrivere il problema in modo diverso.");
            } else if (msg.indexOf("HTTP 429") >= 0) {
              addMessage("ai", "Troppe richieste. Aspetta qualche secondo e riprova.");
            } else if (msg.indexOf("HTTP 5") >= 0) {
              addMessage("ai", "Errore server temporaneo. Riprova tra un momento.");
            } else if (msg.toLowerCase().indexOf("failed to fetch") >= 0 || msg.toLowerCase().indexOf("network") >= 0) {
              addMessage("ai", "Connessione assente o server irraggiungibile. Verifica la rete e riprova.");
            } else {
              addMessage("ai", "Errore: " + msg);
            }

            var isAbort = msg.toLowerCase().indexOf("abort") >= 0;
            setStatus(isAbort ? "Annullato" : "Errore");
            return sleep(750).then(function () { setStatus("Pronto"); });
          })
          .finally(function () {
            setBusy(false);
          });
      });
    }
  }

  if (newChatBtn) {
    newChatBtn.addEventListener("click", function () {
      startNewChat();
    });
  }

  setStatus("Pronto");
  loadConversationOnStart();

  // ===== PWA: registra service worker =====
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/service-worker.js")
        .then(function (reg) { console.log("SW registrato:", reg.scope); })
        .catch(function (err) { console.warn("SW non registrato:", err); });
    });
  }
})();