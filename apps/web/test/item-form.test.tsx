import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemForm } from '../src/components/item-form';
import { LocaleProvider, directionOf, translate } from '../src/lib/i18n';

const uoms = [
  { code: 'HOUR', name: { en: 'Hour', ar: 'ساعة' } },
  { code: 'EA', name: { en: 'Each' } },
];

function renderForm(enabledModules: string[], locale: 'en' | 'ar' = 'en') {
  const onSubmit = vi.fn();
  render(
    <LocaleProvider initial={locale}>
      <ItemForm
        categories={[]}
        uoms={uoms}
        enabledModules={enabledModules}
        onSubmit={onSubmit}
        busy={false}
      />
    </LocaleProvider>,
  );
  return onSubmit;
}

describe('ItemForm (ADR-005, MI-001, F-UX-004)', () => {
  it('a service shows no physical section and submits without warehouse, barcode or expiry', () => {
    const onSubmit = renderForm(['crm', 'sales', 'accounting']);
    expect(screen.queryByTestId('physical')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Code/), { target: { value: 'CONSULT-HR' } });
    fireEvent.change(screen.getByLabelText(/Name \(English\)/), {
      target: { value: 'Consulting hour' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.kind).toBe('SERVICE');
    expect(payload).not.toHaveProperty('physical');
    expect(payload).not.toHaveProperty('warehouseId');
  });

  it('stocked kinds are disabled when the inventory module is off, enabled when on', () => {
    renderForm(['crm', 'sales', 'accounting']);
    const option = screen.getByRole('option', { name: /^Stocked good/ });
    expect(option).toBeDisabled();
    expect(screen.getByRole('option', { name: /^Service/ })).not.toBeDisabled();
  });

  it('switching to a stocked good reveals the physical section when inventory is enabled', () => {
    renderForm(['crm', 'sales', 'accounting', 'inventory']);
    fireEvent.change(screen.getByLabelText(/Kind/), { target: { value: 'STOCKED_GOOD' } });
    expect(screen.getByTestId('physical')).toBeInTheDocument();
    expect(screen.getByLabelText(/Barcode/)).toBeInTheDocument();
  });

  it('MI-017: switching locale changes labels and direction, not the payload', () => {
    const onSubmit = renderForm(['crm', 'sales', 'accounting'], 'ar');
    expect(directionOf('ar')).toBe('rtl');
    expect(translate('ar', 'items.kind')).toBe('النوع');
    fireEvent.change(document.getElementById('code') as HTMLInputElement, {
      target: { value: 'CONSULT-HR' },
    });
    fireEvent.change(document.getElementById('nameEn') as HTMLInputElement, {
      target: { value: 'Consulting hour' },
    });
    expect(screen.getByText('النوع')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء' }));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      kind: 'SERVICE',
      code: 'CONSULT-HR',
      baseUomCode: 'HOUR',
    });
  });
});
