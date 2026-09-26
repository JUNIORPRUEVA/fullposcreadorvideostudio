import assert from "node:assert/strict";
import test from "node:test";
import { toSceneJsonColumn } from "./scene-json.js";

test("un array se guarda como JSON valido", () => {
  assert.equal(toSceneJsonColumn([{ start: 0, end: 3, text: "Hola" }]), '[{"start":0,"end":3,"text":"Hola"}]');
  assert.equal(toSceneJsonColumn([{ type: "HighlightBox", x: 10 }]), '[{"type":"HighlightBox","x":10}]');
  assert.equal(toSceneJsonColumn("[]"), "[]");
});

test("un texto JSON se normaliza (nunca se guarda tal cual)", () => {
  assert.equal(toSceneJsonColumn('[{"start":0,"end":3,"text":"Hola"}]'), '[{"start":0,"end":3,"text":"Hola"}]');
  assert.equal(toSceneJsonColumn('{"focus":[]}'), '{"focus":[]}');
});

test("texto que no es JSON no se persiste (evita romper UI y render)", () => {
  assert.equal(toSceneJsonColumn("texto suelto"), undefined);
  assert.equal(toSceneJsonColumn(""), undefined);
  assert.equal(toSceneJsonColumn("   "), undefined);
  assert.equal(toSceneJsonColumn(null), undefined);
  assert.equal(toSceneJsonColumn(undefined), undefined);
});
