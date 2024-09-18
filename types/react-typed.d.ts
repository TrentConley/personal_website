declare module "react-typed" {
  import { Component } from "react";

  interface TypedProps {
    strings: string[];
    typeSpeed?: number;
    backSpeed?: number;
    startDelay?: number;
    backDelay?: number;
    smartBackspace?: boolean;
    shuffle?: boolean;
    loop?: boolean;
    loopCount?: number;
    showCursor?: boolean;
    cursorChar?: string;
    autoInsertCss?: boolean;
    attr?: string;
    bindInputFocusEvents?: boolean;
    contentType?: "html" | "null";
    className?: string;
    onComplete?: () => void;
    onStringTyped?: (arrayPos: number) => void;
    onLastStringBackspaced?: () => void;
    preStringTyped?: (arrayPos: number) => void;
    onTypingPaused?: (arrayPos: number) => void;
    onTypingResumed?: (arrayPos: number) => void;
    onReset?: () => void;
    onStop?: () => void;
    onStart?: () => void;
    onDestroy?: () => void;
  }

  export default class Typed extends Component<TypedProps> {}
}
