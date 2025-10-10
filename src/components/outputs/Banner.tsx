type BannerProps = {
  name: string;
  title: string;
  tagline: string;
  focusAreas: string[];
};

export function Banner({ name, title, tagline, focusAreas }: BannerProps) {
  return (
    <div className="panel banner">
      <div className="banner__headline">
        {name} <span>// {title}</span>
      </div>
      <p className="banner__subline">{tagline}</p>
      <div className="banner__tags">
        {focusAreas.map((item) => (
          <span key={item} className="badge">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
