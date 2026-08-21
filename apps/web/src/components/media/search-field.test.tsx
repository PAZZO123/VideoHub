import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SearchField } from './search-field';

describe('SearchField', () => {
  it('does not fire once per keystroke', async () => {
    // Every change becomes an API request on the listing pages, so an
    // undebounced field would hammer the server and make results flicker.
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} label="Search videos" />);

    await userEvent.type(screen.getByLabelText('Search videos'), 'bunny');

    expect(onChange).not.toHaveBeenCalledWith('b');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('bunny'), { timeout: 2000 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps typing responsive while the committed value lags behind', async () => {
    // The input is driven locally, so characters appear immediately even though
    // the caller has not been told yet.
    render(<SearchField value="" onChange={vi.fn()} label="Search videos" />);

    const input = screen.getByLabelText('Search videos');
    await userEvent.type(input, 'llama');

    expect(input).toHaveValue('llama');
  });

  it('clears the field and tells the caller', async () => {
    function Harness(): JSX.Element {
      const [value, setValue] = useState('bunny');
      return <SearchField value={value} onChange={setValue} label="Search videos" />;
    }
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));

    expect(screen.getByLabelText('Search videos')).toHaveValue('');
  });

  it('offers no clear button when there is nothing to clear', () => {
    render(<SearchField value="" onChange={vi.fn()} label="Search videos" />);

    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });

  it('follows the value when it changes elsewhere, such as a back navigation', async () => {
    const { rerender } = render(
      <SearchField value="bunny" onChange={vi.fn()} label="Search videos" />,
    );
    expect(screen.getByLabelText('Search videos')).toHaveValue('bunny');

    rerender(<SearchField value="" onChange={vi.fn()} label="Search videos" />);

    await waitFor(() => expect(screen.getByLabelText('Search videos')).toHaveValue(''));
  });

  it('labels each instance so several on one page stay distinguishable', () => {
    render(
      <>
        <SearchField value="" onChange={vi.fn()} label="Search movies" />
        <SearchField value="" onChange={vi.fn()} label="Search trending" />
      </>,
    );

    expect(screen.getByLabelText('Search movies')).toBeInTheDocument();
    expect(screen.getByLabelText('Search trending')).toBeInTheDocument();
  });
});
