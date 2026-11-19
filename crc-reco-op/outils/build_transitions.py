"""Génère 5 pages de transition « Données des contrôles » (charte DSFR)."""
import base64, os
RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOGO = "data:image/png;base64," + base64.b64encode(open(os.path.join(RACINE, "crc-reco-op", "logo-franceagrimer.png"), "rb").read()).decode()

HEAD = """<!DOCTYPE html>
<html lang="fr" data-fr-scheme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Données des contrôles</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.12.1/dist/dsfr.min.css">
<style>
  :root{ --bf:#000091; --bf-1:#1212FF; --bf-2:#6A6AF4; --bf-3:#8585F6; --bf-4:#CACAFB; --bf-5:#E3E3FD; --rm:#E1000F; --rm-2:#F95C5E; --rm-5:#FEE9E9; --nuit:#000074; }
  html,body{height:100%;margin:0}
  body{font-family:Marianne,arial,sans-serif;overflow:hidden;background:var(--bf)}
  .scene{position:relative;min-height:100vh;height:100%;overflow:hidden;display:flex}
  .marque{position:absolute;left:clamp(16px,4vw,48px);top:clamp(16px,4vh,40px);z-index:5;font-weight:700;font-size:.95rem;line-height:1.05;text-transform:uppercase;letter-spacing:.01em;color:#fff}
  .marque::before{content:"";display:block;width:40px;height:9px;margin-bottom:8px;background:linear-gradient(90deg,#000091 33.3%,#fff 33.3% 66.6%,#E1000F 66.6%);box-shadow:0 0 0 1px rgba(255,255,255,.6)}
  .marque i{display:block;font-style:italic;font-weight:400;text-transform:none;font-size:.65rem;margin-top:5px;line-height:1.2;opacity:.9}
  .marque.sombre{color:#161616}.marque.sombre::before{box-shadow:0 0 0 1px #DDD}
  .op{position:absolute;right:clamp(16px,4vw,48px);bottom:clamp(16px,4vh,40px);z-index:5;background:#fff;padding:8px 12px;border-radius:4px;box-shadow:0 4px 14px rgba(0,0,18,.25)}
  .op img{height:clamp(34px,6vh,52px);width:auto;display:block}
  .surtitre{font-size:clamp(.7rem,1.2vw,.85rem);font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin:0}
  .titre{font-weight:800;line-height:1.02;margin:0;letter-spacing:-.01em;color:inherit !important}
  .surtitre,.chapo{color:inherit}
  @media (prefers-reduced-motion: reduce){ *{animation:none !important;transition:none !important} }
</style>
"""
MARQUE = '<div class="marque{cls}" aria-hidden="true">République<br>Française<i>Liberté<br>Égalité<br>Fraternité</i></div>'
OP = f'<div class="op"><img src="{LOGO}" alt="FranceAgriMer"></div>'

PAGES = {}

