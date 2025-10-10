import { useEffect, useState } from "react";

const formatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function StatusBar() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="status-bar">
      <div className="status-bar__identity">
        <strong>trent@console</strong>
        <span className="status-bar__badge">connected</span>
      </div>
      <div className="status-bar__meta">
        <span>atlanta, ga</span>
        <span>{formatter.format(now)} est</span>
      </div>
    </header>
  );
}
