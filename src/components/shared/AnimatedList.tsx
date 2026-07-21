import { motion, type Variants } from "framer-motion";
import React from "react";

const container: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

interface AnimatedListProps {
  children: React.ReactNode[];
  className?: string;
  /** Delay between each child animation in seconds */
  stagger?: number;
}

/**
 * Wraps a list of children with staggered fade-in + slide-up animations.
 * Each direct child gets animated individually.
 */
export function AnimatedList({ children, className, stagger = 0.06 }: AnimatedListProps) {
  const variants: Variants = stagger !== 0.06
    ? { hidden: {}, show: { transition: { staggerChildren: stagger } } }
    : container;

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      animate="show"
    >
      {React.Children.map(children, (child, i) =>
        child ? (
          <motion.div key={i} variants={item}>
            {child}
          </motion.div>
        ) : null
      )}
    </motion.div>
  );
}