# 1 — Flèche : bandes verticales dégradées et flèche qui traverse
PAGES["1-fleche"] = HEAD + """<style>
  .bandes{position:absolute;inset:0;display:flex}
  .bandes span{flex:1;background:linear-gradient(180deg,var(--c1),var(--c2))}
  .bandes span:nth-child(1){--c1:#6A6AF4;--c2:#8585F6}.bandes span:nth-child(2){--c1:#5D5DE6;--c2:#7878F0}.bandes span:nth-child(3){--c1:#1212FF;--c2:#4B4BF5;flex:1.6}
  .bandes span:nth-child(4){--c1:#000091;--c2:#1212FF;flex:.6}.bandes span:nth-child(5){--c1:#000091;--c2:#2323C9;flex:1.4}.bandes span:nth-child(6){--c1:#3D3DD8;--c2:#6A6AF4}
  .bandes span:nth-child(7){--c1:#8585F6;--c2:#CACAFB}.bandes span:nth-child(8){--c1:#A3A3F8;--c2:#E3E3FD}
  .fleche{position:absolute;left:-40%;top:50%;width:62%;height:clamp(60px,14vh,120px);transform:translateY(-50%);animation:entre 1.4s cubic-bezier(.2,.8,.2,1) .2s forwards}
  .fleche::before{content:"";position:absolute;left:0;right:clamp(60px,10vw,140px);top:30%;bottom:30%;background:linear-gradient(90deg,rgba(255,255,255,.15),#fff)}
  .fleche::after{content:"";position:absolute;right:0;top:-55%;bottom:-55%;width:clamp(80px,13vw,180px);background:#fff;clip-path:polygon(0 0,100% 50%,0 100%)}
  .fleche i{position:absolute;right:clamp(22px,4vw,56px);top:50%;width:14px;height:14px;margin-top:-7px;border-radius:50%;background:var(--rm);z-index:2}
  @keyframes entre{to{left:14%}}
  .texte{position:absolute;left:clamp(16px,6vw,96px);bottom:clamp(90px,16vh,150px);color:#fff;z-index:4;max-width:min(680px,80vw);opacity:0;animation:monte .8s ease 1.1s forwards}
  .texte .titre{font-size:clamp(2.2rem,6vw,4.75rem)}
  .texte p.chapo{font-size:clamp(1rem,1.8vw,1.35rem);margin:.75rem 0 0;color:#ECECFE}
  @keyframes monte{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
</style></head><body><main class="scene" aria-label="Page de transition : Données des contrôles">
""" + MARQUE.format(cls="") + """
<div class="bandes" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
<div class="fleche" aria-hidden="true"><i></i></div>
<div class="texte"><p class="surtitre">Rubrique</p><h1 class="titre">Données des contrôles</h1><p class="chapo">De la grille de contrôle à la base consolidée.</p></div>
""" + OP + "</main></body></html>"

# 2 — Convergence : deux crochets et deux flèches vers un carré concentrique
PAGES["2-convergence"] = HEAD + """<style>
  .scene{background:linear-gradient(120deg,#000091 0%,#1212FF 45%,#6A6AF4 80%,#8585F6 100%);flex-direction:column;align-items:center;justify-content:center;gap:clamp(18px,5vh,48px)}
  .scene::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.14),transparent 55%);pointer-events:none}
  .schema{width:min(1100px,94vw);display:block;z-index:2}
  .texte{text-align:center;color:#fff;z-index:2;padding:0 16px}
  .texte .titre{font-size:clamp(2rem,5vw,3.75rem)}
  .texte p.chapo{font-size:clamp(.95rem,1.6vw,1.2rem);margin:.6rem 0 0;color:#ECECFE}
  .texte .trait{display:block;width:56px;height:4px;margin:0 auto 1rem;background:linear-gradient(90deg,#fff 50%,var(--rm) 50%)}
  .g-gauche{animation:gauche 1.1s cubic-bezier(.2,.8,.2,1) both}.g-droite{animation:droite 1.1s cubic-bezier(.2,.8,.2,1) both}
  .carre rect{animation:pulse 3.2s ease-in-out infinite;transform-origin:550px 150px;transform-box:view-box}
  .carre rect:nth-child(2){animation-delay:.15s}.carre rect:nth-child(3){animation-delay:.3s}.carre rect:nth-child(4){animation-delay:.45s}.carre rect:nth-child(5){animation-delay:.6s}.carre rect:nth-child(6){animation-delay:.75s}.carre rect:nth-child(7){animation-delay:.9s}
  @keyframes gauche{from{transform:translateX(-60px);opacity:0}to{transform:none;opacity:1}}
  @keyframes droite{from{transform:translateX(60px);opacity:0}to{transform:none;opacity:1}}
  @keyframes pulse{0%,100%{opacity:.95}50%{opacity:.35}}
</style></head><body><main class="scene" aria-label="Page de transition : Données des contrôles">
""" + MARQUE.format(cls="") + """
<svg class="schema" viewBox="0 0 1100 300" aria-hidden="true">
  <g class="g-gauche" fill="none" stroke="#fff" stroke-opacity=".55">
    <path d="M300,60 L300,20 L20,20 L20,280 L300,280 L300,240" stroke-width="16"/><path d="M270,60 L270,48 L48,48 L48,252 L270,252 L270,240" stroke-width="4" stroke-opacity=".7"/>
    <path d="M140,130 L330,130 L330,105 L385,150 L330,195 L330,170 L140,170 Z" fill="#fff" fill-opacity=".55" stroke="none"/>
  </g>
  <g class="g-droite" fill="none" stroke="#fff" stroke-opacity=".75">
    <path d="M800,60 L800,20 L1080,20 L1080,280 L800,280 L800,240" stroke-width="16"/><path d="M830,60 L830,48 L1052,48 L1052,252 L830,252 L830,240" stroke-width="4" stroke-opacity=".7"/>
    <path d="M960,130 L770,130 L770,105 L715,150 L770,195 L770,170 L960,170 Z" fill="#fff" fill-opacity=".75" stroke="none"/>
  </g>
  <g class="carre" fill="none" stroke="#fff" stroke-width="1.5">
    <rect x="445" y="45" width="210" height="210"/><rect x="462" y="62" width="176" height="176"/><rect x="478" y="78" width="144" height="144"/><rect x="494" y="94" width="112" height="112"/>
    <rect x="509" y="109" width="82" height="82"/><rect x="523" y="123" width="54" height="54"/><rect x="536" y="136" width="28" height="28" fill="#E1000F" stroke="#fff"/>
  </g>
  <text x="160" y="232" fill="#fff" fill-opacity=".85" font-size="20" font-weight="700" font-family="Marianne,arial">Saisie Grist</text>
  <text x="940" y="232" fill="#fff" fill-opacity=".9" font-size="20" font-weight="700" text-anchor="end" font-family="Marianne,arial">Import Excel</text>
</svg>
<div class="texte"><span class="trait"></span><h1 class="titre">Données des contrôles</h1><p class="chapo">Deux voies d'entrée, une seule base consolidée.</p></div>
""" + OP + "</main></body></html>"

