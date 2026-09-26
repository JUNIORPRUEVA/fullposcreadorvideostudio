import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

/*
 * Fase 33: prueba de fidelidad. Falla si alguien vuelve a poner opacidad,
 * filtros, blur o recorte sobre la capa de la captura.
 */

function templateSource() {
  const candidates = [
    new URL("../../src/templates/GeneralVideoTemplates.tsx", import.meta.url),
    new URL("./GeneralVideoTemplates.tsx", import.meta.url)
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("No se encontro GeneralVideoTemplates.tsx");
  return readFileSync(found, "utf8");
}

function functionBody(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `no se encontro ${name}`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("la capa de la captura no lleva opacidad, filtros ni blur", () => {
  const body = functionBody(templateSource(), "MediaSurface");
  for (const forbidden of ["opacity", "filter:", "blur(", "backdropFilter", "mixBlendMode", "saturate(", "brightness("]) {
    assert.equal(body.includes(forbidden), false, `MediaSurface no debe usar "${forbidden}"`);
  }
});

test("la captura nunca se recorta (sin objectFit cover)", () => {
  const body = functionBody(templateSource(), "MediaSurface");
  assert.equal(body.includes('objectFit: "cover"'), false, "la captura no debe recortarse con cover");
  assert.equal(body.includes("objectFit"), false, "el tamano natural limitado por el marco ya equivale a contain");
  assert.ok(body.includes('maxWidth: "100%"') && body.includes('maxHeight: "100%"'));
});

test("el rail es color solido de marca y el lienzo es navy profundo", () => {
  const source = templateSource();
  const body = functionBody(source, "InstructionScene");
  assert.ok(body.includes("SCENE_CANVAS_BACKGROUND"), "el lienzo debe usar el token de fondo solido");
  assert.ok(body.includes("readableTextOn"), "el texto del rail debe calcular contraste");
  assert.equal(body.includes("backdropFilter"), false);
  assert.equal(body.includes("backgroundImage"), false);
  // Nada de derivar el color del rail de la propia captura.
  assert.equal(body.includes("sceneAsset(payload, scene)") && body.includes("rail ="), false);
});

test("el texto narrativo vive en el footer y no se duplica", () => {
  const body = functionBody(templateSource(), "InstructionScene");
  assert.ok(body.includes("footerCaption(scene)"));
  assert.ok(body.includes("suppressText={caption.primary}"), "los subtitulos deben deduplicar contra el footer");
  // La escena de curso ya no pinta el parrafo de narracion en la columna.
  assert.equal(body.includes("scene.narrationScript"), false, "la narracion no debe pintarse en la columna izquierda");
});
