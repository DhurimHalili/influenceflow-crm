// Sauce theme fun: clicking a button splashes sauce (drops + a pepper or two) from the click point; primary
// buttons sometimes shout a line ("EXTRA SAUCE!"). Only in the Sauce theme, never with reduced motion, never in
// the way: the layer ignores the pointer, particles fly off and are removed, and there's a cap on how many exist.

const QUIPS = ["Extra sauce!", "Hot!", "Spicy!", "+1 sauce", "Sauce boss", "Too hot to handle", "Saucy!", "Reaper mode", "Chef's kiss", "Mild? Never."];
const NS = "http://www.w3.org/2000/svg";
function pepperSvg() {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  for (const [d, fill] of [["M24 14c10-4 24 2 30 18 6 17 2 36-10 50-4 5-9 7-9 3 0-3 3-6 5-11 5-13 3-26-4-36-5-7-12-11-15-16-2-4-1-7 3-8z", "#e5161b"], ["M18 17c-2-6 2-12 10-12 5 0 9 3 11 7-6-2-12-1-16 3-2 2-4 3-5 2z", "#3fae49"]]) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d); p.setAttribute("fill", fill); p.setAttribute("transform", "scale(.7) translate(6 0)");
    svg.appendChild(p);
  }
  return svg;
}
const MAX_LIVE = 70;
let live = 0;
let lastQuip = 0;
let layer: HTMLDivElement | null = null;

const on = () => document.documentElement.dataset.theme === "sauce" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const getLayer = () => {
  if (layer && document.body.contains(layer)) return layer;
  layer = document.createElement("div");
  layer.className = "sfx-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  return layer;
};

function fling(el: HTMLElement, x: number, y: number, dx: number, dy: number, ms: number, spin: number) {
  if (live >= MAX_LIVE) return;
  live++;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  getLayer().appendChild(el);
  const anim = el.animate([
    { transform: `translate(-50%, -50%) scale(.4) rotate(0deg)`, opacity: 1 },
    { transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy}px)) scale(1) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.35 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 140}px)) scale(.85) rotate(${spin}deg)`, opacity: 0 },
  ], { duration: ms, easing: "cubic-bezier(.25,.6,.4,1)" });
  const done = () => { el.remove(); live = Math.max(0, live - 1); };
  anim.onfinish = done; anim.oncancel = done;
}

function splash(x: number, y: number, big: boolean) {
  const drops = big ? 12 : 5;
  for (let i = 0; i < drops; i++) {
    const d = document.createElement("span");
    d.className = "sfx-drop";
    const s = (big ? 7 : 5) + Math.random() * (big ? 7 : 4);
    d.style.width = `${s}px`; d.style.height = `${s * 1.15}px`;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
    const pow = (big ? 70 : 40) + Math.random() * (big ? 90 : 45);
    fling(d, x, y, Math.cos(ang) * pow, Math.sin(ang) * pow, 650 + Math.random() * 450, (Math.random() - 0.5) * 120);
  }
  const peppers = big ? 2 + Math.round(Math.random()) : Math.random() < 0.35 ? 1 : 0;
  for (let i = 0; i < peppers; i++) {
    const p = document.createElement("span");
    p.className = "sfx-pepper";
    p.appendChild(pepperSvg());
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const pow = 80 + Math.random() * 80;
    fling(p, x, y, Math.cos(ang) * pow, Math.sin(ang) * pow, 1000 + Math.random() * 400, (Math.random() - 0.5) * 540);
  }
  if (big && Date.now() - lastQuip > 5000 && Math.random() < 0.35) {
    lastQuip = Date.now();
    const q = document.createElement("span");
    q.className = "sfx-quip";
    q.textContent = QUIPS[Math.floor(Math.random() * QUIPS.length)];
    q.style.left = `${Math.min(window.innerWidth - 90, Math.max(90, x))}px`; q.style.top = `${Math.max(40, y - 18)}px`;
    getLayer().appendChild(q);
    const a = q.animate([
      { transform: "translate(-50%, -50%) scale(.3) rotate(-8deg)", opacity: 0 },
      { transform: "translate(-50%, -110%) scale(1.08) rotate(3deg)", opacity: 1, offset: 0.25 },
      { transform: "translate(-50%, -150%) scale(1) rotate(-2deg)", opacity: 1, offset: 0.7 },
      { transform: "translate(-50%, -190%) scale(.9) rotate(0deg)", opacity: 0 },
    ], { duration: 1500, easing: "cubic-bezier(.3,.8,.4,1)" });
    a.onfinish = () => q.remove();
  }
}

let installed = false;
export function installSauceFx() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !on()) return;
    const t = (e.target as HTMLElement | null)?.closest?.("button, a.btn, [role='button'], .qchip, .side-nav a") as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) return;
    splash(e.clientX, e.clientY, t.classList.contains("btn-primary") || t.classList.contains("fw-go") || t.classList.contains("gr-go"));
  }, { passive: true, capture: true });
}

export const SAUCE_LINES = ["Extra sauce", "Hot takes only", "Spicy outreach", "No bland emails", "Sauce level: reaper", "Follow-ups, but spicy", "Keep it saucy", "Turn up the heat"];
