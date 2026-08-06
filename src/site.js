"use strict";

const partkeys = ["root", "combined", "ch1", "ch2", "ch3", "ch4", "ch5"];
const partlabel = {root: "launcher", ch1: "chapter 1", ch2: "chapter 2", ch3: "chapter 3", ch4: "chapter 4", ch5: "chapter 5", combined: "chapter 1&2"};
const particon = {ch1: "ch1.png", ch2: "ch2.png", ch3: "ch3tv.png", ch4: "ch4.png", ch5: "ch5.png"};
const eralabels = {demo: "ch1&2", release: "ch3&4", ch5: "ch5"};
const exclude = new Set();
const staticbase = "/assets/static";
const diffbase = "/diffs"; 

let manifest = null;
let changelogset = new Set();
let steamset = new Set();
let assetset = new Set();
let assetindex = {};
let doodles = {};
const diffcache = {};
const clcache = {};
const clraw = {};
const assetcache = {};

const assetkinds = [
  {key: "sounds", label: "sounds"},
  {key: "sprites", label: "sprites"},
  {key: "objects", label: "objects"},
  {key: "strings", label: "strings"},
  {key: "rooms", label: "rooms"},
  {key: "fonts", label: "fonts"},
];
const kindorder = ["code", ...assetkinds.map(k => k.key)];
const sel = {version: null, chapter: null, file: null, kind: "code", mode: "changelog", clview: "twitter", hideids: false};
const idkey = "drdiff-hideids";

/*//////////////////////////////////////////////////////////////////////*/

// 👢 <-
async function boot() {
  try {
    manifest = await fetchjson(staticbase + "/manifest.json");
    let clindex, stindex, asindex;
    [clindex, doodles, stindex, asindex] = await Promise.all([
      fetchjson(staticbase + "/changelogs/index.json").catch(() => []),
      fetchjson(staticbase + "/doodles.json").catch(() => ({})),
      fetchjson(staticbase + "/steamchangelogs/index.json").catch(() => []),
      fetchjson(diffbase + "/assetindex.json").catch(() => ({})),
    ]);
    changelogset = new Set(clindex);
    steamset = new Set(stindex);
    assetindex = asindex;
    assetset = new Set(Object.keys(asindex));
  } catch (e) {
    document.querySelector(".content").innerHTML = "<div class=\"hint\">no data. run buildsite.py.</div>";
    return;
  }
  manifest.versions = manifest.versions.filter(v => !exclude.has(v.label));
  buildrail();
  initidfilter();
  pixify(document.querySelector(".cswlabel"));
  for (const b of document.querySelectorAll(".cswbtn")) {
    b.addEventListener("click", () => {
      const v = b.dataset.view;
      sel.clview = (sel.mode === "changelog" && sel.clview === v) ? null : v;
      sel.mode = sel.clview ? "changelog" : "diff";
      if (sel.mode === "diff") ensurekind();
      buildkindswitch();
      buildchapters();
      rendercontent();
    });
  }
  const hash = decodeURIComponent(location.hash.slice(1));
  const start = manifest.versions.find(v => v.label === hash) || manifest.versions[manifest.versions.length - 1];
  await selectversion(start.label);
  const q = new URLSearchParams(location.search);
  const cl = q.get("cl") || (q.has("changelog") ? "twitter" : "");
  if (cl) {
    sel.clview = cl;
    sel.mode = "changelog";
    rendercontent();
  }
  const selp = q.get("sel");
  if (selp) {
    const i = selp.indexOf("/");
    sel.chapter = selp.slice(0, i);
    sel.file = selp.slice(i + 1);
    sel.kind = "code";
    sel.mode = "diff";
    buildkindswitch();
    buildchapters();
    rendercontent();
  }
  // deep link
  const kind = q.get("kind") || (q.get("mode") === "assets" ? (q.get("cat") || "sprites") : "");
  if (kind && kind !== "code" && (assetindex[sel.version] || []).includes(kind)) {
    sel.kind = kind;
    sel.mode = "diff";
    if (q.get("ch")) sel.chapter = q.get("ch");
    buildkindswitch();
    buildchapters();
    rendercontent();
  }
}

async function fetchjson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}

async function fetchtext(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.text();
}

let pixpending = [];
function pixify(el) {
  if (!el) return;
  if (window.pixelize) window.pixelize(el);
  else pixpending.push(el);
}
window.addEventListener("fontready", () => {
  for (const el of pixpending) window.pixelize(el);
  pixpending = [];
});

const diffrx = /^FILE (root|ch\d|combined)\/(\S+) ([MAD]) (\d+) (\d+)$/;
function parsediff(text, t) {
  const parsed = {};
  let cur = null, body = [];
  const flush = () => {
    if (!cur) return;
    const p = parsed[cur.part] || (parsed[cur.part] = {modified: [], added: [], removed: []});
    while (body.length && body[body.length - 1] === "") body.pop();
    const content = body.join("\n");
    if (cur.kind === "M") p.modified.push({file: cur.file, plus: cur.plus, minus: cur.minus, diff: content});
    else if (cur.kind === "A") p.added.push({file: cur.file, lines: cur.plus, content: content});
    else p.removed.push({file: cur.file, lines: cur.minus, content: content});
  };
  for (const l of text.split("\n")) {
    const m = diffrx.exec(l);
    if (m) {flush(); cur = {part: m[1], file: m[2], kind: m[3], plus: +m[4], minus: +m[5]}; body = [];}
    else if (cur) body.push(l);
  }
  flush();
  const parts = {};
  for (const part in t.parts) {
    const s = t.parts[part];
    const pp = parsed[part] || {modified: [], added: [], removed: []};
    parts[part] = {
      modified: pp.modified, added: pp.added, removed: pp.removed,
      addedcount: s.a, removedcount: s.r, modifiedcount: s.m,
      plus: s.p, minus: s.mi, collapsed: !!s.collapsed,
    };
  }
  return {parts};
}

/*//////////////////////////////////////////////////////////////////////*/

