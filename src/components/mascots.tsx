export function BearPair({ size = 56 }: { size?: number }) {
  return (
    <span className="bear-pair" style={{ width: size * 1.72, height: size }} aria-hidden>
      <CreamBear />
      <SnowBear />
    </span>
  );
}

function CreamBear() {
  return (
    <svg viewBox="0 0 64 64" className="bear cream">
      <ellipse cx="18" cy="16" rx="9" ry="8" fill="#e8c9a4" />
      <ellipse cx="46" cy="16" rx="9" ry="8" fill="#e8c9a4" />
      <ellipse cx="18" cy="16" rx="5" ry="4.5" fill="#f4d7bc" />
      <ellipse cx="46" cy="16" rx="5" ry="4.5" fill="#f4d7bc" />
      <ellipse cx="32" cy="36" rx="22" ry="22" fill="#f0d0ae" />
      <ellipse cx="22" cy="40" rx="6" ry="4" fill="#f4a3b8" opacity="0.85" />
      <ellipse cx="42" cy="40" rx="6" ry="4" fill="#f4a3b8" opacity="0.85" />
      <ellipse cx="32" cy="46" rx="7" ry="4.2" fill="#d9788c" />
      <ellipse cx="32" cy="45.2" rx="5.2" ry="2.4" fill="#ef9aaa" />
      <circle cx="23" cy="33" r="2.3" fill="#4a2e38" />
      <circle cx="41" cy="33" r="2.3" fill="#4a2e38" />
      <path d="M20 31.2c1.6-1.8 4.2-1.8 5.6 0" fill="none" stroke="#4a2e38" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M38.4 31.2c1.6-1.8 4.2-1.8 5.6 0" fill="none" stroke="#4a2e38" strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="32" cy="39.5" rx="2.4" ry="1.6" fill="#5a3840" />
      <path d="M14 22c4-6 10-8 18-8s14 2 18 8" fill="none" stroke="#e8a0b8" strokeWidth="1.4" opacity="0.7" />
    </svg>
  );
}

function SnowBear() {
  return (
    <svg viewBox="0 0 64 64" className="bear snow">
      <ellipse cx="18" cy="16" rx="9" ry="8" fill="#f4e6d8" />
      <ellipse cx="46" cy="16" rx="9" ry="8" fill="#f4e6d8" />
      <ellipse cx="18" cy="16" rx="5" ry="4.5" fill="#fbeee4" />
      <ellipse cx="46" cy="16" rx="5" ry="4.5" fill="#fbeee4" />
      <ellipse cx="32" cy="36" rx="22" ry="22" fill="#f7ece3" />
      <ellipse cx="22" cy="40" rx="5.5" ry="3.6" fill="#f0b0c4" opacity="0.75" />
      <ellipse cx="42" cy="40" rx="5.5" ry="3.6" fill="#f0b0c4" opacity="0.75" />
      <path d="M26 46.5c2.2 2.4 9.8 2.4 12 0" fill="none" stroke="#d9788c" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="23" cy="33" r="2.3" fill="#4a2e38" />
      <circle cx="41" cy="33" r="2.3" fill="#4a2e38" />
      <path d="M20.2 31c1.5-1.6 4-1.5 5.3.2" fill="none" stroke="#4a2e38" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M38.4 31c1.5-1.6 4-1.5 5.3.2" fill="none" stroke="#4a2e38" strokeWidth="1.2" strokeLinecap="round" />
      <ellipse cx="32" cy="39.4" rx="2.2" ry="1.5" fill="#5a3840" />
      <circle cx="46" cy="20" r="3.2" fill="#e87aa4" />
    </svg>
  );
}

export function MascotHeader({ title, line }: { title: string; line?: string }) {
  return (
    <header className="mascot-head">
      <BearPair size={40} />
      <div>
        <p className="mascot-kicker">EVENGIRL</p>
        <h1>{title}</h1>
        {line ? <p className="mascot-line">{line}</p> : null}
      </div>
    </header>
  );
}
