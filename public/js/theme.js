const themeToggle = document.getElementById('theme-toggle');
const htmlEl = document.documentElement;

const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    htmlEl.setAttribute('data-theme', savedTheme);
} else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
        htmlEl.setAttribute('data-theme', 'dark');
    }
}

themeToggle.addEventListener('click', () => {
    if (htmlEl.getAttribute('data-theme') === 'dark') {
        htmlEl.removeAttribute('data-theme');
        localStorage.removeItem('theme');
    } else {
        htmlEl.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
}); 