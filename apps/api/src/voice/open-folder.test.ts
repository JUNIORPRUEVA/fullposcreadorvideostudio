import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { openInExplorer, resolveGeneratedAudioFolder } from "./open-folder.js";

/*
 * "Abrir carpeta" lanza un proceso del sistema: estas pruebas fijan las dos reglas
 * que importan: (1) el navegador no puede colar una ruta y (2) nunca se usa un shell.
 */

function tempRoot() {
  const directory = mkdtempSync(path.join(tmpdir(), "voice-open-folder-"));
  return { directory, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

// ------------------------------------------------------------- resolucion

test("sin carpeta se abre la raiz de audios generados", () => {
  const root = tempRoot();
  try {
    for (const input of [undefined, null, "", "   ", 42, {}, []]) {
      const resolution = resolveGeneratedAudioFolder(input, { root: root.directory });
      assert.equal(resolution.ok, true, `fallo con ${JSON.stringify(input)}`);
      if (resolution.ok) {
        assert.equal(resolution.folder, null);
        assert.equal(resolution.directory, root.directory);
        assert.equal(resolution.relative, "storage/generated-audio");
      }
    }
  } finally {
    root.cleanup();
  }
});

test("se acepta una carpeta de fecha y la de previews", () => {
  const root = tempRoot();
  try {
    for (const folder of ["2026-09-22", "previews"]) {
      const target = path.join(root.directory, folder);
      mkdirSync(target, { recursive: true });
      const resolution = resolveGeneratedAudioFolder(folder, { root: root.directory });
      assert.equal(resolution.ok, true, `deberia aceptar ${folder}`);
      if (resolution.ok) {
        assert.equal(resolution.folder, folder);
        assert.equal(resolution.directory, target);
        assert.equal(resolution.relative, `storage/generated-audio/${folder}`);
      }
    }
  } finally {
    root.cleanup();
  }
});

test("una carpeta con forma valida pero inexistente no se inventa", () => {
  const root = tempRoot();
  try {
    for (const folder of ["1999-01-01", "2026-13-99"]) {
      const resolution = resolveGeneratedAudioFolder(folder, { root: root.directory });
      assert.equal(resolution.ok, false);
      if (!resolution.ok) assert.equal(resolution.reason, "missing");
    }
  } finally {
    root.cleanup();
  }
});

test("ninguna ruta arbitraria es aceptada", () => {
  const root = tempRoot();
  try {
    const attacks = [
      "..",
      "../..",
      "../../apps/api/.env",
      "..\\..\\windows",
      "2026-09-22/../../..",
      "2026-09-22\\..\\..",
      "/etc/passwd",
      "C:\\Windows\\System32",
      "\\\\servidor\\recurso",
      "storage/generated-audio",
      "audios",
      "%2e%2e%2f%2e%2e",
      ".",
      "./2026-09-22",
      "2026-09-22/hijas"
    ];
    for (const attack of attacks) {
      const resolution = resolveGeneratedAudioFolder(attack, { root: root.directory });
      assert.equal(resolution.ok, false, `deberia rechazar ${attack}`);
      if (!resolution.ok) assert.equal(resolution.reason, "invalid");
    }
  } finally {
    root.cleanup();
  }
});

// --------------------------------------------------------------- explorer

test("en plataformas que no son Windows se explica en vez de fallar", () => {
  const result = openInExplorer("C:\\cualquiera", { platform: "linux", exists: () => true });
  assert.equal(result.launched, false);
  assert.match(String(result.reason), /Windows/);
});

test("si la carpeta desaparecio no se lanza nada", () => {
  const result = openInExplorer("C:\\cualquiera", { platform: "win32", exists: () => false });
  assert.equal(result.launched, false);
});

test("en Windows se lanza explorer.exe sin shell y con un unico argumento", () => {
  const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = [];
  const fakeSpawn = ((command: string, args: string[], options: Record<string, unknown>) => {
    calls.push({ command, args, options });
    return { unref: () => undefined };
  }) as never;

  const directory = "C:\\Users\\pc\\DEV\\PROYECTOS\\PRODUCTOS\\FullPOS-Ad-Studio\\storage\\generated-audio\\2026-09-22";
  const result = openInExplorer(directory, { platform: "win32", spawnFn: fakeSpawn, exists: () => true });

  assert.equal(result.launched, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "explorer.exe");
  // Un solo argumento: la ruta resuelta internamente. Nada de comandos concatenados.
  assert.deepEqual(calls[0].args, [directory]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.detached, true);
});

test("un fallo al lanzar explorer se reporta, no se propaga", () => {
  const failingSpawn = (() => {
    throw new Error("spawn ENOENT");
  }) as never;
  const result = openInExplorer("C:\\x", { platform: "win32", spawnFn: failingSpawn, exists: () => true });
  assert.equal(result.launched, false);
  assert.match(String(result.reason), /ENOENT/);
});
