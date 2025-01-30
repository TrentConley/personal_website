import React from "react";
import { motion } from "framer-motion";

export default function About() {
  return (
    <section id="about" className="py-20 bg-gradient-to-b from-gray-100 to-gray-200 text-gray-800">
      <motion.div 
        className="max-w-4xl mx-auto px-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h2 className="text-5xl font-bold text-center mb-12 bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">About Me</h2>
        
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-12">
          <p className="text-lg leading-relaxed mb-6 text-gray-700">
            Hi! I am a Georgia Tech student graduating in December 2025, planning on
            doing my Masters in Machine Learning (graduation December 2026). I'm
            interested in software architecture, full stack development, machine
            learning, and drone technology.
          </p>
          <p className="text-lg leading-relaxed text-gray-700">
            In my free time, I like to work on side projects, practice Brazilian
            Jiu Jitsu, and do woodworking.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h3 className="text-3xl font-bold mb-6 text-gray-800">
            Opportunities I'm Looking For
          </h3>
          <ul className="space-y-4">
            <li className="flex items-start space-x-3">
              <span className="text-blue-500 mt-1">•</span>
              <span className="text-lg text-gray-700">
                Internships where I can collaborate with and learn from a highly
                skilled team on challenging software or hardware projects.
              </span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-blue-500 mt-1">•</span>
              <span className="text-lg text-gray-700">
                Co-founder of a high-impact startup.
              </span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-blue-500 mt-1">•</span>
              <span className="text-lg text-gray-700">
                Contracting work in Computer Vision, AI, and Machine Learning.
              </span>
            </li>
          </ul>
        </div>
      </motion.div>
    </section>
  );
}
