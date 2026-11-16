import { useEffect, useState } from "react";
import { useData } from "../contexts/DataContext";
import { SAUCE_LINES } from "../lib/sauceFx";

/** Sauce theme only: a little rotating line above your account in the sidebar. */
export function SauceTicker() {
  const theme = useData().profile.theme;
  const [i, setI] = useState(() => Math.floor(Math.random() * SAUCE_LINES.length));
  useEffect(() => {
    if (theme !== "sauce") return;
    const t = window.setInterval(() => setI((n) => (n + 1) % SAUCE_LINES.length), 3800);
    return () => window.clearInterval(t);
  }, [theme]);
  if (theme !== "sauce") return null;
  return <div className="sauce-ticker" aria-hidden="true">
    <svg viewBox="0 0 64 64"><path d="M24 14c10-4 24 2 30 18 6 17 2 36-10 50-4 5-9 7-9 3 0-3 3-6 5-11 5-13 3-26-4-36-5-7-12-11-15-16-2-4-1-7 3-8z" transform="scale(.7) translate(6 0)" fill="#ff4d2e" /><path d="M18 17c-2-6 2-12 10-12 5 0 9 3 11 7-6-2-12-1-16 3-2 2-4 3-5 2z" transform="scale(.7) translate(6 0)" fill="#3fae49" /></svg>
    <span key={i}>{SAUCE_LINES[i]}</span>
  </div>;
}