const numrx = /(?<![\w.])\d+(?![\w.])/g;
const strrx = /"(?:[^"\\]|\\.)*"/g;

function numpairs(a, b) {
  const ma = a.replace(strrx, m => " ".repeat(m.length));
  const mb = b.replace(strrx, m => " ".repeat(m.length));
  const na = ma.match(numrx), nb = mb.match(numrx);
  if (!na || !nb || na.length !== nb.length) return null;
  if (ma.replace(numrx, "#") !== mb.replace(numrx, "#")) return null;
  return na.map((x, i) => [+x, +nb[i]]);
}
function isidswap(a, b, idset) {
  const pairs = numpairs(a, b);
  if (!pairs) return false;
  let moved = false;
  for (const [x, y] of pairs) {
    if (x === y) continue;
    moved = true;
    const d = y - x, lo = Math.min(x, y);
    const relok = lo >= 100 && Math.abs(d) / Math.max(x, y) < 0.02;
    const setok = lo >= 100 && idset && idset.has(d);
    if (!relok && !setok) return false;
  }
  return moved;
}
function partiddeltas(d) {
  const freq = new Map();
  for (const m of (d.modified || [])) {
    const lines = m.diff.split("\n");
    let i = 0;
    while (i < lines.length) {
      if (!lines[i].startsWith("-")) {i++; continue;}
      let j = i; while (j < lines.length && lines[j].startsWith("-")) j++;
      let k = j; while (k < lines.length && lines[k].startsWith("+")) k++;
      const n = j - i;
      if (k - j === n) for (let t = 0; t < n; t++) {
        const pairs = numpairs(lines[i + t].slice(1), lines[j + t].slice(1));
        if (pairs) for (const [x, y] of pairs)
          if (x !== y && Math.min(x, y) >= 100) freq.set(y - x, (freq.get(y - x) || 0) + 1);
      }
      i = k;
    }
  }
  const set = new Set();
  for (const [d2, c] of freq) if (c >= 3) set.add(d2);
  return set;
}
function idsetof(d) {
  if (!d) return null;
  return d.idset || (d.idset = partiddeltas(d));
}
function dropemptyhunks(lines) {
  const out = [];
  let buf = null, live = false;
  const flush = () => {if (buf && live) out.push(...buf); buf = null; live = false;};
  for (const l of lines) {
    if (l.startsWith("@@")) {flush(); buf = [l]; continue;}
    if (!buf) {out.push(l); continue;}
    buf.push(l);
    if (l[0] === "+" || l[0] === "-") live = true;
  }
  flush();
  return out;
}
function cancelhunk(lines, idset) {
  const rem = [], add = [];
  lines.forEach((l, i) => {if (l[0] === "-") rem.push(i); else if (l[0] === "+") add.push(i);});
  const used = new Set(), cancel = new Set();
  for (const ri of rem) for (const ai of add) {
    if (used.has(ai)) continue;
    const a = lines[ri].slice(1), b = lines[ai].slice(1);
    if (a === b || isidswap(a, b, idset)) {used.add(ai); cancel.add(ri); cancel.add(ai); break;}
  }
  const out = [];
  lines.forEach((l, i) => {
    if (!cancel.has(i)) out.push(l);
    else if (l[0] === "+") out.push(" " + l.slice(1));
  });
  return out;
}

function filterdiff(txt, idset) {
  const lines = txt.split("\n"), out = [];
  let hunk = [];
  const flush = () => {if (hunk.length) {out.push(...cancelhunk(hunk, idset)); hunk = [];}};
  for (const l of lines) {
    if (l.startsWith("@@")) {flush(); out.push(l); continue;}
    hunk.push(l);
  }
  flush();
  return dropemptyhunks(out);
}

function filtered(mod, idset) {
  if (!mod.flines) {
    mod.flines = filterdiff(mod.diff, idset);
    mod.fplus = mod.flines.filter(l => l.startsWith("+")).length;
    mod.fminus = mod.flines.filter(l => l.startsWith("-")).length;
  }
  return mod;
}

function realmods(d) {
  if (!sel.hideids || !d.modified) return d.modified || [];
  const idset = idsetof(d);
  return d.modified.filter(m => filtered(m, idset).fplus || m.fminus);
}

function partcounts(d) {
  if (!sel.hideids || d.collapsed || !d.modified || !d.modified.length)
    return {a: d.addedcount, m: d.modifiedcount, r: d.removedcount};
  return {a: d.addedcount, m: realmods(d).length, r: d.removedcount};
}

function initidfilter() {
  const box = document.querySelector(".idfilter");
  sel.hideids = localStorage.getItem(idkey) !== "0";   // on by default, only an explicit off sticks
  const paint = () => {
    box.classList.toggle("on", sel.hideids);
    box.querySelector(".ifcheck").src = "/assets/images/check" + (sel.hideids ? "on" : "off") + ".png";
  };
  box.addEventListener("click", () => {
    sel.hideids = !sel.hideids;
    localStorage.setItem(idkey, sel.hideids ? "1" : "0");
    paint();
    buildkindswitch();
    buildchapters();
    rendercontent();
  });
  paint();
  pixify(box);
}

/*//////////////////////////////////////////////////////////////////////*/

function buildrail() {
  const rail = document.querySelector(".versionrail");
  rail.innerHTML = "";
  const eras = [];
  for (const v of manifest.versions) {
    let g = eras.find(e => e.era === v.era);
    if (!g) {g = {era: v.era, items: []}; eras.push(g);}
    g.items.push(v);
  }
  for (const g of eras) {
    const row = el("div", "erarow");
    const lab = el("div", "eralabel");
    lab.setAttribute("fnt_main", "");
    lab.textContent = eralabels[g.era] || g.era;
    row.appendChild(lab);

    const chips = el("div", "erachips");
    for (const v of g.items) {
      const baseline = !transitionto(v.label); // nothing before it to diff against
      const chip = el("button", "vchip" + (baseline ? " baseline" : ""));
      chip.dataset.v = v.label;
      chip.innerHTML = "<span class=\"vlabel\" fnt_main>" + esc(v.label) + "</span><span class=\"vdate\" fnt_small>" + esc(v.date || "") + "</span>" +
        (v.branch ? "<span class=\"vbranch\" fnt_small azure>" + esc(v.branch) + "</span>" : "");
      if (!baseline) chip.addEventListener("click", () => selectversion(v.label));
      chips.appendChild(chip);
    }
    row.appendChild(chips);
    rail.appendChild(row);
  }
  pixify(rail);
}

