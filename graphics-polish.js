document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('world');
  if (canvas) {
    canvas.style.filter = 'saturate(1.12) contrast(1.08) brightness(1.04)';
  }

  const root = document.documentElement;
  root.style.setProperty('--panel-glow', 'rgba(130, 223, 255, 0.3)');
  root.style.setProperty('--panel-strong', 'rgba(25, 44, 74, 0.98)');

  const overlayCard = document.querySelector('.overlay-card');
  const panels = document.querySelectorAll('.panel, .overlay-card, .shop-item, .match-card');

  panels.forEach((panel) => {
    panel.style.border = '1px solid rgba(197, 236, 255, 0.2)';
  });

  if (overlayCard) {
    overlayCard.style.boxShadow = '0 20px 52px rgba(9, 16, 29, 0.45), 0 0 35px rgba(137, 214, 255, 0.12)';
  }
});
