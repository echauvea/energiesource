import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculer, redistribuer } from './model.js';

const data = JSON.parse(readFileSync(new URL('../data.json', import.meta.url)));

// --- Intégrité de data.json ---

test('chaque poste : la somme des repartition_reference vaut 1', () => {
  for (const poste of data.postes) {
    const somme = poste.chaines.reduce((s, c) => s + c.repartition_reference, 0);
    assert.ok(Math.abs(somme - 1) < 1e-6, `${poste.id} : somme = ${somme}`);
  }
});

// --- calculer() ---

test('sans scenario, simulé === actuel pour chaque poste (défaut = répartition de référence)', () => {
  const { parPoste } = calculer(data, {});
  for (const poste of data.postes) {
    const { simule, actuel } = parPoste[poste.id];
    assert.ok(Math.abs(simule - actuel) < 1e-6, `${poste.id} : simulé=${simule} actuel=${actuel}`);
  }
});

test('total.actuel = somme des parPoste[].actuel + hors_perimetre_mt', () => {
  const { total, parPoste } = calculer(data, {});
  const somme = Object.values(parPoste).reduce((s, p) => s + p.actuel, 0) + data.hors_perimetre_mt;
  assert.ok(Math.abs(total.actuel - somme) < 1e-6);
});

test('ecarts[p] = (actuel - observe) / observe * 100', () => {
  const { parPoste, ecarts } = calculer(data, {});
  for (const poste of data.postes) {
    const { actuel, observe } = parPoste[poste.id];
    const attendu = ((actuel - observe) / observe) * 100;
    assert.ok(Math.abs(ecarts[poste.id] - attendu) < 1e-6);
  }
});

test("chaleur des bâtiments : simulé change quand on force w^simulé(gaz_chaudiere) à 0", () => {
  const scenario = { gaz_chaudiere: { repartition_simulee: 0, verrou: false } };
  const { parPoste } = calculer(data, scenario);
  const { parPoste: parPosteRef } = calculer(data, {});
  assert.notEqual(parPoste.chaleur_batiment.simule, parPosteRef.chaleur_batiment.simule);
});

// --- redistribuer() : fixture synthétique simple pour raisonner sur des nombres ronds ---

function fixture() {
  return {
    version: 'test',
    hors_perimetre_mt: 0,
    postes: [
      {
        id: 'p1',
        nom: 'Poste test',
        volume_annuel: 1000,
        unite: 'kWh',
        emissions_constatees_mt: 100,
        facteur_procede: 0,
        chaines: [
          { id: 'a', libelle: 'A', source_primaire: 'charbon', vecteur: 'direct', convertisseur: 'x', facteur_combustion: 100, repartition_reference: 0.5, plafonne: false, plafond: null, ref: 'test', fiabilite: 'ETABLI' },
          { id: 'b', libelle: 'B', source_primaire: 'gaz', vecteur: 'direct', convertisseur: 'x', facteur_combustion: 50, repartition_reference: 0.3, plafonne: false, plafond: null, ref: 'test', fiabilite: 'ETABLI' },
          { id: 'c', libelle: 'C', source_primaire: 'nucleaire', vecteur: 'electricite', convertisseur: 'x', facteur_combustion: 10, repartition_reference: 0.2, plafonne: true, plafond: 0.25, ref: 'test', fiabilite: 'ETABLI' },
        ],
      },
    ],
  };
}

function sommeParts(scenario, chaines) {
  return chaines.reduce((s, c) => s + (scenario[c.id]?.repartition_simulee ?? c.repartition_reference), 0);
}

test('redistribution simple : la somme des parts reste à 1', () => {
  const data = fixture();
  const scenario = redistribuer(data, {}, 'a', 0.1);
  assert.ok(Math.abs(scenario.a.repartition_simulee - 0.6) < 1e-9);
  assert.ok(Math.abs(sommeParts(scenario, data.postes[0].chaines) - 1) < 1e-9);
});

test("redistribution : une chaîne sature son plafond, le surplus va sur l'autre", () => {
  const data = fixture();
  const scenario = redistribuer(data, {}, 'a', -0.15);
  assert.ok(Math.abs(scenario.a.repartition_simulee - 0.35) < 1e-9);
  assert.ok(Math.abs(scenario.c.repartition_simulee - 0.25) < 1e-9, 'c doit être bloquée à son plafond (0.25)');
  assert.ok(Math.abs(scenario.b.repartition_simulee - 0.40) < 1e-9, 'b absorbe le surplus que c ne peut plus prendre');
  assert.ok(Math.abs(sommeParts(scenario, data.postes[0].chaines) - 1) < 1e-9);
});

test('redistribution : toutes les chaînes verrouillées sauf une, elle absorbe jusqu’à son plafond puis bloque le curseur déplacé', () => {
  const data = fixture();
  const scenarioInitial = { b: { repartition_simulee: 0.3, verrou: true } };
  const scenario = redistribuer(data, scenarioInitial, 'a', -0.15);
  assert.ok(Math.abs(scenario.b.repartition_simulee - 0.3) < 1e-9, 'b verrouillée, inchangée');
  assert.ok(Math.abs(scenario.c.repartition_simulee - 0.25) < 1e-9, 'c absorbe jusqu’à son plafond');
  assert.ok(
    Math.abs(scenario.a.repartition_simulee - 0.45) < 1e-9,
    'a ne peut descendre qu’à 0.45 (pas 0.35 demandé), faute de capacité d’absorption suffisante'
  );
  assert.ok(Math.abs(sommeParts(scenario, data.postes[0].chaines) - 1) < 1e-9);
});

test('redistribution : curseur poussé au-delà du maximum atteignable, tout est verrouillé -> aucun mouvement', () => {
  const data = fixture();
  const scenarioInitial = {
    b: { repartition_simulee: 0.3, verrou: true },
    c: { repartition_simulee: 0.2, verrou: true },
  };
  const scenario = redistribuer(data, scenarioInitial, 'a', -0.2);
  assert.ok(Math.abs(scenario.a.repartition_simulee - 0.5) < 1e-9, 'a reste à sa valeur initiale');
  assert.ok(Math.abs(sommeParts(scenario, data.postes[0].chaines) - 1) < 1e-9);
});

test('redistribuer ne modifie pas le scenario reçu en argument (fonction pure)', () => {
  const data = fixture();
  const scenarioInitial = { b: { repartition_simulee: 0.3, verrou: false } };
  const copie = structuredClone(scenarioInitial);
  redistribuer(data, scenarioInitial, 'a', 0.1);
  assert.deepEqual(scenarioInitial, copie);
});
