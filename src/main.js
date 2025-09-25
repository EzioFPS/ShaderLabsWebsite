import './style.css'

// Smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
  // Handle smooth scrolling for anchor links
  const navLinks = document.querySelectorAll('a[href^="#"]');

  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();

      const targetId = this.getAttribute('href');
      const targetSection = document.querySelector(targetId);

      if (targetSection) {
        const navHeight = document.querySelector('.nav').offsetHeight;
        const targetPosition = targetSection.offsetTop - navHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // Add scroll effect to navigation
  const nav = document.querySelector('.nav');
  let lastScrollY = window.scrollY;

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;

    if (currentScrollY > 100) {
      nav.style.background = 'rgba(0, 0, 0, 0.98)';
    } else {
      nav.style.background = 'rgba(0, 0, 0, 0.95)';
    }

    lastScrollY = currentScrollY;
  });

  // Add intersection observer for fade-in animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observe sections for animations
  const sections = document.querySelectorAll('section');
  sections.forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(30px)';
    section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(section);
  });

  // Hero section should be visible immediately
  const hero = document.querySelector('.hero');
  if (hero) {
    hero.style.opacity = '1';
    hero.style.transform = 'translateY(0)';
  }
});
