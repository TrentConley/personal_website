import { type ReactNode, useEffect } from "react";

const mediumUrl =
  "https://medium.com/@trentconley/would-you-risk-everything-on-a-coin-flip-if-the-math-told-you-to-89aa39a5a6bc";
const sourceUrl = "https://github.com/TrentConley/parallel-betting";

type EquationProps = {
  label: string;
  children: ReactNode;
};

function Equation({ label, children }: EquationProps) {
  return (
    <figure className="article-equation" aria-label={label}>
      <div className="article-math">{children}</div>
    </figure>
  );
}

export function ArticlePage() {
  useEffect(() => {
    document.title =
      "Would you risk everything on a coin flip if the math told you to? | Trent Conley";
  }, []);

  return (
    <div className="article-view">
      <nav className="article-nav" aria-label="Article navigation">
        <a href="/" className="article-nav__mark" aria-label="Return to orbit">
          TC
        </a>
        <a href="/writing">Return to orbit</a>
      </nav>

      <main className="article-shell">
        <article className="article-paper">
          <header className="article-header">
            <h1>
              Would you risk everything on a coin flip if the math told you to?
            </h1>
            <p className="article-dek">
              Expected value says to bet it all. The outcome you&apos;re likely to
              live through says something very different—until you play more
              than one game.
            </p>
            <div className="article-byline">
              <span>Trent Conley</span>
              <span aria-hidden="true">·</span>
              <time dateTime="2026-07-26">July 26, 2026</time>
              <span aria-hidden="true">·</span>
              <span>8 min read</span>
            </div>
          </header>

          <figure className="article-hero">
            <img
              src="/blog/parallel-betting/norway-2026.jpg"
              alt="A horned sheep photographed in Norway"
            />
            <figcaption>Norway, 2026. Captured by Trent Conley.</figcaption>
          </figure>

          <div className="article-body">
            <p className="article-lead">
              Imagine you have $1 and a stranger has a fair coin. They offer you
              the chance to play a game 100 times, and the rules are as follows:
            </p>

            <ol>
              <li>You can bet any amount each round.</li>
              <li>
                If it lands heads, you get your bet back plus 2 times your bet
                amount.
              </li>
              <li>If it lands tails, you lose your bet.</li>
            </ol>

            <p>
              For example, betting $1 on the first round results in you having
              $3 (heads) or $0 (tails).
            </p>
            <p>
              Do you play? Assuming we trust this mysterious stranger, I think
              most people would say yes. But how much should you bet? If you bet
              everything for each 100 rounds, you&apos;d almost certainly walk away
              a dollar poorer.
            </p>
            <p>
              This question intrigued me, because I saw two competing concepts:
              expected value and median outcome. To summarize shortly, expected
              outcome is the weighted probability sum of an outcome and its
              respective payout, and median is the middle outcome.
            </p>
            <p>
              A quick expected value calculation will tell you that you should
              bet all of your money every time. But is that the right amount to
              bet? What is the probability of profiting?
            </p>

            <p>
              <strong>That gives you a 1 in 2¹⁰⁰ chance of profiting.</strong>
            </p>

            <p>
              If you bet everything, you need to get heads at every turn to
              realize a profit. The probability of that is 1 in 2¹⁰⁰, which is
              essentially zero—roughly one in a billion times a billion times a
              billion times a thousand, so yeah, pretty small.
            </p>
            <p>
              So clearly, we shouldn&apos;t bet everything if we want to actually
              realize a profit. Put another way, I only care about the median
              outcome. Before I go into the math to prove it, take a guess. 80%?
              50%? 20%?
            </p>

            <h2>Optimize the outcome you&apos;ll actually see</h2>
            <p>First, let&apos;s define everything more formally:</p>
            <Equation label="h equals number of heads; b equals bet fraction; M sub i equals initial money; M sub f equals final money">
              <math display="block" aria-hidden="true">
                <mtable columnalign="right left" rowspacing="0.55em">
                  <mtr>
                    <mtd><mi>h</mi></mtd>
                    <mtd><mo>=</mo><mtext>number of heads</mtext></mtd>
                  </mtr>
                  <mtr>
                    <mtd><mi>b</mi></mtd>
                    <mtd><mo>=</mo><mtext>bet fraction</mtext></mtd>
                  </mtr>
                  <mtr>
                    <mtd><msub><mi>M</mi><mi>i</mi></msub></mtd>
                    <mtd><mo>=</mo><mtext>initial money</mtext></mtd>
                  </mtr>
                  <mtr>
                    <mtd><msub><mi>M</mi><mi>f</mi></msub></mtd>
                    <mtd><mo>=</mo><mtext>final money</mtext></mtd>
                  </mtr>
                </mtable>
              </math>
            </Equation>
            <p>Then, we can define your final bankroll as:</p>
            <Equation label="Final money equals initial money times one plus two b to the h, times one minus b to the one hundred minus h">
              <math display="block" aria-hidden="true">
                <msub><mi>M</mi><mi>f</mi></msub>
                <mo>=</mo>
                <msub><mi>M</mi><mi>i</mi></msub>
                <msup>
                  <mrow><mo>(</mo><mn>1</mn><mo>+</mo><mn>2</mn><mi>b</mi><mo>)</mo></mrow>
                  <mi>h</mi>
                </msup>
                <msup>
                  <mrow><mo>(</mo><mn>1</mn><mo>−</mo><mi>b</mi><mo>)</mo></mrow>
                  <mrow><mn>100</mn><mo>−</mo><mi>h</mi></mrow>
                </msup>
              </math>
            </Equation>
            <p>
              Great. Now what does the median outcome look like? I&apos;d argue that
              it is when there are 50 heads and 50 tails out of intuition,
              because this sits at exactly the middle distribution of outcomes.
              This will get more tricky later, but for this case it is rather
              simple.
            </p>
            <p>So, our median-outcome final money is:</p>
            <Equation label="Median h equals fifty; final money equals initial money times one plus two b to the fiftieth, times one minus b to the fiftieth">
              <math display="block" aria-hidden="true">
                <mtable rowspacing="0.65em">
                  <mtr>
                    <mtd>
                      <msub><mi>h</mi><mtext>median</mtext></msub>
                      <mo>=</mo><mn>50</mn>
                    </mtd>
                  </mtr>
                  <mtr>
                    <mtd>
                      <msub><mi>M</mi><mi>f</mi></msub><mo>=</mo>
                      <msub><mi>M</mi><mi>i</mi></msub>
                      <msup>
                        <mrow><mo>(</mo><mn>1</mn><mo>+</mo><mn>2</mn><mi>b</mi><mo>)</mo></mrow>
                        <mn>50</mn>
                      </msup>
                      <msup>
                        <mrow><mo>(</mo><mn>1</mn><mo>−</mo><mi>b</mi><mo>)</mo></mrow>
                        <mn>50</mn>
                      </msup>
                    </mtd>
                  </mtr>
                </mtable>
              </math>
            </Equation>
            <p>
              We now have something to optimize. Let&apos;s take the derivative of
              final money with respect to the bet fraction.
            </p>
            <Equation label="The derivative of final money with respect to b simplifies to fifty times initial money, times one plus two b to the forty-ninth, times one minus b to the forty-ninth, times one minus four b">
              <math display="block" aria-hidden="true">
                <mfrac>
                  <mrow><mi>d</mi><msub><mi>M</mi><mi>f</mi></msub></mrow>
                  <mrow><mi>d</mi><mi>b</mi></mrow>
                </mfrac>
                <mo>=</mo><mn>50</mn><msub><mi>M</mi><mi>i</mi></msub>
                <msup>
                  <mrow><mo>(</mo><mn>1</mn><mo>+</mo><mn>2</mn><mi>b</mi><mo>)</mo></mrow>
                  <mn>49</mn>
                </msup>
                <msup>
                  <mrow><mo>(</mo><mn>1</mn><mo>−</mo><mi>b</mi><mo>)</mo></mrow>
                  <mn>49</mn>
                </msup>
                <mrow><mo>(</mo><mn>1</mn><mo>−</mo><mn>4</mn><mi>b</mi><mo>)</mo></mrow>
              </math>
            </Equation>
            <p>Now, let&apos;s set it to zero to find our critical points.</p>
            <Equation label="The critical points for b are negative one half, one quarter, and one">
              <math display="block" aria-hidden="true">
                <mtable rowspacing="0.7em">
                  <mtr>
                    <mtd>
                      <mn>50</mn><msub><mi>M</mi><mi>i</mi></msub>
                      <msup>
                        <mrow><mo>(</mo><mn>1</mn><mo>+</mo><mn>2</mn><mi>b</mi><mo>)</mo></mrow>
                        <mn>49</mn>
                      </msup>
                      <msup>
                        <mrow><mo>(</mo><mn>1</mn><mo>−</mo><mi>b</mi><mo>)</mo></mrow>
                        <mn>49</mn>
                      </msup>
                      <mrow><mo>(</mo><mn>1</mn><mo>−</mo><mn>4</mn><mi>b</mi><mo>)</mo></mrow>
                      <mo>=</mo><mn>0</mn>
                    </mtd>
                  </mtr>
                  <mtr>
                    <mtd>
                      <mi>b</mi><mo>∈</mo>
                      <mrow>
                        <mo>{"{"}</mo>
                        <mo>−</mo><mfrac><mn>1</mn><mn>2</mn></mfrac>
                        <mo>,</mo><mfrac><mn>1</mn><mn>4</mn></mfrac>
                        <mo>,</mo><mn>1</mn><mo>{"}"}</mo>
                      </mrow>
                    </mtd>
                  </mtr>
                </mtable>
              </math>
            </Equation>
            <p>
              The bet fraction can&apos;t be negative, and if it is 1, then our
              final money is zero, so it must be 0.25. We need to bet 25% of our
              stack for each of the 100 rounds.
            </p>

            <p>
              <strong>The single-game answer: bet 25% each round.</strong>
            </p>

            <h2>Now play the games in parallel</h2>
            <p>
              I think we have a sufficient answer, but the interesting part to
              me is a step further: what if you could run multiple of these
              games in parallel?
            </p>
            <p>
              Let&apos;s first simplify the problem, and only consider 10 rounds.
              The probability of betting on just heads becomes 1 in 1024, which
              seems small, but it is much more attainable than our prior
              bet-everything-and-hope strategy. If we had, say, 10,000
              independent games played in parallel, you would expect that at
              least one of the all-heads runs should hit. More concretely, the
              probability of winning anything with the simultaneous games is
              1 − .999¹⁰⁰⁰⁰ ≈ 99.99%. Pretty good!
            </p>
            <p>
              When we have enough independent games, we should bet everything
              because now the median outcome will contain multiple large
              winnings.
            </p>
            <p>
              Okay, so we now know that if we have many simulations compared to
              rounds, we should bet everything. My natural questions that
              follow: when does betting 50% make sense? Is there some ratio
              between rounds and number of games, or does it change with the
              rounds? How do you model the bets in between 25% and 100%?
            </p>
            <p>
              These questions intrigue me much more than the original thought
              experiment.
            </p>
            <p>
              I ran a Monte Carlo simulation to find how many simultaneous games
              necessitates a 50% betting optimum, given our 10 rounds total.
            </p>

            <figure className="article-chart">
              <img
                src="/blog/parallel-betting/monte-carlo-50-percent.png"
                alt="Monte Carlo chart showing that the median-optimal bet rises from 25 percent with one game to 53.4 percent with four parallel games"
              />
              <figcaption>
                Monte Carlo simulation: 500,000 portfolios per curve. The
                original capital is divided equally among the games.
              </figcaption>
            </figure>

            <p>
              At just four games, you should bet over 50%. That&apos;s a
              surprisingly small amount of parallel games. Just a few extra
              games completely change your strategy.
            </p>

            <h2>How many games are you playing?</h2>
            <p>
              I found this variant of the question more analogous to real life.
              Venture capital firms expect most of their investments to go to
              zero, but the returns from a few outliers that become billion
              dollar companies cover the entire fund. The same goes for stocks:
              the majority of returns from the S&amp;P 500 came from just seven
              companies between 2023 and 2025.
            </p>
            <p>
              This is how capitalism, evolution, and nature work, through
              stochastic betting. The only question you need to ask yourself:
              <strong> how many games are you playing?</strong>
            </p>

            <section className="article-notes">
              <h2>Notes</h2>
              <p>
                All of my code is open sourced on GitHub. I&apos;m a bit old school
                when writing, so these are all my words. All the code was
                generated.
              </p>
              <p>
                If you see something cool, make a PR and I could feature it in
                the next post—such as what happens if the games are no longer
                independent.
              </p>
              <p>
                For those scrutinizing the application to venture capital and
                other domains, I&apos;ve left out an important detail: most events
                are not independent. I&apos;d challenge the reader to think about
                how this affects your strategy.
              </p>
            </section>

            <footer className="article-footer">
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                Explore the code ↗
              </a>
              <a href={mediumUrl} target="_blank" rel="noreferrer">
                Originally published on Medium ↗
              </a>
            </footer>
          </div>
        </article>
      </main>
    </div>
  );
}
