import React from "react";
import { motion } from "framer-motion";
import Head from "next/head";
import { FiGithub, FiMenu, FiX } from "react-icons/fi";
import Link from "next/link";
import { useState } from "react";

interface Book {
  title: string;
  author: string;
}

const books: Book[] = [
  {
    title: "The Martian",
    author: "Andy Weir",
  },
  {
    title: "The Three-Body Problem",
    author: "Liu Cixin",
  },
  {
    title: "Ender's Game",
    author: "Orson Scott Card",
  },
  {
    title: "The Alchemist",
    author: "Paulo Coelho",
  },
  {
    title: "Rich Dad Poor Dad",
    author: "Robert T. Kiyosaki",
  },
  {
    title: "12 Rules for Life",
    author: "Jordan B. Peterson",
  },
  {
    title: "1984",
    author: "George Orwell",
  },
  {
    title: "The Power of Habit",
    author: "Charles Duhigg",
  },
  {
    title: "The Odyssey",
    author: "Homer",
  },
  {
    title: "Meditations",
    author: "Marcus Aurelius",
  },
  {
    title: "Atomic Habits",
    author: "James Clear",
  },
  {
    title: "To Kill a Mockingbird",
    author: "Harper Lee",
  },
  {
    title: "Power Score",
    author: "Hugh Dalziel & John P. O'Neill",
  },
  {
    title: "The 7 Habits of Highly Effective People",
    author: "Stephen R. Covey",
  },
  {
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
  },
  {
    title: "The Catcher in the Rye",
    author: "J.D. Salinger",
  },
  {
    title: "100M Offers",
    author: "Alex Hormozi",
  },
];

export default function Books() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { name: "Home", href: "/" },
    { name: "About", href: "/#about" },
    { name: "Portfolio", href: "/#portfolio" },
    { name: "Books", href: "/books" },
    { name: "Resume", href: "/resume" },
    { name: "Contact", href: "/#contact" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      <Head>
        <title>Books | Trent Conley</title>
        <meta
          name="description"
          content="A curated list of my favorite books."
        />
        <link rel="icon" href="/TC.png" />
      </Head>

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
              <Link href="/" className="text-white font-bold text-xl">
                Trent Conley
              </Link>
            </div>
            {/* Desktop Navigation */}
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
                <a
                  href="https://github.com/TrentConley"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-white hover:bg-white/10 p-2 rounded-md transition-all duration-300"
                >
                  <FiGithub className="w-5 h-5" />
                </a>
              </div>
            </div>
            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="text-gray-300 hover:text-white p-2 rounded-md transition-all duration-300"
              >
                {isMenuOpen ? (
                  <FiX className="w-6 h-6" />
                ) : (
                  <FiMenu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden border-t border-white/10"
          >
            <div className="px-2 pt-2 pb-3 space-y-1 backdrop-blur-md bg-black/30">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="text-gray-300 hover:text-white hover:bg-white/10 block px-3 py-2 rounded-md text-base font-medium transition-all duration-300"
                >
                  {item.name}
                </Link>
              ))}
              <a
                href="https://github.com/TrentConley"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMenuOpen(false)}
                className="text-gray-300 hover:text-white hover:bg-white/10 flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium transition-all duration-300"
              >
                <FiGithub className="w-5 h-5" />
                <span>GitHub</span>
              </a>
            </div>
          </motion.div>
        )}
      </motion.nav>
      
      <main className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <motion.div 
          className="max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-4xl font-bold text-center mb-12 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
            Reading List
          </h1>
          
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 shadow-xl">
            <div className="grid gap-4">
              {books.map((book, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="p-4 rounded-lg hover:bg-white/5 transition-all duration-300 border border-white/10"
                >
                  <h2 className="text-xl font-semibold text-white mb-1">
                    {book.title}
                  </h2>
                  <p className="text-gray-400">
                    by {book.author}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
