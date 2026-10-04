(function () {
  "use strict";

  const DATEN = window.WEITERBILDUNGEN;
  const P = DATEN.programme;
  const NACH_ID = Object.fromEntries(P.map((p) => [p.id, p]));
  const MAX_VERGLEICH = 3;
  const KOSTEN_MAX = 55000;
  const DAUER_MAX = 48;

  const ABSCHLUSS_REIHE = ["Master", "MAS", "CAS", "Fachausweis", "Lehrgang", "Zertifikat", "Kurs", "Register"];
  const ZUL_TEXT = {
    ja: "Mit FH-Bachelor zugänglich",
    dossier: "Sur dossier / Praxis nötig",
    eingeschraenkt: "Master oder Auflagen nötig"
  };
  const ZUL_KURZ = { ja: "FH-Bachelor genügt", dossier: "sur dossier", eingeschraenkt: "Master/Auflagen" };

  // ───────── Hilfen ─────────
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const chf = (n) => "CHF " + Math.round(n).toLocaleString("de-CH").replace(/’|’/g, "'");
  const monate = (m) => (m >= 12 && m % 12 === 0 ? `${m / 12} J.` : m >= 12 ? `${(m / 12).toFixed(1).replace(".", ",")} J.` : `${m} Mt.`);
  const uniq = (arr) => [...new Set(arr)];
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* Speicher nicht verfügbar */ } };
  const ersterSatz = (t) => { const m = String(t).match(/^.+?[.!?](\s|$)/); return m ? m[0].trim() : t; };

  const ICON = {
    stern: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/></svg>',
    sternVoll: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/></svg>',
    waage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v16M5 20h14M6 8h12M6 8l-3 6h6zM18 8l-3 6h6z"/></svg>',
    notiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" width="12" height="12"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>'
  };

  // ───────── Speicher: Merkliste & Notizen ─────────
  // Im claude.ai-Artifact werden Merkliste und Notizen privat im Konto gespeichert (alle Geräte),
  // sonst im Browser (localStorage).
  const LS_MERK = "av.merkliste.v1";
  const Speicher = {
    modus: "lokal",
    daten: Object.assign({ favoriten: [], notizen: {} }, lsGet(LS_MERK, {})),
    ref: null,
    timer: null,
    schreibt: false,
    nochmal: false,
    zuhoerer: [],
    istFav(id) { return this.daten.favoriten.includes(id); },
    notiz(id) { return this.daten.notizen[id] || ""; },
    toggleFav(id) {
      const f = this.daten.favoriten;
      this.daten.favoriten = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      this.speichern(0);
    },
    setNotiz(id, text) {
      if (text.trim()) this.daten.notizen[id] = text; else delete this.daten.notizen[id];
      this.speichern(800);
    },
    speichern(verz) {
      lsSet(LS_MERK, this.daten);
      if (!this.ref) { this.melden("gespeichert"); return; }
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.schreiben(), verz);
    },
    async schreiben() {
      if (this.schreibt) { this.nochmal = true; return; }
      this.schreibt = true;
      try {
        await this.ref.set({ favoriten: this.daten.favoriten, notizen: this.daten.notizen, geaendert: new Date().toISOString() });
        this.melden("gespeichert");
      } catch (e) {
        this.melden("fehler");
      } finally {
        this.schreibt = false;
        if (this.nochmal) { this.nochmal = false; this.schreiben(); }
      }
    },
    melden(s) { this.zuhoerer.forEach((f) => f(s)); },
    async verbinden() {
      if (!window.claude || typeof window.claude.use !== "function") return;
      try {
        const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
        if (!db || !user) return;
        const uid = await user.id();
        if (!uid) return;
        this.ref = db.doc("data/users/" + uid + "/merkliste");
        const lokal = { favoriten: [...this.daten.favoriten], notizen: { ...this.daten.notizen } };
        let erster = true;
        this.ref.onSnapshot((snap) => {
          if (snap.metadata && snap.metadata.hasPendingWrites) return;
          if (snap.exists) {
            const d = snap.data() || {};
            const aktiv = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.notiz : null;
            const notizen = Object.assign({}, d.notizen || {});
            if (aktiv && this.daten.notizen[aktiv] !== undefined) notizen[aktiv] = this.daten.notizen[aktiv];
            this.daten = { favoriten: Array.isArray(d.favoriten) ? [...d.favoriten] : [], notizen };
            lsSet(LS_MERK, this.daten);
            render();
          } else if (erster && (lokal.favoriten.length || Object.keys(lokal.notizen).length)) {
            this.daten = lokal; // bisher lokal Gemerktes ins Konto übernehmen
            this.schreiben();
          }
          erster = false;
        }, () => { this.ref = null; this.modus = "lokal"; zeigeSync(); });
        this.modus = "konto";
        zeigeSync();
      } catch { /* bleibt lokal */ }
    }
  };

  function zeigeSync() {
    const el = $("#sync");
    el.dataset.modus = Speicher.modus;
    el.textContent = Speicher.modus === "konto" ? "Merkliste & Notizen im Konto (alle Geräte)" : "Merkliste & Notizen nur in diesem Browser";
  }

  // ───────── Filterzustand ─────────
  const LS_FILTER = "av.filter.v1";
  const STANDARD = () => ({
    suche: "", abschluss: [], thema: [], zeit: [], form: [], sprache: [], schule: [], zul: [], naehe: [],
    ort: "", kostenMax: KOSTEN_MAX, ohnePreis: true, dauerMax: DAUER_MAX, passungMin: 1, sort: "passung"
  });
  let F = Object.assign(STANDARD(), lsGet(LS_FILTER, {}));
  let vergleich = lsGet("av.vergleich.v1", []).filter((id) => NACH_ID[id]);
  let ansicht = "katalog";

  const OPTIONEN = {
    abschluss: ABSCHLUSS_REIHE.filter((a) => P.some((p) => p.abschluss === a)),
    thema: DATEN.themen,
    zeit: ["Teilzeit", "Vollzeit"],
    form: ["Präsenz", "Blended", "Online"],
    sprache: uniq(P.flatMap((p) => p.sprache)).sort(),
    schule: uniq(P.map((p) => p.schule)).sort((a, b) => a.localeCompare(b, "de")),
    zul: ["ja", "dossier", "eingeschraenkt"],
    naehe: ["kern", "angrenzend", "weit"],
    ort: uniq(P.flatMap((p) => p.orte)).filter((o) => o !== "diverse" && !o.startsWith("weitere")).sort((a, b) => a.localeCompare(b, "de"))
  };
  const NAEHE_LABEL = { kern: "Kern Architektur", angrenzend: "Angrenzend", weit: "Branchenfremd / Umstieg" };
  const NAEHE_KURZ = { kern: "Kern", angrenzend: "Angrenzend", weit: "Umstieg" };
  const ZUL_LABEL = { ja: "genügt", dossier: "sur dossier", eingeschraenkt: "Master/Auflagen" };

  function passt(p) {
    if (F.suche) {
      const q = F.suche.toLowerCase();
      const heu = [p.titel, p.schule, p.schuleVoll, p.inhalt, p.relevanz, p.nutzen, p.themen.join(" "), p.orte.join(" ")].join(" ").toLowerCase();
      if (!q.split(/\s+/).every((w) => heu.includes(w))) return false;
    }
    if (F.abschluss.length && !F.abschluss.includes(p.abschluss)) return false;
    if (F.thema.length && !F.thema.some((t) => p.themen.includes(t))) return false;
    if (F.zeit.length && !F.zeit.some((z) => p.zeitmodell.includes(z))) return false;
    if (F.form.length && !F.form.includes(p.form)) return false;
    if (F.sprache.length && !F.sprache.some((s) => p.sprache.includes(s))) return false;
    if (F.schule.length && !F.schule.includes(p.schule)) return false;
    if (F.zul.length && !F.zul.includes(p.zulassungFh)) return false;
    if (F.naehe.length && !F.naehe.includes(p.naehe)) return false;
    if (F.ort && !p.orte.includes(F.ort)) return false;
    if (p.kostenChf == null) { if (!F.ohnePreis) return false; }
    else if (F.kostenMax < KOSTEN_MAX && p.kostenChf > F.kostenMax) return false;
    if (F.dauerMax < DAUER_MAX && p.dauerMonate != null && p.dauerMonate > F.dauerMax) return false;
    if (p.passung < F.passungMin) return false;
    return true;
  }

  function sortiere(liste) {
    const s = F.sort;
    const nullLast = (v) => (v == null ? Infinity : v);
    return [...liste].sort((a, b) => {
      if (s === "kosten") return nullLast(a.kostenChf) - nullLast(b.kostenChf);
      if (s === "dauer") return nullLast(a.dauerMonate) - nullLast(b.dauerMonate);
      if (s === "ects") return (b.ects || 0) - (a.ects || 0);
      if (s === "titel") return a.titel.localeCompare(b.titel, "de");
      return b.passung - a.passung || nullLast(a.kostenChf) - nullLast(b.kostenChf);
    });
  }

  // ───────── Bausteine ─────────
  const passungHtml = (n) => `<span class="passung" title="Passung ${n} von 5" aria-label="Passung ${n} von 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "an" : ""}"></i>`).join("")}</span>`;

  function massHtml(lbl, wert, max, text) {
    const bekannt = wert != null;
    const breite = bekannt ? Math.max(8, Math.min(100, (wert / max) * 100)) : 100;
    return `<div class="mass${bekannt ? "" : " unbekannt"}">
      <span class="lbl">${lbl}</span>
      <div class="bahn" title="${esc(text)}"><span class="linie" style="width:${breite}%"></span><span class="wert">${esc(bekannt ? (lbl === "Kosten" ? chf(wert) : monate(wert)) : "k. A.")}</span></div>
    </div>`;
  }

  function karteHtml(p) {
    const fav = Speicher.istFav(p.id);
    const inVg = vergleich.includes(p.id);
    const notiz = Speicher.notiz(p.id);
    return `<article class="karte" data-id="${p.id}">
      <div class="oben">
        <div style="display:flex;gap:8px;align-items:center"><span class="abschluss" data-a="${esc(p.abschluss)}">${esc(p.abschluss)}</span>${p.ects ? `<span class="ects">${p.ects} ECTS</span>` : ""}<span class="naehe" data-n="${p.naehe}" title="${NAEHE_LABEL[p.naehe]}">${NAEHE_KURZ[p.naehe]}</span></div>
        ${passungHtml(p.passung)}
      </div>
      <h3>${esc(p.titel)}</h3>
      <p class="schule">${esc(p.schuleVoll)}</p>
      <div class="check-block">
        ${massHtml("Dauer", p.dauerMonate, DAUER_MAX, p.dauerText)}
        ${massHtml("Kosten", p.kostenChf, KOSTEN_MAX, p.kostenText)}
        <div class="fakten">
          <span class="fakt">${esc(p.zeitmodell.join(" / "))}</span>
          <span class="fakt">${esc(p.form)}</span>
          <span class="fakt">${esc(p.orte.join(", "))}</span>
          <span class="fakt">${esc(p.sprache.join(", "))}</span>
        </div>
        <span class="zul" data-z="${p.zulassungFh}">${ZUL_TEXT[p.zulassungFh]}</span>
        <p class="fuer-dich"><b>Für dich</b>${esc(ersterSatz(p.relevanz))}</p>
      </div>
      <div class="aktionen">
        <button class="aktion merken" data-akt="merken" aria-pressed="${fav}" title="${fav ? "Von der Merkliste entfernen" : "Auf die Merkliste"}">${fav ? ICON.sternVoll : ICON.stern}${fav ? "Gemerkt" : "Merken"}</button>
        <button class="aktion vergl" data-akt="vergleichen" aria-pressed="${inVg}" ${!inVg && vergleich.length >= MAX_VERGLEICH ? 'disabled title="Maximal 3 Angebote im Vergleich"' : ""}>${ICON.waage}${inVg ? "Im Vergleich" : "Vergleichen"}</button>
        ${notiz ? `<span class="notiz-hinweis">${ICON.notiz}Notiz</span>` : ""}
        <button class="aktion mehr" data-akt="details">Details</button>
      </div>
    </article>`;
  }

  // ───────── Filter-UI ─────────
  function chipsAufbauen(id, key, labelFn = (x) => x) {
    const el = $("#" + id);
    el.innerHTML = OPTIONEN[key].map((o) => `<button class="chip" data-key="${key}" data-val="${esc(o)}" aria-pressed="${F[key].includes(o)}">${esc(labelFn(o))}</button>`).join("");
  }

  function filterAufbauen() {
    chipsAufbauen("f-abschluss", "abschluss");
    chipsAufbauen("f-thema", "thema");
    chipsAufbauen("f-zeit", "zeit");
    chipsAufbauen("f-form", "form");
    chipsAufbauen("f-sprache", "sprache");
    chipsAufbauen("f-schule", "schule");
    chipsAufbauen("f-zul", "zul", (z) => ZUL_LABEL[z]);
    chipsAufbauen("f-naehe", "naehe", (n) => NAEHE_LABEL[n]);
    $("#f-ort").innerHTML = `<option value="">Alle Orte</option>` + OPTIONEN.ort.map((o) => `<option ${F.ort === o ? "selected" : ""}>${esc(o)}</option>`).join("");
    $("#f-suche").value = F.suche;
    $("#f-kosten").value = F.kostenMax;
    $("#f-dauer").value = F.dauerMax;
    $("#f-ohnepreis").checked = F.ohnePreis;
    $("#f-passung").value = String(F.passungMin);
    $("#sortierung").value = F.sort;
    regler();
  }

  function regler() {
    $("#o-kosten").textContent = F.kostenMax >= KOSTEN_MAX ? "beliebig" : chf(F.kostenMax);
    $("#o-dauer").textContent = F.dauerMax >= DAUER_MAX ? "beliebig" : monate(F.dauerMax);
  }

  function filterGeaendert() {
    lsSet(LS_FILTER, F);
    renderKatalog();
  }

  // ───────── Ansichten ─────────
  function renderKatalog() {
    const liste = sortiere(P.filter(passt));
    $("#treffer").textContent = liste.length;
    $("#raster").innerHTML = liste.length
      ? liste.map(karteHtml).join("")
      : `<div class="leer"><b>Keine Angebote mit diesen Filtern</b>Lockere einen Filter oder setze alle zurück.</div>`;
  }

  function renderMerkliste() {
    const liste = Speicher.daten.favoriten.map((id) => NACH_ID[id]).filter(Boolean);
    $("#treffer-merk").textContent = liste.length;
    $("#merkliste").innerHTML = liste.length
      ? liste.map(karteHtml).join("")
      : `<div class="leer"><b>Noch nichts gemerkt</b>Tippe im Katalog auf «Merken». Deine Merkliste und Notizen erscheinen dann hier.</div>`;
  }

  function renderBaukasten() {
    const eltern = P.filter((p) => P.some((k) => k.teilVon.includes(p.id)));
    eltern.sort((a, b) => b.passung - a.passung);
    $("#baukasten").innerHTML = eltern.map((m) => {
      const kinder = P.filter((k) => k.teilVon.includes(m.id));
      const summe = kinder.reduce((s, k) => s + (k.kostenChf || 0), 0);
      const ectsSumme = kinder.reduce((s, k) => s + (k.ects || 0), 0);
      return `<section class="baum">
        <div class="baum-kopf">
          <h3><button data-detail="${m.id}">${esc(m.titel)}</button></h3>
          <span class="meta">${esc(m.schule)} · ${m.ects ? m.ects + " ECTS · " : ""}${m.kostenChf ? chf(m.kostenChf) : "Kosten k. A."} · ${passungHtml(m.passung)}</span>
        </div>
        <ul class="zweige">
          ${kinder.map((k) => `<li class="${Speicher.istFav(k.id) ? "gewaehlt" : ""}">
            <button class="name" data-detail="${k.id}">${esc(k.abschluss)} · ${esc(k.titel.replace(/^CAS\s+/, ""))}</button>
            <span class="meta">${k.ects ? k.ects + " ECTS · " : ""}${k.kostenChf ? chf(k.kostenChf) : "k. A."}</span>
          </li>`).join("")}
          <li class="thesis"><span>${m.abschluss === "MAS" ? "Master-Thesis bzw. weitere Module nach Reglement" : "weitere Module nach Reglement"}</span><span class="meta"></span></li>
        </ul>
        <p class="baum-fuss">Hier erfasste Bausteine: <span class="num">${kinder.length}</span> mit zusammen <span class="num">${ectsSumme} ECTS</span> und <span class="num">${chf(summe)}</span>. ${esc(m.dauerText)}.</p>
      </section>`;
    }).join("");
  }

  function renderVergleich() {
    const el = $("#vergleich");
    const liste = vergleich.map((id) => NACH_ID[id]).filter(Boolean);
    if (!liste.length) {
      el.innerHTML = `<div class="leer vg-leer"><b>Noch nichts im Vergleich</b>Wähle im Katalog bis zu drei Angebote mit «Vergleichen» aus. Sie erscheinen hier nebeneinander.</div>`;
      return;
    }
    const minK = Math.min(...liste.map((p) => p.kostenChf ?? Infinity));
    const minD = Math.min(...liste.map((p) => p.dauerMonate ?? Infinity));
    const maxP = Math.max(...liste.map((p) => p.passung));
    // nur hervorheben, wenn sich die Angebote unterscheiden
    const differiert = (f) => new Set(liste.map(f)).size > 1;
    const zeilen = [
      ["Abschluss", (p) => esc(p.abschluss) + (p.ects ? ` · <span class="num">${p.ects} ECTS</span>` : "")],
      ["Schule", (p) => esc(p.schuleVoll)],
      ["Passung", (p) => passungHtml(p.passung), (p) => differiert((x) => x.passung) && p.passung === maxP],
      ["Dauer", (p) => esc(p.dauerText), (p) => differiert((x) => x.dauerMonate) && p.dauerMonate === minD],
      ["Kosten", (p) => esc(p.kostenText), (p) => differiert((x) => x.kostenChf) && p.kostenChf === minK],
      ["Nähe zum Beruf", (p) => NAEHE_LABEL[p.naehe]],
      ["Zeitmodell", (p) => esc(p.zeitmodell.join(" / "))],
      ["Form", (p) => esc(p.form)],
      ["Ort", (p) => esc(p.orte.join(", "))],
      ["Sprache", (p) => esc(p.sprache.join(", "))],
      ["Zulassung", (p) => `<span class="zul" data-z="${p.zulassungFh}">${ZUL_KURZ[p.zulassungFh]}</span><br>${esc(p.zulassung)}`],
      ["Start", (p) => esc(p.start)],
      ["Was du lernst", (p) => esc(p.inhalt)],
      ["Warum relevant", (p) => esc(p.relevanz)],
      ["Wofür brauchbar", (p) => esc(p.nutzen)],
      ["Meine Notiz", (p) => esc(Speicher.notiz(p.id)) || '<span style="color:var(--muted)">–</span>']
    ];
    el.innerHTML = `<div class="vg-scroll"><table class="vg">
      <thead><tr><th></th>${liste.map((p) => `<th>${esc(p.titel)}<button class="x" data-entfernen="${p.id}">✕ entfernen</button></th>`).join("")}</tr></thead>
      <tbody>${zeilen.map(([t, f, best]) => `<tr><th scope="row">${t}</th>${liste.map((p) => `<td class="${best && best(p) ? "bester" : ""}">${f(p)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>
    <p style="font-size:12.5px;color:var(--muted)">Grün markiert: kürzeste Dauer, tiefste Kosten, beste Passung.</p>`;
  }

  function renderZaehler() {
    $("#zahl-vergleich").textContent = vergleich.length || "";
    $("#zahl-merkliste").textContent = Speicher.daten.favoriten.length || "";
  }

  function render() {
    renderZaehler();
    if (ansicht === "katalog") renderKatalog();
    if (ansicht === "merkliste") renderMerkliste();
    if (ansicht === "baukasten") renderBaukasten();
    if (ansicht === "vergleich") renderVergleich();
    const offen = $("#schublade").dataset.id;
    if (offen && !$("#schublade").hidden) aktualisiereSchubladeKnoepfe(offen);
  }

  function zeigeAnsicht(a) {
    ansicht = a;
    document.querySelectorAll(".reiter button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.ansicht === a)));
    ["katalog", "baukasten", "vergleich", "merkliste"].forEach((x) => ($("#ansicht-" + x).hidden = x !== a));
    $("#filter").hidden = a !== "katalog";
    $("#haupt").style.gridTemplateColumns = a === "katalog" ? "" : "minmax(0, 1fr)";
    render();
  }

  // ───────── Detail ─────────
  function oeffneDetail(id) {
    const p = NACH_ID[id];
    if (!p) return;
    const s = $("#schublade");
    const eltern = p.teilVon.map((x) => NACH_ID[x]).filter(Boolean);
    const kinder = P.filter((k) => k.teilVon.includes(p.id));
    s.dataset.id = id;
    s.innerHTML = `
      <button class="zu" id="d-zu" aria-label="Schliessen">✕</button>
      <div style="display:flex;gap:10px;align-items:center"><span class="abschluss" data-a="${esc(p.abschluss)}">${esc(p.abschluss)}</span>${passungHtml(p.passung)}</div>
      <h2 id="d-titel">${esc(p.titel)}</h2>
      <p class="schule">${esc(p.schuleVoll)}</p>
      <div class="aktionen" id="d-aktionen"></div>
      <div class="eyebrow" style="margin-bottom:6px">Schnellcheck</div>
      <dl class="tabelle">
        <dt>ECTS</dt><dd class="num">${p.ects ?? "–"}</dd>
        <dt>Dauer</dt><dd>${esc(p.dauerText)}</dd>
        <dt>Kosten</dt><dd>${esc(p.kostenText)}</dd>
        <dt>Zeitmodell</dt><dd>${esc(p.zeitmodell.join(" / "))}</dd>
        <dt>Form</dt><dd>${esc(p.form)}</dd>
        <dt>Ort</dt><dd>${esc(p.orte.join(", "))}</dd>
        <dt>Sprache</dt><dd>${esc(p.sprache.join(", "))}</dd>
        <dt>Zulassung</dt><dd><span class="zul" data-z="${p.zulassungFh}">${ZUL_TEXT[p.zulassungFh]}</span><br>${esc(p.zulassung)}</dd>
        <dt>Start</dt><dd>${esc(p.start)}</dd>
        <dt>Nähe zum Beruf</dt><dd>${NAEHE_LABEL[p.naehe]}</dd>
        <dt>Themen</dt><dd>${esc(p.themen.join(", "))}</dd>
      </dl>
      <div class="abschnitt betont"><h4>Warum relevant für Architekt:innen BSc FH</h4><p>${esc(p.relevanz)}</p></div>
      <div class="abschnitt"><h4>Was du lernst</h4><p>${esc(p.inhalt)}</p></div>
      <div class="abschnitt"><h4>Wofür brauchbar</h4><p>${esc(p.nutzen)}</p></div>
      ${eltern.length ? `<div class="abschnitt"><h4>Anrechenbar an</h4><div class="verwandt">${eltern.map((e) => `<button data-detail="${e.id}">${esc(e.abschluss)} · ${esc(e.titel)}</button>`).join("")}</div></div>` : ""}
      ${kinder.length ? `<div class="abschnitt"><h4>Bausteine</h4><div class="verwandt">${kinder.map((k) => `<button data-detail="${k.id}">${esc(k.titel)}</button>`).join("")}</div></div>` : ""}
      ${p.hinweis ? `<p class="hinweis">${esc(p.hinweis)}</p>` : ""}
      <div class="abschnitt">
        <h4><label for="notiz-${p.id}">Meine Notiz</label></h4>
        <textarea class="notiz" id="notiz-${p.id}" data-notiz="${p.id}" placeholder="z.B. Infoabend am …, Arbeitgeber zahlt 50 %, Frage zur Zulassung …">${esc(Speicher.notiz(p.id))}</textarea>
        <div class="notiz-status" id="notiz-status" aria-live="polite"></div>
      </div>
      <p><a href="${esc(p.url)}" target="_blank" rel="noopener">Zur Programmseite der Schule ↗</a></p>`;
    aktualisiereSchubladeKnoepfe(id);
    s.hidden = false;
    $("#schleier").hidden = false;
    document.body.style.overflow = "hidden";
    $("#d-zu").focus();
  }

  function aktualisiereSchubladeKnoepfe(id) {
    const box = $("#d-aktionen");
    if (!box) return;
    const fav = Speicher.istFav(id);
    const inVg = vergleich.includes(id);
    box.innerHTML = `
      <button class="aktion merken" data-akt="merken" data-id="${id}" aria-pressed="${fav}">${fav ? ICON.sternVoll : ICON.stern}${fav ? "Gemerkt" : "Merken"}</button>
      <button class="aktion vergl" data-akt="vergleichen" data-id="${id}" aria-pressed="${inVg}" ${!inVg && vergleich.length >= MAX_VERGLEICH ? "disabled" : ""}>${ICON.waage}${inVg ? "Im Vergleich" : "Vergleichen"}</button>`;
  }

  function schliesseDetail() {
    $("#schublade").hidden = true;
    $("#schleier").hidden = true;
    $("#schublade").dataset.id = "";
    document.body.style.overflow = "";
    render();
  }

  // ───────── Aktionen ─────────
  function aktion(akt, id) {
    if (akt === "merken") Speicher.toggleFav(id);
    if (akt === "vergleichen") {
      vergleich = vergleich.includes(id) ? vergleich.filter((x) => x !== id) : vergleich.length < MAX_VERGLEICH ? [...vergleich, id] : vergleich;
      lsSet("av.vergleich.v1", vergleich);
    }
    if (akt === "details") { oeffneDetail(id); return; }
    render();
  }

  function ereignisse() {
    document.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip[data-key]");
      if (chip) {
        const k = chip.dataset.key, v = chip.dataset.val;
        F[k] = F[k].includes(v) ? F[k].filter((x) => x !== v) : [...F[k], v];
        chip.setAttribute("aria-pressed", String(F[k].includes(v)));
        filterGeaendert();
        return;
      }
      const btn = e.target.closest("[data-akt]");
      if (btn) {
        const id = btn.dataset.id || btn.closest("[data-id]")?.dataset.id;
        if (id) aktion(btn.dataset.akt, id);
        return;
      }
      const det = e.target.closest("[data-detail]");
      if (det) { oeffneDetail(det.dataset.detail); return; }
      const weg = e.target.closest("[data-entfernen]");
      if (weg) { aktion("vergleichen", weg.dataset.entfernen); return; }
      const tab = e.target.closest(".reiter button");
      if (tab) { zeigeAnsicht(tab.dataset.ansicht); return; }
      if (e.target.id === "d-zu" || e.target.id === "schleier") schliesseDetail();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#schublade").hidden) schliesseDetail(); });
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.notiz) {
        Speicher.setNotiz(t.dataset.notiz, t.value);
        $("#notiz-status").textContent = "Wird gespeichert …";
        return;
      }
      if (t.id === "f-suche") { F.suche = t.value.trim(); filterGeaendert(); }
      if (t.id === "f-kosten") { F.kostenMax = +t.value; regler(); filterGeaendert(); }
      if (t.id === "f-dauer") { F.dauerMax = +t.value; regler(); filterGeaendert(); }
    });
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "f-ohnepreis") { F.ohnePreis = t.checked; filterGeaendert(); }
      if (t.id === "f-ort") { F.ort = t.value; filterGeaendert(); }
      if (t.id === "f-passung") { F.passungMin = +t.value; filterGeaendert(); }
      if (t.id === "sortierung") { F.sort = t.value; filterGeaendert(); }
    });
    $("#f-reset").addEventListener("click", () => { F = STANDARD(); filterAufbauen(); filterGeaendert(); });
    $("#filter-toggle").addEventListener("click", () => {
      const f = $("#filter");
      const zu = f.dataset.zu !== "true";
      f.dataset.zu = String(zu);
      $("#filter-toggle").setAttribute("aria-expanded", String(!zu));
      $("#filter-toggle").textContent = zu ? "Filter anzeigen" : "Filter ausblenden";
    });
    Speicher.zuhoerer.push((s) => {
      const el = $("#notiz-status");
      if (!el) return;
      el.textContent = s === "fehler" ? "Speichern fehlgeschlagen. Die Notiz bleibt in diesem Browser erhalten." : Speicher.modus === "konto" ? "Gespeichert, auf allen Geräten verfügbar." : "Gespeichert in diesem Browser.";
    });
  }

  // ───────── Kopf ─────────
  function kopf() {
    const stand = new Date(DATEN.stand + "T00:00:00");
    $("#stand").textContent = stand.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    $("#anzahl-total").textContent = P.length;
    $("#anzahl-schulen").textContent = OPTIONEN.schule.length;
    const alterMt = (Date.now() - stand.getTime()) / (30.4 * 864e5);
    $("#stand-hinweis").innerHTML = alterMt > 6 ? `<span class="alt">Älter als 6 Monate, Aktualisierung fällig</span>` : `Nächste Prüfung: ${new Date(stand.getTime() + 182 * 864e5).toLocaleDateString("de-CH", { month: "long", year: "numeric" })}`;
    $("#ziele").innerHTML = `<span class="ziel" style="background:transparent;padding-left:0;color:var(--muted)">Deine Ziele:</span>` + DATEN.profil.ziele.map((z) => `<span class="ziel">${esc(z)}</span>`).join("");
  }

  // ───────── Start ─────────
  kopf();
  filterAufbauen();
  ereignisse();
  zeigeSync();
  const start = (location.hash || "").replace("#", "");
  zeigeAnsicht(["katalog", "baukasten", "vergleich", "merkliste"].includes(start) ? start : "katalog");
  Speicher.verbinden();
})();
