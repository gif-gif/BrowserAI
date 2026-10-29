import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from '../../../../components/ui/Select';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
] as const;

describe('Select', () => {
  it('opens a listbox and picks an option with the mouse', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select label="Format" value="a" options={options} onChange={onChange} />);

    const trigger = screen.getByRole('combobox', { name: 'Format' });
    expect(trigger).toHaveTextContent('Option A');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: 'Option A' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('option', { name: 'Option B' }));

    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('supports keyboard navigation and Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select label="Format" value="a" options={options} onChange={onChange} />);

    screen.getByRole('combobox', { name: 'Format' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('closes when clicking outside and stays closed while disabled', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<div><Select label="Format" value="a" options={options} onChange={vi.fn()} /><p>outside</p></div>);

    await user.click(screen.getByRole('combobox', { name: 'Format' }));
    await user.click(screen.getByText('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    rerender(<div><Select label="Format" value="a" options={options} disabled onChange={vi.fn()} /><p>outside</p></div>);
    expect(screen.getByRole('combobox', { name: 'Format' })).toBeDisabled();
  });

  it('renders group headings and supports an aria-label without a visible label', async () => {
    const user = userEvent.setup();
    render(
      <Select
        ariaLabel="Slot"
        value=""
        options={[
          { value: '', label: 'None' },
          { value: 'x', label: 'X', group: 'Group 1' },
          { value: 'y', label: 'Y', group: 'Group 2' },
        ]}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Slot' }));
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('Group 2')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('keeps Escape from reaching document listeners such as a drawer', async () => {
    const user = userEvent.setup();
    const onDocumentEscape = vi.fn();
    document.addEventListener('keydown', onDocumentEscape);
    render(<Select label="Format" value="a" options={options} onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: 'Format' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onDocumentEscape).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onDocumentEscape);
  });
});
