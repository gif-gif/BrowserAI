import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GatewayForm } from '../../../components/settings/GatewayForm';
import SidePanelApp from '../../../entrypoints/sidepanel/App';
import { en } from '../../../shared/i18n/en';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';

describe('English UI', () => {
  it('renders the side panel in English', () => {
    render(
      <I18nProvider locale="en">
        <SidePanelApp context={{ status: 'preparing' }} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('heading', { name: 'Ask AI' })).not.toBeInTheDocument();
    expect(screen.queryByText('Your browser assistant')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: (name) => en.greetings.includes(name) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('renders Gateway settings in English', () => {
    render(
      <I18nProvider locale="en">
        <GatewayForm onSubmit={vi.fn()} onRemoveSecret={vi.fn()} onListModels={vi.fn()} onTest={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText('Model connection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch models' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test gateway' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save configuration' })).toBeInTheDocument();
  });
});
