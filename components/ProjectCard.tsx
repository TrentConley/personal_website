import { useState } from "react";
import Image from "next/image";
import {
  FiGithub,
  FiExternalLink,
  FiYoutube,
  FiChevronDown,
  FiChevronUp,
} from "react-icons/fi";
import Link from "next/link";
import { motion } from "framer-motion";

interface Project {
  id: number;
  title: string;
  image: string;
  description: string;
  links: {
    github?: string;
    website?: string;
    youtube?: string;
  };
}

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const toggleDescription = () => {
    setIsOpen(!isOpen);
  };

  const truncatedDescription =
    project.description.length > 100
      ? `${project.description.substring(0, 100)}...`
      : project.description;

  return (
    <motion.div
      className="bg-black/40 backdrop-blur-lg rounded-2xl overflow-hidden shadow-xl border border-white/10 hover:border-white/20 transition-all duration-300"
      whileHover={{ y: -5, scale: 1.02 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <div className="relative">
        <div className="w-full h-64 bg-gradient-to-br from-gray-900 to-gray-800 animate-pulse">
          <Image
            src={project.image}
            alt={project.title}
            width={600}
            height={400}
            priority={false}
            loading="lazy"
            lazyBoundary="800px"
            className={`object-cover w-full h-64 transition-all duration-500 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: isHovered ? 'scale(1.05)' : 'scale(1)',
            }}
            onLoad={() => setImageLoaded(true)}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            quality={75}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent"></div>
      </div>
      
      <div className="p-6">
        <motion.h3 
          className="text-2xl font-bold mb-2 text-white bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent"
          whileHover={{ x: 5 }}
        >
          {project.title}
        </motion.h3>
        <p className="text-white mb-4">
          {isOpen ? project.description : truncatedDescription}
        </p>
        {project.description.length > 100 && (
          <motion.button
            onClick={toggleDescription}
            className="flex items-center text-cyan-400 hover:text-cyan-300 transition-colors duration-300 mb-4 font-medium"
            whileHover={{ x: 5 }}
          >
            {isOpen ? "Show Less" : "Show More"}
            {isOpen ? (
              <FiChevronUp className="ml-1" />
            ) : (
              <FiChevronDown className="ml-1" />
            )}
          </motion.button>
        )}
        <div className="flex items-center space-x-4">
          {project.links.github && (
            <motion.a
              href={project.links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-white transition-colors duration-300"
              whileHover={{ scale: 1.2, rotate: 5 }}
            >
              <FiGithub className="w-6 h-6" />
            </motion.a>
          )}
          {project.links.website && (
            <motion.a
              href={project.links.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-white transition-colors duration-300"
              whileHover={{ scale: 1.2, rotate: 5 }}
            >
              <FiExternalLink className="w-6 h-6" />
            </motion.a>
          )}
          {project.links.youtube && (
            <motion.a
              href={project.links.youtube}
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-500 hover:text-red-400 transition-colors duration-300"
              whileHover={{ scale: 1.2, rotate: 5 }}
            >
              <FiYoutube className="w-6 h-6" />
            </motion.a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
