import { SUGGESTED_PROMPTS } from '@videohub/config';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function AiCta(): JSX.Element {
  return (
    <section className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6 lg:px-10">
      <div className="relative isolate overflow-hidden rounded-3xl border border-white/[0.08] bg-ink-850 px-6 py-12 sm:px-12 sm:py-16">
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div className="absolute -left-20 -top-24 size-96 rounded-full bg-brand-600/25 blur-[100px]" />
          <div className="absolute -bottom-32 right-0 size-96 rounded-full bg-accent-500/20 blur-[100px]" />
        </div>

        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-200">
            <Sparkles className="size-3.5" aria-hidden="true" />
            VideoHub AI
          </span>

          <h2 className="mt-5 font-display text-display-md font-bold text-balance text-white">
            Not sure what to watch?
          </h2>

          <p className="mt-4 text-lg leading-relaxed text-ink-300">
            Describe a mood, a genre, a runtime, or a film you loved. VideoHub AI suggests
            something and explains why — then points you to somewhere legitimate to watch it.
          </p>

          <ul className="mt-7 flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.slice(0, 5).map((prompt) => (
              <li key={prompt.text}>
                <Link
                  to={`/ai?q=${encodeURIComponent(prompt.text)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-sm text-ink-200 transition-colors hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
                >
                  <span aria-hidden="true">{prompt.emoji}</span>
                  {prompt.text}
                </Link>
              </li>
            ))}
          </ul>

          <Link to="/ai" className="mt-8 inline-block">
            <Button size="lg" rightIcon={<ArrowRight className="size-4.5" />}>
              Start a conversation
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
