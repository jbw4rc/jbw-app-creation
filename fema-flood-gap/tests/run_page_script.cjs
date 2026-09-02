/* Runs a rendered report page's script against a minimal DOM shim and prints
 * the resulting figures as JSON, so the Python suite can check that the
 * in-page arithmetic agrees with the server-side numbers it was derived from.
 *
 * Usage: node run_page_script.js <page.html> [sinceYear] [toggle]
 */
const fs = require('fs');

const html = fs.readFileSync(process.argv[2], 'utf8');
const sinceYear = process.argv[3] ? Number(process.argv[3]) : null;
const wantToggle = process.argv[4] === 'toggle';

const figures = html.match(/id="figures">([\s\S]*?)<\/script>/)[1]
  .replace(/<\\\//g, '</');
const script = html.slice(html.lastIndexOf('<script>') + 8,
                          html.lastIndexOf('</script>'));

function Node(id, attrs) {
  this.id = id;
  this.attrs = attrs || {};
  this._text = '';
  this.innerHTML = '';
  this.className = '';
  this.value = this.attrs.value || '';
  this.handlers = {};
}
// A real DOM stringifies whatever is assigned to textContent; the shim must
// too, or it hides type slips that the browser would paper over.
Object.defineProperty(Node.prototype, 'textContent', {
  get: function () { return this._text; },
  set: function (value) { this._text = String(value); },
});
Node.prototype.getAttribute = function (name) {
  return name in this.attrs ? this.attrs[name] : null;
};
Node.prototype.addEventListener = function (event, fn) {
  this.handlers[event] = fn;
};

const nodes = {
  figures: (function () { var n = new Node('figures');
    n.textContent = figures; return n; })(),
  basis: new Node('basis'),
  footerbasis: new Node('footerbasis'),
  lede: new Node('lede'),
  sharebody: new Node('sharebody'),
  tablebody: new Node('tablebody'),
  tablecaption: new Node('tablecaption'),
  sincelabel: new Node('sincelabel'),
  toggle: new Node('toggle'),
  since: new Node('since'),
  resetyears: new Node('resetyears'),
};

// Card and note placeholders, mirroring what the renderer emits.
const cards = [];
for (const key of ['households', 'ihpTotal', 'ihpMean', 'nfipMean',
                   'stateShare', 'gap', 'aggregateGap']) {
  cards.push(new Node(null, {'data-card': key}));
  cards.push(new Node(null, {'data-note': key}));
}

global.document = {
  getElementById: (id) => nodes[id] || null,
  querySelectorAll: (selector) => {
    const attr = selector.replace(/[[\]]/g, '');
    return cards.filter((node) => node.getAttribute(attr) !== null);
  },
};

new Function(script.replace(/^\s*<script>|<\/script>\s*$/g, ''))();

if (wantToggle && nodes.toggle.handlers.click) nodes.toggle.handlers.click();
if (sinceYear !== null && nodes.since.handlers.input) {
  nodes.since.value = String(sinceYear);
  nodes.since.handlers.input();
}

const out = {basis: nodes.basis.textContent, lede: nodes.lede.textContent,
             caption: nodes.tablecaption.textContent,
             sinceLabel: nodes.sincelabel.textContent,
             toggleLabel: nodes.toggle.textContent,
             shareRows: (nodes.sharebody.innerHTML.match(/<tr/g) || []).length,
             tableRows: (nodes.tablebody.innerHTML.match(/<tr/g) || []).length};
for (const node of cards) {
  const key = node.getAttribute('data-card');
  if (key) out[key] = node.textContent;
}
process.stdout.write(JSON.stringify(out, null, 2));
