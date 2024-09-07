document.addEventListener('DOMContentLoaded', () => {
    const currentLocation = window.location.pathname.split('/').pop();
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        const linkPath = link.getAttribute('href').split('/').pop();
        if (linkPath === currentLocation || (linkPath === '' && currentLocation === 'index.html')) {
            link.classList.add('active');
        }
    });

    document.body.classList.add("fade-in");
});