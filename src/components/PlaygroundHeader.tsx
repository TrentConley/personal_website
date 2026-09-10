import { useEffect, useRef } from "react";
import { playground } from "../data/playground";

export function PlaygroundHeader() {
  const contactRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      const contact = contactRef.current;
      if (contact?.open && event.target instanceof Node && !contact.contains(event.target)) contact.open = false;
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      const contact = contactRef.current;
      if (event.key === "Escape" && contact?.open) {
        contact.open = false;
        contact.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, []);

  return <header className="playground-header">
    <a className="playground-name" href="/">{playground.identity.name}</a>
    <details className="playground-contact-menu" ref={contactRef}>
      <summary className="playground-contact">{playground.labels.contact}</summary>
      <div className="playground-contact-panel">
        <p>{playground.identity.role}</p>
        <a href={playground.identity.email}>{playground.identity.emailLabel}</a>
      </div>
    </details>
  </header>;
}
