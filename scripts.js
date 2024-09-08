document.addEventListener('DOMContentLoaded', () => {
    let currentLocation = window.location.pathname.split('/').pop();
    
    if (window.location.pathname === '/' || window.location.pathname === ''){
        window.location.href = '/index.html';
    }

    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        const linkPath = link.getAttribute('href').split('/').pop();
        if (linkPath === currentLocation) {
            link.classList.add('active');
        }
    });

    document.body.classList.add("fade-in");
});
