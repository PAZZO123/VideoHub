import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MediaGrid } from './media-rail';

/**
 * Guards a layout bug that was visible rather than throwable.
 *
 * The cards carry a fixed pixel width so they work inside a horizontal rail,
 * where `.rail > *` is `shrink-0`. Dropped into a grid track narrower than that
 * width, a card overflowed its column and sat on top of its neighbour — a 300px
 * VideoCard in a 203px track overlapped the next card by about 97px on the
 * trending page. The grid has to force its children to fill their track.
 */
describe('MediaGrid', () => {
  it('makes children fill their grid track, whatever width the card asks for', () => {
    render(
      <MediaGrid>
        <article data-testid="card">card</article>
      </MediaGrid>,
    );

    const grid = screen.getByTestId('card').parentElement;
    expect(grid?.className).toContain('[&>*]:w-full');
  });

  it('keeps the poster and landscape column counts distinct', () => {
    const { container, rerender } = render(
      <MediaGrid>
        <article>a</article>
      </MediaGrid>,
    );
    const poster = container.firstElementChild?.className ?? '';

    rerender(
      <MediaGrid variant="landscape">
        <article>a</article>
      </MediaGrid>,
    );
    const landscape = container.firstElementChild?.className ?? '';

    expect(poster).not.toBe(landscape);
    // Posters are narrow, so more of them fit per row than 16:9 cards.
    expect(poster).toContain('2xl:grid-cols-7');
    expect(landscape).toContain('xl:grid-cols-4');
  });
});
