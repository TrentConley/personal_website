import React from "react";
import Image from "next/image";
import Particles from "react-tsparticles";
import { Engine } from "tsparticles-engine";
import { loadSlim } from "tsparticles-slim";
import { motion } from "framer-motion";
import TypingEffect from "./TypingEffect";

const Hero = () => {
  const particlesInit = async (engine: Engine) => {
    await loadSlim(engine);
  };

  return (
    <section className="relative flex items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      {/* Particles Background */}
      <Particles
        id="tsparticles"
        init={particlesInit}
        options={{
          fullScreen: false,
          particles: {
            number: { value: 80 },
            size: { value: { min: 1, max: 3 } },
            move: { enable: true, speed: 0.3 },
            opacity: { value: 0.5 },
            shape: { type: "circle" },
            color: { value: "#ffffff" },
          },
          interactivity: {
            events: {
              onHover: { enable: true, mode: "repulse" },
            },
            modes: {
              repulse: { distance: 70, duration: 0.4 },
            },
          },
        }}
        className="absolute inset-0 w-full h-full"
      />

      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6">
        {/* Profile Image */}
        <div className="mb-6">
          <Image
            src="/profile.png"
            alt="Your Name"
            width={150}
            height={150}
            className="rounded-full shadow-lg"
          />
        </div>

        <motion.h1
          className="text-4xl md:text-6xl font-bold text-white mb-6"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <TypingEffect />
        </motion.h1>
        <motion.p
          className="text-lg md:text-xl text-gray-300 mb-8 max-w-2xl mx-auto"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
        ></motion.p>
        <motion.div
          className="flex justify-center space-x-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
        >
          <a href="#portfolio" className="btn btn-primary">
            View Portfolio
          </a>
          <a href="#contact" className="btn btn-secondary">
            Get in Touch
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
