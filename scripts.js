document.addEventListener('DOMContentLoaded', () => {
    let currentLocation = window.location.pathname;
    
    if (currentLocation === '/' || currentLocation === '') {
        currentLocation = 'index.html';
    }

    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        const linkPath = link.getAttribute('href');

        if (linkPath === currentLocation || (linkPath === '/' && currentLocation === 'index.html')) {
            link.classList.add('active');
        }
    });

    document.body.classList.add("fade-in");
});
