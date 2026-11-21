import { fireEvent, screen } from '@testing-library/react';

export function fillExportBillingDetails() {
  fireEvent.change(screen.getByLabelText(/Billing country/i), {
    target: { value: 'US' },
  });
  fireEvent.change(screen.getByLabelText('Billing name'), {
    target: { value: 'CiteLadder' },
  });
  fireEvent.change(screen.getByLabelText('Address'), {
    target: { value: '1 Main Street' },
  });
  fireEvent.change(screen.getByLabelText('City'), {
    target: { value: 'New York' },
  });
  fireEvent.change(screen.getByLabelText('Postal code'), {
    target: { value: '10001' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: /qualifies as an export/i }));
}

export const EXPORT_CHECKOUT_BODY = {
  catalog_key: 'tier_1',
  credential_mode: 'byok',
  country_code: 'US',
  billing_name: 'CiteLadder',
  billing_address_line1: '1 Main Street',
  billing_city: 'New York',
  billing_state_code: null,
  billing_postal_code: '10001',
  customer_gstin: null,
  export_eligibility_attested: true,
};
