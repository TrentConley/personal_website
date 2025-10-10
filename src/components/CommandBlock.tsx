import { motion } from "framer-motion";
import { ReactNode } from "react";
import { Typewriter } from "./Typewriter";

type CommandBlockProps = {
  prompt: string;
  command: string;
  output?: ReactNode;
  isActive: boolean;
  showCursor: boolean;
};

export function CommandBlock({
  prompt,
  command,
  output,
  isActive,
  showCursor,
}: CommandBlockProps) {
  return (
    <motion.div
      className="command-block"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="prompt-line">
        <span className="prompt-line__prompt">{prompt}</span>
        <Typewriter text={command} active={isActive} />
        {showCursor && <span className="prompt-line__caret" aria-hidden="true" />}
      </div>
      {output ? <div className="command-block__output">{output}</div> : null}
    </motion.div>
  );
}