function transitionto(label) {
  return manifest.transitions.find(t => t.to === label) || null;
}

async function selectversion(label) {
  sel.version = label;
  location.hash = encodeURIComponent(label);
  for (const c of document.querySelectorAll(".vchip")) c.classList.toggle("active", c.dataset.v === label);
  const active = document.querySelector(".vchip.active");
  if (active) active.scrollIntoView({block: "nearest", inline: "center"});

  const t = transitionto(label);
  let diff = null;
  if (t) {
    try {
      if (!diffcache[t.id]) {
        const txt = await fetchtext(diffbase + "/code/" + t.id + ".diff");
        diffcache[t.id] = parsediff(txt, t);
      }
      diff = diffcache[t.id];
    } catch (e) { diff = null; }
  }
  sel.diff = diff;
  sel.trans = t;
  await loadassets(label);

  if (!presentkinds().includes(sel.kind)) sel.kind = presentkinds().includes("code") ? "code" : (presentkinds()[0] || "code");

  const codeparts = partkeys.filter(p => {const cd = diff && diff.parts[p]; return cd && !cd.collapsed && changedcount(cd) > 0;});
  const anyparts = partkeys.filter(partanychange);
  sel.chapter = codeparts.slice(-1)[0] || anyparts.slice(-1)[0] || null;
  sel.file = null;
  ensurekind();
  buildkindswitch();
  buildchapters();
  const hastwitter = changelogset.has(label), hassteam = steamset.has(label);
  const ok = {twitter: hastwitter, steam: hassteam, diff: hastwitter && hassteam};
  const waschangelog = sel.mode === "changelog";
  if (waschangelog) {
    if (!sel.clview || !ok[sel.clview]) sel.clview = hastwitter ? "twitter" : (hassteam ? "steam" : null);
    if (!sel.clview) sel.mode = "diff";
  } else {
    sel.clview = null;
  }
  updatechangelogbtn();
  rendercontent();
}

function presentkinds() {
  return kindorder.filter(k => k === "code" ? (sel.diff && anycodechange()) : (assetindex[sel.version] || []).includes(k));
}
function anycodechange() {
  return partkeys.some(p => {const d = sel.diff && sel.diff.parts[p]; return d && (d.collapsed || changedcount(d) > 0);});
}
function hasassetchange(p) {
  const ad = assetdata() && assetdata()[p];
  if (!ad) return false;
  for (const k in ad) {const t = ad[k]; if ((t.added || []).length + (t.removed || []).length + (t.changed || []).length) return true;}
  return false;
}

function partanychange(p) {
  const d = sel.diff && sel.diff.parts[p];
  if (d && (d.collapsed || changedcount(d) > 0)) return true;
  return hasassetchange(p);
}
function kindavailable(part, kind) {
  if (kind === "code") {const d = sel.diff && sel.diff.parts[part]; if (d && d.collapsed) return true;}
  const c = kindcounts(part, kind);
  return c.a + c.r + c.c > 0;
}
function ensurekind() {
  if (!sel.chapter || kindavailable(sel.chapter, sel.kind)) return;
  const ks = presentkinds();
  sel.kind = (kindavailable(sel.chapter, "code") && "code") || ks.find(k => kindavailable(sel.chapter, k)) || sel.kind;
}
function selectchapter(p) {
  sel.chapter = p;
  sel.file = null;
  if (sel.mode === "diff") ensurekind();
  buildkindswitch();
  buildchapters();
  rendercontent();
}

async function loadassets(label) {
  if (!assetset.has(label) || assetcache[label]) return;
  const types = assetindex[label] || [];
  const loaded = await Promise.all(types.map(t =>
    fetchjson(diffbase + "/" + t + "/" + label + ".json").catch(() => ({})).then(d => [t, d])));
  const byPart = {};
  for (const [t, perpart] of loaded)
    for (const part in perpart) (byPart[part] || (byPart[part] = {}))[t] = perpart[part];
  assetcache[label] = byPart;
}

function changedcount(p) {
  const c = partcounts(p);
  return (c.a || 0) + (c.r || 0) + (c.m || 0);
}

function assetdata() {
  return assetcache[sel.version] || null;
}

function kindcounts(part, kind) {
  if (kind === "code") {
    const d = sel.diff && sel.diff.parts[part];
    if (!d || d.collapsed) return {a: 0, r: 0, c: 0};
    return {a: partcounts(d).a, r: partcounts(d).r, c: partcounts(d).m};
  }
  const t = assetdata() && assetdata()[part] && assetdata()[part][kind];
  return t ? {a: (t.added || []).length, r: (t.removed || []).length, c: (t.changed || []).length} : {a: 0, r: 0, c: 0};
}
function countbadge(c, locked) {
  const bits = [];
  if (c.a) bits.push("<span green>+" + c.a + "</span>");
  if (!locked && c.c) bits.push("<span azure>~" + c.c + "</span>");
  if (c.r) bits.push("<span red>-" + c.r + "</span>");
  return "<span class=\"cbadge\" fnt_small>" + bits.join("") + "</span>";
}

function buildkindswitch() {
  const grid = document.querySelector(".kindswitch");
  grid.innerHTML = "";
  for (const k of presentkinds()) {
    const avail = kindavailable(sel.chapter, k);
    const cell = el("button", "kcell" + (avail ? "" : " dim"));
    cell.dataset.kind = k;
    cell.innerHTML = "<span class=\"kname\" fnt_main>" + k + "</span>" + countbadge(kindcounts(sel.chapter, k), false);
    if (avail) cell.addEventListener("click", () => {
      sel.kind = k; sel.mode = "diff"; sel.clview = null; sel.file = null;
      buildchapters();
      rendercontent();
    });
    grid.appendChild(cell);
  }
  pixify(grid);
}

