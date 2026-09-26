import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPTION_MAX_LINES,
  CAPTION_PRIMARY_SIZE,
  COURSE_SCENE_COMPOSITION,
  footerCaption,
  isMeaningfulCaption,
  railModule,
  readableTextOn,
  sceneNumberLabel,
  screenshotFrame,
  screenshotWidthShare
} from "./composition.js";

test("la captura ocupa la gran mayoria del ancho y no tapa rail ni footer", () => {
  const box = screenshotFrame();
  const share = screenshotWidthShare();
  assert.ok(share >= 0.8 && share <= 0.85, `ancho de captura fuera de rango: ${share}`);
  assert.equal(box.x, COURSE_SCENE_COMPOSITION.railWidth + COURSE_SCENE_COMPOSITION.margin);
  assert.equal(box.y, COURSE_SCENE_COMPOSITION.margin);
  assert.equal(box.x + box.width + COURSE_SCENE_COMPOSITION.margin, COURSE_SCENE_COMPOSITION.canvasWidth);
  assert.equal(box.y + box.height + COURSE_SCENE_COMPOSITION.footerHeight + COURSE_SCENE_COMPOSITION.margin, COURSE_SCENE_COMPOSITION.canvasHeight);
});

test("footer y rail quedan dentro de los rangos pedidos", () => {
  assert.ok(COURSE_SCENE_COMPOSITION.footerHeight >= 72 && COURSE_SCENE_COMPOSITION.footerHeight <= 96);
  assert.ok(COURSE_SCENE_COMPOSITION.railWidth >= 15 * 19.2 && COURSE_SCENE_COMPOSITION.railWidth <= 20 * 19.2);
  assert.ok(CAPTION_PRIMARY_SIZE >= 26 && CAPTION_PRIMARY_SIZE <= 34);
  assert.equal(CAPTION_MAX_LINES, 1);
});

test("Fase 7: no se renderizan titulos genericos ni nombres de archivo", () => {
  assert.equal(isMeaningfulCaption("Nueva escena"), false);
  assert.equal(isMeaningfulCaption("nueva escena"), false);
  assert.equal(isMeaningfulCaption("Paso 3"), false);
  assert.equal(isMeaningfulCaption("image-b6271a45-7f6a-4b78-a192-82112e455a4a.png"), false);
  assert.equal(isMeaningfulCaption(""), false);
  assert.equal(isMeaningfulCaption("Registrar una venta"), true);
});

test("el texto del footer sale de la narrativa real del paso", () => {
  assert.deepEqual(footerCaption({ narrationScript: "Abre facturación." }), { primary: "Abre facturación.", secondary: "" });
  assert.deepEqual(footerCaption({ narrationScript: "Abre facturación. Busca el producto." }), { primary: "Abre facturación.", secondary: "Busca el producto." });
  // Sin narrativa, solo se usa el titulo si aporta valor.
  assert.deepEqual(footerCaption({ title: "Registrar una venta" }), { primary: "Registrar una venta", secondary: "" });
  assert.deepEqual(footerCaption({ title: "Nueva escena" }), { primary: "", secondary: "" });
});

test("el rail solo lleva modulo corto (nada narrativo)", () => {
  assert.equal(railModule({ chapter: "Facturación" }), "Facturación");
  assert.equal(railModule({ chapter: "", title: "Nueva escena" }), "");
  assert.equal(railModule({ chapter: "Un capitulo con un nombre larguisimo de verdad" }).length <= 22, true);
  assert.equal(sceneNumberLabel(0), "01");
  assert.equal(sceneNumberLabel(11), "12");
});

test("texto legible sobre color solido de marca", () => {
  assert.equal(readableTextOn("#1457d9"), "#ffffff");
  assert.equal(readableTextOn("#ffffff"), "#0b1728");
  assert.equal(readableTextOn("no-es-un-color"), "#ffffff");
});
