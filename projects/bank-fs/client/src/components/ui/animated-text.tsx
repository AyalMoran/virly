import * as React from "react";
import { motion, type Variants } from "framer-motion";
import { cn } from "../../lib/utils";

interface AnimatedTextProps extends React.HTMLAttributes<HTMLDivElement> {
  text: string;
  duration?: number;
  delay?: number;
  replay?: boolean;
  className?: string;
  textClassName?: string;
  underlineClassName?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
  underlineGradient?: string;
  underlineHeight?: string;
  underlineOffset?: string;
}

const AnimatedText = React.forwardRef<HTMLDivElement, AnimatedTextProps>(
  (
    {
      text,
      duration = 0.19,
      delay = 0.18,
      replay = true,
      className,
      textClassName,
      underlineClassName,
      as: Component = "h1",
      underlineGradient,
      underlineHeight,
      underlineOffset,
      ...props
    },
    ref
  ) => {
    const letters = React.useMemo(() => Array.from(text), [text]);
    const MotionComponent = React.useMemo(() => motion.create(Component), [Component]);

    const container: Variants = React.useMemo(
      () => ({
        hidden: {
          opacity: 0
        },
        visible: (i: number = 1) => ({
          opacity: 1,
          transition: {
            staggerChildren: duration,
            delayChildren: i * delay
          }
        })
      }),
      [delay, duration]
    );

    const child: Variants = React.useMemo(
      () => ({
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            type: "spring",
            damping: 12,
            stiffness: 200
          }
        },
        hidden: {
          opacity: 0,
          y: 20,
          transition: {
            type: "spring",
            damping: 12,
            stiffness: 200
          }
        }
      }),
      []
    );

    const lineVariants: Variants = React.useMemo(
      () => ({
        hidden: {
          width: "0%",
          left: "50%"
        },
        visible: {
          width: "100%",
          left: "0%",
          transition: {
            delay: (letters.length - 1) * delay,
            duration: 0.8,
            ease: "easeOut"
          }
        }
      }),
      [delay, letters.length]
    );

    return (
      <div
        ref={ref}
        className={cn("animated-text", className)}
        {...props}
      >
        <div className="animated-text-shell">
          <MotionComponent
            style={{ display: "flex", overflow: "hidden" }}
            variants={container}
            initial="hidden"
            animate={replay ? "visible" : "hidden"}
            className={cn("animated-text-heading", textClassName)}
          >
            {letters.map((letter, index) => (
              <motion.span key={`${letter}-${index}`} variants={child}>
                {letter === " " ? "\u00A0" : letter}
              </motion.span>
            ))}
          </MotionComponent>

          <motion.div
            variants={lineVariants}
            initial="hidden"
            animate="visible"
            className={cn(
              "animated-text-underline",
              underlineGradient,
              underlineHeight,
              underlineOffset,
              underlineClassName
            )}
          />
        </div>
      </div>
    );
  }
);

AnimatedText.displayName = "AnimatedText";

export { AnimatedText };
