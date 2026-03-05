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
  var exportBtn  = document.getElementById("exportBtn");
  var historyBtn = document.getElementById("historyBtn");
  var historyPanel = document.getElementById("historyPanel");
  var historyOverlay = document.getElementById("historyOverlay");
  var historyCloseBtn = document.getElementById("historyCloseBtn");
  var historyList = document.getElementById("historyList");
  var historySearch = document.getElementById("historySearch");

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
    // T4: disable send quando non c'è nulla da inviare
    updateSendState();
  }

  // T4: aggiorna stato del sendBtn in base al contenuto
  function updateSendState() {
    if (!sendBtn) return;
    if (_busy) return; // durante busy il bottone è "Annulla"
    var hasText = textInput && textInput.value && textInput.value.trim().length > 0;
    var hasImg = !!selectedBlob;
    sendBtn.disabled = !(hasText || hasImg);
    sendBtn.style.opacity = (hasText || hasImg) ? "1" : "0.4";
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
        sendBtn.style.opacity = "1";
      } else {
        sendBtn.textContent = "Invia";
        sendBtn.classList.remove("danger");
        sendBtn.classList.add("primary");
        updateSendState();
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
    updateSendState();
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
    updateSendState();
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

  function candidateDeleteEndpoints(convId) {
    var path = "/api/conversations/" + encodeURIComponent(convId);
    if (isProdSameOrigin()) return [location.origin + path];
    return [location.origin + path, "http://localhost:3000" + path];
  }

  function renameConversationApi(convId, title) {
    var urls = candidateDeleteEndpoints(convId); // stesso path PATCH
    var lastErr = null;
    function tryOne(i) {
      if (i >= urls.length) return Promise.reject(lastErr || new Error("Errore rete"));
      return fetch(urls[i], {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title })
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .catch(function (e) { lastErr = e; return tryOne(i + 1); });
    }
    return tryOne(0);
  }

  function deleteConversationApi(convId) {
    var urls = candidateDeleteEndpoints(convId);
    var lastErr = null;
    function tryOne(i) {
      if (i >= urls.length) return Promise.reject(lastErr || new Error("Errore rete"));
      return fetch(urls[i], { method: "DELETE" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .catch(function (e) { lastErr = e; return tryOne(i + 1); });
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
        html += '<div class="history-item-title" data-title-id="' + escapeHtml(id) + '">' + escapeHtml(title) + '</div>';
        if (date) html += '<div class="history-item-date">' + escapeHtml(date) + '</div>';
        html += '</div>';
        html += '<button class="history-item-edit" type="button" title="Rinomina" data-edit-id="' + escapeHtml(id) + '">\u270F</button>';
        html += '<button class="history-item-del" type="button" title="Elimina conversazione" data-del-id="' + escapeHtml(id) + '">\u2715</button>';
        html += '</div>';
      }
      historyList.innerHTML = html;
      filterHistoryList();

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
      // Click su pulsante modifica titolo — editing inline
      var editBtns = historyList.querySelectorAll(".history-item-edit");
      for (var m = 0; m < editBtns.length; m++) {
        (function (btn) {
          btn.addEventListener("click", function (e) {
            e.stopPropagation();
            var editId = btn.getAttribute("data-edit-id");
            if (!editId) return;

            var titleDiv = historyList.querySelector(".history-item-title[data-title-id='" + editId + "']");
            if (!titleDiv || titleDiv.querySelector("input")) return; // già in editing

            var originalText = titleDiv.textContent || "";
            titleDiv.innerHTML = "";
            var inp = document.createElement("input");
            inp.type = "text";
            inp.className = "history-item-title-input";
            inp.value = originalText;
            titleDiv.appendChild(inp);
            inp.focus();
            inp.select();

            var saved = false;

            function save() {
              if (saved) return;
              saved = true;
              var newTitle = inp.value.trim().slice(0, 80);
              if (!newTitle || newTitle === originalText) {
                titleDiv.innerHTML = escapeHtml(originalText);
                return;
              }
              titleDiv.textContent = newTitle;
              renameConversationApi(editId, newTitle)
                .catch(function () {
                  titleDiv.textContent = originalText; // ripristina su errore
                });
            }

            function cancel() {
              if (saved) return;
              saved = true;
              titleDiv.textContent = originalText;
            }

            inp.addEventListener("keydown", function (ev) {
              if (ev.key === "Enter") { ev.preventDefault(); save(); }
              if (ev.key === "Escape") { cancel(); }
            });
            inp.addEventListener("blur", save);
          });
        })(editBtns[m]);
      }

      // Click su pulsante elimina (due tocchi: prima confirm, poi delete)
      var delBtns = historyList.querySelectorAll(".history-item-del");
      for (var k = 0; k < delBtns.length; k++) {
        (function (btn) {
          var confirmTimer = null;
          btn.addEventListener("click", function (e) {
            e.stopPropagation(); // non aprire la conversazione
            var delId = btn.getAttribute("data-del-id");
            if (!delId) return;

            if (btn.classList.contains("confirm")) {
              // Secondo tocco → elimina davvero
              clearTimeout(confirmTimer);
              btn.classList.remove("confirm");
              btn.disabled = true;
              btn.textContent = "\u2026";
              deleteConversationApi(delId)
                .then(function () {
                  // Se era la conversazione corrente, resetta chat
                  if (String(conversationId) === String(delId)) {
                    conversationId = null;
                    localStorage.removeItem("conversation_id");
                    conversationHistory = [];
                    clearChatUi();
                    addMessage("ai", "Conversazione eliminata. Puoi iniziarne una nuova.");
                  }
                  loadHistoryList();
                })
                .catch(function () {
                  btn.disabled = false;
                  btn.textContent = "\u2715";
                  btn.classList.remove("confirm");
                });
            } else {
              // Primo tocco → chiedi conferma
              btn.classList.add("confirm");
              btn.textContent = "?";
              confirmTimer = setTimeout(function () {
                btn.classList.remove("confirm");
                btn.textContent = "\u2715";
              }, 3000);
            }
          });
        })(delBtns[k]);
      }
    }).catch(function () {
      historyList.innerHTML = '<div class="history-empty">Impossibile caricare lo storico.</div>';
    });
  }

  if (historyBtn) historyBtn.addEventListener("click", openHistoryPanel);
  if (historyCloseBtn) historyCloseBtn.addEventListener("click", closeHistoryPanel);
  if (historyOverlay) historyOverlay.addEventListener("click", closeHistoryPanel);

  // ===== RICERCA STORICO =====
  function filterHistoryList() {
    if (!historySearch || !historyList) return;
    var q = (historySearch.value || "").toLowerCase().trim();
    var items = historyList.querySelectorAll(".history-item");
    for (var i = 0; i < items.length; i++) {
      var titleEl = items[i].querySelector(".history-item-title");
      var text = titleEl ? (titleEl.textContent || "").toLowerCase() : "";
      items[i].style.display = (!q || text.indexOf(q) !== -1) ? "" : "none";
    }
  }
  if (historySearch) historySearch.addEventListener("input", filterHistoryList);

  // ===== EXPORT CONVERSAZIONE (TXT / JSON / PDF) =====
  if (exportBtn) {
    // Wrap button in .export-wrap and create dropdown
    var exportWrap = document.createElement("div");
    exportWrap.className = "export-wrap";
    exportBtn.parentNode.insertBefore(exportWrap, exportBtn);
    exportWrap.appendChild(exportBtn);

    var exportMenu = document.createElement("div");
    exportMenu.className = "export-menu";
    exportMenu.innerHTML =
      "<button id=\"exportTxt\">📄 Testo (.txt)</button>" +
      "<button id=\"exportJson\">📦 JSON</button>" +
      "<button id=\"exportPdf\">📕 PDF</button>";
    exportWrap.appendChild(exportMenu);

    exportBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      exportMenu.classList.toggle("open");
    });
    document.addEventListener("click", function () {
      exportMenu.classList.remove("open");
    });

    function collectLines() {
      var msgs = chat ? chat.querySelectorAll(".msg") : [];
      var lines = ["IA Wire Pro — Report Diagnostico", "Data: " + new Date().toLocaleString("it-IT"), "---", ""];
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        if (m.id === "welcomeMsg") continue;
        var isUser = m.classList.contains("user");
        var bubble = m.querySelector(".bubble");
        if (!bubble) continue;
        var txt = (bubble.innerText || bubble.textContent || "").trim();
        if (!txt) continue;
        lines.push((isUser ? "[TU]     " : "[ROCCO]  ") + txt);
        lines.push("");
      }
      return lines;
    }

    function triggerDownload(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function exportTs() {
      return new Date().toISOString().slice(0, 16).replace("T", "_").replace(/:/g, "-");
    }

    document.getElementById("exportTxt").addEventListener("click", function () {
      exportMenu.classList.remove("open");
      var lines = collectLines();
      if (lines.length <= 4) return;
      triggerDownload(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), "iawire_" + exportTs() + ".txt");
    });

    document.getElementById("exportJson").addEventListener("click", function () {
      exportMenu.classList.remove("open");
      if (!conversationHistory.length) return;
      var payload = JSON.stringify({
        conversation_id: conversationId,
        exported_at: new Date().toISOString(),
        messages: conversationHistory
      }, null, 2);
      triggerDownload(new Blob([payload], { type: "application/json" }), "iawire_" + exportTs() + ".json");
    });

    document.getElementById("exportPdf").addEventListener("click", function () {
      exportMenu.classList.remove("open");
      var lines = collectLines();
      if (lines.length <= 4) return;
      try {
        var jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!jsPDF) { alert("jsPDF non caricato. Verifica la connessione internet."); return; }
        var doc = new jsPDF({ unit: "mm", format: "a4" });
        var margin = 15;
        var pageW = 210;
        var maxW = pageW - margin * 2;
        var y = margin;
        var lineH = 5.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(14);
        doc.setTextColor(10, 30, 60);
        doc.text("IA Wire Pro — Report Diagnostico", margin, y);
        y += 8;
        doc.setFontSize(9);
        doc.setTextColor(100, 120, 140);
        doc.text("Generato: " + new Date().toLocaleString("it-IT"), margin, y);
        y += 8;
        doc.setDrawColor(0, 180, 220);
        doc.line(margin, y, pageW - margin, y);
        y += 6;
        for (var i = 3; i < lines.length; i++) {
          var raw = lines[i];
          if (!raw) { y += 3; continue; }
          var isRocco = raw.indexOf("[ROCCO]") === 0;
          var isUser  = raw.indexOf("[TU]") === 0;
          doc.setFontSize(9);
          if (isRocco) { doc.setTextColor(0, 140, 180); }
          else if (isUser) { doc.setTextColor(200, 100, 20); }
          else { doc.setTextColor(60, 60, 60); }
          var wrapped = doc.splitTextToSize(raw, maxW);
          if (y + wrapped.length * lineH > 280) {
            doc.addPage();
            y = margin;
          }
          doc.text(wrapped, margin, y);
          y += wrapped.length * lineH;
        }
        doc.save("iawire_" + exportTs() + ".pdf");
      } catch (e) {
        alert("Errore generazione PDF: " + e.message);
      }
    });
  }

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
        if (sendBtn && !sendBtn.disabled) sendBtn.click();
      }
    });
    // T4: su mobile, quando la tastiera si apre, scroll chat al fondo
    textInput.addEventListener("focus", function () {
      setTimeout(function () {
        if (chat) {
          try { chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" }); }
          catch (e) { chat.scrollTop = chat.scrollHeight; }
        }
      }, 300);
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
          updateSendState();
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
            var msgResult = addMessage("ai", ans, {
              provider: data.provider,
              model: data.model,
              fallback_used: !!data.fallback_used
            });

            // ROCCO chip — mostra pattern/ipotesi top rilevati dal Foundation Engine
            if (data.foundation && !data.foundation.outOfScope && msgResult && msgResult.wrapper) {
              var chipParts = [];
              if (data.foundation.patternId) {
                chipParts.push("⚡ " + String(data.foundation.patternId).replace(/_/g, " "));
              }
              if (data.foundation.topHypothesis) {
                chipParts.push("→ " + String(data.foundation.topHypothesis));
              }
              if (data.foundation.components && data.foundation.components.length) {
                chipParts.push("🔧 " + data.foundation.components.join(", "));
              }
              if (chipParts.length) {
                var chip = document.createElement("div");
                chip.className = "rocco-chip";
                chip.title = chipParts.join(" · ");
                chip.textContent = chipParts.join("  ·  ");
                msgResult.wrapper.appendChild(chip);
              }
            }

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
  updateSendState();
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