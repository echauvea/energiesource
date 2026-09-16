// ui.js — rendu et interactions. Toute la logique de calcul vient de model.js ;
// ce fichier ne fait que lire/écrire le DOM et l'état `scenario`.

import { calculer, redistribuer } from './model.js';
import { lireScenarioDepuisURL, ecrireScenarioDansURL } from './url.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

let data = null;
let scenario = {};
const posteOuverts = new Set();

async function init() {
  data = await fetch('data.json').then((r) => r.json());
  scenario = lireScenarioDepuisURL();
  initOnglets();
  document.getElementById('reset-global').addEventListener('click', () => {
    scenario = {};
    render();
  });
  render();
}

function initOnglets() {
  const onglets = document.querySelectorAll('.onglet');
  onglets.forEach((bouton) => {
    bouton.addEventListener('click', () => {
      onglets.forEach((b) => b.setAttribute('aria-selected', String(b === bouton)));
      document.getElementById('panel-simulateur').hidden = bouton.id !== 'tab-simulateur';
      document.getElementById('panel-explication').hidden = bouton.id !== 'tab-explication';
    });
  });
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

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// Icône de cadenas : anse fermée en boucle, ou pivotée ouverte vers l'extérieur.
function iconeCadenas(verrouille) {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', class: 'icone-cadenas', 'aria-hidden': 'true' });
  const anse = svgEl('path', {
    d: 'M8,11 V7 a4,4 0 0 1 8,0 v4',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2.2',
    'stroke-linecap': 'round',
  });
  if (!verrouille) anse.setAttribute('transform', 'rotate(-35 8 11)');
  svg.appendChild(anse);
  svg.appendChild(svgEl('rect', { x: '4.5', y: '11', width: '15', height: '9.5', rx: '2', fill: 'currentColor' }));
  svg.appendChild(svgEl('circle', { cx: '12', cy: '15.5', r: '1.3', fill: 'var(--bois)' }));
  return svg;
}

// Icône d'alerte discrète : triangle avec un point d'exclamation évidé.
function iconeAlerte() {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', class: 'icone-alerte', 'aria-hidden': 'true' });
  svg.appendChild(svgEl('path', { d: 'M12,3 L22,20 H2 Z', fill: 'currentColor' }));
  svg.appendChild(svgEl('rect', { x: '11', y: '9', width: '2', height: '6', fill: 'var(--bois)' }));
  svg.appendChild(svgEl('rect', { x: '11', y: '16.5', width: '2', height: '2', fill: 'var(--bois)' }));
  return svg;
}

// Deux pastilles chiffrées : la part actuelle du poste dans les émissions des postes
// modélisés (neutre), et l'écart simulé vs actuel en points de % des émissions mondiales
// (colorée rouge si ça augmente, verte si ça baisse).
function creerIndicateursPoste(partActuelle, deltaMondial) {
  const conteneur = document.createElement('span');
  conteneur.className = 'poste-indicateurs';

  const part = document.createElement('span');
  part.className = 'poste-part';
  part.textContent = `${Math.round(partActuelle)} %`;
  conteneur.appendChild(part);

  const delta = document.createElement('span');
  delta.className = 'poste-delta';
  const fleche = deltaMondial > 0.05 ? '▲ ' : deltaMondial < -0.05 ? '▼ ' : '';
  delta.textContent = `${fleche}${formatPct(deltaMondial)}`;
  if (deltaMondial > 0.05) delta.classList.add('poste-delta--hausse');
  else if (deltaMondial < -0.05) delta.classList.add('poste-delta--baisse');
  conteneur.appendChild(delta);

  return conteneur;
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
  document.getElementById('total-ecart').textContent = `${fleche}${formatPct(pct)}`;
  document.getElementById('total-hors').textContent =
    `Émissions non modélisées (fixes) : ${(data.hors_perimetre_mt / 1000).toFixed(1)} Gt`;
}

function renderPostes(resultat) {
  const container = document.getElementById('postes');
  container.replaceChildren();
  const sommeActuelle = data.postes.reduce((s, p) => s + resultat.parPoste[p.id].actuel, 0);
  for (const poste of data.postes) {
    container.appendChild(renderPoste(poste, resultat, sommeActuelle));
  }
}

function renderPoste(poste, resultat, sommeActuelle) {
  const ouvert = posteOuverts.has(poste.id);
  const { simule, actuel } = resultat.parPoste[poste.id];
  const partActuelle = sommeActuelle ? (actuel / sommeActuelle) * 100 : 0;
  const deltaMondial = resultat.total.actuel ? ((simule - actuel) / resultat.total.actuel) * 100 : 0;

  const section = document.createElement('section');
  section.className = 'poste';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'poste-header';
  header.setAttribute('aria-expanded', String(ouvert));
  header.title =
    `Part actuelle dans les émissions des postes modélisés — ` +
    `Écart simulé, en points de % des émissions mondiales`;
  header.innerHTML = `<span class="poste-chevron">${ouvert ? '▾' : '▸'}</span>` +
    `<span class="poste-nom">${poste.nom}</span>`;
  header.appendChild(creerIndicateursPoste(partActuelle, deltaMondial));
  header.addEventListener('click', () => {
    if (ouvert) posteOuverts.delete(poste.id);
    else posteOuverts.add(poste.id);
    render();
  });
  section.appendChild(header);

  if (ouvert) {
    const chainesDiv = document.createElement('div');
    chainesDiv.className = 'chaines';

    // Ordre figé sur la part de référence : ne jamais retrier pendant l'interaction,
    // sinon les lignes sautent de position quand on déplace un curseur.
    const chainesTriees = [...poste.chaines].sort(
      (a, b) => b.repartition_reference - a.repartition_reference
    );
    for (const chaine of chainesTriees) {
      chainesDiv.appendChild(renderChaine(poste, chaine));
    }
    section.appendChild(chainesDiv);
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
  lockBtn.type = 'button';
  lockBtn.className = 'chaine-verrou';
  lockBtn.setAttribute('aria-pressed', String(verrou));
  lockBtn.setAttribute('aria-label', verrou ? 'Déverrouiller cette chaîne' : 'Verrouiller cette chaîne');
  lockBtn.title = verrou ? 'Verrouillé' : 'Verrouiller';
  lockBtn.appendChild(iconeCadenas(verrou));
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

  // Icône discrète : seulement pour les chiffres à prendre avec des pincettes.
  if (chaine.fiabilite === 'DEBATTU' || chaine.fiabilite === 'A_SOURCER') {
    const alerte = document.createElement('span');
    alerte.className = 'chaine-alerte';
    alerte.title =
      (chaine.fiabilite === 'DEBATTU'
        ? 'Chiffre non contesté, mais méthode de comptage débattue scientifiquement'
        : 'Estimation de travail, pas encore vérifiée') + ` — ${chaine.ref}`;
    alerte.appendChild(iconeAlerte());
    row.appendChild(alerte);
  }

  return row;
}

init();