function buildchapters() {
  const bar = document.querySelector(".chaptertabs");
  bar.innerHTML = "";
  const code = sel.kind === "code";
  document.querySelector(".idfilter").style.display = (sel.diff && code && sel.mode === "diff") ? "" : "none";
  for (const p of partkeys) {
    if (!partanychange(p)) continue;
    const d = sel.diff && sel.diff.parts[p];
    const c = kindcounts(p, sel.kind);
    const locked = code && d && !!d.collapsed;
    const muted = !locked && code && !c.a && !c.c && c.r;
    const tab = el("button", "ctab" + (locked ? " locked" : "") + (muted ? " muted" : ""));
    tab.dataset.part = p;
    const iurl = particon[p] ? "/assets/images/chapters/" + particon[p] : "";
    const icon = iurl ? "<span class=\"cicon\"><img src=\"" + iurl + "\" alt=\"\"></span>" : "";
    tab.innerHTML = icon + "<span class=\"ctext\"><span class=\"cname\" fnt_main>" + esc(partlabel[p]) + "</span>" + countbadge(c, locked) + "</span>";
    if (!locked && !muted) tab.addEventListener("click", () => selectchapter(p));
    bar.appendChild(tab);
  }
  if (!bar.querySelector(`.ctab[data-part="${sel.chapter}"]`)) {
    const first = bar.querySelector(".ctab:not(.locked):not(.muted)") || bar.querySelector(".ctab");
    if (first) sel.chapter = first.dataset.part;
  }
  pixify(bar);
}

function markchaptertab() {
  for (const t of document.querySelectorAll(".ctab"))
    t.classList.toggle("active", t.dataset.part === sel.chapter);
  for (const b of document.querySelectorAll(".kcell"))
    b.classList.toggle("on", sel.mode === "diff" && b.dataset.kind === sel.kind);
  for (const b of document.querySelectorAll(".cswbtn"))
    b.classList.toggle("on", sel.mode === "changelog" && sel.clview === b.dataset.view);
}

/*//////////////////////////////////////////////////////////////////////*/

function rendercontent() {
  markchaptertab();
  marksidebar();
  const asset = sel.mode === "diff" && sel.kind !== "code";
  document.querySelector(".filelist").style.display = asset ? "none" : "";
  if (!asset) {sel.trans ? renderfilelist() : renderbaselinelist();}
  if (sel.mode === "changelog") {renderchangelog(); return;}
  if (asset) return renderassetmain();
  if (!sel.trans) return renderbaselinepane();
  renderdiffpane();
}

function marksidebar() {
  document.querySelector(".sidebar").classList.remove("nocode", "empty");
}

function renderbaselinelist() {
  document.querySelector(".filelist").innerHTML = "<div class=\"fempty\">nothing prior to diff against..</div>";
}
function renderbaselinepane() {
  document.querySelector(".content").innerHTML = "<div class=\"notecode\">" + esc(sel.version) +
    " is the earliest build, there's no earlier version here to diff against..</div>";
}

function updatechangelogbtn() {
  const sw = document.querySelector(".changelogswitch");
  const hastwitter = changelogset.has(sel.version), hassteam = steamset.has(sel.version);
  sw.style.display = (hastwitter || hassteam) ? "" : "none";
  sw.querySelector("[data-view=twitter]").style.display = hastwitter ? "" : "none";
  sw.querySelector("[data-view=steam]").style.display = hassteam ? "" : "none";
  sw.querySelector("[data-view=diff]").style.display = (hastwitter && hassteam) ? "" : "none";
  const pad = (hastwitter || hassteam) ? sw.offsetHeight + 10 : 8;
  document.querySelector(".filelist").style.paddingBottom = pad + "px";
}

/*//////////////////////////////////////////////////////////////////////*/

function shortname(n) {
  return n.replace(/\.gml$/, "").replace(/^gml_/, "");
}

function renderfilelist() {
  const list = document.querySelector(".filelist");
  list.innerHTML = "";
  const d = sel.diff && sel.chapter ? sel.diff.parts[sel.chapter] : null;
  if (!d) {list.innerHTML = "<div class=\"fempty\">no chapter selected.</div>"; return;}
  if (d.collapsed) {
    list.innerHTML = "<div class=\"fempty\">" + (d.addedcount
      ? esc(partlabel[sel.chapter]) + " was added here.<br>" + d.addedcount + " new code entries."
      : esc(partlabel[sel.chapter]) + " was restructured here.<br>" + d.removedcount + " entries removed.") +
      "<br>excluded from the line diff.</div>";
    return;
  }
  const rows = [];
  for (const m of realmods(d)) rows.push({kind: "mod", file: m.file, mod: m});
  for (const o of d.added) rows.push({kind: "add", file: o.file, lines: o.lines});
  for (const o of d.removed) rows.push({kind: "del", file: o.file, lines: o.lines});
  if (!rows.length) {
    list.innerHTML = "<div class=\"fempty\">" + (sel.hideids && d.modifiedcount
      ? "every change in this chapter is an id swap."
      : "no changes in this chapter.") + "</div>";
    return;
  }

  for (const r of rows) {
    const row = el("div", "frow " + r.kind);
    row.dataset.file = r.file;
    let stat;
    const plus = sel.hideids && r.mod ? r.mod.fplus : (r.mod && r.mod.plus);
    const minus = sel.hideids && r.mod ? r.mod.fminus : (r.mod && r.mod.minus);
    if (r.kind === "add") stat = "<span class=\"fstat\" fnt_small><span class=\"p\" green>+" + r.lines + "</span></span>";
    else if (r.kind === "del") stat = "<span class=\"fstat\" fnt_small><span class=\"m\" red>-" + r.lines + "</span></span>";
    else stat = "<span class=\"fstat\" fnt_small><span class=\"p\" green>+" + plus + "</span> <span class=\"m\" red>-" + minus + "</span></span>";
    row.innerHTML = "<span class=\"fname\" title=\"" + esc(r.file) + "\">" + esc(shortname(r.file)) + "</span>" + stat;
    row.addEventListener("click", () => {sel.file = r.file; sel.mode = "diff"; sel.clview = null; renderdiffpane(); highlightrow(); markchaptertab();});
    list.appendChild(row);
  }
  if (!sel.file || !rows.some(r => r.file === sel.file)) sel.file = rows[0].file;
  highlightrow();
  pixify(list);
}

