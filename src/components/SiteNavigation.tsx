import { playground } from "../data/playground";

export function SiteNavigation({ active }: { active: string }) {
  return <nav className="site-navigation" aria-label={playground.labels.menu}>
    {playground.navigation.map((link) =>
      <a key={link.id} href={link.href} aria-current={active === link.id ? "page" : undefined}>
        {link.label}
      </a>
    )}
  </nav>;
}
