import { useState } from 'react';

import { SearchField } from '@/components/ui/search-field';

/** A search box that applies on Enter, so each keystroke is not a request. */
export function SubmittedSearch({
  query,
  onApply,
  placeholder,
  label,
}: Readonly<{
  query: string;
  onApply: (query: string) => void;
  placeholder: string;
  label: string;
}>) {
  const [draft, setDraft] = useState(query);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft.trim());
      }}
    >
      <SearchField
        value={draft}
        onValueChange={(value) => {
          setDraft(value);
          // An emptied box lists everything again: there is nothing to submit.
          if (value === '' && query !== '') onApply('');
        }}
        placeholder={placeholder}
        aria-label={label}
      />
    </form>
  );
}