function highlightrow() {
  for (const r of document.querySelectorAll(".frow")) r.classList.toggle("active", r.dataset.file === sel.file);
}

/*//////////////////////////////////////////////////////////////////////*/

function renderdiffpane() {
  const c = document.querySelector(".content");
  const d = sel.diff && sel.chapter ? sel.diff.parts[sel.chapter] : null;
  if (!d) {c.innerHTML = "<div class=\"hint\">nothing to show.</div>"; return;}
  if (d.collapsed) {
    const msg = d.addedcount
      ? esc(partlabel[sel.chapter]) + " debuted in this version - " + d.addedcount + " code entries added at once."
      : esc(partlabel[sel.chapter]) + " was restructured here - " + d.removedcount + " entries removed (split into separate chapters).";
    c.innerHTML = "<div class=\"notecode\">" + msg + " excluded from the line diff.</div>";
    return;
  }
  const mod = realmods(d).find(m => m.file === sel.file);
  if (mod) {
    const body = sel.hideids ? filtered(mod).flines.join("\n") : mod.diff;
    c.innerHTML = "<div class=\"code\">" + renderdiff(body) + "</div>";
    c.scrollTop = 0;
    return;
  }
  const add = (d.added || []).find(a => a.file === sel.file);
  const del = (d.removed || []).find(r => r.file === sel.file);
  const whole = add || del;
  if (whole) {
    c.innerHTML = "<div class=\"code\">" + renderfull(whole.content, add ? "add" : "del") + "</div>";
    c.scrollTop = 0;
    return;
  }
  c.innerHTML = "<div class=\"notecode\">pick an entry.</div>";
}

function renderfull(content, kind) {
  let out = "";
  for (const l of content.split("\n"))
    out += "<span class=\"cline " + kind + "\">" + highlightgml(l) + "</span>";
  return out;
}

function renderdiff(txt) {
  let out = "";
  for (const l of txt.split("\n")) {
    if (l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("@@")) {out += "<span class=\"cline hunk\">" + esc(l) + "</span>"; continue;}
    let cls = "ctx", body = l;
    if (l.startsWith("+")) {cls = "add"; body = l.slice(1);}
    else if (l.startsWith("-")) {cls = "del"; body = l.slice(1);}
    else body = l.startsWith(" ") ? l.slice(1) : l;
    out += "<span class=\"cline " + cls + "\">" + highlightgml(body) + "</span>";
  }
  return out;
}

/*//////////////////////////////////////////////////////////////////////*/

function typebase(type) {
  return diffbase + "/" + type + "/" + encodeURIComponent(sel.version) + "/" + sel.chapter;
}

function renderassetmain() {
  const c = document.querySelector(".content");
  const pd = assetdata() ? assetdata()[sel.chapter] : null;
  const t = pd && pd[sel.kind];
  if (!t) {c.innerHTML = "<div class=\"notecode\">no " + esc(sel.kind) + " changes in this chapter.</div>"; return;}
  let h;
  if (sel.kind === "strings") h = stringsdiffhtml(t);
  else if (sel.kind === "sprites") h = spritesdiffhtml(t);
  else if (sel.kind === "sounds") h = soundsdiffhtml(t);
  else h = metadiffhtml(sel.kind, t);
  c.innerHTML = "<div class=\"assetview " + sel.kind + "\">" + h + "</div>";
  c.scrollTop = 0;
  if (sel.kind === "sprites") wirespritezoom(c);
}

function stringsdiffhtml(t) {
  const rows = [];
  for (const s of (t.removed || [])) rows.push("<div class=\"sline del\">" + esc(s) + "</div>");
  for (const s of (t.added || [])) rows.push("<div class=\"sline add\">" + esc(s) + "</div>");
  return "<div class=\"stringdiff\">" + rows.join("") + "</div>";
}

function spriteurl(side, name) {
  return typebase("sprites") + "/" + side + "/" + encodeURIComponent(name) + ".png";
}
function spriteimg(side, name) {
  return "<img class=\"aspr\" loading=\"lazy\" src=\"" + spriteurl(side, name) + "\" alt=\"\">";
}
function spritesdiffhtml(t) {
  const cards = [];
  for (const r of (t.added || []))
    cards.push(spritecard("added", r[0], meta(r), "new", null, "<div class=\"achk\">" + spriteimg("new", r[0]) + "</div>"));
  for (const ch of (t.changed || [])) {
    const r = ch.new;
    cards.push(spritecard("changed", r[0], meta(r), "new", "old", "<div class=\"achk\">" + spriteimg("new", r[0]) + "</div>"));
  }
  for (const r of (t.removed || []))
    cards.push(spritecard("removed", r[0], meta(r), "old", null, "<div class=\"achk\">" + spriteimg("old", r[0]) + "</div>"));
  return "<div class=\"agrid\">" + cards.join("") + "</div>";
  function meta(r) {return r[1] + "&times;" + r[2] + (r[5] && r[5] !== "1" ? ", " + r[5] + "f" : "");}
}
function spritecard(cls, name, metaText, side, side2, body) {
  return "<div class=\"acard sprite " + cls + "\" data-name=\"" + esc(name) + "\" data-side=\"" + side + "\"" +
    (side2 ? " data-side2=\"" + side2 + "\"" : "") + ">" +
    "<div class=\"acardtop\"><span class=\"acardname\" title=\"" + esc(name) + "\">" + esc(name) +
    "</span><span class=\"acardmeta\" fnt_small>" + metaText + "</span></div><div class=\"aimgs\">" + body + "</div></div>";
}

