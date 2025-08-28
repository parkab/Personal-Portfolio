document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.section');

    const sectionIdToNav = {};
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
            sectionIdToNav[href.substring(1)] = link;
        }
    });

    let currentActiveId = null;
    let isScrollingFromClick = false;

    function updateActiveNav(activeId) {
    if (currentActiveId === activeId) return;
        
        currentActiveId = activeId;
        
        navLinks.forEach(link => {
            link.classList.remove('active');
        });
        
        const targetNav = sectionIdToNav[activeId];
        if (targetNav) {
            targetNav.classList.add('active');
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                isScrollingFromClick = true;
                
                updateActiveNav(targetId);
                
                targetSection.scrollIntoView({
                    behavior: 'smooth'
                });
                
                setTimeout(() => {
                    isScrollingFromClick = false;
                }, 800);
            }
        });
    });

    function determineActiveSection() {
        if (isScrollingFromClick) return;
        
    const scrollPosition = window.scrollY + window.innerHeight * 0.3;
        
    let activeSection = sections[0];
        
        for (let i = sections.length - 1; i >= 0; i--) {
            const section = sections[i];
            if (scrollPosition >= section.offsetTop) {
                activeSection = section;
                break;
            }
        }
        
        const activeId = activeSection.getAttribute('id');
        updateActiveNav(activeId);
    }

    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(determineActiveSection, 10);
    }, { passive: true });

    determineActiveSection();

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            setTimeout(determineActiveSection, 100);
        }
    });

    let touchTimer = null;
    document.addEventListener('touchstart', () => {
        clearTimeout(touchTimer);
    }, { passive: true });

    document.addEventListener('touchend', () => {
        clearTimeout(touchTimer);
        touchTimer = setTimeout(() => {
            isScrollingFromClick = false;
            determineActiveSection();
        }, 150);
    }, { passive: true });

    document.body.classList.add("fade-in");
});