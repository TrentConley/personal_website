import type { Project } from "../../data/profile";

type ProjectsPanelProps = {
  projects: Project[];
};

export function ProjectsPanel({ projects }: ProjectsPanelProps) {
  return (
    <div className="panel">
      <span className="panel__label">ls projects/featured</span>
      <div className="projects">
        {projects.map((project) => (
          <article key={project.name} className="project-card">
            <header className="project-card__header">
              <h3 className="project-card__title">{project.name}</h3>
              <div className="project-card__meta">
                {project.stack.join(" · ")}
              </div>
            </header>
            <p className="project-card__summary">{project.summary}</p>
            <p className="project-card__focus">{project.focus}</p>
            <div className="project-card__links">
              {project.links.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
