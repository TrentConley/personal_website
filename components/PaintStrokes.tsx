import React, { useEffect, useState, useRef, CSSProperties } from "react";
import { motion, useAnimation } from "framer-motion";

interface FluidBlobProps {
  size: string;
  color1: string;
  color2: string;
  delay: number;
  index: number;
  blurAmount?: string;
  opacity1?: string;
  opacity2?: string;
}

const generateRandomPath = () => {
  const points = 5;
  const path = [];
  for (let i = 0; i < points; i++) {
    path.push([
      Math.random() * 100 - 50,  // x between -50 and 50
      Math.random() * 100 - 50   // y between -50 and 50
    ]);
  }
  return path;
};

const getColorValue = (color: string) => {
  const colors: { [key: string]: string } = {
    blue: 'rgb(37, 99, 235)',
    indigo: 'rgb(79, 70, 229)',
    purple: 'rgb(147, 51, 234)',
    fuchsia: 'rgb(217, 70, 239)',
    cyan: 'rgb(6, 182, 212)',
    violet: 'rgb(139, 92, 246)',
    pink: 'rgb(236, 72, 153)',
    rose: 'rgb(244, 63, 94)',
  };
  return colors[color] || colors.blue;
};

const FluidBlob: React.FC<FluidBlobProps> = ({ 
  size, 
  color1, 
  color2, 
  delay, 
  index,
  blurAmount = "3xl",
  opacity1 = "30",
  opacity2 = "20"
}) => {
  const controls = useAnimation();
  const isMounted = useRef(false);
  
  const getBlurValue = (blur: string) => {
    const blurValues: { [key: string]: string } = {
      '2xl': '40px',
      '3xl': '64px',
    };
    return blurValues[blur] || '40px';
  };

  useEffect(() => {
    isMounted.current = true;
    let animationFrame: number;

    const animate = async () => {
      if (!isMounted.current) return;

      const path = generateRandomPath();
      for (const [x, y] of path) {
        if (!isMounted.current) break;
        
        await controls.start({
          x,
          y,
          transition: {
            duration: Math.random() * 5 + 8,
            ease: "easeInOut"
          }
        });
      }
      
      if (isMounted.current) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    const timeoutId = setTimeout(() => {
      animate();
    }, delay * 1000);

    return () => {
      isMounted.current = false;
      clearTimeout(timeoutId);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [controls, delay]);

  const blobStyles: { first: CSSProperties; second: CSSProperties } = {
    first: {
      position: 'absolute' as const,
      inset: 0,
      backgroundColor: getColorValue(color1),
      opacity: Number(opacity1) / 100,
      borderRadius: '9999px',
      filter: `blur(${getBlurValue(blurAmount)})`,
      transform: 'translateZ(0)',
      mixBlendMode: 'screen' as const,
    },
    second: {
      position: 'absolute' as const,
      inset: 0,
      backgroundColor: getColorValue(color2),
      opacity: Number(opacity2) / 100,
      borderRadius: '9999px',
      filter: 'blur(100px)',
      transform: 'translateZ(0)',
      mixBlendMode: 'screen' as const,
    }
  };

  return (
    <motion.div
      animate={controls}
      initial={{ x: 0, y: 0 }}
      className={`absolute ${size} origin-center`}
      style={{
        left: `${Math.random() * 80 + 10}vw`,
        top: `${Math.random() * 80 + 10}vh`,
      }}
    >
      <motion.div
        animate={{
          scale: [1, 1.1, 0.9, 1.15, 1],
          rotate: [0, 10, -10, 15, 0],
        }}
        transition={{
          duration: Math.random() * 10 + 15,
          repeat: Infinity,
          ease: "easeInOut",
          delay: delay,
        }}
        className="relative w-full h-full"
      >
        <div style={blobStyles.first}></div>
        <div style={blobStyles.second}></div>
      </motion.div>
    </motion.div>
  );
};

export default function PaintStrokes() {
  const blobs = [
    { size: "w-[45vw] h-[45vw]", color1: "blue", color2: "indigo", delay: 0, blurAmount: "3xl", opacity1: "15", opacity2: "10" },
    { size: "w-[40vw] h-[40vw]", color1: "purple", color2: "fuchsia", delay: 2, blurAmount: "3xl", opacity1: "12", opacity2: "8" },
    { size: "w-[50vw] h-[50vw]", color1: "cyan", color2: "blue", delay: 1, blurAmount: "3xl", opacity1: "12", opacity2: "8" },
    { size: "w-[35vw] h-[35vw]", color1: "violet", color2: "purple", delay: 3, blurAmount: "2xl", opacity1: "15", opacity2: "10" },
    { size: "w-[45vw] h-[45vw]", color1: "pink", color2: "rose", delay: 2, blurAmount: "3xl", opacity1: "12", opacity2: "8" },
    { size: "w-[30vw] h-[30vw]", color1: "blue", color2: "cyan", delay: 4, blurAmount: "2xl", opacity1: "12", opacity2: "8" },
    { size: "w-[40vw] h-[40vw]", color1: "indigo", color2: "violet", delay: 1, blurAmount: "3xl", opacity1: "12", opacity2: "8" },
    { size: "w-[35vw] h-[35vw]", color1: "purple", color2: "pink", delay: 3, blurAmount: "2xl", opacity1: "12", opacity2: "8" },
  ];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden bg-[#030610]">
      {blobs.map((blob, index) => (
        <FluidBlob key={index} {...blob} index={index} />
      ))}
    </div>
  );
} 