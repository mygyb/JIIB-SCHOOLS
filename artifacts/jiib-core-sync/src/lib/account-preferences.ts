export function accountThemeKey(email: string) {
  return `jiib.darkMode:${encodeURIComponent(email.trim().toLowerCase())}`;
}

export function getAccountDarkMode(email: string) {
  if (!email.trim()) return false;
  return localStorage.getItem(accountThemeKey(email)) === 'true';
}

export function setAccountDarkMode(email: string, enabled: boolean) {
  if (email.trim()) {
    localStorage.setItem(accountThemeKey(email), String(enabled));
  }
  document.documentElement.classList.toggle('dark', enabled);
  window.dispatchEvent(new CustomEvent('jiib:theme-update', {
    detail: { email: email.trim().toLowerCase(), enabled },
  }));
}

export function clearAccountTheme() {
  document.documentElement.classList.remove('dark');
}
