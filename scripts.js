document.addEventListener('DOMContentLoaded', () => {
    let currentLocation = window.location.pathname.split('/').pop();

    const navLinks = document.querySelectorAll('.nav-link');

    if (currentLocation === '' || currentLocation === '/') {
        currentLocation = '/';
    }

    navLinks.forEach(link => {
        const linkPath = link.getAttribute('href').split('/').pop();
        if (linkPath === currentLocation || (linkPath === '' && currentLocation === '/')) {
            link.classList.add('active');
        }
    });

    document.body.classList.add("fade-in");
});
