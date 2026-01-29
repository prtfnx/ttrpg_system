/**
 * CustomizePanel Component Tests  
 * Production-ready tests for UI customization panel
 */

import { CustomizePanel } from '@features/character';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

describe('CustomizePanel', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-button-style');
    document.documentElement.removeAttribute('data-color-scheme');
    document.documentElement.style.removeProperty('--accent-opacity');
    document.documentElement.style.removeProperty('--custom-radius');
  });

  describe('rendering', () => {
    it('renders panel with header', () => {
      render(<CustomizePanel />);
      
      expect(screen.getByText(/Customize Interface/i)).toBeTruthy();
      expect(screen.getByText(/Personalize your TTRPG experience/i)).toBeTruthy();
    });

    it('renders all theme options', () => {
      render(<CustomizePanel />);
      
      expect(screen.getByText('Dark')).toBeTruthy();
      expect(screen.getByText('Light')).toBeTruthy();
      expect(screen.getByText('High Contrast')).toBeTruthy();
      expect(screen.getByText('Cyberpunk')).toBeTruthy();
      expect(screen.getByText('Forest')).toBeTruthy();
    });

    it('renders button style options', () => {
      render(<CustomizePanel />);
      
      expect(screen.getByText('Rounded')).toBeTruthy();
      expect(screen.getByText('Sharp')).toBeTruthy();
      expect(screen.getByText('Pill')).toBeTruthy();
    });

    it('renders color scheme options', () => {
      render(<CustomizePanel />);
      
      expect(screen.getByLabelText('blue accent')).toBeTruthy();
      expect(screen.getByLabelText('purple accent')).toBeTruthy();
      expect(screen.getByLabelText('green accent')).toBeTruthy();
      expect(screen.getByLabelText('red accent')).toBeTruthy();
      expect(screen.getByLabelText('orange accent')).toBeTruthy();
    });

    it('renders reset button', () => {
      render(<CustomizePanel />);
      
      expect(screen.getByText(/Reset to Defaults/i)).toBeTruthy();
    });
  });

  describe('theme selection', () => {
    it('applies dark theme on selection', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const darkButton = screen.getByText('Dark').closest('button');
      await user.click(darkButton!);
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(localStorage.getItem('app-theme')).toBe('dark');
    });

    it('applies light theme on selection', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const lightButton = screen.getByText('Light').closest('button');
      await user.click(lightButton!);
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(localStorage.getItem('app-theme')).toBe('light');
    });

    it('applies high-contrast theme on selection', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const hcButton = screen.getByText('High Contrast').closest('button');
      await user.click(hcButton!);
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
      expect(localStorage.getItem('app-theme')).toBe('high-contrast');
    });

    it('applies cyberpunk theme on selection', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const cpButton = screen.getByText('Cyberpunk').closest('button');
      await user.click(cpButton!);
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('cyberpunk');
      expect(localStorage.getItem('app-theme')).toBe('cyberpunk');
    });

    it('applies forest theme on selection', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const forestButton = screen.getByText('Forest').closest('button');
      await user.click(forestButton!);
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('forest');
      expect(localStorage.getItem('app-theme')).toBe('forest');
    });
  });

  describe('button style selection', () => {
    it('applies rounded button style', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const roundedButton = screen.getByText('Rounded').closest('button');
      await user.click(roundedButton!);
      
      expect(document.documentElement.getAttribute('data-button-style')).toBe('rounded');
      expect(localStorage.getItem('button-style')).toBe('rounded');
    });

    it('applies sharp button style', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const sharpButton = screen.getByText('Sharp').closest('button');
      await user.click(sharpButton!);
      
      expect(document.documentElement.getAttribute('data-button-style')).toBe('sharp');
      expect(localStorage.getItem('button-style')).toBe('sharp');
    });

    it('applies pill button style', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const pillButton = screen.getByText('Pill').closest('button');
      await user.click(pillButton!);
      
      expect(document.documentElement.getAttribute('data-button-style')).toBe('pill');
      expect(localStorage.getItem('button-style')).toBe('pill');
    });
  });

  describe('color scheme selection', () => {
    it('applies blue color scheme', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const blueButton = screen.getByLabelText('blue accent');
      await user.click(blueButton);
      
      expect(document.documentElement.getAttribute('data-color-scheme')).toBe('blue');
      expect(localStorage.getItem('color-scheme')).toBe('blue');
    });

    it('applies purple color scheme', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const purpleButton = screen.getByLabelText('purple accent');
      await user.click(purpleButton);
      
      expect(document.documentElement.getAttribute('data-color-scheme')).toBe('purple');
      expect(localStorage.getItem('color-scheme')).toBe('purple');
    });

    it('applies green color scheme', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const greenButton = screen.getByLabelText('green accent');
      await user.click(greenButton);
      
      expect(document.documentElement.getAttribute('data-color-scheme')).toBe('green');
      expect(localStorage.getItem('color-scheme')).toBe('green');
    });

    it('applies red color scheme', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const redButton = screen.getByLabelText('red accent');
      await user.click(redButton);
      
      expect(document.documentElement.getAttribute('data-color-scheme')).toBe('red');
      expect(localStorage.getItem('color-scheme')).toBe('red');
    });

    it('applies orange color scheme', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const orangeButton = screen.getByLabelText('orange accent');
      await user.click(orangeButton);
      
      expect(document.documentElement.getAttribute('data-color-scheme')).toBe('orange');
      expect(localStorage.getItem('color-scheme')).toBe('orange');
    });
  });

  describe('accent opacity control', () => {
    it('updates accent opacity CSS variable', async () => {
      render(<CustomizePanel />);
      
      const slider = screen.getAllByRole('slider')[0];
      fireEvent.change(slider, { target: { value: '75' } });
      
      const opacity = document.documentElement.style.getPropertyValue('--accent-opacity');
      expect(opacity).toBe('0.75');
    });

    it('persists accent opacity to localStorage', async () => {
      render(<CustomizePanel />);
      
      const slider = screen.getAllByRole('slider')[0];
      fireEvent.change(slider, { target: { value: '50' } });
      
      expect(localStorage.getItem('accent-opacity')).toBe('50');
    });
  });

  describe('border radius control', () => {
    it('updates border radius CSS variable', async () => {
      render(<CustomizePanel />);
      
      const slider = screen.getAllByRole('slider')[1];
      fireEvent.change(slider, { target: { value: '16' } });
      
      const radius = document.documentElement.style.getPropertyValue('--custom-radius');
      expect(radius).toBe('16px');
    });

    it('persists border radius to localStorage', async () => {
      render(<CustomizePanel />);
      
      const slider = screen.getAllByRole('slider')[1];
      fireEvent.change(slider, { target: { value: '12' } });
      
      expect(localStorage.getItem('border-radius')).toBe('12');
    });
  });

  describe('reset functionality', () => {
    it('resets all settings to defaults', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const lightButton = screen.getByText('Light').closest('button');
      await user.click(lightButton!);
      
      const sharpButton = screen.getByText('Sharp').closest('button');
      await user.click(sharpButton!);
      
      const resetButton = screen.getByText(/Reset to Defaults/i);
      await user.click(resetButton);
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.getAttribute('data-button-style')).toBe('rounded');
      expect(document.documentElement.getAttribute('data-color-scheme')).toBe('blue');
      expect(localStorage.getItem('app-theme')).toBe('dark');
      expect(localStorage.getItem('button-style')).toBe('rounded');
      expect(localStorage.getItem('color-scheme')).toBe('blue');
    });

    it('resets opacity and radius values', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      const resetButton = screen.getByText(/Reset to Defaults/i);
      await user.click(resetButton);
      
      expect(document.documentElement.style.getPropertyValue('--accent-opacity')).toBe('1');
      expect(document.documentElement.style.getPropertyValue('--custom-radius')).toBe('8px');
      expect(localStorage.getItem('accent-opacity')).toBe('100');
      expect(localStorage.getItem('border-radius')).toBe('8');
    });
  });

  describe('persistence', () => {
    it('persists multiple setting changes', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      await user.click(screen.getByText('Cyberpunk'));
      await user.click(screen.getByText('Pill'));
      await user.click(screen.getByLabelText('purple accent'));
      
      expect(localStorage.getItem('app-theme')).toBe('cyberpunk');
      expect(localStorage.getItem('button-style')).toBe('pill');
      expect(localStorage.getItem('color-scheme')).toBe('purple');
    });

    it('applies all changes to DOM', async () => {
      const user = userEvent.setup();
      render(<CustomizePanel />);
      
      await user.click(screen.getByText('Forest'));
      await user.click(screen.getByText('Sharp'));
      await user.click(screen.getByLabelText('green accent'));
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('forest');
      expect(document.documentElement.getAttribute('data-button-style')).toBe('sharp');
      expect(document.documentElement.getAttribute('data-color-scheme')).toBe('green');
    });
  });

  describe('accessibility', () => {
    it('has accessible theme buttons', () => {
      render(<CustomizePanel />);
      
      const themeButtons = screen.getAllByRole('button').filter(btn => 
        ['Dark', 'Light', 'High Contrast', 'Cyberpunk', 'Forest'].includes(btn.textContent || '')
      );
      
      expect(themeButtons.length).toBe(5);
      themeButtons.forEach(button => {
        expect(button).toBeTruthy();
      });
    });

    it('has accessible sliders', () => {
      render(<CustomizePanel />);
      
      const sliders = screen.getAllByRole('slider');
      expect(sliders.length).toBe(2);
    });
  });
});
