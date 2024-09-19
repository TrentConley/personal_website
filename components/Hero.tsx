import React, { useCallback, useRef } from "react";
import Image from "next/image";
import Particles from "react-tsparticles";
import { Engine, Container, ISourceOptions } from "tsparticles-engine";
import { loadFull } from "tsparticles"; // Changed from loadSlim to loadFull
import { motion } from "framer-motion";
import TypingEffect from "./TypingEffect";

const Hero = () => {
  const particlesRef = useRef<Container | null>(null);

  const particlesInit = useCallback(async (engine: Engine) => {
    // Load the full tsParticles package
    await loadFull(engine);
  }, []);

  const particlesLoaded = useCallback(async (container: Container | null) => {
    particlesRef.current = container;
  }, []);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      const container = particlesRef.current;
      if (container) {
        const pos = {
          x: event.clientX / window.innerWidth,
          y: event.clientY / window.innerHeight,
        };

        container.particles.addParticle({
          x: pos.x * container.canvas.size.width,
          y: pos.y * container.canvas.size.height,
          move: {
            direction: "none",
            enable: true,
            speed: 2, // Adjust speed as desired
            outModes: {
              default: "destroy",
            },
          },
          size: {
            value: 3,
            random: {
              enable: true,
              minimumValue: 1,
            },
          },
          color: {
            value: "#FFD700", // Changed color to gold
          },
          opacity: {
            value: 0.8,
          },
          shape: {
            type: "circle",
          },
        });
      }
    },
    []
  );

  const particlesOptions: ISourceOptions = {
    fullScreen: false,
    background: {
      color: {
        value: "#1a202c", // Optional: Match the Tailwind background
      },
    },
    particles: {
      number: {
        value: 80,
        density: {
          enable: true,
          area: 800,
        },
      },
      size: {
        value: { min: 1, max: 3 },
      },
      move: {
        enable: true,
        speed: 0.1, // Reduced speed for smoother movement
        direction: "none",
        random: false,
        straight: false,
        outModes: {
          default: "out",
        },
      },
      opacity: {
        value: 0.5,
        random: false,
      },
      shape: {
        type: "circle",
      },
      color: {
        value: "#ffffff",
      },
    },
    interactivity: {
      events: {
        onHover: {
          enable: true,
          mode: "repulse",
        },
        onClick: {
          enable: false, // We'll handle click manually
          mode: "repulse",
        },
        resize: true,
      },
      modes: {
        repulse: {
          distance: 100,
          duration: 0.8,
          factor: 8, // Strength of repulsion
          speed: 1, // Speed at which particles are repulsed
        },
      },
    },
    detectRetina: true,
  };

  return (
    <section
      className="relative flex items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900"
      onClick={handleClick} // Attach click handler to the section
    >
      {/* Particles Background */}
      <Particles
        id="tsparticles"
        init={particlesInit}
        loaded={particlesLoaded}
        options={particlesOptions}
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
