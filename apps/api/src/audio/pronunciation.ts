export const pronunciationDictionary: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bRD\$\s*1[,.]?000\s*\/\s*mes\b/gi, replacement: "mil pesos dominicanos al mes" },
  { pattern: /\bRD\$\s*1[,.]?000\b/gi, replacement: "mil pesos dominicanos" },
  { pattern: /\bRD\$\s*(\d+)\s*\/\s*mes\b/gi, replacement: "$1 pesos dominicanos al mes" },
  { pattern: /\bRD\$\s*(\d+)\b/gi, replacement: "$1 pesos dominicanos" },
  { pattern: /\b7\s+d[ií]as\s+gratis\b/gi, replacement: "siete días gratis" },
  { pattern: /\bAndroid\b/gi, replacement: "An-droid" },
  { pattern: /\biPhone\b/gi, replacement: "ai fon" },
  { pattern: /\bPC\b/g, replacement: "computadora" },
  { pattern: /\bPWA\b/g, replacement: "aplicación web progresiva" },
  { pattern: /\bsoftware\b/gi, replacement: "sóftwer" },
  { pattern: /\bfacturación\b/gi, replacement: "facturación" }
];

export function prepareTextForSpeech(text: string, extraDictionary: Array<{ writtenText: string; spokenText: string }> = []) {
  const withBrandTerms = extraDictionary.reduce((current, entry) => {
    if (!entry.writtenText.trim()) return current;
    return current.replace(new RegExp(`\\b${escapeRegExp(entry.writtenText)}\\b`, "gi"), entry.spokenText);
  }, text);
  return pronunciationDictionary.reduce((current, entry) => current.replace(entry.pattern, entry.replacement), withBrandTerms);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
