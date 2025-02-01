import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function Contact() {
  return (
    <section id="contact" className="relative py-20 bg-[#050A18] text-white">
      <motion.div
        className="max-w-4xl mx-auto px-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h2 className="text-5xl font-bold text-center mb-12 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 text-transparent bg-clip-text drop-shadow-lg">
          Contact
        </h2>
        <div className="bg-black/40 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-white/10 hover:border-white/20 transition-all duration-300">
          <div className="text-center space-y-6">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="group"
            >
              <p className="text-lg">
                <strong className="text-blue-400">Email:</strong>{" "}
                <a 
                  href="mailto:tconley7@gatech.edu" 
                  className="text-gray-300 hover:text-white transition-colors duration-300 border-b border-blue-400/30 hover:border-blue-400 pb-0.5"
                >
                  tconley7@gatech.edu
                </a>
              </p>
            </motion.div>
            
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="group"
            >
              <p className="text-lg">
                <strong className="text-purple-400">Phone:</strong>{" "}
                <a 
                  href="tel:+16507141773" 
                  className="text-gray-300 hover:text-white transition-colors duration-300 border-b border-purple-400/30 hover:border-purple-400 pb-0.5"
                >
                  +1 (650) 714-1773
                </a>
              </p>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.05 }}
              className="pt-4"
            >
              <Link 
                href="/resume"
                className="inline-block px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-blue-500/50"
              >
                View & Download Resume
              </Link>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
