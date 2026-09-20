try {
  const accent = localStorage.getItem('citeladder.accent');
  if (['chili', 'blue', 'violet', 'amber'].includes(accent)) {
    document.documentElement.dataset.accent = accent;
  }
} catch {
  // Storage can be unavailable; Emerald remains the default.
}
