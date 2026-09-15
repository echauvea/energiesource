// url.js — partage du scénario par l'URL (§7 : "?s=base64", aucune persistance serveur).
// encoderScenario/decoderScenario sont pures (testables sans navigateur) ; les deux
// fonctions lireScenarioDepuisURL/ecrireScenarioDansURL touchent window et ne le sont pas.

function base64UrlEncode(texte) {
  const bin = String.fromCharCode(...new TextEncoder().encode(texte));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const complete = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const bin = atob(complete);
  const octets = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(octets);
}

export function encoderScenario(scenario) {
  if (!scenario || Object.keys(scenario).length === 0) return '';
  return base64UrlEncode(JSON.stringify(scenario));
}

export function decoderScenario(param) {
  if (!param) return {};
  try {
    return JSON.parse(base64UrlDecode(param));
  } catch {
    return {};
  }
}

export function lireScenarioDepuisURL() {
  const params = new URLSearchParams(window.location.search);
  return decoderScenario(params.get('s'));
}

export function ecrireScenarioDansURL(scenario) {
  const encode = encoderScenario(scenario);
  const url = new URL(window.location.href);
  if (encode) url.searchParams.set('s', encode);
  else url.searchParams.delete('s');
  window.history.replaceState(null, '', url);
}
