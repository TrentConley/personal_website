import React from "react";
import { motion } from "framer-motion";
import PaintStrokes from "./PaintStrokes";

export default function About() {
  return (
    <section id="about" className="relative py-20 bg-[#050A18] text-gray-100 overflow-hidden">
      {/* Interactive background effects */}
      <PaintStrokes />
      
      <motion.div 
        className="relative max-w-4xl mx-auto px-6 z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h2 className="text-5xl font-bold text-center mb-12 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 text-transparent bg-clip-text drop-shadow-lg">
          About Me
        </h2>
        
        <div className="bg-black/40 backdrop-blur-lg rounded-2xl p-8 mb-12 shadow-xl border border-white/10 hover:border-white/20 transition-all duration-300">
          <p className="text-lg leading-relaxed mb-6 text-white">
            Hi! I'm a Georgia Tech student set to graduate in December 2025. This summer, I'll be joining SpaceX as a Software Engineering intern, and I'm planning on pursuing a Masters in Machine Learning (graduating December 2026). I love in software architecture, full stack development, machine learning, and drone technology.
          </p>
          <p className="text-lg leading-relaxed text-white">
            In my free time, I like to work on side projects, practice Brazilian
            Jiu Jitsu, and do woodworking.
          </p>
        </div>

        <div className="bg-black/40 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-white/10 hover:border-white/20 transition-all duration-300">
          <h3 className="text-3xl font-bold mb-6 bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text drop-shadow-lg">
            What I'm Looking For
          </h3>
          <ul className="space-y-4">
            <motion.li 
              className="flex items-start space-x-3"
              whileHover={{ x: 10, scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-cyan-400 mt-1.5 text-xl">•</span>
              <span className="text-lg text-white">
                Full-time opportunities starting 2026 where I can contribute to challenging software projects at the intersection of AI and engineering.
              </span>
            </motion.li>
            <motion.li 
              className="flex items-start space-x-3"
              whileHover={{ x: 10, scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-purple-400 mt-1.5 text-xl">•</span>
              <span className="text-lg text-white">
                Co-founder of a high-impact startup.
              </span>
            </motion.li>
            <motion.li 
              className="flex items-start space-x-3"
              whileHover={{ x: 10, scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-pink-400 mt-1.5 text-xl">•</span>
              <span className="text-lg text-white">
                Part-time contracting work in Computer Vision, AI, or Full Stack Development.
              </span>
            </motion.li>
          </ul>
        </div>
      </motion.div>
    </section>
  );
}
