import { journal, journalTheme } from "../data/journal";
import "../journal.css";

export function JournalHeader({ active, dark = false }: { active?: string; dark?: boolean }) {
  return (
    <header className={`journal-nav${dark ? " journal-nav--dark" : ""}`} style={journalTheme}>
      <a href="/" className="journal-brand" aria-label={`${journal.identity.name} — ${journal.labels.home}`}>
        <span className="journal-monogram" aria-hidden="true">{journal.identity.initials}<span>✳</span></span>
        <span>{journal.identity.name}</span>
      </a>
      <nav className="journal-nav-links" aria-label={journal.labels.menu}>
        {journal.navigation.map((item) => (
          <a key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined}>{item.label}</a>
        ))}
      </nav>
      <a className="journal-orbit-link" href={journal.orbit.href}>
        <span className="journal-orbit-symbol" aria-hidden="true">⊙</span>
        {journal.orbit.label} <span aria-hidden="true">↗</span>
      </a>
    </header>
  );
}