function wirespritezoom(root) {
  for (const card of root.querySelectorAll(".acard.sprite")) {
    card.addEventListener("click", () => openzoom(card.dataset.name, !!card.dataset.side2, card.dataset.side));
  }
}

// not sure if it's the best idea to make this a separate function, but, like, why would i repeat it dosens of times
function arrowimg(dir) {
  return "<img class=\"uarrow" + (dir === "right" ? " flip" : "") + "\" src=\"/assets/images/arrowleft.png\" alt=\"" + (dir === "right" ? "->" : "<-") + "\">";
}

function bestscale(natw, nath, availfrac) {
  const availw = window.innerWidth * availfrac - 24;
  const availh = window.innerHeight * 0.86 - 96;
  return Math.max(1, Math.min(Math.floor(availw / natw), Math.floor(availh / nath), 40));
}

function openzoom(name, compare, side) {
  let ov = document.querySelector(".zoomoverlay");
  if (!ov) {
    ov = el("div", "zoomoverlay");
    ov.addEventListener("click", () => ov.classList.remove("show"));
    document.body.appendChild(ov);
  }
  const inner = compare
    ? "<div class=\"zcompare\"><img class=\"zc-img zc-new\" src=\"" + spriteurl("new", name) + "\">" +
        "<div class=\"zc-clip\"><img class=\"zc-img zc-old\" src=\"" + spriteurl("old", name) + "\"></div>" +
        "<div class=\"zc-line\"></div><div class=\"zc-handle\"><img class=\"zc-knob\" src=\"/assets/images/circle.png\"></div>" +
      "</div><div class=\"zc-legend\"><span class=\"del\" fnt_main>old</span> " + arrowimg("left") +
        " <span fnt_main>drag to compare</span> " + arrowimg("right") + " <span class=\"add\" fnt_main>new</span></div>"
    : "<figure class=\"zfig\"><img class=\"zimg\" src=\"" + spriteurl(side, name) + "\"></figure>";
  ov.innerHTML = "<div class=\"zoombox\"><div class=\"zname\">" + esc(name) + "</div>" + inner + "</div>";
  ov.classList.add("show");
  ov.querySelector(".zoombox").onclick = e => e.stopPropagation();
  if (window.pixelize) window.pixelize(ov);
  if (compare) setupcompare(ov); else {
    const img = ov.querySelector(".zimg");
    const fit = () => {if (img.naturalWidth) img.style.width = (img.naturalWidth * bestscale(img.naturalWidth, img.naturalHeight, 0.88)) + "px";};
    img.complete ? fit() : (img.onload = fit);
  }
}

function setupcompare(ov) {
  const box = ov.querySelector(".zcompare");
  const nw = box.querySelector(".zc-new"), old = box.querySelector(".zc-old");
  const clip = box.querySelector(".zc-clip"), knob = box.querySelector(".zc-knob");
  const setsplit = f => {
    f = Math.max(0, Math.min(1, f));
    clip.style.width = (f * 100) + "%";
    box.style.setProperty("--split", (f * 100) + "%");
  };
  const layout = () => {
    if (!nw.naturalWidth) return;
    const s = bestscale(nw.naturalWidth, nw.naturalHeight, 0.88);
    const w = nw.naturalWidth * s, h = nw.naturalHeight * s;
    box.style.width = w + "px"; box.style.height = h + "px";
    for (const im of [nw, old]) {im.style.width = w + "px"; im.style.height = h + "px";}
    setsplit(0.5);
  };
  let lastx = null;
  const move = e => {
    const r = box.getBoundingClientRect();
    const x = e.clientX;
    setsplit((x - r.left) / r.width);
    if (lastx != null && x !== lastx) knob.className = "zc-knob " + (x < lastx ? "left" : "right");
    lastx = x;
  };
  const up = () => {
    knob.src = "/assets/images/circle.png"; knob.className = "zc-knob"; lastx = null;
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
  };
  box.addEventListener("pointerdown", e => {
    e.preventDefault();
    knob.src = "/assets/images/arrowleft.png"; lastx = null; move(e);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  });
  nw.complete ? layout() : (nw.onload = layout);
}

function soundsdiffhtml(t) {
  const render = t.render || {new: {}, old: {}};
  const audio = (side, name) => {
    const ext = render[side] && render[side][name];
    return ext ? "<audio controls preload=\"none\" src=\"" + typebase("sounds") + "/" + side + "/" + encodeURIComponent(name) + "." + ext + "\"></audio>" : "";
  };
  const cards = [];
  for (const r of (t.added || []))
    cards.push(soundcard("added", r[0], r, "<div class=\"asnd\">" + audio("new", r[0]) + "</div>"));
  for (const ch of (t.changed || []))
    cards.push(soundcard("changed", ch.new[0], ch.new,
      "<div class=\"asnd\"><span class=\"aside\">old</span>" + audio("old", ch.new[0]) + "</div><div class=\"asnd\"><span class=\"aside\">new</span>" + audio("new", ch.new[0]) + "</div>"));
  for (const r of (t.removed || []))
    cards.push(soundcard("removed", r[0], r, "<div class=\"asnd\">" + audio("old", r[0]) + "</div>"));
  return "<div class=\"asndlist\">" + cards.join("") + "</div>";
}
function soundcard(cls, name, r, body) {
  const kb = r[3] ? (r[3] / 1024).toFixed(1) + " KB" : "";
  return "<div class=\"acard snd " + cls + "\"><div class=\"acardtop\"><span class=\"acardname\">" + esc(name) +
    "</span><span class=\"acardmeta\" fnt_small>" + esc(r[1] || "") + " " + kb + "</span></div>" + body + "</div>";
}

