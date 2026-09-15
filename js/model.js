// model.js — calcul pur, sans DOM. Contrat détaillé en §7.1 de conception-simulateur-sources.md.

const G_PAR_MT = 1e12; // 1 Mt CO2e = 1e12 g

function trouverChaineEtPoste(data, chaineId) {
  for (const poste of data.postes) {
    const chaine = poste.chaines.find((c) => c.id === chaineId);
    if (chaine) return { chaine, poste };
  }
  return null;
}

function partSimulee(scenario, chaine) {
  const etat = scenario[chaine.id];
  return etat ? etat.repartition_simulee : chaine.repartition_reference;
}

function estVerrouillee(scenario, chaineId) {
  return !!scenario[chaineId]?.verrou;
}

function fixerPartSimulee(scenario, chaine, valeur) {
  scenario[chaine.id] = {
    repartition_simulee: valeur,
    verrou: scenario[chaine.id]?.verrou ?? false,
  };
}

function clamp(x, min, max) {
  return Math.min(Math.max(x, min), max);
}

function borneSuperieure(chaine) {
  return chaine.plafonne ? chaine.plafond : 1;
}

// E_p = V_p × [ Σ part(chaîne) × F(chaîne) + F_p^proc ] / 1e12 (g -> Mt)
function emissionsPoste(poste, part) {
  const sigma = poste.chaines.reduce((s, c) => s + part(c) * c.facteur_combustion, 0);
  return (poste.volume_annuel * (sigma + poste.facteur_procede)) / G_PAR_MT;
}

/**
 * Calcule les émissions simulées et actuelles, poste par poste et au total mondial.
 * Fonction pure : ne modifie ni data ni scenario.
 */
export function calculer(data, scenario) {
  const parPoste = {};
  const ecarts = {};
  let totalSimule = 0;
  let totalActuel = 0;

  for (const poste of data.postes) {
    const simule = emissionsPoste(poste, (c) => partSimulee(scenario, c));
    const actuel = emissionsPoste(poste, (c) => c.repartition_reference);
    const observe = poste.emissions_constatees_mt;

    parPoste[poste.id] = { simule, actuel, observe };
    ecarts[poste.id] = observe ? ((actuel - observe) / observe) * 100 : null;

    totalSimule += simule;
    totalActuel += actuel;
  }

  totalSimule += data.hors_perimetre_mt;
  totalActuel += data.hors_perimetre_mt;

  return {
    total: { simule: totalSimule, actuel: totalActuel },
    parPoste,
    ecarts,
  };
}

/**
 * Déplace le curseur de la chaîne `chaineId` de `delta` et redistribue au prorata
 * sur les autres chaînes du même poste (algorithme §4.3). Retourne un nouveau
 * scenario ; ne modifie pas celui passé en argument.
 */
export function redistribuer(data, scenario, chaineId, delta) {
  const trouvee = trouverChaineEtPoste(data, chaineId);
  if (!trouvee) throw new Error(`Chaîne inconnue : ${chaineId}`);
  const { chaine: chaineI, poste } = trouvee;

  const nouveauScenario = structuredClone(scenario);

  const wIActuel = partSimulee(nouveauScenario, chaineI);
  const wIVoulu = clamp(wIActuel + delta, 0, borneSuperieure(chaineI));
  const deltaReel = wIVoulu - wIActuel;

  if (deltaReel === 0) {
    fixerPartSimulee(nouveauScenario, chaineI, wIVoulu);
    return nouveauScenario;
  }

  let restant = -deltaReel; // ce que les autres chaînes du poste doivent absorber

  let eligibles = poste.chaines.filter(
    (c) => c.id !== chaineId && !estVerrouillee(nouveauScenario, c.id)
  );

  while (Math.abs(restant) > 1e-9 && eligibles.length > 0) {
    const sommeW = eligibles.reduce((s, c) => s + partSimulee(nouveauScenario, c), 0);
    if (sommeW <= 0 && restant < 0) break; // rien à retirer, tout est déjà à 0

    let absorbe = 0;
    const saturees = [];
    for (const c of eligibles) {
      const wc = partSimulee(nouveauScenario, c);
      const proposition = sommeW > 0 ? restant * (wc / sommeW) : restant / eligibles.length;
      const maxC = borneSuperieure(c);
      const nouveauWc = clamp(wc + proposition, 0, maxC);
      fixerPartSimulee(nouveauScenario, c, nouveauWc);
      absorbe += nouveauWc - wc;
      if (nouveauWc === 0 || nouveauWc === maxC) saturees.push(c.id);
    }
    restant -= absorbe;
    if (saturees.length === 0) break;
    eligibles = eligibles.filter((c) => !saturees.includes(c.id));
  }

  // Étape 5 (§4.3) : ce que les autres n'ont pas pu absorber reste sur la chaîne i.
  fixerPartSimulee(nouveauScenario, chaineI, wIVoulu + restant);

  return nouveauScenario;
}
