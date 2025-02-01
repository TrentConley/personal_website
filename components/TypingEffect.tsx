import { useEffect, useState } from "react";
import Typewriter from "typewriter-effect";
import { motion } from "framer-motion";

export default function TypingEffect() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <div className="text-center relative">
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="relative"
      >
        <motion.p
          className="text-7xl font-bold mb-4 text-white/90"
          style={{
            textShadow: '0 0 30px rgba(59, 130, 246, 0.3), 0 0 60px rgba(147, 51, 234, 0.2)',
          }}
        >
          Trent Conley
        </motion.p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
        className="relative"
      >
        <p className="text-2xl text-gray-300/90">
          I am a{" "}
          <span className="relative inline-block">
            <span className="relative z-10">
              <Typewriter
                options={{
                  strings: ["Software Engineer", "Inventor", "Tech Enthusiast"],
                  autoStart: true,
                  loop: true,
                  delay: 75,
                  deleteSpeed: 50,
                  cursor: "_",
                  wrapperClassName: "text-white/90",
                }}
              />
            </span>
            <motion.span
              className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 blur-lg"
              animate={{
                opacity: [0.3, 0.5, 0.3],
                scale: [1, 1.03, 1],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </span>
        </p>
      </motion.div>
    </div>
  );
}
