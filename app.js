"use strict";

const PARTS = ["root", "ch1", "ch2", "ch3", "ch4", "ch5"];
const PARTLABEL = {root: "launcher", ch1: "chapter 1", ch2: "chapter 2", ch3: "chapter 3", ch4: "chapter 4", ch5: "chapter 5"};

let manifest = null;
let notes = {};
let current = null;
const diffcache = {};

/*//////////////////////////////////////////////////////////////////////*/
/* boot */

async function boot() {
  try {
    manifest = await fetchjson("data/manifest.json");
    notes = await fetchjson("data/notes.json").catch(() => ({}));
  } catch (e) {
    document.querySelector(".stage").innerHTML = "<div class=\"empty\">no data yet. run the pipeline to generate data/manifest.json.</div>";
    return;
  }
  buildrail();
  document.querySelector(".showunchanged").addEventListener("change", () => {if (current) rendertransition(current)});
  buildlightbox();
  const hash = location.hash.slice(1);
  const t = manifest.transitions.find(t => t.id === hash) || manifest.transitions[manifest.transitions.length - 1];
  if (t) selecttransition(t.id);
}

async function fetchjson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}

/*//////////////////////////////////////////////////////////////////////*/
/* rail */

function buildrail() {
  const rail = document.querySelector(".timeline");
  rail.innerHTML = "";
  const eras = [];
  for (const t of manifest.transitions) {
    let g = eras.find(e => e.era === t.era);
    if (!g) {g = {era: t.era, items: []}; eras.push(g)}
    g.items.push(t);
  }
  for (const g of eras) {
    const box = el("div", "eragroup");
    box.appendChild(el("div", "eralabel", g.era === "ch5" ? "chapter 5 era" : g.era + " era"));
    for (const t of g.items) {
      const b = el("button", "step" + (t.boundary ? " boundary" : ""));
      b.dataset.id = t.id;
      b.innerHTML = "<span class=\"from\">" + esc(t.from) + "</span> <span class=\"arrow\">-&gt;</span> <span class=\"to\">" + esc(t.to) + "</span>" +
        "<span class=\"stepmeta\">" + esc(t.date || "") + changesummary(t) + "</span>";
      b.addEventListener("click", () => selecttransition(t.id));
      box.appendChild(b);
    }
    rail.appendChild(box);
  }
}

function changesummary(t) {
  let a = 0, m = 0, d = 0;
  for (const p of PARTS) {
    const s = t.parts[p]; if (!s) continue;
    if (s.collapsed) {m += 0; continue}
    a += s.a || 0; m += s.m || 0; d += s.r || 0;
  }
  const bits = [];
  if (a) bits.push("+" + a);
  if (m) bits.push("~" + m);
  if (d) bits.push("-" + d);
  return bits.length ? "  " + bits.join(" ") : "  no code change";
}

/*//////////////////////////////////////////////////////////////////////*/
/* select + render */

function selecttransition(id) {
  current = id;
  location.hash = id;
  for (const b of document.querySelectorAll(".step")) b.classList.toggle("active", b.dataset.id === id);
  const t = manifest.transitions.find(t => t.id === id);
  if (t) rendertransition(id);
}

async function rendertransition(id) {
  const t = manifest.transitions.find(t => t.id === id);
  const stage = document.querySelector(".stage");
  const showunch = document.querySelector(".showunchanged").checked;
  const note = notes[t.to] || {};

  const vfrom = versionof(t.from), vto = versionof(t.to);
  let verbits = "";
  for (const p of PARTS) {
    if (!vto || !vto.ver || !vto.ver[p]) continue;
    const a = vfrom && vfrom.ver ? vfrom.ver[p] : null;
    const bb = vto.ver[p];
    verbits += "<span class=\"vb\">" + PARTLABEL[p] + " <b>" + esc(bb || "?") + "</b></span>  ";
  }

  let html = "";
  html += "<div class=\"thead\"><h1>" + esc(t.from) + " &rarr; " + esc(t.to) + "</h1>" +
    "<span class=\"tdate\">" + esc(t.date || "") + "</span>" +
    (t.boundary ? "<span class=\"tboundary\">era boundary - new chapter excluded</span>" : "") + "</div>";
  html += "<div class=\"verline\">" + verbits + "</div>";
  html += notehtml(note);
  html += "<div class=\"parts\"></div>";
  stage.innerHTML = html;

  const partsbox = stage.querySelector(".parts");
  partsbox.innerHTML = "<div class=\"loading\">loading diff...</div>";
  let diff;
  try {
    diff = diffcache[id] || (diffcache[id] = await fetchjson("data/diffs/" + id + ".json"));
  } catch (e) {
    partsbox.innerHTML = "<div class=\"empty\">diff file missing for " + esc(id) + "</div>";
    return;
  }
  partsbox.innerHTML = "";
  for (const p of PARTS) {
    const d = diff.parts[p];
    if (!d) continue;
    const changed = (d.added_count || 0) + (d.removed_count || 0) + (d.modified_count || 0);
    if (!changed && !showunch) continue;
    partsbox.appendChild(renderpart(p, d, vto));
  }
  if (!partsbox.children.length) partsbox.innerHTML = "<div class=\"empty\">no code changes in this step.</div>";
}