const metacols = {
  objects: ["name", "sprite", "parent", "visible", "solid", "persistent", "depth", "physics"],
  rooms: ["name", "width", "height", "objects", "tiles", "layers", "backgrounds"],
  fonts: ["name", "display", "size", "bold", "italic", "rangestart", "rangeend", "glyphs", "hash"],
};
function metadiffhtml(cat, t) {
  const cols = metacols[cat] || [];
  const rows = [];

  const line = (cls, r, extra) =>
    "<div class=\"mline " + cls + "\"><span class=\"mname\">" + esc(r[0]) + "</span>" + (extra || "") + "</div>";
  for (const r of (t.added || [])) rows.push(line("add", r, fieldspan(cols, r)));
  for (const ch of (t.changed || [])) {
    const diffs = [];
    for (let i = 1; i < cols.length; i++)
      if (ch.old[i] !== ch.new[i])
        diffs.push("<span class=\"mfield\">" + cols[i] + ": <span class=\"del\">" + esc(ch.old[i]) + "</span> " + arrowimg("right") + " <span class=\"add\">" + esc(ch.new[i]) + "</span></span>");
    rows.push(line("chg", ch.new, "<span class=\"mfields\">" + diffs.join("") + "</span>"));
  }
  for (const r of (t.removed || [])) rows.push(line("del", r, fieldspan(cols, r)));
  return "<div class=\"metadiff\">" + rows.join("") + "</div>";
  function fieldspan(cols, r) {
    const bits = [];
    for (let i = 1; i < cols.length && i < r.length; i++)
      if (r[i] && r[i] !== "-" && cols[i] !== "hash") bits.push("<span class=\"mfield\">" + cols[i] + ": " + esc(r[i]) + "</span>");
    return "<span class=\"mfields\">" + bits.join("") + "</span>";
  }
}

/*//////////////////////////////////////////////////////////////////////*/

function doodlehtml(version, side) {
  const p = doodles[version] && doodles[version][side];
  if (!p) return "<span class=\"cl-dood-spacer\"></span>";
  return "<img class=\"cl-dood " + side + (p.flip ? " flip" : "") + "\" src=\"/assets/images/" + esc(p.src) + "\" alt=\"\">";
}

async function getcl(version) {
  if (clcache[version]) return clcache[version];
  const md = await fetchtext(staticbase + "/changelogs/" + version + ".md").catch(() => null);
  const parsed = md == null ? null : parsemd(md);
  clcache[version] = parsed;
  return parsed;
}

function parsemd(text) {
  if (text.startsWith("::raw")) return {raw: text.slice(text.indexOf("\n") + 1)};
  const out = {title: "", subtitle: "", intro: "", table: null, sections: [], outro: [], footer: ""};
  let cur = null, prevblank = true;
  const introlines = [];
  for (const raw of text.split("\n")) {
    const l = raw.replace(/\s+$/, "");
    if (!l.trim()) {prevblank = true; continue;}
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {cur = null; prevblank = true; continue;}
    if (l.startsWith("# ")) {out.title = l.slice(2).trim(); prevblank = false; continue;}
    if (l.startsWith("## ")) {out.subtitle = l.slice(3).trim(); prevblank = false; continue;}
    if (l.startsWith("### ")) {
      const name = l.slice(4).trim();
      prevblank = false;
      if (name === "Version Numbers") {out.table = {cols: [], rows: []}; cur = "table"; continue;}
      cur = {header: name, items: []};
      out.sections.push(cur);
      continue;
    }
    if (l.startsWith("#### ")) {
      cur = {header: l.slice(5).trim(), items: [], sub: true};
      out.sections.push(cur);
      prevblank = false;
      continue;
    }
    if (l.trim().startsWith("|") && cur === "table") {
      const cells = l.split("|").slice(1, -1).map(x => x.trim());
      prevblank = false;
      if (cells.every(x => /^-*$/.test(x))) continue;
      if (!out.table.cols.length && cells[0] === "") out.table.cols = cells.slice(1);
      else out.table.rows.push(cells);
      continue;
    }

    if (cur === "table" && /^\s*\S[^:]{0,23}:\s*\S/.test(l)) {
      const i = l.indexOf(":");
      out.table.rows.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]);
      prevblank = false;
      continue;
    }
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(l.trim())) { // standalone image
      const m = l.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      out.outro.push({img: m[2], alt: m[1]});
      cur = null;
      prevblank = true;
      continue;
    }
    if (/^_[^_].*_$/.test(l.trim())) {
      const note = l.trim().slice(1, -1);
      if (cur && cur.items) cur.items.push({note});
      else out.outro.push({note});
      prevblank = false;
      continue;
    }
    if (l.startsWith("- ")) {
      let txt = l.slice(2).trim();
      let tag = null;
      const m = txt.match(/^\[([^\]]+)\]\s*(?!\()/); // platform tag
      if (m) {tag = m[1]; txt = txt.slice(m[0].length);}
      if (!cur || !cur.items) {cur = {header: "", items: []}; out.sections.push(cur);}
      cur.items.push({text: txt, tag});
      prevblank = false;
      continue;
    }
    if (l.startsWith("> ")) {out.footer = (out.footer + " " + l.slice(2).trim()).trim(); prevblank = false; continue;}
    if (cur === "table" || (!out.sections.length && !out.table)) introlines.push(l.trim());
    else if (!prevblank && cur && cur.items && cur.items.length) cur.items[cur.items.length - 1].text += " " + l.trim();
    else if (!out.sections.length) introlines.push(l.trim());
    else out.outro.push(l.trim());
    prevblank = false;
  }
  out.intro = introlines.join(" ");
  return out;
}

async function renderchangelog() {
  const c = document.querySelector(".content");
  const version = sel.version;
  let body;
  if (sel.clview === "diff") {
    body = await renderwordingdiff(version);
  } else if (sel.clview === "steam") {
    const st = await getsteamcl(version);
    body = st ? recreationhtml(st, version) : nochangeloghtml(version);
  } else {
    const cl = await getcl(version);
    body = cl ? recreationhtml(cl, version) : nochangeloghtml(version);
  }
  if (version !== sel.version || sel.mode !== "changelog") return;
  c.innerHTML = body;
  c.scrollTop = 0;
}

