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
    <div className="text-center">
      <motion.p
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="text-7xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600 drop-shadow-lg"
      >
        Trent Conley
      </motion.p>
      <motion.p
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="text-2xl text-gray-300"
      >
        I am a{" "}
        <span className="text-blue-500">
          <Typewriter
            options={{
              strings: ["Software Engineer", "Inventor", "Tech Enthusiast"],
              autoStart: true,
              loop: true,
              delay: 75,
              deleteSpeed: 50,
              cursor: "_",
            }}
          />
        </span>
      </motion.p>
    </div>
  );
}