# 3 — Diagonale : panneau bleu France et panneau rouge Marianne séparés par un double filet
PAGES["3-diagonale"] = HEAD + """<style>
  .scene{background:var(--rm)}
  .gauche{position:absolute;inset:0;background:var(--bf);clip-path:polygon(0 0,46% 0,36% 100%,0 100%);animation:ouvre 1s cubic-bezier(.2,.8,.2,1) both}
  .filet{position:absolute;inset:0;clip-path:polygon(47.5% 0,48.6% 0,38.6% 100%,37.5% 100%);background:#fff;animation:ouvre 1s cubic-bezier(.2,.8,.2,1) .1s both}
  .filet.f2{clip-path:polygon(49.6% 0,50.7% 0,40.7% 100%,39.6% 100%);animation-delay:.2s}
  @keyframes ouvre{from{transform:translateX(-30%);opacity:0}to{transform:none;opacity:1}}
  .vertical{position:absolute;left:clamp(30px,13vw,190px);top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;color:#fff;z-index:3}
  .vertical b{writing-mode:vertical-rl;transform:rotate(180deg);font-size:clamp(3rem,9vh,6.5rem);font-weight:800;letter-spacing:.06em;line-height:1}
  .vertical i{width:4px;height:clamp(40px,10vh,90px);background:#fff}
  .droite{position:absolute;left:52%;right:clamp(16px,5vw,80px);top:50%;transform:translateY(-50%);color:#fff;z-index:3;animation:fond .9s ease .5s both}
  .droite .titre{font-size:clamp(2.2rem,5.6vw,4.8rem)}
  .droite p.chapo{font-size:clamp(1rem,1.7vw,1.3rem);margin:1rem 0 0;max-width:520px}
  .droite ul{list-style:none;padding:0;margin:1.5rem 0 0;display:flex;flex-wrap:wrap;gap:.5rem}
  .droite li{border:1.5px solid #fff;border-radius:2rem;padding:.25rem .85rem;font-size:.85rem;font-weight:500}
  @keyframes fond{from{opacity:0;transform:translateY(-40%)}to{opacity:1;transform:translateY(-50%)}}
  @media (max-width:700px){.gauche{clip-path:polygon(0 0,100% 0,100% 30%,0 40%)}.filet{display:none}.vertical{left:0;right:0;top:9vh;bottom:auto;flex-direction:row}.vertical b{writing-mode:horizontal-tb;transform:none;font-size:2.4rem}.vertical i{width:40px;height:4px}.droite{left:16px;right:16px;top:62%}}
</style></head><body><main class="scene" aria-label="Page de transition : Données des contrôles">
<div class="gauche" aria-hidden="true"></div><div class="filet" aria-hidden="true"></div><div class="filet f2" aria-hidden="true"></div>
""" + MARQUE.format(cls="") + """
<div class="vertical" aria-hidden="true"><i></i><b>DATA</b><i></i></div>
<div class="droite"><p class="surtitre">Rubrique</p><h1 class="titre">Données<br>des contrôles</h1><p class="chapo">Fiches des OP, réponses critère par critère et tableaux annexes.</p>
<ul><li>OP</li><li>Réponses</li><li>Conventions</li><li>Producteurs</li><li>Sondages</li></ul></div>
""" + OP + "</main></body></html>"

