// ui.js — rendu et interactions. Toute la logique de calcul vient de model.js ;
// ce fichier ne fait que lire/écrire le DOM et l'état `scenario`.

import { calculer, redistribuer } from './model.js';
import { lireScenarioDepuisURL, ecrireScenarioDansURL } from './url.js';

let data = null;
let scenario = {};
const posteOuverts = new Set();

async function init() {
  data = await fetch('data.json').then((r) => r.json());
  scenario = lireScenarioDepuisURL();
  render();
}

function partSimuleeAffichee(chaine) {
  return scenario[chaine.id]?.repartition_simulee ?? chaine.repartition_reference;
}

function estVerrouillee(chaine) {
  return scenario[chaine.id]?.verrou ?? false;
}

function formatPct(pct, { signe = true } = {}) {
  if (pct === null || pct === undefined) return '—';
  const s = signe && pct > 0 ? '+' : '';
  return `${s}${pct.toFixed(0)} %`;
}

function render() {
  ecrireScenarioDansURL(scenario);
  const resultat = calculer(data, scenario);
  renderTotal(resultat);
  renderPostes(resultat);
}

function renderTotal(resultat) {
  const { simule, actuel } = resultat.total;
  const pct = ((simule - actuel) / actuel) * 100;
  const fleche = pct === 0 ? '' : pct < 0 ? '▼ ' : '▲ ';

  document.getElementById('total-simule').textContent = `${(simule / 1000).toFixed(1)} Gt CO₂e/an`;
  document.getElementById('total-ecart').textContent = `${fleche}${formatPct(pct)} vs actuel`;
  document.getElementById('total-hors').textContent =
    `dont hors périmètre ${(data.hors_perimetre_mt / 1000).toFixed(1)} Gt (fixe)`;
}

function renderPostes(resultat) {
  const container = document.getElementById('postes');
  container.replaceChildren();
  for (const poste of data.postes) {
    container.appendChild(renderPoste(poste, resultat));
  }
}

function renderPoste(poste, resultat) {
  const ouvert = posteOuverts.has(poste.id);
  const { simule, actuel } = resultat.parPoste[poste.id];
  const vsActuel = actuel ? ((simule - actuel) / actuel) * 100 : 0;
  const deltaP = resultat.ecarts[poste.id]; // écart de calibration (§4.2), pas affiché en clair

  const section = document.createElement('section');
  section.className = 'poste';

  const header = document.createElement('button');
  header.className = 'poste-header';
  header.setAttribute('aria-expanded', String(ouvert));
  header.title = `Écart au réel (Δp) : ${formatPct(deltaP)} — voir §4.2 du document de conception`;
  header.innerHTML = `<span class="poste-chevron">${ouvert ? '▾' : '▸'}</span>` +
    `<span class="poste-nom">${poste.nom}</span>` +
    `<span class="poste-ecart">${formatPct(vsActuel)}</span>`;
  header.addEventListener('click', () => {
    if (ouvert) posteOuverts.delete(poste.id);
    else posteOuverts.add(poste.id);
    render();
  });
  section.appendChild(header);

  if (ouvert) {
    const chainesDiv = document.createElement('div');
    chainesDiv.className = 'chaines';

    const chainesTriees = [...poste.chaines].sort(
      (a, b) => partSimuleeAffichee(b) - partSimuleeAffichee(a)
    );
    for (const chaine of chainesTriees) {
      chainesDiv.appendChild(renderChaine(poste, chaine));
    }
    section.appendChild(chainesDiv);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'poste-reset';
    resetBtn.textContent = 'Réinitialiser';
    resetBtn.addEventListener('click', () => {
      scenario = structuredClone(scenario);
      for (const c of poste.chaines) delete scenario[c.id];
      render();
    });
    section.appendChild(resetBtn);
  }

  return section;
}

function renderChaine(poste, chaine) {
  const wActuel = partSimuleeAffichee(chaine);
  const verrou = estVerrouillee(chaine);
  const maxPct = chaine.plafonne ? Math.round(chaine.plafond * 100) : 100;

  const row = document.createElement('div');
  row.className = 'chaine';
  if (verrou) row.classList.add('chaine-verrouillee');

  const libelle = document.createElement('span');
  libelle.className = 'chaine-libelle';
  libelle.textContent = chaine.libelle;
  row.appendChild(libelle);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(maxPct);
  slider.step = '1';
  slider.value = String(Math.round(wActuel * 100));
  slider.disabled = verrou;
  slider.className = 'chaine-slider';
  slider.setAttribute('aria-label', chaine.libelle);
  slider.style.setProperty('--valeur-pct', `${(Number(slider.value) / maxPct) * 100}%`);
  row.appendChild(slider);

  const pctLabel = document.createElement('span');
  pctLabel.className = 'chaine-pct';
  pctLabel.textContent = `${Math.round(wActuel * 100)} %`;
  row.appendChild(pctLabel);

  slider.addEventListener('input', () => {
    pctLabel.textContent = `${slider.value} %`;
    slider.style.setProperty('--valeur-pct', `${(Number(slider.value) / maxPct) * 100}%`);
  });

  slider.addEventListener('change', () => {
    const nouvelleValeur = Number(slider.value) / 100;
    const delta = nouvelleValeur - wActuel;
    scenario = redistribuer(data, scenario, chaine.id, delta);
    render();
  });

  const lockBtn = document.createElement('button');
  lockBtn.className = 'chaine-verrou';
  lockBtn.textContent = verrou ? 'Verrouillé' : 'Verrouiller';
  lockBtn.setAttribute('aria-pressed', String(verrou));
  lockBtn.addEventListener('click', () => {
    scenario = structuredClone(scenario);
    scenario[chaine.id] = { repartition_simulee: wActuel, verrou: !verrou };
    render();
  });
  row.appendChild(lockBtn);

  if (chaine.plafonne) {
    const plafondNote = document.createElement('span');
    plafondNote.className = 'chaine-plafond';
    plafondNote.textContent = `plafond ${maxPct} %`;
    row.appendChild(plafondNote);
  }

  const fiabiliteNote = document.createElement('span');
  fiabiliteNote.className = `chaine-fiabilite fiabilite-${chaine.fiabilite.toLowerCase()}`;
  fiabiliteNote.textContent = chaine.fiabilite;
  fiabiliteNote.title = chaine.ref;
  row.appendChild(fiabiliteNote);

  return row;
}

init();
