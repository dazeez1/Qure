(() => {
  const nav = document.querySelector('.navigation-menu');
  const toggleBtn = document.querySelector('.mobile-menu-button');

  if (!nav || !toggleBtn) return;

  const closeMenu = () => {
    nav.classList.remove('mobile-open');
    toggleBtn.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    nav.classList.add('mobile-open');
    toggleBtn.setAttribute('aria-expanded', 'true');
  };

  toggleBtn.addEventListener('click', () => {
    const isOpen = nav.classList.contains('mobile-open');
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
})();
(() => {
  const header = document.querySelector('.page-header');
  const menuBtn = document.querySelector('.mobile-menu-button');
  if (!header || !menuBtn) return;

  const toggleMenu = () => {
    header.classList.toggle('mobile-open');
  };

  menuBtn.addEventListener('click', toggleMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') header.classList.remove('mobile-open');
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) header.classList.remove('mobile-open');
  });
})();

