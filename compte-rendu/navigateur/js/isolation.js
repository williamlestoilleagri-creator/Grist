/*
 * Active le calcul multi-cœurs : si la page n'est pas « isolée » (en-têtes absents, ex. GitHub Pages),
 * installe sw-isolation.js puis recharge la page une seule fois. Sans effet si le serveur envoie déjà
 * les en-têtes (configuration nginx fournie) ou si le navigateur ne le permet pas.
 */
(function () {
  if (window.crossOriginIsolated || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  var cle = "cr-isolation-tentee";
  navigator.serviceWorker.register(new URL("../sw-isolation.js", document.currentScript.src).href, { scope: "./" })
    .then(function (inscription) {
      var recharger = function () {
        try { if (sessionStorage.getItem(cle)) return; sessionStorage.setItem(cle, "1"); } catch (e) { return; }
        window.location.reload();
      };
      if (navigator.serviceWorker.controller) recharger();
      else navigator.serviceWorker.addEventListener("controllerchange", recharger);
      return inscription;
    })
    .catch(function () { /* calcul sur un seul cœur : plus lent, mais fonctionnel */ });
})();
