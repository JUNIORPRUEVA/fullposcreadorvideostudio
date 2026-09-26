import assert from "node:assert/strict";
import test from "node:test";
import { shouldSeedStarterScenes, starterScenesFor } from "./starter-scenes.js";

test("un proyecto armado con archivos propios nace SIN pasos starter", () => {
  assert.deepEqual(starterScenesFor("COURSE"), []);
  assert.deepEqual(starterScenesFor("COURSE", false), []);
  assert.deepEqual(starterScenesFor("QUICK_TUTORIAL"), []);
  assert.deepEqual(starterScenesFor("AD"), []);
});

test("solo se siembran si el cliente lo pide explicitamente", () => {
  assert.equal(shouldSeedStarterScenes(true), true);
  assert.equal(shouldSeedStarterScenes("true"), false);
  assert.equal(shouldSeedStarterScenes(1), false);
  assert.equal(shouldSeedStarterScenes(undefined), false);

  const course = starterScenesFor("COURSE", true);
  assert.equal(course.length, 8);
  assert.deepEqual(
    course.map((scene) => scene.title),
    ["Intro", "Abrir facturación", "Buscar producto", "Agregar producto", "Seleccionar cliente", "Cobrar", "Confirmación", "Resumen"]
  );
  assert.equal(starterScenesFor("QUICK_TUTORIAL", true).length, 4);
  assert.equal(starterScenesFor("AD", true).length, 3);
});