function nochangeloghtml(version) {
  return "<div class=\"changelog\"><div class=\"cl-title\">no changelog</div>" +
    "<div class=\"cl-intro\">no official patch notes were posted for " + esc(version) + ".</div></div>";
}

async function getsteamcl(version) {
  const key = "st:" + version;
  if (clcache[key]) return clcache[key];
  const md = await fetchtext(staticbase + "/steamchangelogs/" + version + ".md").catch(() => null);
  clcache[key] = md == null ? null : parsemd(md);
  return clcache[key];
}

function recreationhtml(cl, version) {
  if (cl.raw) return "<div class=\"changelog clraw\">" + cl.raw + "</div>";
  let h = "<div class=\"changelog\">";
  h += "<div class=\"cl-head\">" + doodlehtml(version, "left") + "<div class=\"cl-headtext\">";
  h += "<div class=\"cl-title\">" + esc(cl.title) + "</div>";
  if (cl.subtitle) h += "<div class=\"cl-sub\">" + esc(cl.subtitle) + "</div>";
  if (cl.intro) h += "<div class=\"cl-intro\">" + inline(cl.intro) + "</div>";
  h += "</div>" + doodlehtml(version, "right") + "</div>";
  if (cl.table && cl.table.rows.length) {
    h += "<div class=\"cl-h\">Version Numbers</div><table class=\"cl-table\"><tr><th></th>";
    for (const col of cl.table.cols) h += "<th>" + esc(col) + "</th>";
    h += "</tr>";
    for (const row of cl.table.rows) {
      h += "<tr><td class=\"rowh\">" + esc(row[0]) + "</td>";
      for (let i = 1; i < row.length; i++) h += "<td>" + esc(row[i]) + "</td>";
      h += "</tr>";
    }
    h += "</table>";
  }

  if (cl.sections.some(s => s.items.length)) h += "<div class=\"cl-h\">Changelist</div>";
  for (const sec of cl.sections) {
    h += "<div class=\"cl-section" + (sec.sub ? " sub" : "") + "\">";
    if (sec.header) h += "<div class=\"cl-sech" + (sec.sub ? " sub" : "") + "\">" + esc(sec.header) + "</div>";
    for (const it of sec.items) {
      if (it.note) {h += "<div class=\"cl-inote\">" + inline(it.note) + "</div>"; continue;}
      const tag = it.tag ? "<span class=\"cl-tag\">[" + esc(it.tag) + "] </span>" : "";
      h += "<div class=\"cl-item\"><span class=\"bullet\">&bull;</span><span>" + tag + inline(it.text) + "</span></div>";
    }
    h += "</div>";
  }
  for (const p of (cl.outro || [])) {
    if (p.img) h += "<div class=\"cl-media\"><img src=\"" + esc(p.img) + "\" alt=\"" + esc(p.alt) + "\"></div>";
    else if (p.note) h += "<div class=\"cl-outro\"><em>" + inline(p.note) + "</em></div>";
    else h += "<div class=\"cl-outro\">" + inline(p) + "</div>";
  }
  if (cl.footer) h += "<div class=\"cl-footer\">" + inline(cl.footer) + "</div>";
  h += "</div>";
  return h;
}

async function getrawmd(src, version) {
  const key = src + "/" + version;
  if (clraw[key] != null) return clraw[key];
  clraw[key] = await fetchtext(staticbase + "/" + src + "/" + version + ".md").catch(() => "");
  return clraw[key];
}

function mdplain(md) {
  return md.replace(/^::raw\n/, "").replace(/<[^>]+>/g, "").split("\n").map(l =>
    l.replace(/^#{1,6}\s*/, "").replace(/^\s*[-*]\s*/, "").replace(/^>\s*/, "")
     .replace(/^\[[^\]]+\]\s*/, "").replace(/\|/g, " ").replace(/\*\*/g, "")
     .replace(/^_(.+)_$/, "$1").trim())
    .filter(x => x && !/^-+$/.test(x)).join("\n");
}

async function renderwordingdiff(version) {
  const [tw, st, cl] = await Promise.all([
    getrawmd("changelogs", version), getrawmd("steamchangelogs", version), getcl(version)]);
  let h = "<div class=\"changelog worddiff\">";
  h += "<div class=\"cl-head\">" + doodlehtml(version, "left") + "<div class=\"cl-headtext\">";
  h += "<div class=\"cl-title\">" + esc(cl ? cl.title : version) + "</div>";
  h += "</div>" + doodlehtml(version, "right") + "</div>";
  h += "<div class=\"wdbody\">" + worddiff(mdplain(tw), mdplain(st)) + "</div></div>";
  return h;
}

function worddiff(a, b) {
  const awords = a.split(/(\s+)/).filter(t => t.length);
  const bwords = b.split(/(\s+)/).filter(t => t.length);
  const n = awords.length, m = bwords.length;
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = awords[i] === bwords[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ws = t => /^\s+$/.test(t);
  const emit = (cls, t) => ws(t) ? t.replace(/\n/g, "<br>") : "<span class=\"" + cls + "\">" + esc(t) + "</span>";
  let i = 0, j = 0, out = "";
  while (i < n && j < m) {
    if (awords[i] === bwords[j]) {out += ws(awords[i]) ? awords[i].replace(/\n/g, "<br>") : esc(awords[i]); i++; j++;}
    else if (dp[i + 1][j] >= dp[i][j + 1]) {out += emit("wdel", awords[i]); i++;}
    else {out += emit("wadd", bwords[j]); j++;}
  }
  while (i < n) out += emit("wdel", awords[i++]);
  while (j < m) out += emit("wadd", bwords[j++]);
  return out;
}

/*//////////////////////////////////////////////////////////////////////*/

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c]));
}
function inline(s) {
  return esc(s).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
    (m, t, u) => "<a href=\"" + u + "\" target=\"_blank\" rel=\"noopener\">" + t + "</a>");
}
boot();
