import ProjectCard from "./ProjectCard";

export default function Portfolio() {
  const projects = [
    {
      id: 1,
      title: "Eye-Controlled Drone",
      image: "/drone.jpg",
      description:
        "As a passion project, I created a system to control a drone using only eye movements and head tilts. I began by building an algorithm that mapped where my pupil was in relation to the rest of my eye, but this approach was ineffective since I could have variable distance to the screen. I set out to build a Convolutional Neural Network to classify my eye in certain positions, which provided two degrees of freedom. To gain full control of the drone, I incorporated my head tilt into the algorithm, giving me two more degrees of freedom. Finally, I refined the model by adding approximated face to camera distances, adding pupil coordinates, and retrained the CNN to incorporate these factors. The result was a surprisingly accurate and enjoyable drone control system. I had a friend test it out where he would look at another friend in the camera frame from the drone, and the software recognized where and one of my friends tested it out and you can see my friend Owen control it here: https://www.youtube.com/watch?v=lf6IOTpSvVg",
      links: {
        github: "https://github.com/TrentConley/Drone",
        youtube: "https://www.youtube.com/watch?v=lf6IOTpSvVg",
      },
    },
    {
      id: 2,
      title: "Token Streaming with Revest FNFTs",
      image: "/revest.png",
      description:
        "For the Web3ATL hackathon, I designed and implemented a token streaming mechanism using Revest FNFTs, offering both linear and quadratic withdrawal methods. I enhanced the RevestV2 contracts by introducing a batch minting process, creating one FNFT per second from creation until time lock expiration. This approach allows users to withdraw tokens at predetermined intervals seamlessly. I developed multiple withdrawal functions to handle different streaming strategies and wrote comprehensive tests to validate functionality and ensure reliability. Additionally, I modified auxiliary components such as the lock manager and interfaces to support the new streaming features, resulting in a robust and flexible token streaming solution. Although the initial prize was $2,500, Revest's value increased before distribution, resulting in earnings of over $8,000 in Ethereum at the time.",
      links: {
        github: "https://github.com/TrentConley/RevestV2-Streaming",
        website:
          "https://app.buidlbox.io/projects/token-str?path=projects%2Ftoken-str",
      },
    },
    {
      id: 3,
      title: "Website Development for True Persona AI",
      image: "/persona.png",
      description:
        "During my contract with True Persona AI, I was responsible for developing a website quickly to support their demos showcasing how generative AI can synthesize the personalities and skills of multiple individuals to form effective consulting teams. The website has been instrumental in over a dozen demonstrations, directly contributing to a successful fundraising round for the startup.",
      links: {
        website: "https://team-builder2.vercel.app/",
      },
    },
    {
      id: 4,
      title: "Easy Deep Learning",
      image: "/easy-deep-learning.png",
      description:
        "During Hacklytics 2024, my team and I developed Easy Deep Learning to simplify fine-tuning vision models without coding. Our platform allows users to upload images and fine-tune image classification models using data augmentation with Stable Diffusion. We leveraged technologies such as Firebase, Next.js, Flask, and Intel Developer Cloud to build a robust solution that can train accurate models with minimal data. We successfully trained models to recognize flooded neighborhoods in Pakistan with high accuracy using only 16 original images augmented with synthetic data. This project demonstrates the potential of making advanced AI techniques accessible to non-technical users.",
      links: {
        github: "https://github.com/TrentConley/Hacklytics",
        website: "https://devfolio.co/projects/easy-deep-learning-5b92",
        youtube: "https://www.youtube.com/watch?v=Ci80FKm_ACc",
      },
    },
    // Add more projects as needed
  ];

  return (
    <section id="portfolio" className="py-16 bg-gray-50">
      <h2 className="text-4xl font-bold text-center mb-12">Projects</h2>
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 px-6">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}