# 4 — Chargement : dégradé, barre segmentée animée, décor de traits et cercles
PAGES["4-chargement"] = HEAD + """<style>
  .scene{background:linear-gradient(135deg,#000091 0%,#1212FF 55%,#6A6AF4 100%);align-items:center;justify-content:center;flex-direction:column}
  .onde{position:absolute;inset:0;background:radial-gradient(ellipse 70% 45% at 25% 85%,rgba(202,202,251,.32),transparent 70%),radial-gradient(ellipse 50% 40% at 85% 75%,rgba(255,255,255,.12),transparent 70%)}
  .deco{position:absolute;inset:0;pointer-events:none}
  .deco .t{position:absolute;height:1.5px;background:rgba(255,255,255,.55);transform:rotate(-38deg)}
  .deco .c{position:absolute;border:1.5px solid rgba(255,255,255,.6);border-radius:50%}
  .deco .p{position:absolute;width:10px;height:10px;border-radius:50%;background:#fff}
  .deco .tri{position:absolute;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid rgba(255,255,255,.6)}
  .bloc{text-align:center;color:#fff;z-index:2;padding:0 16px}
  .bloc .surtitre{letter-spacing:.5em;font-size:clamp(1.4rem,4vw,2.6rem);font-weight:300;margin-bottom:1rem}
  .barre{width:min(560px,82vw);height:clamp(44px,7vh,64px);border:2px solid #fff;padding:6px;display:flex;gap:6px;margin:0 auto}
  .barre span{flex:1;background:rgba(255,255,255,.25);border-radius:1px}
  .barre span.on{background:#fff}
  .barre span.on:last-of-type{background:var(--rm)}
  .bloc .titre{font-size:clamp(1.6rem,3.6vw,2.6rem);margin-top:1.75rem}
  .bloc p.chapo{margin:.5rem 0 0;color:#ECECFE;font-size:clamp(.95rem,1.5vw,1.15rem)}
  .pct{font-variant-numeric:tabular-nums}
</style></head><body><main class="scene" aria-label="Page de transition : Données des contrôles">
""" + MARQUE.format(cls="") + """
<div class="onde" aria-hidden="true"></div>
<div class="deco" aria-hidden="true">
  <span class="t" style="left:2%;top:58%;width:16%"></span><span class="t" style="left:70%;top:14%;width:14%"></span><span class="t" style="left:78%;top:30%;width:22%"></span><span class="t" style="left:10%;top:88%;width:10%"></span>
  <span class="c" style="left:33%;top:80%;width:22px;height:22px"></span><span class="c" style="left:88%;top:62%;width:14px;height:14px"></span>
  <span class="p" style="left:46%;top:12%"></span><span class="p" style="left:74%;top:91%"></span><span class="tri" style="left:22%;top:23%"></span>
</div>
<div class="bloc"><p class="surtitre">Chargement</p>
  <div class="barre" id="barre" role="progressbar" aria-label="Chargement des données des contrôles" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
  <h1 class="titre">Données des contrôles</h1><p class="chapo">Préparation des fiches, réponses et tableaux annexes… <span class="pct" id="pct">0 %</span></p></div>
""" + OP + """
<script>
  const N = 28, b = document.getElementById("barre"), pct = document.getElementById("pct");
  b.innerHTML = "<span></span>".repeat(N); const segs = b.querySelectorAll("span");
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches; let i = reduit ? 20 : 0;
  function pas(){ segs.forEach((s, k) => s.classList.toggle("on", k < i)); const v = Math.round(i / N * 100); pct.textContent = v + " %"; b.setAttribute("aria-valuenow", v);
    if (!reduit){ i = i >= N ? 0 : i + 1; setTimeout(pas, i === 0 ? 1200 : 90); } }
  pas();
</script></main></body></html>"""

