import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encoderScenario, decoderScenario } from './url.js';

test('scenario vide -> chaîne vide', () => {
  assert.equal(encoderScenario({}), '');
});

test('paramètre vide -> scenario vide', () => {
  assert.deepEqual(decoderScenario(''), {});
  assert.deepEqual(decoderScenario(null), {});
});

test('aller-retour : decoderScenario(encoderScenario(x)) === x', () => {
  const scenario = {
    gaz_chaudiere: { repartition_simulee: 0.42, verrou: false },
    pac_nucleaire: { repartition_simulee: 0.31, verrou: true },
  };
  const encode = encoderScenario(scenario);
  assert.ok(encode.length > 0);
  assert.deepEqual(decoderScenario(encode), scenario);
});

test("l'encodage ne contient aucun caractère invalide dans une URL (+ / =)", () => {
  const scenario = { a: { repartition_simulee: 0.999999, verrou: false } };
  const encode = encoderScenario(scenario);
  assert.doesNotMatch(encode, /[+/=]/);
});

test('paramètre corrompu -> scenario vide plutôt qu\'une exception', () => {
  assert.deepEqual(decoderScenario('!!!pas-du-base64!!!'), {});
});
