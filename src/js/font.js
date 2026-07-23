import {fonts} from "../../assets/fonts/fonts.js";

export const colors = {
  red: "#ff0000", blue: "#0000ff", yellow: "#ffff00", green: "#00ff00",
  white: "#ffffff", black: "#000000", purple: "#800080", maroon: "#800000",
  orange: "#ffa040", azure: "#00aeff", pink: "#ff80ff", mint: "#80ff80",
};

const fontnames = Object.keys(fonts);
const defaultfont = "fnt_main";

/*//////////////////////////////////////////////////////////////////////*/

const charheads = {kris: 1, susie: 2, ralsei: 3, noelle: 4};
function headicon(name) {
  const s = document.createElement("span");
  const id = charheads[String(name).toLowerCase()];
  s.className = "headicon" + (id ? " face-" + id : "");
  return s;
}

const styledfonts = new Set();
function ensurefontstyle(name) {
  if (styledfonts.has(name)) return;
  const font = fonts[name]; if (!font) return;
  styledfonts.add(name);
  let css = "";
  const map = font.glyphs;
  for (const code in map) {
    const [x, y, w, h, shift, offset] = map[code];
    css += ".g-" + name + "-" + code + "{--gs:" + shift + "px;--gw:" + w + "px;--gh:" + h + "px;--go:" + offset + "px;--gp:" + (-x) + "px " + (-y) + "px}\n";
  }
  const st = document.createElement("style");
  st.dataset.font = name;
  st.textContent = css;
  document.head.appendChild(st);
}

function glyph(ch, map, name) {
  const g = document.createElement("span");
  g.textContent = ch;
  const code = ch.codePointAt(0);
  g.className = map[code] ? "glyph g-" + name + "-" + code : "glyphx";
  return g;
}

export function rendertext(str, name = defaultfont) {
  const nm = fonts[name] ? name : defaultfont;
  ensurefontstyle(nm);
  const map = fonts[nm].glyphs;
  const frag = document.createDocumentFragment();

  let word = null, hadspace = false;
  const newword = () => {word = document.createElement("span"); word.className = "word"};
  const flush = () => {if (word) {frag.appendChild(word); word = null; hadspace = false; frag.appendChild(document.createTextNode("​"))}};
  for (const ch of str) {
    if (ch === "\n") {flush(); frag.appendChild(document.createElement("br")); continue}
    if (ch === " ") {if (!word) newword(); word.appendChild(glyph(" ", map, nm)); hadspace = true; continue}
    if (hadspace) flush();
    if (!word) newword();
    word.appendChild(glyph(ch, map, nm));
    if (ch === "_" || ch === "/") flush();
  }
  flush();
  return frag;
}

function applyfont(el, name) {
  const font = fonts[name] || fonts[defaultfont];
  const href = new URL(font.atlas, document.baseURI).href;
  el.style.setProperty("--atlas", 'url("' + href + '")');
  el.style.setProperty("--lh", font.lh + "px");
  el.style.setProperty("--font-size", font.lh + "px");
}

function applycolor(el, col) {
  if (!col) return;
  el.style.setProperty("--ink", col);
}

function ownfont(el) {return fontnames.find(n => el.hasAttribute(n)) || null}
function owncolor(el) {for (const c in colors) if (el.hasAttribute(c)) return colors[c]; return null}

export function settext(el, str, name = defaultfont, color = null) {
  el.classList.add("font");
  applyfont(el, name);
  applycolor(el, color);
  el.textContent = "";
  el.appendChild(rendertext(str, name));
}

export function setrich(el, html, name = defaultfont, color = null) {
  if (html == null) html = "";
  if (!/[<\n]/.test(html)) return settext(el, html, name, color);
  el.classList.add("font");
  applyfont(el, name);
  applycolor(el, color);
  el.textContent = "";
  const tpl = document.createElement("template");
  tpl.innerHTML = String(html);
  for (const node of [...tpl.content.childNodes]) el.appendChild(rendernode(node, name, color));
}

function copytransformfilter(source, target) {
  const style = source.style;
  if (style.transform) target.style.setProperty("transform", style.transform);
  if (style.transformOrigin) target.style.setProperty("transform-origin", style.transformOrigin);
  if (style.transformBox) target.style.setProperty("transform-box", style.transformBox);
  if (style.filter) target.style.setProperty("filter", style.filter);
  if (style.backdropFilter) target.style.setProperty("backdrop-filter", style.backdropFilter);
}

function rendernode(node, font, color) {
  if (node.nodeType === Node.TEXT_NODE) return rendertext(node.data, font);
  if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
  const f = ownfont(node) || font;
  const c = owncolor(node) || color;
  const islink = node.tagName === "A" && node.getAttribute("href");
  const out = document.createElement(islink ? "a" : "span");
  if (islink) {out.href = node.getAttribute("href"); out.target = "_blank"; out.rel = "noopener"}
  out.className = (node.className ? node.className + " " : "") + "font" + (islink ? " fontlink" : "");
  copytransformfilter(node, out);
  applyfont(out, f);
  applycolor(out, c);
  if (node.hasAttribute("head")) out.appendChild(headicon(node.getAttribute("head")));
  for (const ch of [...node.childNodes]) out.appendChild(rendernode(ch, f, c));
  return out;
}

/*//////////////////////////////////////////////////////////////////////*/

function pixelizeel(el) {
  if (el.dataset.pfdone) return;
  const name = ownfont(el) || defaultfont;
  const color = owncolor(el);
  el.classList.add("font");
  applyfont(el, name);
  applycolor(el, color);
  const frag = document.createDocumentFragment();
  for (const node of [...el.childNodes]) frag.appendChild(rendernode(node, name, color));
  el.textContent = "";
  el.appendChild(frag);
  el.dataset.pfdone = "1";
}

export function pixelize(root = document) {
  const sel = "[data-pf]" + fontnames.map(n => ",[" + n + "]").join("");
  const marked = [...root.querySelectorAll(sel)];
  for (const el of marked) {
    if (marked.some(other => other !== el && other.contains(el))) continue;
    pixelizeel(el);
  }
}
