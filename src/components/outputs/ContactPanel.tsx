type ContactPanelProps = {
  email: string;
  phone: string;
  github: string;
};

export function ContactPanel({ email, phone, github }: ContactPanelProps) {
  const phoneHref = phone.replace(/[^\d+]/g, "");
  const phonePretty = phone.replace(/\s/g, "\u00A0");
  return (
    <div className="panel">
      <span className="panel__label">ping contact</span>
      <div className="grid-spec" style={{ marginBottom: "1.3rem" }}>
        <div className="grid-spec__row">
          <span className="grid-spec__label">email</span>
          <span className="grid-spec__value">
            <a href={`mailto:${email}`}>{email}</a>
          </span>
        </div>
        <div className="grid-spec__row">
          <span className="grid-spec__label">phone</span>
          <span className="grid-spec__value">
            <a href={`tel:${phoneHref}`}>{phonePretty}</a>
          </span>
        </div>
      </div>
      <div className="inline-links">
        <a href={github} target="_blank" rel="noreferrer">
          github
        </a>
        <a href="/Trent.jpg" target="_blank" rel="noreferrer">
          portrait
        </a>
      </div>
    </div>
  );
}
