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

  const toggleDescription = () => {
    setIsOpen(!isOpen);
  };

  const truncatedDescription =
    project.description.length > 100
      ? `${project.description.substring(0, 100)}...`
      : project.description;

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <Image
        src={project.image}
        alt={project.title}
        width={600}
        height={400}
        className="object-cover"
      />
      <div className="p-6">
        <h3 className="text-2xl font-semibold mb-2">{project.title}</h3>
        <p className="text-gray-600">
          {isOpen ? project.description : truncatedDescription}
        </p>
        {project.description.length > 100 && (
          <button
            onClick={toggleDescription}
            className="flex items-center mt-2 text-blue-500 hover:text-blue-700 focus:outline-none"
          >
            {isOpen ? "Show Less" : "Show More"}
            {isOpen ? (
              <FiChevronUp className="ml-1" />
            ) : (
              <FiChevronDown className="ml-1" />
            )}
          </button>
        )}
        <div className="flex items-center space-x-4 mt-4">
          {project.links.github && (
            <Link href={project.links.github} passHref>
              <FiGithub className="w-6 h-6 text-gray-700 hover:text-gray-900 cursor-pointer" />
            </Link>
          )}
          {project.links.website && (
            <Link href={project.links.website} passHref>
              <FiExternalLink className="w-6 h-6 text-gray-700 hover:text-gray-900 cursor-pointer" />
            </Link>
          )}
          {project.links.youtube && (
            <Link href={project.links.youtube} passHref>
              <FiYoutube className="w-6 h-6 text-red-600 hover:text-red-800 cursor-pointer" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
