type ResumePanelProps = {
  resumeUrl: string;
};

export function ResumePanel({ resumeUrl }: ResumePanelProps) {
  return (
    <div className="panel">
      <span className="panel__label">open resume</span>
      <p className="banner__subline">
        Need the full breakdown? Download the PDF or view it in-browser. Updated
        whenever something noteworthy ships.
      </p>
      <div className="cta-bar">
        <a className="button" href={resumeUrl} target="_blank" rel="noreferrer">
          View Online
        </a>
        <a className="button" href={resumeUrl} download>
          Download PDF
        </a>
      </div>
    </div>
  );
}