function notehtml(note) {
  if (!note || (!note.ocr && !note.text)) return "<div class=\"notes\"><div class=\"notesnone\">no changelog was posted for this version.</div></div>";
  let img = "";
  if (note.image) img = "<div class=\"notesimg\"><img src=\"data/media/" + esc(note.image) + "\" alt=\"changelog\" loading=\"lazy\"></div>";
  const tweet = note.text ? "<span class=\"tweet\">" + esc(note.text) + "</span>" : "";
  const body = note.ocr ? esc(note.ocr) : "";
  return "<div class=\"notes\"><div class=\"noteshead\">official changelog</div>" +
    "<div class=\"notesbody\"><div class=\"notestext\">" + tweet + body + "</div>" + img + "</div></div>";
}

/*//////////////////////////////////////////////////////////////////////*/
/* parts + files */

function renderpart(p, d, vto) {
  const part = el("div", "part");
  const ver = vto && vto.ver && vto.ver[p] ? vto.ver[p] : "";
  const head = el("div", "parthead");
  head.innerHTML = "<span class=\"partname\">" + esc(PARTLABEL[p]) + "</span>" +
    "<span class=\"partver\">" + esc(ver) + "</span>" + countshtml(d);
  head.insertAdjacentHTML("beforeend", "<span class=\"chev\">&#9656;</span>");
  part.appendChild(head);

  const body = el("div", "partbody");
  if (d.collapsed) {
    body.innerHTML = "<div class=\"newchapter\"><b>new chapter added</b> - " + d.added_count +
      " code entries introduced. excluded from line-level diff (bulk addition).</div>";
  } else {
    for (const f of d.removed) body.appendChild(filerow("del", f, null));
    for (const f of d.added) body.appendChild(filerow("add", f, null));
    for (const m of d.modified) body.appendChild(filerow("mod", m.file, m));
  }
  part.appendChild(body);
  const changed = (d.added_count || 0) + (d.removed_count || 0) + (d.modified_count || 0);
  if (changed) part.classList.add("open");
  head.addEventListener("click", () => part.classList.toggle("open"));
  if (location.search.indexOf("expand") >= 0) {
    part.classList.add("open");
    for (const r of body.querySelectorAll(".filerow")) r.classList.add("open");
  }
  return part;
}

function countshtml(d) {
  const c = el("span", "counts");
  const changed = (d.added_count || 0) + (d.removed_count || 0) + (d.modified_count || 0);
  if (d.collapsed) {c.innerHTML = "<span class=\"cadd\">+" + d.added_count + " new</span>"; return c.outerHTML}
  if (!changed) {c.innerHTML = "<span class=\"cnone\">unchanged</span>"; return c.outerHTML}
  let h = "";
  if (d.added_count) h += "<span class=\"cadd\">+" + d.added_count + " files</span>";
  if (d.modified_count) h += "<span class=\"cmod\">~" + d.modified_count + " mod</span>";
  if (d.removed_count) h += "<span class=\"cdel\">-" + d.removed_count + " files</span>";
  c.innerHTML = h;
  return c.outerHTML;
}

function filerow(kind, name, mod) {
  const row = el("div", "filerow");
  const tag = kind === "add" ? "tadd" : kind === "del" ? "tdel" : "tmod";
  const label = kind === "add" ? "ADD" : kind === "del" ? "DEL" : "MOD";
  let stat = "";
  if (mod) stat = "<span class=\"filestat\"><span class=\"p\">+" + mod.plus + "</span> <span class=\"m\">-" + mod.minus + "</span></span>";
  const head = el("div", "filehead");
  head.innerHTML = "<span class=\"filetag " + tag + "\">" + label + "</span>" +
    "<span class=\"filename\">" + esc(shortname(name)) + "</span>" + stat;
  row.appendChild(head);
  if (mod) {
    const wrap = el("div", "diffwrap");
    wrap.innerHTML = "<div class=\"diff\">" + renderdiff(mod.diff) + "</div>";
    row.appendChild(wrap);
    head.addEventListener("click", () => row.classList.toggle("open"));
    head.style.cursor = "pointer";
  }
  return row;
}

function shortname(n) {
  return n.replace(/\.gml$/, "").replace(/^gml_/, "");
}

function renderdiff(txt) {
  const lines = txt.split("\n");
  let out = "";
  for (const l of lines) {
    if (l.startsWith("+++") || l.startsWith("---")) continue;
    let cls = "ctx";
    if (l.startsWith("@@")) cls = "hunk";
    else if (l.startsWith("+")) cls = "add";
    else if (l.startsWith("-")) cls = "del";
    out += "<span class=\"ln " + cls + "\">" + esc(l || " ") + "</span>";
  }
  return out;
}

/*//////////////////////////////////////////////////////////////////////*/
/* helpers + lightbox */

function versionof(label) {
  return manifest.versions.find(v => v.label === label);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c]));
}

function buildlightbox() {
  const lb = el("div", "lightbox");
  lb.innerHTML = "<img>";
  lb.addEventListener("click", () => lb.classList.remove("on"));
  document.body.appendChild(lb);
  document.addEventListener("click", e => {
    const img = e.target.closest(".notesimg img");
    if (img) {lb.querySelector("img").src = img.src; lb.classList.add("on")}
  });
}

boot();
