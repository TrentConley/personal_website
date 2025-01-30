import React from "react";
import Image from "next/image";
import Particles from "react-tsparticles";
import { Engine } from "tsparticles-engine";
import { loadSlim } from "tsparticles-slim";
import { motion } from "framer-motion";
import TypingEffect from "./TypingEffect";
import Link from "next/link";

const Hero = () => {
  const particlesInit = async (engine: Engine) => {
    await loadSlim(engine);
  };

  const navItems = [
    { name: "Home", href: "#" },
    { name: "About", href: "#about" },
    { name: "Portfolio", href: "#portfolio" },
    { name: "Books", href: "/books" },
    { name: "Resume", href: "/resume" },
    { name: "Contact", href: "#contact" },
  ];

  return (
    <section className="relative min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      {/* Navigation Bar */}
      <motion.nav 
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/30 border-b border-white/10"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-shrink-0">
              <span className="text-white font-bold text-xl">TC</span>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-center space-x-8">
                {navItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="text-gray-300 hover:text-white hover:bg-white/10 px-3 py-2 rounded-md text-sm font-medium transition-all duration-300"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.nav>

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
              repulse: { distance: 70, duration: 0.4, factor: 8, speed: 1 },
            },
          },
        }}
        className="absolute inset-0 w-full h-full"
      />

      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 min-h-screen justify-center pt-16">
        {/* Profile Image */}
        <motion.div 
          className="mb-8"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full blur opacity-75"></div>
            <Image
              src="/profile.png"
              alt="Your Name"
              width={180}
              height={180}
              className="rounded-full shadow-lg relative"
            />
          </div>
        </motion.div>

        <motion.div
          className="space-y-6"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
        >
          <TypingEffect />
          
          <motion.div
            className="flex justify-center space-x-4 mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
          >
            <a 
              href="#portfolio" 
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-full font-medium hover:from-blue-600 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-blue-500/50"
            >
              View Portfolio
            </a>
            <a 
              href="#contact" 
              className="px-8 py-3 bg-transparent border-2 border-white/50 text-white rounded-full font-medium hover:bg-white/10 transition-all duration-300"
            >
              Get in Touch
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
