import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar } from "./components/StatusBar";
import { CommandBlock } from "./components/CommandBlock";
import { Banner } from "./components/outputs/Banner";
import { WhoAmI } from "./components/outputs/WhoAmI";
import { ProjectsPanel } from "./components/outputs/ProjectsPanel";
import { BooksPanel } from "./components/outputs/BooksPanel";
import { ResumePanel } from "./components/outputs/ResumePanel";
import { ContactPanel } from "./components/outputs/ContactPanel";
import { books, profile, projects } from "./data/profile";

type Command = {
  id: string;
  command: string;
  autoAdvance?: boolean;
  autoDelay?: number;
  render: () => JSX.Element | null;
};

const PROMPT = "trent@console:~$";

const commandSequence: Command[] = [
  {
    id: "welcome",
    command: "./bootstrap --init",
    autoAdvance: true,
    autoDelay: 1700,
    render: () => (
      <Banner
        name={profile.name}
        title={profile.title}
        tagline={profile.tagline}
        focusAreas={profile.focusAreas}
      />
    ),
  },
  {
    id: "whoami",
    command: "whoami",
    render: () => (
      <WhoAmI
        location={profile.location}
        focusAreas={profile.focusAreas}
        availability={profile.availability}
      />
    ),
  },
  {
    id: "projects",
    command: "ls projects --featured",
    render: () => <ProjectsPanel projects={projects} />,
  },
  {
    id: "books",
    command: "cat library/recommended.txt",
    render: () => <BooksPanel books={books} />,
  },
  {
    id: "resume",
    command: "open resume.pdf --preview",
    render: () => <ResumePanel resumeUrl={profile.contact.resume} />,
  },
  {
    id: "contact",
    command: "ping contact --all",
    render: () => (
      <ContactPanel
        email={profile.contact.email}
        phone={profile.contact.phone}
        github={profile.contact.github}
      />
    ),
  },
];

export default function App() {
  const totalCommands = commandSequence.length;
  const [visibleCount, setVisibleCount] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const advance = useCallback(() => {
    setVisibleCount((prev) => Math.min(totalCommands, prev + 1));
  }, [totalCommands]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [advance]);

  useEffect(() => {
    const index = Math.min(visibleCount, totalCommands) - 1;
    const current = commandSequence[index];

    if (!current || !current.autoAdvance) {
      return;
    }

    if (visibleCount >= totalCommands) {
      return;
    }

    const timer = window.setTimeout(() => advance(), current.autoDelay ?? 1500);
    return () => window.clearTimeout(timer);
  }, [visibleCount, advance, totalCommands]);

  useEffect(() => {
    if (!containerRef.current) return;
    const node = containerRef.current.lastElementChild;
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [visibleCount]);

  const visibleCommands = commandSequence.slice(0, visibleCount);
  const hasMore = visibleCount < totalCommands;

  return (
    <div className="app">
      <StatusBar />
      <div className="terminal-shell">
        <div className="terminal-shell__chrome">
          <div className="window-dots">
            <span className="window-dot window-dot--red" />
            <span className="window-dot window-dot--yellow" />
            <span className="window-dot window-dot--green" />
          </div>
          <span>~/workspace/trent</span>
          <span>v1.0.0</span>
        </div>
        <div className="terminal-shell__body" ref={containerRef}>
          {visibleCommands.map((command, index) => (
            <CommandBlock
              key={command.id}
              prompt={PROMPT}
              command={command.command}
              output={command.render()}
              isActive={index === visibleCommands.length - 1}
              showCursor={hasMore && index === visibleCommands.length - 1}
            />
          ))}
          {hasMore ? (
            <button
              type="button"
              className="indicator"
              onClick={advance}
              aria-label="Run next command"
            >
              press enter to run next command
            </button>
          ) : (
            <div className="footnote">
              ↑ built with React, Vite, and a love for command lines
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
