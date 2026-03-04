"use strict";

/**
 * Normalizza qualsiasi valore di certezza verso i 3 livelli standard:
 *   ALTA | MEDIA | BASSA
 *
 * Gestisce sia i valori legacy ROCCO (Confermato/Probabile/Non verificabile)
 * che nuovi valori (alta/media/bassa/possibile/improbabile/ecc.)
 *
 * @param {string|null} value
 * @returns {"ALTA"|"MEDIA"|"BASSA"}
 */
function normalizeCertainty(value) {
  if (!value) return "MEDIA";

  const v = String(value).toLowerCase().trim().replace(/[\.\:\;]+$/, "");

  // ALTA
  if (v === "alta" || v === "probabile" || v === "molto probabile" ||
      v.includes("confermato") || v.includes("alta certezza")) {
    return "ALTA";
  }

  // BASSA
  if (v === "bassa" || v === "improbabile" || v.includes("bassa certezza")) {
    return "BASSA";
  }

  // MEDIA — include "media", "possibile", "non verificabile", "da_verificare"
  if (v === "media" || v === "possibile" ||
      v.includes("non verificabile") || v.includes("da_verificare") ||
      v.includes("da verificare") || v.includes("media certezza")) {
    return "MEDIA";
  }

  // Default
  return "MEDIA";
}

module.exports = { normalizeCertainty };
