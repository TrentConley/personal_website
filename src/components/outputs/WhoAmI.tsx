type WhoAmIProps = {
  location: string;
  focusAreas: string[];
  availability: string[];
};

export function WhoAmI({ location, focusAreas, availability }: WhoAmIProps) {
  return (
    <div className="panel">
      <span className="panel__label">whoami</span>
      <div className="grid-spec">
        <div className="grid-spec__row">
          <span className="grid-spec__label">location</span>
          <span className="grid-spec__value">{location}</span>
        </div>
        <div className="grid-spec__row">
          <span className="grid-spec__label">focus</span>
          <span className="grid-spec__value">{focusAreas.join(" • ")}</span>
        </div>
      </div>
      <ul className="list" style={{ marginTop: "1.8rem" }}>
        {availability.map((item) => (
          <li key={item} className="list__item">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
