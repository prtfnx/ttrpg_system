/**
 * Accessibility Test Helpers
 * 
 * Helper functions for testing with accessible queries.
 * These help find elements the way users (including screen reader users) would.
 */
import { screen, within } from '@testing-library/react';

/**
 * Finds an option in a listbox by accessible name
 */
export function getListOption(name: string | RegExp) {
  return screen.getByRole('option', { name });
}

/**
 * Finds all options in a listbox
 */
export function getAllListOptions() {
  return screen.getAllByRole('option');
}

/**
 * Checks if an element is marked as selected (aria-selected)
 */
export function isSelected(element: HTMLElement): boolean {
  return element.getAttribute('aria-selected') === 'true';
}

/**
 * Checks if an element is expanded (aria-expanded)
 */
export function isExpanded(element: HTMLElement): boolean {
  return element.getAttribute('aria-expanded') === 'true';
}

/**
 * Checks if an element is pressed (aria-pressed for toggle buttons)
 */
export function isPressed(element: HTMLElement): boolean {
  return element.getAttribute('aria-pressed') === 'true';
}

/**
 * Finds an error alert on the page
 */
export function getErrorAlert() {
  return screen.queryByRole('alert');
}

/**
 * Finds a tab by name
 */
export function getTab(name: string | RegExp) {
  return screen.getByRole('tab', { name });
}

/**
 * Finds the active tabpanel
 */
export function getActiveTabPanel() {
  return screen.getByRole('tabpanel');
}

/**
 * Finds a dialog/modal
 */
export function getDialog(name?: string | RegExp) {
  return name 
    ? screen.getByRole('dialog', { name }) 
    : screen.getByRole('dialog');
}

/**
 * Within a specific element, find by role
 */
export function withinElement(element: HTMLElement) {
  return within(element);
}

/**
 * Get loading indicator
 */
export function getLoadingIndicator() {
  return screen.queryByRole('status', { name: /loading/i }) 
    || screen.queryByText(/loading/i);
}

/**
 * Assert element has proper focus
 */
export function hasFocus(element: HTMLElement): boolean {
  return document.activeElement === element;
}