# 5 — Typographie : grands mots empilés, forme diagonale bleu France, pastille bloc-marque
PAGES["5-typographie"] = HEAD + """<style>
  .scene{background:#fff}
  .forme{position:absolute;inset:0;background:var(--bf);clip-path:polygon(0 0,84% 0,62% 100%,0 100%);animation:glisse 1s cubic-bezier(.2,.8,.2,1) both}
  .forme2{position:absolute;inset:0;background:var(--bf-5);clip-path:polygon(84% 0,93% 0,71% 100%,62% 100%);animation:glisse 1s cubic-bezier(.2,.8,.2,1) .12s both}
  @keyframes glisse{from{transform:translateX(-25%)}to{transform:none}}
  .pastille{position:absolute;left:62%;top:-14vh;width:clamp(220px,28vw,360px);aspect-ratio:1;border-radius:50%;background:#fff;transform:translateX(-50%);z-index:3;display:flex;align-items:flex-end;justify-content:center;padding-bottom:clamp(26px,5vh,46px);box-shadow:0 8px 24px rgba(0,0,18,.18)}
  .pastille .marque{position:static;color:#161616}
  .mots{position:absolute;left:clamp(16px,8vw,140px);right:16px;top:50%;transform:translateY(-42%);z-index:4}
  .mots .surtitre{color:#fff;margin-bottom:.75rem;font-size:clamp(.7rem,1.1vw,.85rem)}
  .mot{display:block;font-weight:800;font-size:clamp(2.2rem,7vw,6.4rem);line-height:.95;text-transform:uppercase;letter-spacing:-.01em;color:#fff;opacity:0;animation:mot .7s ease forwards}
  .mot:nth-of-type(1){animation-delay:.35s}.mot:nth-of-type(2){animation-delay:.5s}.mot:nth-of-type(3){animation-delay:.65s}
  .mot.accent{color:var(--rm);display:inline-block;background:#fff;padding:0 .12em;margin-top:.08em;box-shadow:0 0 0 2px var(--rm)}
  @keyframes mot{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}
  .legende{position:absolute;right:clamp(16px,4vw,64px);top:50%;transform:translateY(-50%);z-index:4;text-align:right;color:var(--bf);font-weight:700;font-size:clamp(.8rem,1.2vw,1rem);max-width:15vw;border-right:4px solid var(--rm);padding-right:.75rem}
  @media (max-width:760px){.legende{display:none}.pastille{left:50%}.mots{top:58%}}
  .legende span{display:block;font-weight:400;color:#3A3A3A;margin-top:.25rem}
  h1.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
</style></head><body><main class="scene" aria-label="Page de transition : Données des contrôles">
<h1 class="sr">Données des contrôles</h1>
<div class="forme" aria-hidden="true"></div><div class="forme2" aria-hidden="true"></div>
<div class="pastille">""" + MARQUE.format(cls=" sombre") + """</div>
<div class="legende">Données des contrôles<span>Contrôle de reconnaissance des OP</span></div>
<div class="mots" aria-hidden="true"><p class="surtitre">Des données qui</p><span class="mot">Collectent</span><span class="mot">Consolident</span><span class="mot accent">Éclairent</span></div>
""" + OP + "</main></body></html>"

for nom, html in PAGES.items():
    open(os.path.join(RACINE, "transitions", f"donnees-controles-{nom}.html"), "w", encoding="utf-8").write(html)
    print(nom, len(html) // 1024, "Ko")
