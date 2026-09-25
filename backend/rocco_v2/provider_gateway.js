"use strict";

var path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

var Anthropic = require("@anthropic-ai/sdk");
var OpenAI = require("openai");
var Ollama = require("ollama").Ollama;

function buildDefaultAdapters() {
  var adapters = [];
  var openaiKey = String(process.env.OPENAI_API_KEY || "").trim();
  var anthropicKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
  var ollamaUrl = String(process.env.OLLAMA_URL || "http://localhost:11434").trim();
  var openaiModel = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  var anthropicModel = String(process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001").trim();
  var ollamaModel = String(process.env.OLLAMA_MODEL || "mistral").trim();
  var openaiClient;
  var anthropicClient;
  var ollamaClient;

  if (openaiKey) {
    openaiClient = new OpenAI({ apiKey: openaiKey });
    adapters.push({
      name: "openai",
      model: openaiModel,
      chat: function (payload) {
        return openaiClient.chat.completions.create({
          model: openaiModel,
          temperature: 0.1,
          max_tokens: 900,
          messages: [
            { role: "system", content: payload.system_prompt },
            { role: "user", content: payload.user_prompt }
          ]
        }).then(function (response) {
          var choice = response && response.choices && response.choices[0];
          var text = choice && choice.message ? choice.message.content : "";
          return { text: String(text || ""), model: openaiModel };
        });
      },
      ocr: function (payload) {
        return openaiClient.chat.completions.create({
          model: openaiModel,
          temperature: 0,
          max_tokens: 250,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: payload.prompt },
              { type: "image_url", image_url: { url: payload.image_data_url, detail: "high" } }
            ]
          }]
        }).then(function (response) {
          var choice = response && response.choices && response.choices[0];
          var text = choice && choice.message ? choice.message.content : "";
          return { text: String(text || ""), model: openaiModel };
        });
      }
    });
  }

  if (anthropicKey) {
    anthropicClient = new Anthropic({ apiKey: anthropicKey });
    adapters.push({
      name: "anthropic",
      model: anthropicModel,
      chat: function (payload) {
        return anthropicClient.messages.create({
          model: anthropicModel,
          max_tokens: 900,
          temperature: 0.1,
          system: payload.system_prompt,
          messages: [{ role: "user", content: payload.user_prompt }]
        }).then(function (response) {
          var blocks = Array.isArray(response && response.content) ? response.content : [];
          var text = blocks.filter(function (block) {
            return block && block.type === "text";
          }).map(function (block) {
            return block.text;
          }).join("\n");
          return { text: String(text || ""), model: anthropicModel };
        });
      },
      ocr: function (payload) {
        return anthropicClient.messages.create({
          model: anthropicModel,
          max_tokens: 250,
          temperature: 0,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: payload.mime_type, data: payload.image_b64 } },
              { type: "text", text: payload.prompt }
            ]
          }]
        }).then(function (response) {
          var blocks = Array.isArray(response && response.content) ? response.content : [];
          var text = blocks.filter(function (block) {
            return block && block.type === "text";
          }).map(function (block) {
            return block.text;
          }).join("\n");
          return { text: String(text || ""), model: anthropicModel };
        });
      }
    });
  }

  ollamaClient = new Ollama({ host: ollamaUrl });
  adapters.push({
    name: "ollama",
    model: "ollama:" + ollamaModel,
    chat: function (payload) {
      return ollamaClient.chat({
        model: ollamaModel,
        stream: false,
        options: { temperature: 0.1 },
        messages: [
          { role: "system", content: payload.system_prompt },
          { role: "user", content: payload.user_prompt }
        ]
      }).then(function (response) {
        var text = response && response.message ? response.message.content : "";
        return { text: String(text || ""), model: "ollama:" + ollamaModel };
      });
    },
    ocr: function () {
      return Promise.reject(new Error("ocr_not_supported"));
    }
  });

  return adapters;
}

function reorder(queue, firstName) {
  var ordered = [];
  var i;

  for (i = 0; i < queue.length; i += 1) {
    if (queue[i].name === firstName) ordered.push(queue[i]);
  }
  for (i = 0; i < queue.length; i += 1) {
    if (queue[i].name !== firstName) ordered.push(queue[i]);
  }
  return ordered;
}

function buildQueue(adapters, requestedProvider) {
  var requested = String(requestedProvider || "").toLowerCase().trim();
  var available = adapters.filter(function (adapter) {
    return adapter && typeof adapter.chat === "function";
  });
  var preferred = String(process.env.PREFERRED_PROVIDER || "openai").toLowerCase().trim();

  if (!available.length) return [];
  if (requested) return reorder(available, requested);
  return reorder(available, preferred);
}

function executeSequential(queue, methodName, payload, previousErrors) {
  var index = 0;
  var errors = previousErrors || [];

  function next() {
    var adapter;
    if (index >= queue.length) {
      return Promise.reject({
        message: "provider_unavailable",
        attempts: errors
      });
    }

    adapter = queue[index];
    index += 1;

    if (typeof adapter[methodName] !== "function") {
      errors.push({ provider: adapter.name, reason: methodName + "_unsupported" });
      return next();
    }

    return adapter[methodName](payload).then(function (result) {
      return {
        ok: true,
        text: result.text,
        provider_used: adapter.name,
        model_used: result.model || adapter.model || null,
        attempts: errors.slice(0),
        fallback_used: errors.length > 0,
        fallback_reason: errors.length > 0 ? "provider_switch" : null
      };
    }).catch(function (error) {
      errors.push({
        provider: adapter.name,
        reason: String(error && error.message || error || "provider_error")
      });
      return next();
    });
  }

  return next();
}

function createGateway(options) {
  var settings = options || {};
  var adapters = Array.isArray(settings.adapters) ? settings.adapters.slice(0) : buildDefaultAdapters();

  return {
    buildQueue: function (requestedProvider) {
      return buildQueue(adapters, requestedProvider);
    },
    runReasoner: function (payload) {
      var queue = buildQueue(adapters, payload && payload.requested_provider);
      return executeSequential(queue, "chat", payload || {}, []);
    },
    runOcr: function (payload) {
      var queue = buildQueue(adapters, payload && payload.requested_provider);
      return executeSequential(queue, "ocr", payload || {}, []);
    }
  };
}

module.exports = {
  createGateway: createGateway,
  createDefaultGateway: createGateway
};
