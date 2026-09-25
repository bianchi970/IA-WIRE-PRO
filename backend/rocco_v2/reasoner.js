"use strict";

function execute(providerGateway, payload) {
  if (!providerGateway || typeof providerGateway.runReasoner !== "function") {
    return Promise.reject(new Error("provider_gateway_missing"));
  }
  return providerGateway.runReasoner(payload || {});
}

module.exports = {
  execute: execute
};
