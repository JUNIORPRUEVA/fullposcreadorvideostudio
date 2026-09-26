/**
 * Logging helpers with a hard no-secrets guarantee.
 * Every line printed by the lab passes through `redact()`.
 */

const PRESENCE_VALUES = new Set(["yes", "no", "true", "false", "undefined", "null", "n/a", "<redacted>"]);

const SECRET_PATTERNS = [
  // RunPod API keys
  { pattern: /\brpa_[A-Za-z0-9_-]{6,}\b/g, replacement: "rpa_<redacted>" },
  // AWS / R2 signing material
  { pattern: /X-Amz-Signature=[A-Za-z0-9%]+/gi, replacement: "X-Amz-Signature=<redacted>" },
  { pattern: /X-Amz-Credential=[^&\s"']+/gi, replacement: "X-Amz-Credential=<redacted>" },
  { pattern: /X-Amz-Security-Token=[^&\s"']+/gi, replacement: "X-Amz-Security-Token=<redacted>" },
  { pattern: /X-Amz-SignedHeaders=[^&\s"']+/gi, replacement: "X-Amz-SignedHeaders=<redacted>" },
  // key/value leaks in JSON or env dumps. Presence flags such as `KEY=YES` are
  // deliberately left readable - they are the point of the audit output.
  {
    pattern: /("?(?:apiKey|API_KEY|RUNPOD_API_KEY|secretAccessKey|R2_SECRET_ACCESS_KEY|accessKeyId|R2_ACCESS_KEY_ID|JWT_SECRET|OWNER_PASSWORD)"?\s*[:=]\s*"?)([^\s",'}\]]+)/g,
    replacement: (_match, prefix, value) =>
      PRESENCE_VALUES.has(String(value).toLowerCase()) ? `${prefix}${value}` : `${prefix}<redacted>`
  }
];

export function redact(value) {
  let text = typeof value === "string" ? value : String(value);
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const dim = paint("2");
const bold = paint("1");
const green = paint("32");
const yellow = paint("33");
const red = paint("31");
const cyan = paint("36");

function emit(stream, line) {
  stream.write(`${redact(line)}\n`);
}

export const log = {
  banner(title) {
    emit(process.stdout, `\n${bold(title)}\n${dim("=".repeat(title.length + 2))}`);
  },
  section(title) {
    emit(process.stdout, `\n${bold(title)}`);
  },
  step(message) {
    emit(process.stdout, `${cyan(">")} ${message}`);
  },
  info(message) {
    emit(process.stdout, `  ${message}`);
  },
  detail(message) {
    emit(process.stdout, `  ${dim(message)}`);
  },
  pass(message) {
    emit(process.stdout, `  ${green("PASS")} ${message}`);
  },
  warn(message) {
    emit(process.stdout, `  ${yellow("WARN")} ${message}`);
  },
  fail(message) {
    emit(process.stderr, `  ${red("FAIL")} ${message}`);
  },
  error(message) {
    emit(process.stderr, `\n${red("Error:")} ${message}`);
  },
  keyValue(key, value) {
    emit(process.stdout, `  ${key.padEnd(26)} ${value}`);
  },
  raw(line = "") {
    emit(process.stdout, line);
  }
};

/** Trims a presigned URL down to something safe to display. */
export function maskUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}?<signed>`;
  } catch {
    return "<unparsable-url>";
  }
}
