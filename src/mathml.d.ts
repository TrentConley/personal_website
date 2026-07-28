import type * as React from "react";

type MathMLElementProps = React.HTMLAttributes<HTMLElement> & {
  columnalign?: string;
  display?: string;
  rowspacing?: string;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLElementProps;
      mfrac: MathMLElementProps;
      mi: MathMLElementProps;
      mn: MathMLElementProps;
      mo: MathMLElementProps;
      mrow: MathMLElementProps;
      msub: MathMLElementProps;
      msup: MathMLElementProps;
      mtable: MathMLElementProps;
      mtd: MathMLElementProps;
      mtext: MathMLElementProps;
      mtr: MathMLElementProps;
    }
  }
}

export {};
